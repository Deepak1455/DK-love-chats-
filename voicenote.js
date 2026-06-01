// ==========================================
// --- FIREBASE IMPORTS ---
// ==========================================
import { doc, setDoc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// ==========================================
// --- STATE VARIABLES ---
// ==========================================
window.mediaRecorder = null;
window.audioChunks = [];
window.isRecordingVoice = false;
window.recordedDuration = 0; // 🌟 सटीक ड्यूरेशन सुरक्षित करने के लिए

let recordTimerInterval = null;
let recordSeconds = 0;
let isRecordingCancelled = false;
let startTouchX = 0;

// ==========================================
// --- HELPER: FORMAT TIMER ---
// ==========================================
window.formatTimer = (sec) => {
    let m = Math.floor(sec / 60);
    let s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
};

// ==========================================
// --- 1. START VOICE RECORDING (LONG PRESS) ---
// ==========================================
window.startVoiceRecord = async (e) => {
    if (e.cancelable) e.preventDefault(); 
    if (window.isRecordingVoice) return;
    
    isRecordingCancelled = false;
    recordSeconds = 0;
    window.recordedDuration = 0;
    startTouchX = e.touches ? e.touches[0].clientX : e.clientX;

    const micBtn = document.getElementById('chat-mic-btn');
    const overlay = document.getElementById('recording-active-overlay');
    const msgInput = document.getElementById('msg-input');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        window.mediaRecorder = new MediaRecorder(stream);
        window.audioChunks = [];

        window.mediaRecorder.ondataavailable = (event) => { 
            if (event.data.size > 0) window.audioChunks.push(event.data); 
        };

        window.mediaRecorder.onstop = async () => {
            // अगर कैंसल नहीं किया गया है, तभी Firebase पर भेजें
            if (!isRecordingCancelled && window.audioChunks.length > 0) {
                const audioBlob = new Blob(window.audioChunks, { type: 'audio/webm' });
                // 🌟 सेंड करते वक़्त कैप्चर की हुई बिल्कुल सटीक ड्यूरेशन भेजेंगे
                window.sendVoiceNote(audioBlob, window.recordedDuration); 
            }
        };

        window.mediaRecorder.start();
        window.isRecordingVoice = true;
        
        if(navigator.vibrate) navigator.vibrate([40, 50]);
        
        // --- 🌟 UI ANIMATION ON ---
        if(msgInput) msgInput.style.opacity = '0'; 
        if(micBtn) micBtn.classList.add('mic-active-scale'); 
        
        if(overlay) {
            overlay.classList.remove('hidden');
            setTimeout(() => overlay.classList.add('show-overlay'), 10);
            document.getElementById('recording-live-time').innerText = "0:00";
            
            const recBar = document.getElementById('recording-progress-bar');
            if(recBar) recBar.style.width = '0%';
        }

        const maxLimit = 60; // रिकॉर्डिंग लिमिट (60 सेकंड)

        recordTimerInterval = setInterval(() => {
            recordSeconds++;
            
            // टाइमर अपडेट करें
            const timeEl = document.getElementById('recording-live-time');
            if(timeEl) timeEl.innerText = window.formatTimer(recordSeconds);

            // प्रोग्रेस बार अपडेट करें
            const recBar = document.getElementById('recording-progress-bar');
            if(recBar) {
                const percent = (recordSeconds / maxLimit) * 100;
                recBar.style.width = `${Math.min(100, percent)}%`;
            }

            // अगर लिमिट पूरी हो गई तो आटोमेटिक स्टॉप करें
            if(recordSeconds >= maxLimit) {
                window.stopVoiceRecord(new Event('touchend'));
            }
        }, 1000);

        document.addEventListener('touchmove', window.handleMicSwipe, { passive: false });
        document.addEventListener('touchend', window.stopVoiceRecord);
        document.addEventListener('mouseup', window.stopVoiceRecord);
        document.addEventListener('mousemove', window.handleMicSwipe);
        
    } catch (err) { 
        console.error("Mic Error: ", err); 
        if(typeof window.showToast === 'function') window.showToast("Error", "Microphone access denied!", null, "error");
    }
};

// ==========================================
// --- 2. HANDLE SWIPE LEFT TO CANCEL ---
// ==========================================
window.handleMicSwipe = (e) => {
    if (!window.isRecordingVoice) return;
    
    let currentX = e.touches ? e.touches[0].clientX : e.clientX;
    const micBtn = document.getElementById('chat-mic-btn');
    let diffX = startTouchX - currentX;

    if (diffX > 0 && diffX < 80 && micBtn) {
        micBtn.style.transform = `scale(1.4) translateX(-${diffX}px)`;
    }

    if (diffX >= 80) { 
        window.cancelVoiceRecordAction();
    }
};

// ==========================================
// --- 3. EXPLICIT CANCEL BUTTON (TRASH ICON) ---
// ==========================================
window.cancelVoiceRecordAction = () => {
    if (!window.isRecordingVoice) return;
    isRecordingCancelled = true;
    if(navigator.vibrate) navigator.vibrate([30, 30, 30]); 
    window.cleanupVoiceUI();
};

// ==========================================
// --- 4. STOP & SEND (ON RELEASE) ---
// ==========================================
window.stopVoiceRecord = (e) => {
    if (!window.isRecordingVoice) return;
    
    // 🌟 स्टॉप करने से ठीक पहले बिल्कुल सटीक समय को यहाँ सुरक्षित करें
    window.recordedDuration = recordSeconds;
    
    window.cleanupVoiceUI(); 
};

// ==========================================
// --- 5. CLEANUP & RESET UI ---
// ==========================================
window.cleanupVoiceUI = () => {
    if(window.mediaRecorder && window.mediaRecorder.state !== "inactive") {
        window.mediaRecorder.stop();
        window.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    
    clearInterval(recordTimerInterval);
    window.isRecordingVoice = false;
    
    document.removeEventListener('touchmove', window.handleMicSwipe);
    document.removeEventListener('touchend', window.stopVoiceRecord);
    document.removeEventListener('mouseup', window.stopVoiceRecord);
    document.removeEventListener('mousemove', window.handleMicSwipe);
    
    const micBtn = document.getElementById('chat-mic-btn');
    const overlay = document.getElementById('recording-active-overlay');
    const msgInput = document.getElementById('msg-input');
    const recBar = document.getElementById('recording-progress-bar');
    
    if(micBtn) {
        micBtn.classList.remove('mic-active-scale');
        micBtn.style.transform = ''; 
    }
    
    if(overlay) {
        overlay.classList.remove('show-overlay');
        setTimeout(() => overlay.classList.add('hidden'), 300); 
    }
    
    if(msgInput) msgInput.style.opacity = '1'; 
    if(recBar) recBar.style.width = '0%'; 
};

// ==========================================
// --- 6. UPLOAD & SEND TO FIREBASE ---
// ==========================================
window.sendVoiceNote = async (audioBlob, duration) => {
    if(!window.currentChatId || !window.db || !window.currentUser) return;
    
    const db = window.db;
    const currentUser = window.currentUser;
    const targetRoomId = window.currentChatId.roomId;
    const targetUserId = window.currentChatId.targetUid;

    const progressBar = document.getElementById('chat-progress-bar');
    if(progressBar) progressBar.style.width = '5%';
    
    const audioFile = new File([audioBlob], "voicenote.webm", { type: "audio/webm" });

    try {
        const uploadData = await window.uploadFile(audioFile, (p) => { 
            if(progressBar) progressBar.style.width = p + "%"; 
        });

        setDoc(doc(db, "chats", targetRoomId), {
            users: [currentUser.uid, targetUserId],
            lastMessage: "🎤 Voice message",
            timestamp: serverTimestamp() 
        }, { merge: true });

        addDoc(collection(db, "chats", targetRoomId, "messages"), {
            text: "", 
            mediaUrl: uploadData.url, 
            mediaType: "audio", 
            duration: duration || 0, // 🌟 सेंड करते समय रिकॉर्डिंग की सटीक ड्यूरेशन डेटाबेस में जाएगी
            senderId: currentUser.uid, 
            receiverId: targetUserId, 
            seen: false, 
            timestamp: serverTimestamp() 
        });

        if(progressBar) progressBar.style.width = '0%';
        if(typeof window.playSendSound === 'function') window.playSendSound();

    } catch(e) {
        console.error("Voice Send Error:", e);
        if(progressBar) progressBar.style.width = '0%';
        if(typeof window.showToast === 'function') window.showToast("Error", "Failed to send voice note", null, "error");
    }
};

// =======================================================
// --- 🎧 CUSTOM INSTAGRAM AUDIO PLAYER LOGIC (1x 2x 3x) ---
// =======================================================
window.currentPlayingAudio = null;

// Simulated Waveform Generator (24 Vertical Bars)
window.generateWaveformHTML = () => {
    const heights = [8, 14, 10, 22, 14, 6, 18, 12, 26, 14, 8, 18, 12, 22, 14, 8, 18, 10, 14, 6, 12, 20, 10, 8];
    return heights.map(h => `<div class="wave-bar" style="height:${h}px;"></div>`).join('');
};

// Play / Pause Logic
window.toggleAudioPlay = (id) => {
    const audio = document.getElementById(`audio-${id}`);
    const icon = document.getElementById(`play-icon-${id}`);
    
    if (window.currentPlayingAudio && window.currentPlayingAudio !== audio) {
        window.currentPlayingAudio.pause();
        const oldId = window.currentPlayingAudio.id.replace('audio-', '');
        const oldIcon = document.getElementById(`play-icon-${oldId}`);
        if(oldIcon) oldIcon.className = "fa-solid fa-play";
    }

    if (audio.paused) {
        audio.play(); 
        icon.className = "fa-solid fa-pause";
        window.currentPlayingAudio = audio;
    } else {
        audio.pause(); 
        icon.className = "fa-solid fa-play";
        window.currentPlayingAudio = null;
    }
};

// Realtime Progress & Timer Bar Logic
window.updateAudioProgress = (id) => {
    const audio = document.getElementById(`audio-${id}`);
    const progressContainer = document.getElementById(`progress-${id}`);
    const timerEl = document.getElementById(`timer-${id}`);
    
    if (audio && progressContainer) { 
        // 🌟 बग फिक्स: ब्राउज़र के इनफिनिटी ड्यूरेशन के बजाय डेटाबेस से मिला हुआ सटीक समय उठाएं
        const duration = parseFloat(audio.getAttribute('data-duration')) || audio.duration;
        
        if (duration && !isNaN(duration) && duration !== Infinity) {
            const percent = audio.currentTime / duration;
            const bars = progressContainer.querySelectorAll('.wave-bar');
            const activeCount = Math.floor(bars.length * percent);
            
            // बार्स का कलर बदलना
            bars.forEach((bar, index) => {
                if (index < activeCount) bar.classList.add('active');
                else bar.classList.remove('active');
            });

            // टाइमर डिस्प्ले अपडेट करना (बिल्कुल सही समय दिखेगा)
            if (timerEl) {
                const currentStr = window.formatTimer(Math.floor(audio.currentTime));
                const durationStr = window.formatTimer(Math.floor(duration));
                timerEl.innerText = `${currentStr} / ${durationStr}`;
            }
        }
    }
};

// Seek Waveform (वेव बार पर कहीं भी क्लिक करने पर ऑडियो वहाँ पहुँच जाएगा)
window.seekAudioWaveform = (id, event) => {
    const audio = document.getElementById(`audio-${id}`);
    const progressContainer = document.getElementById(`progress-${id}`);
    if (audio && progressContainer) {
        // 🌟 सटीक ड्यूरेशन उठाएं
        const duration = parseFloat(audio.getAttribute('data-duration')) || audio.duration;
        if (duration && !isNaN(duration) && duration !== Infinity) {
            const rect = progressContainer.getBoundingClientRect();
            const clickX = event.clientX - rect.left;
            const percent = Math.max(0, Math.min(1, clickX / rect.width)); 
            audio.currentTime = percent * duration;
        }
    }
};

// Audio ख़त्म होने पर Reset
window.resetAudio = (id) => {
    const icon = document.getElementById(`play-icon-${id}`);
    const progressContainer = document.getElementById(`progress-${id}`);
    const timerEl = document.getElementById(`timer-${id}`);
    const audio = document.getElementById(`audio-${id}`);
    
    if(icon) icon.className = "fa-solid fa-play";
    
    if(audio) {
        const duration = parseFloat(audio.getAttribute('data-duration')) || audio.duration;
        if(timerEl && duration && !isNaN(duration) && duration !== Infinity) {
            timerEl.innerText = `0:00 / ${window.formatTimer(Math.floor(duration))}`;
        }
    }
    
    if(progressContainer) {
        progressContainer.querySelectorAll('.wave-bar').forEach(bar => bar.classList.remove('active'));
    }
    
    if(window.currentPlayingAudio === audio) {
        window.currentPlayingAudio = null;
    }
};

// Speed Control Logic (1x -> 1.5x -> 2x -> 3x -> 1x)
window.changeAudioSpeed = (id) => {
    const audio = document.getElementById(`audio-${id}`);
    const speedBtn = document.getElementById(`speed-${id}`);
    let currentSpeed = audio.playbackRate;
    
    if(currentSpeed === 1) { 
        audio.playbackRate = 1.5; 
        speedBtn.innerText = "1.5x"; 
    }
    else if(currentSpeed === 1.5) { 
        audio.playbackRate = 2.0; 
        speedBtn.innerText = "2x"; 
    }
    else if(currentSpeed === 2.0) { 
        audio.playbackRate = 3.0; 
        speedBtn.innerText = "3x"; 
    }
    else { 
        audio.playbackRate = 1.0; 
        speedBtn.innerText = "1x"; 
    }
};