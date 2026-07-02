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

// 🌟 SMART: क्रेडेंशियल कैशिंग और सुरक्षा गेटवे डिक्लेरेशन (FIXED)
let processedCandidates = new Set();
let isCallAccepted = false; // कॉल स्वीकार होने का स्टेट गेटवे
let cachedIceServers = null; // रीयल-टाइम क्रेडेंशियल्स कैश मेमोरी
let isSettingRemoteDescription = false; // 🌟 FIXED: वैश्विक स्तर पर डिक्लेयर किया गया है

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
    if (cachedIceServers) {
        return cachedIceServers;
    }
    const activeDb = getDb();
    if (activeDb) {
        try {
            const configSnap = await getDoc(doc(activeDb, "app_settings", "webrtc"));
            if (configSnap.exists()) {
                const configData = configSnap.data();
                if (configData.iceServers && Array.isArray(configData.iceServers)) {
                    cachedIceServers = { iceServers: configData.iceServers };
                    console.log("Calling System: Custom TURN/STUN servers applied.");
                    return cachedIceServers;
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

// 🌟 SMART: कम्पेटिबल कनेक्शन स्टेट चेंजर (Jio/Airtel और मोबाइल वेबव्यू के लिए)
function updateCallConnectionStatus() {
    const statusLabel = document.getElementById("call-room-status");
    if (!statusLabel || !peerConnection) return;

    const connectionState = peerConnection.connectionState;
    const iceConnectionState = peerConnection.iceConnectionState;

    if (isCallAccepted) {
        if (connectionState === "connected" || iceConnectionState === "connected") {
            statusLabel.innerText = "Connected";
        } else if (connectionState === "connecting" || iceConnectionState === "checking") {
            statusLabel.innerText = "Connecting...";
        } else if (connectionState === "disconnected" || connectionState === "failed") {
            statusLabel.innerText = "Reconnecting...";
        }
    } else {
        statusLabel.innerText = "Dialing...";
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
    isSettingRemoteDescription = false;
    processedCandidates.clear();

    showCallUI(targetName, targetAvatar, "Dialing...", type);
    startRingtone('dialing');

    // 45 सेकंड रिंगिंग टाइमआउट
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
                localVideoEl.muted = true; // ब्राउज़र ऑटोप्ले ब्लॉक को रोकने के लिए लोकल प्रिव्यू म्यूट
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

    peerConnection.onconnectionstatechange = updateCallConnectionStatus;
    peerConnection.oniceconnectionstatechange = updateCallConnectionStatus;

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

    // सिंगल कुशल स्नैपशॉट लिसनर
    callListenerUnsubscribe = onSnapshot(callRef, async (docSnap) => {
        if (!docSnap.exists()) {
            endCallCleanUp();
            return;
        }
        const data = docSnap.data();

        // रीयल-टाइम कैंडिडेट्स सिंकिंग
        if (data.receiverCandidates && peerConnection && peerConnection.remoteDescription && !isSettingRemoteDescription) {
            data.receiverCandidates.forEach(cand => {
                const candKey = JSON.stringify(cand);
                if (!processedCandidates.has(candKey)) {
                    processedCandidates.add(candKey);
                    peerConnection.addIceCandidate(new RTCIceCandidate(cand)).catch(e => {});
                }
            });
        }

        // 🌟 SMART: रेस कंडीशन सुरक्षा लॉक के साथ 'setRemoteDescription'
        if (data.status === "accepted" && !peerConnection.currentRemoteDescription && !isSettingRemoteDescription) {
            isSettingRemoteDescription = true; 
            isCallAccepted = true; 
            stopRingtone();
            
            if (ringTimeoutTimer) {
                clearTimeout(ringTimeoutTimer);
                ringTimeoutTimer = null;
            }
            
            const statusLabel = document.getElementById("call-room-status");
            if (statusLabel) statusLabel.innerText = "Connecting...";

            const muteControl = document.getElementById("btn-mute-call");
            if (muteControl) muteControl.style.display = "flex";

            const cameraControl = document.getElementById("btn-video-call-toggle");
            if (cameraControl && data.type === 'video') cameraControl.style.display = "flex";

            const answerDesc = new RTCSessionDescription(data.answer);
            
            peerConnection.setRemoteDescription(answerDesc).then(() => {
                isSettingRemoteDescription = false;
                if (data.receiverCandidates) {
                    data.receiverCandidates.forEach(cand => {
                        const candKey = JSON.stringify(cand);
                        if (!processedCandidates.has(candKey)) {
                            processedCandidates.add(candKey);
                            peerConnection.addIceCandidate(new RTCIceCandidate(cand)).catch(e => {});
                        }
                    });
                }
            }).catch(err => {
                console.error("WebRTC Signaling Error:", err);
                isSettingRemoteDescription = false;
                hangupCall();
            });
        } else if (data.status === "rejected" || data.status === "ended") {
            endCallCleanUp();
        }
    });
}

// --- INCOMING CALL SCREEN ACTION ---
function showIncomingCallUI(callId, callData) {
    activeCallId = callId;
    isCallAccepted = false;
    isSettingRemoteDescription = false;
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
                localVideoEl.muted = true; // ब्राउज़र ऑटोप्ले ब्लॉक को रोकने के लिए लोकल प्रिव्यू म्यूट
                localVideoEl.srcObject = localStream;
                localVideoEl.play().catch(e => console.log(e));
            }
        }
    } catch (err) {
        console.error("Local Media Init Failed:", err);
        rejectCall(callId);
        return;
    }

    try {
        const rtcConfig = await getIceServersConfiguration();
        peerConnection = new RTCPeerConnection(rtcConfig);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.onconnectionstatechange = updateCallConnectionStatus;
        peerConnection.oniceconnectionstatechange = updateCallConnectionStatus;

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
        const snap = await getDoc(callRef);
        if (!snap.exists()) {
            endCallCleanUp();
            return;
        }
        const data = snap.data();

        // रेस-कंडीशन सुरक्षित तरीके से ऑफर विवरण जोड़ें
        isSettingRemoteDescription = true;
        const offerDesc = new RTCSessionDescription(data.offer);
        await peerConnection.setRemoteDescription(offerDesc);
        isSettingRemoteDescription = false;

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

        // 'Connected' स्थिति का प्रबंधन अब पूरी तरह से 'updateCallConnectionStatus' पर छोड़ दिया गया है

        const muteControl = document.getElementById("btn-mute-call");
        if (muteControl) muteControl.style.display = "flex";

        const cameraControl = document.getElementById("btn-video-call-toggle");
        if (cameraControl && callData.type === 'video') cameraControl.style.display = "flex";

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

    } catch (e) {
        console.error("Handshake Connection Failed:", e);
        // यदि स्वीकारने के दौरान कोई एरर आए, तो कॉल रिजेक्ट कर दोनों स्क्रीन तुरंत क्लोज करें
        rejectCall(callId);
        return;
    }
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
    isSettingRemoteDescription = false;
    activeCallId = null;
}

// अचानक टैब बंद होने पर दूसरे फोन से ऑटो-कॉल स्क्रीन बंद करें
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
