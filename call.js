import { 
    getFirestore, collection, doc, addDoc, setDoc, getDoc, updateDoc, onSnapshot, deleteDoc, arrayUnion, query, where 
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// ⚡ डेटाबेस रेस-कंडीशन को रोकने के लिए रन-टाइम डीबी रिट्रीवर
function getDb() {
    return window.db;
}

let localStream = null;
let remoteStream = null;
let peerConnection = null;
let activeCallId = null;
let callListenerUnsubscribe = null;
let candidatesListenerUnsubscribe = null; // कैंडिडेट्स के लिए पृथक लिसनर
let audioContext = null;
let ringtoneInterval = null;

// डिफ़ॉल्ट हाई-अवेलेबिलिटी फॉलबैक STUN सर्वर्स सूची
const defaultIceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.services.mozilla.com" }
];

// 🌟 SMART: Firestore से डायनामिक TURN/STUN क्रेडेंशियल्स लोड करने का सुरक्षित आर्किटेक्चर
async function getIceServersConfiguration() {
    const activeDb = getDb();
    if (activeDb) {
        try {
            // Firestore में "app_settings/webrtc" डॉक्यूमेंट से लाइव क्रेडेंशियल्स लें
            const configSnap = await getDoc(doc(activeDb, "app_settings", "webrtc"));
            if (configSnap.exists()) {
                const configData = configSnap.data();
                if (configData.iceServers && Array.isArray(configData.iceServers)) {
                    console.log("Calling System: Custom TURN/STUN servers applied from database.");
                    return { iceServers: configData.iceServers };
                }
            }
        } catch (e) {
            console.warn("Calling System: Failed to fetch dynamic ICE servers, falling back to default STUN list:", e.message);
        }
    }
    return { iceServers: defaultIceServers };
}

// --- Ringtone Synthesizer (सिंथेटिक साउंड जनरेटर - ब्राउज़र ऑटोरिज्यूम फिक्स) ---
function playSoundTone(frequency, duration) {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        let osc = audioContext.createOscillator();
        let gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.value = frequency;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
        osc.start();
        osc.stop(audioContext.currentTime + duration);
    } catch (e) { 
        console.warn("Audio Context playback failed or blocked:", e.message); 
    }
}

function startRingtone(type = 'dialing') {
    stopRingtone();
    ringtoneInterval = setInterval(() => {
        if (type === 'dialing') {
            playSoundTone(440, 0.8);
        } else {
            playSoundTone(587.33, 0.2);
            setTimeout(() => playSoundTone(659.25, 0.2), 250);
        }
    }, 1500);
}

function stopRingtone() {
    if (ringtoneInterval) {
        clearInterval(ringtoneInterval);
        ringtoneInterval = null;
    }
}

// --- INITIALIZE CALL SYSTEM (सुरक्षित कनेक्शन गार्ड के साथ) ---
export function setupCallListeners(currentUserUid) {
    if (!currentUserUid) return;

    const activeDb = getDb();
    if (!activeDb) {
        setTimeout(() => setupCallListeners(currentUserUid), 1000);
        return;
    }

    try {
        const incomingCallQuery = query(
            collection(activeDb, "calls"), 
            where("receiverId", "==", currentUserUid), 
            where("status", "==", "calling")
        );

        onSnapshot(incomingCallQuery, (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === "added") {
                    const callData = change.doc.data();
                    showIncomingCallUI(change.doc.id, callData);
                }
            });
        });
    } catch (error) {
        console.error("Calling System: Failed to setup call listener:", error.message);
    }
}

// --- CALL INITIATION (सुरक्षित कैमरा/माइक और HTTPS चेकर) ---
export async function startCall(targetUid, targetName, targetAvatar, type = 'voice') {
    const activeDb = getDb();
    if (!activeDb) {
        if (typeof window.showToast === 'function') {
            window.showToast("System Wait", "डेटाबेस लोड हो रहा है, कृपया पुनः प्रयास करें।", "", "warning");
        }
        return;
    }

    const callerId = window.currentUser.uid;
    const callerName = window.currentUser.displayName || "DK User";
    const callerAvatar = window.currentUserData?.avatarBase64 || window.currentUser?.photoURL || "";

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (typeof window.showToast === 'function') {
            window.showToast("Security Block", "कॉलिंग के लिए HTTPS (सुरक्षित कनेक्शन) का होना आवश्यक है।", "", "error");
        }
        console.warn("Calling System: navigator.mediaDevices.getUserMedia is undefined. HTTPS is required.");
        return;
    }

    activeCallId = `${callerId}_${targetUid}_${Date.now()}`;
    showCallUI(targetName, targetAvatar, "Dialing...");
    startRingtone('dialing');

    const muteBtn = document.getElementById("btn-mute-call");
    if (muteBtn) muteBtn.classList.remove("muted");

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: type === 'video'
        });
        if (type === 'video') {
            const localVideoEl = document.getElementById("local-video-preview");
            if (localVideoEl) {
                localVideoEl.srcObject = localStream;
                localVideoEl.play().catch(e => console.log(e));
            }
            const videoGrid = document.getElementById("call-video-grid");
            if (videoGrid) videoGrid.classList.add("active");
        }
    } catch (err) {
        console.error("Media Access Denied", err);
        if (typeof window.showToast === 'function') {
            window.showToast("Mic/Camera Error", "कैमरा या माइक की अनुमति नहीं मिली।", "", "error");
        }
        endCallCleanUp();
        return;
    }

    const callRef = doc(activeDb, "calls", activeCallId);
    await setDoc(callRef, {
        callerId,
        callerName,
        callerAvatar,
        receiverId: targetUid,
        status: "calling",
        type: type,
        timestamp: Date.now()
    });

    // Dynamic ICE configurations load
    const rtcConfig = await getIceServersConfiguration();
    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // 🌟 SMART CONNECTION MONITORING: नेटवर्क टूटने या बदलने पर यूजर को सूचित करें
    peerConnection.onconnectionstatechange = () => {
        const statusLabel = document.getElementById("call-room-status");
        if (!statusLabel) return;
        
        switch (peerConnection.connectionState) {
            case "connecting":
                statusLabel.innerText = "Connecting...";
                break;
            case "connected":
                statusLabel.innerText = "Connected";
                break;
            case "disconnected":
            case "failed":
                statusLabel.innerText = "Reconnecting / Dropped";
                // 3 सेकंड के भीतर रिकनेक्ट न होने पर ऑटो-कॉल ड्रॉप गार्ड चालू करें
                setTimeout(() => {
                    if (peerConnection && (peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "failed")) {
                        hangupCall();
                    }
                }, 4000);
                break;
            case "closed":
                statusLabel.innerText = "Ended";
                break;
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            updateDoc(callRef, {
                callerCandidates: arrayUnion(event.candidate.toJSON())
            }).catch(e => console.warn(e));
        }
    };

    peerConnection.ontrack = (event) => {
        remoteStream = event.streams[0];
        const remoteVideoEl = document.getElementById("remote-video-preview");
        if (remoteVideoEl) {
            remoteVideoEl.srcObject = remoteStream;
            remoteVideoEl.play().catch(e => console.log(e));
        }
    };

    const offerDescription = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offerDescription);

    await updateDoc(callRef, {
        offer: {
            sdp: offerDescription.sdp,
            type: offerDescription.type
        }
    });

    // 🌟 FAST: रीयल-टाइम कैंडिडेट्स सिंकिंग प्रक्रिया
    candidatesListenerUnsubscribe = onSnapshot(callRef, (docSnap) => {
        if (!docSnap.exists() || !peerConnection) return;
        const data = docSnap.data();
        if (data.receiverCandidates && peerConnection.remoteDescription) {
            data.receiverCandidates.forEach(cand => {
                peerConnection.addIceCandidate(new RTCIceCandidate(cand)).catch(e => {});
            });
        }
    });

    callListenerUnsubscribe = onSnapshot(callRef, async (docSnap) => {
        if (!docSnap.exists()) {
            endCallCleanUp();
            return;
        }
        const data = docSnap.data();
        if (data.status === "accepted" && !peerConnection.currentRemoteDescription) {
            stopRingtone();
            
            const statusLabel = document.getElementById("call-room-status");
            if (statusLabel) statusLabel.innerText = "Connecting...";

            const muteControl = document.getElementById("btn-mute-call");
            if (muteControl) muteControl.style.display = "flex";

            const cameraControl = document.getElementById("btn-video-call-toggle");
            if (cameraControl && data.type === 'video') cameraControl.style.display = "flex";

            const answerDesc = new RTCSessionDescription(data.answer);
            await peerConnection.setRemoteDescription(answerDesc);
            
            // सेट रिमोट डिस्क्रिप्शन के बाद संचित कैंडिडेट्स को रिफ्रेश करें
            if (data.receiverCandidates) {
                data.receiverCandidates.forEach(cand => {
                    peerConnection.addIceCandidate(new RTCIceCandidate(cand)).catch(e => {});
                });
            }
        } else if (data.status === "rejected" || data.status === "ended") {
            endCallCleanUp();
        }
    });
}

// --- INCOMING CALL SCREEN ACTION ---
function showIncomingCallUI(callId, callData) {
    activeCallId = callId;
    startRingtone('ringing');

    showCallUI(callData.callerName, callData.callerAvatar, `Incoming ${callData.type} Call...`);
    
    const acceptBtn = document.getElementById("btn-accept-call");
    const declineBtn = document.getElementById("btn-decline-call");
    const muteBtn = document.getElementById("btn-mute-call");
    const videoToggleBtn = document.getElementById("btn-video-call-toggle");
    
    if (acceptBtn) acceptBtn.style.display = "flex";
    if (declineBtn) {
        declineBtn.style.display = "flex";
        declineBtn.onclick = () => rejectCall(callId);
    }
    
    if (muteBtn) muteBtn.style.display = "none";
    if (videoToggleBtn) videoToggleBtn.style.display = "none";

    if (acceptBtn) {
        acceptBtn.onclick = () => {
            acceptCall(callId, callData);
        };
    }
}

// --- ACCEPT CALL ---
async function acceptCall(callId, callData) {
    const activeDb = getDb();
    if (!activeDb) return;

    stopRingtone();
    
    const acceptBtn = document.getElementById("btn-accept-call");
    if (acceptBtn) acceptBtn.style.display = "none";
    
    const statusLabel = document.getElementById("call-room-status");
    if (statusLabel) statusLabel.innerText = "Connecting...";

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (typeof window.showToast === 'function') {
            window.showToast("Security Block", "कैमरा/माइक एक्सेस के लिए HTTPS सुरक्षित कनेक्शन आवश्यक है।", "", "error");
        }
        rejectCall(callId);
        return;
    }

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: callData.type === 'video'
        });
        if (callData.type === 'video') {
            const localVideoEl = document.getElementById("local-video-preview");
            if (localVideoEl) {
                localVideoEl.srcObject = localStream;
                localVideoEl.play().catch(e => console.log(e));
            }
            const videoGrid = document.getElementById("call-video-grid");
            if (videoGrid) videoGrid.classList.add("active");
        }
    } catch (err) {
        console.error("Local Media Init Failed:", err);
        rejectCall(callId);
        return;
    }

    const rtcConfig = await getIceServersConfiguration();
    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.onconnectionstatechange = () => {
        const label = document.getElementById("call-room-status");
        if (!label) return;
        if (peerConnection.connectionState === "connected") {
            label.innerText = "Connected";
        } else if (peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "failed") {
            label.innerText = "Reconnecting...";
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            updateDoc(doc(activeDb, "calls", callId), {
                receiverCandidates: arrayUnion(event.candidate.toJSON())
            }).catch(e => console.warn(e));
        }
    };

    peerConnection.ontrack = (event) => {
        remoteStream = event.streams[0];
        const remoteVideoEl = document.getElementById("remote-video-preview");
        if (remoteVideoEl) {
            remoteVideoEl.srcObject = remoteStream;
            remoteVideoEl.play().catch(e => console.log(e));
        }
    };

    const callRef = doc(activeDb, "calls", callId);
    
    try {
        const snap = await getDoc(callRef);
        if (!snap.exists()) {
            endCallCleanUp();
            return;
        }
        const data = snap.data();

        const offerDesc = new RTCSessionDescription(data.offer);
        await peerConnection.setRemoteDescription(offerDesc);

        const answerDesc = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answerDesc);

        await updateDoc(callRef, {
            answer: {
                sdp: answerDesc.sdp,
                type: answerDesc.type
            },
            status: "accepted"
        });

        if (data.callerCandidates) {
            data.callerCandidates.forEach(cand => {
                peerConnection.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.warn(e));
            });
        }

        if (statusLabel) statusLabel.innerText = "Connected";

        const muteControl = document.getElementById("btn-mute-call");
        if (muteControl) muteControl.style.display = "flex";

        const cameraControl = document.getElementById("btn-video-call-toggle");
        if (cameraControl && callData.type === 'video') cameraControl.style.display = "flex";

    } catch (e) {
        console.error("Handshake Connection Failed:", e);
        endCallCleanUp();
        return;
    }

    // 🌟 FAST: इनकमिंग रीयल-टाइम कैंडिडेट्स सिंकिंग
    candidatesListenerUnsubscribe = onSnapshot(callRef, (docSnap) => {
        if (!docSnap.exists() || !peerConnection) return;
        const data = docSnap.data();
        if (data.callerCandidates && peerConnection.remoteDescription) {
            data.callerCandidates.forEach(cand => {
                peerConnection.addIceCandidate(new RTCIceCandidate(cand)).catch(e => {});
            });
        }
    });

    callListenerUnsubscribe = onSnapshot(callRef, (docSnap) => {
        if (docSnap.exists()) {
            const updatedData = docSnap.data();
            if (updatedData.status === "ended" || updatedData.status === "rejected") {
                endCallCleanUp();
            }
        } else {
            endCallCleanUp();
        }
    });
}

// --- REJECT OR DISCONNECT CALL ---
export async function rejectCall(callId) {
    const activeDb = getDb();
    stopRingtone();
    endCallCleanUp();

    if (callId && activeDb) {
        try {
            await updateDoc(doc(activeDb, "calls", callId), { status: "rejected" });
        } catch (e) {
            console.warn("Could not sync rejection status with server:", e);
        }
    }
}

export async function hangupCall() {
    const activeDb = getDb();
    stopRingtone();
    const callIdToClose = activeCallId;

    endCallCleanUp();

    if (callIdToClose && activeDb) {
        try {
            await updateDoc(doc(activeDb, "calls", callIdToClose), { status: "ended" });
        } catch (e) {
            console.warn("Could not sync hangup status with server:", e);
        }
    }
}

// --- SYSTEM RESET ---
function endCallCleanUp() {
    stopRingtone();
    
    if (callListenerUnsubscribe) {
        try { callListenerUnsubscribe(); } catch(e) {}
        callListenerUnsubscribe = null;
    }

    if (candidatesListenerUnsubscribe) {
        try { candidatesListenerUnsubscribe(); } catch(e) {}
        candidatesListenerUnsubscribe = null;
    }

    if (localStream) {
        try {
            localStream.getTracks().forEach(track => track.stop());
        } catch(e) {}
        localStream = null;
    }

    if (peerConnection) {
        try { peerConnection.close(); } catch(e) {}
        peerConnection = null;
    }

    const callOverlay = document.getElementById("call-screen-overlay");
    if (callOverlay) {
        callOverlay.classList.remove("active");
    }
    
    const videoGrid = document.getElementById("call-video-grid");
    if (videoGrid) {
        videoGrid.classList.remove("active");
    }

    const localVideo = document.getElementById("local-video-preview");
    if (localVideo) localVideo.srcObject = null;

    const remoteVideo = document.getElementById("remote-video-preview");
    if (remoteVideo) remoteVideo.srcObject = null;

    const acceptBtn = document.getElementById("btn-accept-call");
    if (acceptBtn) acceptBtn.style.display = "none";

    activeCallId = null;
}

// --- UI CONTROLLERS ---
function showCallUI(name, avatar, status) {
    const overlay = document.getElementById("call-screen-overlay");
    if (overlay) {
        const avatarEl = document.getElementById("call-room-avatar");
        if (avatarEl) avatarEl.src = avatar || "https://i.pravatar.cc/150";
        
        const usernameEl = document.getElementById("call-room-username");
        if (usernameEl) usernameEl.innerText = name;
        
        const statusEl = document.getElementById("call-room-status");
        if (statusEl) statusEl.innerText = status;

        const muteBtn = document.getElementById("btn-mute-call");
        if (muteBtn) muteBtn.style.display = "none";
        
        const videoBtn = document.getElementById("btn-video-call-toggle");
        if (videoBtn) videoBtn.style.display = "none";

        const acceptBtn = document.getElementById("btn-accept-call");
        if (acceptBtn) acceptBtn.style.display = "none";
        
        overlay.classList.add("active");
    }
}

// --- IN-CALL TOGGLES (MUTE / VIDEO DISABLE) ---
window.toggleMuteCall = () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const btn = document.getElementById("btn-mute-call");
            if (btn) {
                if (audioTrack.enabled) {
                    btn.classList.remove("muted");
                    btn.innerHTML = `<i class="fa-solid fa-microphone"></i>`;
                } else {
                    btn.classList.add("muted");
                    btn.innerHTML = `<i class="fa-solid fa-microphone-slash"></i>`;
                }
            }
        }
    }
};

window.toggleVideoCall = () => {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const btn = document.getElementById("btn-video-call-toggle");
            if (btn) {
                if (videoTrack.enabled) {
                    btn.classList.remove("disabled");
                    btn.innerHTML = `<i class="fa-solid fa-video"></i>`;
                } else {
                    btn.classList.add("disabled");
                    btn.innerHTML = `<i class="fa-solid fa-video-slash"></i>`;
                }
            }
        }
    }
};

// --- SAFE CALL TRIGGER FROM ACTIVE CHAT ---
window.startCallFromChat = (type) => {
    let targetUid = null;
    
    if (window.currentChatId) {
        targetUid = (typeof window.currentChatId === 'object') ? window.currentChatId.targetUid : window.currentChatId;
    }
    
    const name = document.getElementById('chat-room-title')?.innerText || "User";
    const avatar = document.getElementById('chat-header-img')?.src || "";
    
    if (targetUid) {
        startCall(targetUid, name, avatar, type);
    } else {
        console.warn("Active Chat User ID not found.");
    }
};

// Global level binding for trigger actions
window.initiateCall = startCall;
window.hangupActiveCall = hangupCall;
