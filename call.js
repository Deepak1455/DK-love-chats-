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
let incomingCallUnsubscribe = null; // इनकमिंग मॉनिटर लिसनर
let audioContext = null;
let ringtoneInterval = null;
let ringTimeoutTimer = null; // रिंगिंग टाइमआउट टाइमर

// रीयल-टाइम नॉन-डुप्लिकेट कैंडिडेट सिंकिंग फ़िल्टर
let processedCandidates = new Set();
let isCallAccepted = false; // कॉल स्वीकार होने का स्टेट गेटवे

const defaultIceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.services.mozilla.com" }
];

// --- Dynamic TURN/STUN Configuration Fetching ---
async function getIceServersConfiguration() {
    const activeDb = getDb();
    if (activeDb) {
        try {
            const configSnap = await getDoc(doc(activeDb, "app_settings", "webrtc"));
            if (configSnap.exists()) {
                const configData = configSnap.data();
                if (configData.iceServers && Array.isArray(configData.iceServers)) {
                    console.log("Calling System: Custom TURN/STUN servers applied.");
                    return { iceServers: configData.iceServers };
                }
            }
        } catch (e) {
            console.warn("Calling System: Falling back to default STUN list:", e.message);
        }
    }
    return { iceServers: defaultIceServers };
}

// --- Ringtone Synthesizer ---
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
        console.warn("Audio Context blocked:", e.message); 
    }
}

// स्क्रीन पर प्रथम टच के साथ ऑडियो अनलॉक बाईपास
function unlockAudioContextOnUserInteraction() {
    const unlock = () => {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                window.removeEventListener('click', unlock);
                window.removeEventListener('touchstart', unlock);
            });
        }
    };
    window.addEventListener('click', unlock);
    window.addEventListener('touchstart', unlock);
}
unlockAudioContextOnUserInteraction();

function startRingtone(type = 'dialing') {
    stopRingtone();
    ringtoneInterval = setInterval(() => {
        if (type === 'dialing') {
            playSoundTone(440, 0.8);
        } else {
            playSoundTone(587.33, 0.2);
            setTimeout(() => playSoundTone(659.25, 0.2), 250);
            
            if (navigator.vibrate) {
                navigator.vibrate([200, 100, 200]);
            }
        }
    }, 1500);
}

function stopRingtone() {
    if (ringtoneInterval) {
        clearInterval(ringtoneInterval);
        ringtoneInterval = null;
    }
    if (navigator.vibrate) {
        navigator.vibrate(0);
    }
}

// --- INITIALIZE INCOMING CALL LISTENERS (INSTANT SYNC UPGRADE) ---
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
            where("receiverId", "==", currentUserUid)
        );

        if (incomingCallUnsubscribe) incomingCallUnsubscribe();

        // 🌟 SMART: इनकमिंग कॉल्स की हर स्थिति (Cancel, Reject, Accept) को रीयल-टाइम मॉनिटर करें
        incomingCallUnsubscribe = onSnapshot(incomingCallQuery, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const callId = change.doc.id;
                const callData = change.doc.data();

                if (change.type === "added" || change.type === "modified") {
                    if (callData.status === "calling") {
                        if (activeCallId !== callId) {
                            showIncomingCallUI(callId, callData);
                        }
                    } else if (callData.status === "rejected" || callData.status === "ended") {
                        // अगर कॉलर ने रिंगिंग के दौरान अचानक कॉल काट दी, तो रिसीवर की स्क्रीन तुरंत बंद करें
                        if (activeCallId === callId) {
                            endCallCleanUp();
                        }
                    }
                } else if (change.type === "removed") {
                    if (activeCallId === callId) {
                        endCallCleanUp();
                    }
                }
            });
        });
    } catch (error) {
        console.error("Calling System: Failed to setup call listener:", error.message);
    }
}

// --- CALL INITIATION ---
export async function startCall(targetUid, targetName, targetAvatar, type = 'voice') {
    const activeDb = getDb();
    if (!activeDb) {
        if (typeof window.showToast === 'function') {
            window.showToast("System Wait", "डेटाबेस लोड हो रहा है, पुनः प्रयास करें।", "", "warning");
        }
        return;
    }

    const callerId = window.currentUser.uid;
    const callerName = window.currentUser.displayName || "DK User";
    const callerAvatar = window.currentUserData?.avatarBase64 || window.currentUser?.photoURL || "";

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (typeof window.showToast === 'function') {
            window.showToast("Security Block", "कॉलिंग के लिए HTTPS कनेक्शन आवश्यक है।", "", "error");
        }
        return;
    }

    activeCallId = `${callerId}_${targetUid}_${Date.now()}`;
    isCallAccepted = false;
    processedCandidates.clear();

    showCallUI(targetName, targetAvatar, "Dialing...", type);
    startRingtone('dialing');

    // 🌟 SMART: 45 सेकंड रिंगिंग टाइमआउट (No Answer पर कॉल स्वतः समाप्त होगी)
    ringTimeoutTimer = setTimeout(() => {
        if (!isCallAccepted) {
            if (typeof window.showToast === 'function') {
                window.showToast("Call Timeout", "No answer from user.", "", "warning");
            }
            hangupCall();
        }
    }, 45000);

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
        }
    } catch (err) {
        console.error("Media Access Denied", err);
        if (typeof window.showToast === 'function') {
            window.showToast("Mic/Camera Error", "अनुमति नहीं मिली।", "", "error");
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

    const rtcConfig = await getIceServersConfiguration();
    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.onconnectionstatechange = () => {
        const statusLabel = document.getElementById("call-room-status");
        if (!statusLabel) return;
        
        if (isCallAccepted) {
            switch (peerConnection.connectionState) {
                case "connecting":
                    statusLabel.innerText = "Connecting...";
                    break;
                case "connected":
                    statusLabel.innerText = "Connected";
                    break;
                case "disconnected":
                case "failed":
                    statusLabel.innerText = "Reconnecting...";
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
        } else {
            statusLabel.innerText = "Dialing...";
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
            remoteVideoEl.play().catch(e => console.log("Remote video track play block:", e));
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

    // सिंगल कुशल स्नैपशॉट लिसनर
    callListenerUnsubscribe = onSnapshot(callRef, async (docSnap) => {
        if (!docSnap.exists()) {
            endCallCleanUp();
            return;
        }
        const data = docSnap.data();

        // रीयल-टाइम कैंडिडेट्स सिंकिंग
        if (data.receiverCandidates && peerConnection && peerConnection.remoteDescription) {
            data.receiverCandidates.forEach(cand => {
                const candKey = JSON.stringify(cand);
                if (!processedCandidates.has(candKey)) {
                    processedCandidates.add(candKey);
                    peerConnection.addIceCandidate(new RTCIceCandidate(cand)).catch(e => {});
                }
            });
        }

        if (data.status === "accepted" && !peerConnection.currentRemoteDescription) {
            isCallAccepted = true; // 🌟 कॉल एक्सेप्ट हुई!
            stopRingtone();
            if (ringTimeoutTimer) clearTimeout(ringTimeoutTimer);
            
            const statusLabel = document.getElementById("call-room-status");
            if (statusLabel) statusLabel.innerText = "Connecting...";

            const muteControl = document.getElementById("btn-mute-call");
            if (muteControl) muteControl.style.display = "flex";

            const cameraControl = document.getElementById("btn-video-call-toggle");
            if (cameraControl && data.type === 'video') cameraControl.style.display = "flex";

            const answerDesc = new RTCSessionDescription(data.answer);
            await peerConnection.setRemoteDescription(answerDesc);
            
            if (data.receiverCandidates) {
                data.receiverCandidates.forEach(cand => {
                    const candKey = JSON.stringify(cand);
                    if (!processedCandidates.has(candKey)) {
                        processedCandidates.add(candKey);
                        peerConnection.addIceCandidate(new RTCIceCandidate(cand)).catch(e => {});
                    }
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
    isCallAccepted = false;
    processedCandidates.clear();
    startRingtone('ringing');

    showCallUI(callData.callerName, callData.callerAvatar, `Incoming ${callData.type} Call...`, callData.type);
    
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
    isCallAccepted = true; // 🌟 कॉल स्वीकार हो चुकी है
    if (ringTimeoutTimer) clearTimeout(ringTimeoutTimer);
    
    const acceptBtn = document.getElementById("btn-accept-call");
    if (acceptBtn) acceptBtn.style.display = "none";
    
    const statusLabel = document.getElementById("call-room-status");
    if (statusLabel) statusLabel.innerText = "Connecting...";

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (typeof window.showToast === 'function') {
            window.showToast("Security Block", "सुरक्षित कनेक्शन आवश्यक है।", "", "error");
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
            remoteVideoEl.play().catch(e => console.log("Remote track init fail:", e));
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
                const candKey = JSON.stringify(cand);
                if (!processedCandidates.has(candKey)) {
                    processedCandidates.add(candKey);
                    peerConnection.addIceCandidate(new RTCIceCandidate(cand)).catch(e => console.warn(e));
                }
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

    callListenerUnsubscribe = onSnapshot(callRef, (docSnap) => {
        if (!docSnap.exists() || !peerConnection) {
            endCallCleanUp();
            return;
        }
        const updatedData = docSnap.data();
        
        if (updatedData.status === "ended" || updatedData.status === "rejected") {
            endCallCleanUp();
            return;
        }

        if (updatedData.callerCandidates && peerConnection.remoteDescription) {
            updatedData.callerCandidates.forEach(cand => {
                const candKey = JSON.stringify(cand);
                if (!processedCandidates.has(candKey)) {
                    processedCandidates.add(candKey);
                    peerConnection.addIceCandidate(new RTCIceCandidate(cand)).catch(e => {});
                }
            });
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
            console.warn("Could not sync rejection:", e);
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
            console.warn("Could not sync hangup:", e);
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

    if (ringTimeoutTimer) {
        clearTimeout(ringTimeoutTimer);
        ringTimeoutTimer = null;
    }

    processedCandidates.clear();
    isCallAccepted = false;
    activeCallId = null;
}

// 🌟 SMART: अचानक टैब बंद होने पर दूसरे फोन से ऑटो-कॉल स्क्रीन बंद करें
window.addEventListener('beforeunload', () => {
    if (activeCallId) {
        const activeDb = getDb();
        if (activeDb) {
            updateDoc(doc(activeDb, "calls", activeCallId), { status: "ended" }).catch(()=>{});
        }
    }
    endCallCleanUp();
});

// --- UI CONTROLLERS ---
function showCallUI(name, avatar, status, type = 'voice') {
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
        
        // 🌟 SMART Layout Segregation: वीडियो ग्रिड को केवल वीडियो कॉल होने पर ही एक्टिव करें
        const videoGrid = document.getElementById("call-video-grid");
        if (videoGrid) {
            if (type === 'video') {
                videoGrid.classList.add("active");
            } else {
                videoGrid.classList.remove("active");
            }
        }
        
        overlay.classList.add("active");
    }
}

// --- IN-CALL TOGGLES ---
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

window.initiateCall = startCall;
window.hangupActiveCall = hangupCall;
