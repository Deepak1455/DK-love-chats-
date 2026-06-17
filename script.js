
const APP_VERSION = 2.3;

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, updateDoc, setDoc, getDocs, where, getDoc, writeBatch, limit, deleteDoc, arrayUnion, arrayRemove, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collectionGroup, startAfter, limitToLast } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// 🌟 नया सुरक्षित इम्पोर्ट: isSupported को शामिल किया गया है
import { getMessaging, getToken, isSupported } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging.js";

const firebaseConfig = {
    apiKey: "AIzaSyANdglj3LTDuwsOfXqyiGKSR4Vfez7oqDI",
    authDomain: "my-chat-e4ea8.firebaseapp.com",
    projectId: "my-chat-e4ea8",
    storageBucket: "my-chat-e4ea8.firebasestorage.app",
    messagingSenderId: "212293939926",
    appId: "1:212293939926:web:fa102692a367aac5fd0f77",
    measurementId: "G-C323ZJY5J6"
};

// --- FIREBASE INIT ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// 🌟 सुरक्षित इनिशियलाइजेशन: केवल सपोर्टेड एनवायरनमेंट में ही मेसेजिंग लोड करें
let messaging = null;

isSupported().then((supported) => {
    if (supported) {
        messaging = getMessaging(app);
        console.log("FCM matches browser requirements and is ready.");
    } else {
        console.warn("FCM registration is skipped: Web Notifications require HTTPS or localhost.");
    }
}).catch((err) => {
    console.error("FCM Compatibility Check Error:", err);
});
// 🌟 वेरिफिकेशन इंजन मॉड्यूल को रजिस्टर करें (यह सभी ग्लोबल फ़ंक्शंस को एक्टिव कर देगा)
import "./DK-love-Verified.js";
// Smart Back-Navigation Globals
window.navHistoryStack = []; // खुले हुए मोबाइल्स/चैट रूम्स का ट्रैक रखने के लिए
let lastBackPressTime = 0;   // डबल-टैप एक्जिट डिटेक्शन के लिए
// Exposing missing Firestore functions for share.js and other files
window.addDoc = addDoc;
window.setDoc = setDoc;
window.serverTimestamp = serverTimestamp;
window.writeBatch = writeBatch;
// Exposing to window for external file compatibility
window.app = app; 
window.db = db;
window.auth = auth;
window.getDoc = getDoc;
window.doc = doc;
window.query = query;
window.collection = collection;
window.where = where;
window.onSnapshot = onSnapshot;
window.orderBy = orderBy;
window.limit = limit;
window.startAfter = startAfter;
window.getDocs = getDocs;
window.arrayUnion = arrayUnion;
window.arrayRemove = arrayRemove;
window.updateDoc = updateDoc;
window.deleteDoc = deleteDoc;

// --- SOUND EFFECT ---
const sendSound = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU");

// ==========================================
// --- GLOBAL STATE VARIABLES ---
// ==========================================
let currentVisualThumbnail = null; 
let activeTextElement = null; 
let currentUser = null;
let currentUserData = null; 

let activeCommentPostId = null;
let allCachedUsers = []; 

let currentChatDetails = null; 
let returnToChatInfo = null;   
let currentPlayingReelId = null; 
let isFirstReelsLoad = true;
let reelObserver = null;

let currentChatId = null;
let currentReplyData = null; 
let unreadCounts = {}; 
window.unreadCounts = unreadCounts; 
let chatRawFile = null;
let chatMediaBase64 = null;
let chatMediaType = 'text';
let typingTimeout = null;
let selectedMsgId = null;
let selectedMsgText = null;
let chatDrafts = JSON.parse(localStorage.getItem('loveChats_drafts') || "{}");
window.chatDrafts = chatDrafts;

// Unsubscribers
let unsubscribeReels = null, unsubscribeFeed = null;
let unsubscribeComments = null, unsubscribeProfilePosts = null;
let unsubscribeUserStatus = null, unsubscribeStories = null;
let unsubscribeCurrentUser = null, unsubscribeChatList = null, unsubscribeStoryView = null; 
let unsubscribeChat = null, unsubscribeTyping = null, unsubscribeUnread = null;

// Story State
let activeStoryQueue = [];
let currentStoryIdx = 0;
let storyTimer = null;
let storyMusicAudio = new Audio();
let storyStartTime = 0;
let storyRemainingTime = 0;
let isStoryPaused = false;
let pendingMusicFromSticker = null;

// User Status
let currentProfileUid = null;
window.currentProfileUid = currentProfileUid;
let pendingUnlockData = null;

// RAW FILES & Preview Data
let selectedRawFile = null, profileRawFile = null;
let selectedMediaBase64 = null, selectedMediaType = 'image';
let longPressTimer = null;
let currentUploadXHR = null;

// Story Editor Vars
let editorCanvas, editorCtx;
let isDrawing = false, drawColor = '#fff', drawMode = false, textMode = false;
let editorMediaFile = null, editorMediaType = 'image', editorMusicFile = null;
let editorPreviewAudio = new Audio(), editorCurrentFilter = '', filterIndex = 0;
const filterList = ['', 'filter-grayscale', 'filter-sepia', 'filter-contrast', 'filter-invert'];
let drawHistory = [], isNewText = false;
let editorStoryDuration = 15, editorMusicUrl = null, musicLibrary = [], editorMusicStartTime = 0;
let musicLoopInterval = null, progressInterval = null;

// Viewers state
let viewersIndex = 0, isFetchingViewers = false, loadedViewersData = [];
const VIEWERS_LIMIT = 30;

// Navigation state
let returnToChatData = null, targetSharedPostId = null, currentVisibleReelId = null;

// Cache
const userCache = new Map();

// ==========================================
// --- 🌟 नया सुरक्षित FCM टोकन रजिस्ट्रेशन ---
// ==========================================
async function registerNotificationToken(userId) {
    if (!('serviceWorker' in navigator) || !messaging) {
        console.warn("FCM registration skipped: Service Workers are unsupported or connection is insecure.");
        return;
    }
    try {
        const registration = await navigator.serviceWorker.register('firebase-messaging-sw.js');
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const vapidKey = "BMDJDsQo74FayFmBTyW0oXjjB-sUutaiI1FysNolYtCe_MI3w1ZVcIiXgyVDkcpFsbOV8B1CWVYZbcoGd9H8ywk"; 

            const currentToken = await getToken(messaging, { 
                serviceWorkerRegistration: registration,
                vapidKey: vapidKey 
            });

            if (currentToken) {
                await setDoc(doc(db, "users", userId), {
                    fcmToken: currentToken,
                    lastTokenUpdate: Date.now()
                }, { merge: true });
                console.log("FCM Token updated successfully in database.");
            }
        }
    } catch (error) {
        console.error("An error occurred during registration:", error);
    }
}

// ==========================================
// --- AUTH STATE & USER SNAPSHOT ---
// ==========================================
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    window.currentUser = user;
    if(user) {
        onSnapshot(doc(db, "users", user.uid), (docSnap) => {
            if(docSnap.exists()) {
                currentUserData = docSnap.data();
                window.currentUserData = currentUserData;
            }
        });

        // 🌟 यूजर लॉगिन होने पर सुरक्षित रूप से टोकन रजिस्ट्रेशन शुरू करें
        registerNotificationToken(user.uid);
    }
});

const parseStartupDeepLinks = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const reelId = urlParams.get('reel');
    const postId = urlParams.get('post');

    if (reelId) {
        sessionStorage.setItem('pending_shared_reel', reelId);
    } else if (postId) {
        sessionStorage.setItem('pending_shared_post', postId);
    }
};
parseStartupDeepLinks();

window.checkAndRedirectPendingDeepLinks = async () => {
    const pendingReelId = sessionStorage.getItem('pending_shared_reel');
    const pendingPostId = sessionStorage.getItem('pending_shared_post');

    if (pendingReelId) {
        sessionStorage.removeItem('pending_shared_reel');
        const exists = await window.checkContentStillExists(pendingReelId, "posts");
        if (exists) {
            if (typeof window.goToPost === 'function') {
                window.goToPost(pendingReelId, 'video');
            }
        } else {
            if (typeof showToast === 'function') showToast("Not Found", "This Reel has been deleted.", currentUser?.photoURL);
        }
    } else if (pendingPostId) {
        sessionStorage.removeItem('pending_shared_post');
        const exists = await window.checkContentStillExists(pendingPostId, "posts");
        if (exists) {
            if (typeof window.goToPost === 'function') {
                window.goToPost(pendingPostId, 'image');
            }
        } else {
            if (typeof showToast === 'function') showToast("Not Found", "This Post has been deleted.", currentUser?.photoURL);
        }
    }
};
// ... (script.js का पहले से मौजूद कोड) ...

// ==========================================
// --- 🌟 PWA DEEP LINK ROUTING SYSTEM ---
// ==========================================
// ==========================================
// --- 🌟 PWA DEEP LINK ROUTING SYSTEM (BUG RESOLVED) ---
// ==========================================
function handleDeepLinking() {
    const urlParams = new URLSearchParams(window.location.search);
    const openChatUserId = urlParams.get('openChat');
    const viewPostId = urlParams.get('post');
    const viewReelId = urlParams.get('reel');

    // 1. यदि चैट नोटिफिकेशन पर क्लिक किया गया हो
    if (openChatUserId) {
        console.log("[Deep-Link] Routing to Chat with User:", openChatUserId);
        
        if (typeof window.switchTab === 'function') {
            window.switchTab('chat');
        }
        
        // 🌟 सुरक्षा फ़ेच और रीयल-टाइम रेंडर (सही फ़ंक्शन बाइंडिंग):
        // नॉन-एक्ज़िस्टेंट फ़ंक्शंस के बजाय सीधे 'window.startPrivateChat' को कॉल किया जाता है।
        const checkAndOpenChatRoom = async () => {
            let targetUser = window.allCachedUsers?.find(u => u.uid === openChatUserId);
            if (!targetUser && window.db) {
                try {
                    const uDoc = await window.getDoc(window.doc(window.db, "users", openChatUserId));
                    if (uDoc.exists()) targetUser = uDoc.data();
                } catch (e) {
                    console.error("[Deep-Link] Firestore fetch failed:", e.message);
                }
            }
            
            const name = targetUser ? targetUser.name : "User";
            const photo = targetUser ? (targetUser.avatarBase64 || targetUser.photoURL) : "https://i.pravatar.cc/150";
            
            if (typeof window.startPrivateChat === 'function') {
                window.startPrivateChat(openChatUserId, name, photo);
            }
        };

        // फ़ायरस्टोर इनिशियलाइज़ होने के बाद चैट रूम खोलें
        setTimeout(checkAndOpenChatRoom, 1400);

        // 🌟 100% पक्का एड्रेस बार क्लीनर (Address Bar Sanitizer):
        // राउटिंग होते ही यूआरएल से 'openChat=...' को चुपचाप डिलीट करता है ताकि आगे की नेविगेशन क्रैश न हो।
        const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
    } 
    // 2. यदि किसी पोस्ट के नोटिफिकेशन पर क्लिक किया गया हो
    else if (viewPostId) {
        console.log("[Deep-Link] Routing to Single Post View:", viewPostId);
        if (typeof window.openSinglePostView === 'function') {
            window.openSinglePostView(viewPostId);
        }
        
        // यूआरएल क्लीनर
        const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
    } 
    // 3. यदि किसी रील के नोटिफिकेशन पर क्लिक किया गया हो
    else if (viewReelId) {
        console.log("[Deep-Link] Routing to Reels View for Reel:", viewReelId);
        if (typeof window.switchTab === 'function') {
            window.switchTab('reels');
        }
        
        // यूआरएल क्लीनर
        const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
    }
}

window.addEventListener('popstate', handleDeepLinking);

function updateWindowUsersCache(usersArray) {
    allCachedUsers = usersArray;
    window.allCachedUsers = usersArray;
}

function updateNetworkStatus() {
    const el = document.getElementById('network-status');
    const txt = document.getElementById('net-text');
    
    if (navigator.onLine) {
        const conn = navigator.connection;
        if(conn && conn.saveData) console.log("Data Saver is ON...");
        if (el) el.className = 'net-online show';
        if (txt) txt.innerText = 'Connected';
        setTimeout(() => el?.classList.remove('show'), 2000);
    } else {
        if (el) el.className = 'net-offline show';
        if (txt) txt.innerText = 'Offline Mode (Using Cache)';
    }
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
updateNetworkStatus();

window.addEventListener('load', () => {
    history.pushState({ app: 'lovechats', view: 'home' }, null, window.location.href);
    
    editorCanvas = document.getElementById('drawing-canvas');
    if(editorCanvas) {
        editorCtx = editorCanvas.getContext('2d');
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        editorCanvas.addEventListener('touchstart', startDraw, {passive: false});
        editorCanvas.addEventListener('touchmove', draw, {passive: false});
        editorCanvas.addEventListener('touchend', endDraw);
        
        editorCanvas.addEventListener('mousedown', startDraw);
        editorCanvas.addEventListener('mousemove', draw);
        editorCanvas.addEventListener('mouseup', endDraw);
    }
    
    const scrubber = document.getElementById('music-scrubber');
    if(scrubber) scrubber.addEventListener('input', onScrubberInput);
});

// =========================================================
// --- SMART BACK-NAVIGATION & NAVIGATION STACK SYSTEM ---
// =========================================================

// 1. जब कोई मोडल या चैट खुले, तो इसे स्टैक में दर्ज करें
window.pushNavigationState = (type, closeFunc) => {
    const stateId = type + '_' + Date.now();
    if (!window.navHistoryStack) window.navHistoryStack = [];
    window.navHistoryStack.push({ id: stateId, type: type, close: closeFunc });
    
    // ब्राउज़र हिस्ट्री में नकली स्टेट पुश करें
    history.pushState({ navStateId: stateId }, null, window.location.href);
};

// 2. जब यूजर खुद क्लोज बटन दबाकर मोडल बंद करे, तो हिस्ट्री को सिंक्रोनाइज करें
window.popNavigationState = (type) => {
    if (window.navHistoryStack && window.navHistoryStack.length > 0) {
        const lastState = window.navHistoryStack[window.navHistoryStack.length - 1];
        if (lastState.type === type) {
            window.navHistoryStack.pop();
            window.history.back(); // बैक करके नकली स्टेट को हटा दें
        }
    }
};

// 3. मुख्य Popstate इवेंट लिसनर (सीक्वेंशियल फ्लो अपडेटेड)
// =========================================================
// --- SMART APP EXIT ENGINE ---
// =========================================================

/**
 * ऐप से पूरी तरह बाहर निकलने (Exit) के लिए सुरक्षित फ़ंक्शन।
 * ब्राउज़र सुरक्षा सीमाओं के कारण, PWA को बंद करने के लिए window.close() 
 * और 'about:blank' रीडायरेक्शन दोनों का उपयोग किया गया है।
 */
window.confirmAppExit = () => {
    if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]); // एक्जिट के लिए हैप्टिक फीडबैक
    }
    
    // वर्तमान सत्र के ड्राफ्ट को साफ़ करने या सहेजने का कार्य यहाँ करें
    
    // ब्राउज़र विंडो बंद करने का प्रयास
    window.close();
    
    // सामान्य ब्राउज़र वातावरण के लिए फॉलबैक
    setTimeout(() => {
        window.location.href = "about:blank";
    }, 150);
};

// पूर्व घोषित 'lastBackPressTime' का उपयोग करते हुए 'popstate' श्रोता (Listener) में बदलाव:
window.addEventListener('popstate', (event) => {
    // बैक बटन दबाए जाने पर डिफ़ॉल्ट रूप से PWA को बंद होने से बचाने के लिए स्टेट को रीस्टोर करें
    history.pushState({ app: 'lovechats' }, null, window.location.href);

    // [A] शेयर की गई पोस्ट से बैक आने पर पुनः चैट रूम खोलने का लॉजिक
    if (window.returnToChatData && window.targetSharedPostId) {
        const homeView = document.getElementById('home-view');
        const reelsView = document.getElementById('reels-view');
        
        let isStillOnPost = false;
        if (reelsView && reelsView.classList.contains('active-view')) {
            isStillOnPost = (window.currentVisibleReelId === window.targetSharedPostId);
        } else if (homeView && homeView.classList.contains('active-view')) {
            const postEl = document.getElementById(`post-${window.targetSharedPostId}`);
            if (postEl) {
                const rect = postEl.getBoundingClientRect();
                if (rect.top >= -200 && rect.bottom <= window.innerHeight + 200) isStillOnPost = true;
            }
        }

        if (isStillOnPost) {
            window.switchTab('chat', true);
            if (typeof window.openChatRoom === 'function') {
                window.openChatRoom(
                    window.returnToChatData.targetUid, 
                    window.returnToChatData.targetName, 
                    window.returnToChatData.placeholder, 
                    window.returnToChatData.isFake
                );
            }
            if (typeof window.toggleSharedReturnButton === 'function') window.toggleSharedReturnButton(false);
            window.returnToChatData = null; 
            window.targetSharedPostId = null;
            return;
        }
    }

    if (typeof window.toggleSharedReturnButton === 'function') window.toggleSharedReturnButton(false);

    // [B] प्राथमिकता 1: स्मार्ट नेविगेशन स्टैक की जांच (जैसे ChatProfile -> ChatRoom)
    if (window.navHistoryStack && window.navHistoryStack.length > 0) {
        const stateToClose = window.navHistoryStack.pop();
        if (stateToClose && typeof stateToClose.close === 'function') {
            stateToClose.close();
            return;
        }
    }

    // [C] प्राथमिकता 2 (सुरक्षा जाल): सीधे खुले मॉडलों की सूची को स्कैन करना (Legacy Fallback)
// 🌟 अपडेटेड स्मार्ट बैक-नेविगेशन ऐरे (वैरिफिकेशन हब सपोर्ट के साथ)
    const activeModals = [
        { id: 'chat-profile-modal', class: 'active', isHidden: false, close: () => window.closeChatProfile() },
        { id: 'media-viewer-modal', class: 'active', isHidden: false, close: () => window.closeFullScreenMedia() },
        { id: 'notif-full-modal', class: 'hidden', isHidden: true, close: () => window.toggleNotifFullModal(false) }, 
        { id: 'single-post-view-modal', class: 'hidden', isHidden: true, close: () => window.closeSinglePostView(true) },
        { id: 'story-view-modal', class: 'hidden', isHidden: true, close: () => window.closeStory() },
        { id: 'story-editor-modal', class: 'hidden', isHidden: true, close: () => window.closeStoryEditor() },
        { id: 'offline-radar-modal', class: 'hidden', isHidden: true, close: () => window.closeRadar() },
        { id: 'global-search-modal', class: 'hidden', isHidden: true, close: () => window.closeGlobalSearch() },
        { id: 'msg-options-modal', class: 'hidden', isHidden: true, close: () => window.closeMsgOptions() },
        { id: 'inbox-options-modal', class: 'hidden', isHidden: true, close: () => window.closeInboxOptions() },
        { id: 'comments-modal', class: 'hidden', isHidden: true, close: () => window.toggleModal('comments-modal', false) },
        { id: 'share-modal', class: 'hidden', isHidden: true, close: () => window.toggleModal('share-modal', false) },
        { id: 'user-list-modal', class: 'hidden', isHidden: true, close: () => window.toggleModal('user-list-modal', false) },
        { id: 'edit-profile-modal', class: 'hidden', isHidden: true, close: () => window.toggleModal('edit-profile-modal', false) },
        { id: 'settings-modal', class: 'hidden', isHidden: true, close: () => window.closeSettingsModal() },
        { id: 'verification-hub-modal', class: 'hidden', isHidden: true, close: () => window.closeVerificationHub() }, // 🌟 नया: वेरिफिकेशन हब बैक बटन एक्जिट सपोर्ट
        { id: 'create-post-modal', class: 'hidden', isHidden: true, close: () => window.toggleModal('create-post-modal', false) },
        { id: 'password-prompt-modal', class: 'hidden', isHidden: true, close: () => window.cancelUnlockChat() },
        { id: 'story-viewers-modal', class: 'hidden', isHidden: true, close: () => window.toggleModal('story-viewers-modal', false) },
        { id: 'custom-alert-modal', class: 'hidden', isHidden: true, close: () => window.closeCustomAlert() },
        { id: 'custom-confirm-modal', class: 'hidden', isHidden: true, close: () => window.closeCustomConfirm() },
        { id: 'exit-modal', class: 'hidden', isHidden: true, close: () => window.toggleModal('exit-modal', false) }
    ];

    for (let modal of activeModals) {
        const el = document.getElementById(modal.id);
        if (el) {
            const isOpen = modal.isHidden ? !el.classList.contains('hidden') : el.classList.contains('active');
            if (isOpen) { 
                modal.close(); 
                return; 
            }
        }
    }

    // [D] चैट रूम बंद करने का लॉजिक (Fallback सुरक्षा के लिए)
    const chatRoom = document.getElementById('chat-room');
    if (chatRoom && chatRoom.classList.contains('active')) { 
        if(typeof window.closeChat === 'function') window.closeChat(); 
        return; 
    }

    // [E] इनबॉक्स लिस्ट (Messages tab) से होम फीड पर वापस जाने का लॉजिक
    const homeView = document.getElementById('home-view');
    if (homeView && !homeView.classList.contains('active-view')) { 
        if(typeof window.switchTab === 'function') window.switchTab('home'); 
        return; 
    }

    // [F] अंतिम चरण: स्मार्ट एग्जिट लॉजिक (स्मार्टफोन बैक बटन हैंडलर)
    if (homeView && homeView.classList.contains('active-view')) {
        // यदि यूजर होम स्क्रीन पर बहुत नीचे स्क्रॉल कर चुका है, तो पहला बैक बटन केवल ऊपर स्क्रॉल करेगा।
        if (homeView.scrollTop > 200) { 
            homeView.scrollTo({ top: 0, behavior: 'smooth' }); 
            return; 
        }

        const currentTime = Date.now();
        const doubleTapInterval = 2000; // 2 सेकंड की समय सीमा

        // यदि यूजर 2 सेकंड के भीतर दोबारा बैक बटन दबाता है
        if (currentTime - lastBackPressTime < doubleTapInterval) {
            window.confirmAppExit(); // सीधे ऐप बंद करें
        } else {
            lastBackPressTime = currentTime;
            
            // दृश्य फीडबैक के लिए कस्टमाइज़्ड एग्जिट पुष्टिकरण मोडल खोलें
            if (typeof window.toggleModal === 'function') {
                window.toggleModal('exit-modal', true);
            }
            
            // वैकल्पिक: यूजर अनुभव को बढ़ाने के लिए हल्का टोस्ट मैसेज
            if (typeof showToast === 'function') {
                let userPhoto = currentUserData?.avatarBase64 || currentUser?.photoURL;
                showToast("Exit Application", "Press back once more to close", userPhoto);
            }
        }
    }
});


// ==========================================
// --- UTILITY & HELPER FUNCTIONS ---
// ==========================================
async function getFastUserData(uid) {
    if (userCache.has(uid)) return userCache.get(uid);
    try {
        const uDoc = await getDoc(doc(db, "users", uid));
        if (uDoc.exists()) {
            const data = uDoc.data();
            userCache.set(uid, data);
            return data;
        }
    } catch (e) { return null; }
}

function playSendSound() { 
    try { sendSound.currentTime = 0; sendSound.play().catch(e => console.log("Audio play blocked", e)); } catch(e) {} 
}
window.playSendSound = playSendSound;

window.closeActivitySheet = () => {
    window.toggleModal('story-viewers-modal', false);
    resumeStory();
};

window.onImageLoad = (img) => {
    img.classList.add('loaded');
    if(img.parentElement.classList.contains('img-placeholder')) {
        img.parentElement.style.animation = 'none';
        img.parentElement.style.background = 'transparent';
    }
};

function resizeCanvas() {
    const container = document.getElementById('editor-canvas-container');
    if(container && editorCanvas) {
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            editorCanvas.width = rect.width;
            editorCanvas.height = rect.height;
        }
    }
}

// ==========================================
// --- STATUS UI ---
// ==========================================
function renderActiveNowBar(users) {
    const container = document.getElementById('active-now-bar');
    if(!container) return;

    const now = Date.now();
    const activeUsers = users.filter(u => (now - u.lastActive) < 120000 && u.uid !== currentUser?.uid);

    if(activeUsers.length === 0) { container.classList.add('hidden'); return; }

    container.classList.remove('hidden');
    let html = "";

    activeUsers.forEach(u => {
        const img = u.avatarBase64 || u.photoURL || "https://i.pravatar.cc/150";
        const hasStories = window.allGroupedStories && window.allGroupedStories[u.uid] && window.allGroupedStories[u.uid].length > 0;
        let imgClass = "active-img"; 
        let clickAction = `if(typeof startPrivateChat==='function') startPrivateChat('${u.uid}', '${u.name}', '${img}')`;

        if (hasStories) {
            imgClass += hasUnseenStories(u.uid) ? " story-ring-border" : " story-seen-border"; 
            clickAction = `viewStoryGroup('${u.uid}')`;
        }

        html += `
        <div class="active-item">
            <div class="active-img-container" onclick="${clickAction}">
                <img src="${img}" class="${imgClass}">
                <div class="active-dot-badge"></div>
            </div>
            <div class="active-name" onclick="if(typeof startPrivateChat==='function') startPrivateChat('${u.uid}', '${u.name}', '${img}')">${u.name.split(' ')[0]}</div>
        </div>`;
    });
    container.innerHTML = html;
}
window.renderActiveNowBar = renderActiveNowBar;

// ==========================================
// --- NAVIGATION & UI TOGGLES ---
// ==========================================
window.toggleAuth = (screen) => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const allInputs = document.querySelectorAll('#auth-section input');
    
    allInputs.forEach(input => { input.value = ""; input.style.borderColor = "rgba(255,255,255,0.1)"; });
    if (navigator.vibrate) navigator.vibrate(10);

    if (screen === 'signup') {
        loginForm.classList.add('hidden'); signupForm.classList.remove('hidden');
        document.getElementById('reg-username')?.focus();
    } else {
        signupForm.classList.add('hidden'); loginForm.classList.remove('hidden');
        document.getElementById('login-email')?.focus();
    }
};

window.toggleModal = (id, show) => {
    const modal = document.getElementById(id);
    if(show && modal) {
        modal.classList.remove('hidden');
        modal.querySelector('.modal-content')?.classList.add('fade-in');
    } else if (modal) { 
        modal.classList.add('hidden'); 
        if(id === 'create-post-modal' && typeof window.resetNewPostUI === 'function') window.resetNewPostUI();
    }
};

window.triggerStoryUpload = () => {
    const storyInput = document.getElementById('story-upload');
    if (storyInput) storyInput.click();
    else if(typeof showCustomAlert === 'function') showCustomAlert("Error", "Story upload system is not ready. Please refresh.", "error");
};

window.switchTab = (tab, noRefresh = false) => {
    const targetView = document.getElementById(tab + '-view');
    
    if(tab === 'profile' && currentUser && (currentProfileUid !== currentUser.uid || targetView.classList.contains('active-view'))) {
        if(typeof window.viewUserProfile === 'function') window.viewUserProfile(currentUser.uid);
    }

    if (tab !== 'reels') document.querySelectorAll('.reel-video').forEach(vid => vid.pause());

    if (!noRefresh) {
        returnToChatData = null; targetSharedPostId = null;
        const topBackBtn = document.getElementById('shared-return-btn');
        if (topBackBtn) topBackBtn.style.display = 'none';
    }

    if (targetView.classList.contains('active-view')) {
        if (!noRefresh) {
            if (tab === 'home' && typeof window.loadFeed === 'function') window.loadFeed(true); 
            if (tab === 'reels' && typeof refreshReels === 'function') refreshReels(); 
            targetView.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
    }

    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    targetView.classList.add('active-view');
    const navItems = document.querySelectorAll('.nav-item');
    
    if (tab === 'home') navItems[0].classList.add('active'); 
    else if (tab === 'reels') { navItems[2].classList.add('active'); if(!noRefresh && typeof loadReels === 'function') loadReels(); }
    else if (tab === 'chat') navItems[4].classList.add('active'); 
    else if (tab === 'profile') navItems[5].classList.add('active'); 
};

function toggleSharedReturnButton(show) {
    let btn = document.getElementById('shared-return-btn');
    if (!btn) {
        btn = document.createElement('div');
        btn.id = 'shared-return-btn';
        btn.innerHTML = `<i class="fa-solid fa-arrow-left"></i>`;
        btn.style.cssText = 'position:fixed; top:15px; left:15px; width:40px; height:40px; border-radius:50%; background:rgba(0,0,0,0.5); color:white; display:flex; align-items:center; justify-content:center; z-index:9999; cursor:pointer; backdrop-filter:blur(10px); font-size:1.2rem;';
        btn.onclick = () => { window.history.back(); }; 
        document.body.appendChild(btn);
    }
    btn.style.display = show ? 'flex' : 'none';
}
window.toggleSharedReturnButton = toggleSharedReturnButton;

function updateAllFeedAvatars() {
    const avatars = document.querySelectorAll('.feed-story-avatar');
    avatars.forEach(img => {
        const uid = img.getAttribute('data-user-id');
        if (!uid) return;
        const hasStory = window.allGroupedStories && window.allGroupedStories[uid] && window.allGroupedStories[uid].length > 0;
        img.classList.remove('story-border-unseen', 'story-border-seen');
        
        if (hasStory) {
            img.classList.add(window.hasUnseenStories(uid) ? 'story-border-unseen' : 'story-border-seen'); 
            img.onclick = () => viewStoryGroup(uid);
        } else {
            img.style.border = "none";
            img.onclick = () => { if(typeof window.viewUserProfile === 'function') window.viewUserProfile(uid); };
        }
    });
}
window.updateAllFeedAvatars = updateAllFeedAvatars;

// ==========================================
// --- FILE UPLOAD ENGINE ---
// ==========================================
function uploadFile(file, onProgress) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", "love_chats_unsigned");
        formData.append("cloud_name", "dknnmldye");

        const xhr = new XMLHttpRequest();
        currentUploadXHR = xhr; 
        xhr.open("POST", "https://api.cloudinary.com/v1_1/dknnmldye/auto/upload");

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                resolve({ url: data.secure_url, type: data.resource_type });
            } else reject("Upload failed"); 
        };

        xhr.onerror = () => reject("Network error");
        xhr.onabort = () => reject("Cancelled");
        xhr.send(formData);
    });
}

function generateVideoCover(file) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        video.src = URL.createObjectURL(file);
        video.muted = true; video.playsInline = true;
        video.onloadeddata = () => { video.currentTime = 1; };
        video.onseeked = () => {
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg'));
            URL.revokeObjectURL(video.src); 
        };
    });
}

window.cancelUpload = () => {
    if (currentUploadXHR) { currentUploadXHR.abort(); currentUploadXHR = null; }
    const uploadArea = document.getElementById('upload-status-area');
    if (uploadArea) uploadArea.innerHTML = ""; 
    let userPhoto = currentUserData?.avatarBase64 || currentUserData?.photoURL || currentUser?.photoURL;
    if(typeof showToast === 'function') showToast("Cancelled", "Upload has been stopped.", userPhoto);
};

// ==========================================
// --- STORY LOGIC & EDITOR ---
// ==========================================
function hasUnseenStories(targetUid) {
    if (!window.allGroupedStories || !window.allGroupedStories[targetUid]) return false;
    return window.allGroupedStories[targetUid].some(story => !story.views || !story.views.includes(currentUser?.uid));
}
window.hasUnseenStories = hasUnseenStories;

function loadStories() {
    if(unsubscribeStories) unsubscribeStories();
    const q = query(collection(db, "stories"), orderBy("timestamp", "desc"), limit(60));
    
    unsubscribeStories = onSnapshot(q, (snapshot) => {
        const container = document.getElementById('stories-container');
        if(!container) return;
        
        const now = Date.now();
        const groupedStories = new Map();

        snapshot.forEach(docSnap => {
            const s = docSnap.data();
            const storyTime = s.timestamp?.toMillis ? s.timestamp.toMillis() : 0;
            if(now - storyTime < 86400000) { // 1 day
                if (!groupedStories.has(s.userId)) groupedStories.set(s.userId, { userId: s.userId, userName: s.userName, userPhoto: s.userPhoto, stories: [] });
                groupedStories.get(s.userId).stories.push({ ...s, id: docSnap.id });
            }
        });

        window.allGroupedStories = {};
        groupedStories.forEach((val, key) => {
            val.stories.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
            window.allGroupedStories[key] = val.stories;
        });

        container.innerHTML = "";

        if (currentUser) {
            const myDiv = document.createElement('div');
            myDiv.className = 'story-item';
            const myPhoto = currentUserData?.avatarBase64 || currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.displayName)}`;
            const myStories = groupedStories.get(currentUser.uid);
            const ringClass = myStories ? 'ring-seen' : 'ring-none';
            const clickAction = myStories ? `viewStoryGroup('${currentUser.uid}')` : `triggerStoryUpload()`;
            
            myDiv.innerHTML = `
                <div class="story-ring ${ringClass}" onclick="${clickAction}">
                    <img src="${myPhoto}" class="story-img" id="my-story-ring-img">
                    <div class="add-story-badge" onclick="event.stopPropagation(); triggerStoryUpload()"><i class="fa-solid fa-plus" style="font-size:0.7rem;"></i></div>
                </div>
                <span class="story-name">Your Story</span>`;
            container.appendChild(myDiv);
        }

        groupedStories.forEach((group, uid) => {
            if (currentUser && uid === currentUser.uid) return; 
            const div = document.createElement('div');
            div.className = 'story-item';
            div.onclick = () => viewStoryGroup(uid);
            
            const ringClass = hasUnseenStories(uid) ? 'ring-unseen' : 'ring-seen';
            div.innerHTML = `
                <div class="story-ring ${ringClass}">
                    <img src="${group.userPhoto}" class="story-img" id="story-ring-img-${uid}">
                </div>
                <span class="story-name">${group.userName}</span>`;
            container.appendChild(div);
            updateStoryRingDP(uid);
        });
        updateAllFeedAvatars();
    });
}
window.loadStories = loadStories;

async function updateStoryRingDP(uid) {
    try {
        const userSnap = await getDoc(doc(db, "users", uid));
        if(userSnap.exists()) {
            const uData = userSnap.data();
            const img = document.getElementById(`story-ring-img-${uid}`);
            if(img && (uData.avatarBase64 || uData.photoURL)) img.src = uData.avatarBase64 || uData.photoURL;
        }
    } catch(e) {}
}

window.openStoryEditor = async (input) => {
    const file = input.files[0];
    if(!file) return;
    editorMediaFile = file;

    if(file.type.startsWith('video')) {
        editorMediaType = 'video';
        currentVisualThumbnail = await generateVideoCover(file); 
    } else {
        editorMediaType = 'image';
        currentVisualThumbnail = URL.createObjectURL(file);
    }
    
    drawHistory = []; 
    if (editorCtx) editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height); 
    document.querySelectorAll('.editor-text-overlay').forEach(e => e.remove()); 
    
    if(musicLoopInterval) clearInterval(musicLoopInterval);
    if(progressInterval) clearInterval(progressInterval);
    if(editorPreviewAudio) { editorPreviewAudio.pause(); editorPreviewAudio.src = ""; }

    filterIndex = 0; editorCurrentFilter = '';
    document.getElementById('story-editor-modal').classList.remove('hidden');
    const trimmerContainer = document.getElementById('music-trimmer-container');

    if (pendingMusicFromSticker) {
        editorMusicUrl = pendingMusicFromSticker; 
        editorPreviewAudio.src = editorMusicUrl;
        editorPreviewAudio.load(); 
        editorMusicStartTime = 0; editorStoryDuration = 15; 

        document.querySelectorAll('.dur-btn').forEach(btn => btn.classList.remove('active'));
        const dur15Btn = document.getElementById('dur-15');
        if(dur15Btn) dur15Btn.classList.add('active');

        document.getElementById('music-status-text').innerHTML = `🎵 Audio Applied <i class="fa-solid fa-xmark" onclick="removeStoryMusic()"></i>`;
        
        if(trimmerContainer) { trimmerContainer.style.display = 'block'; trimmerContainer.classList.remove('hidden'); }

        editorPreviewAudio.onloadedmetadata = () => {
            const scrubber = document.getElementById('music-scrubber');
            if(scrubber) { scrubber.max = Math.floor(editorPreviewAudio.duration) - editorStoryDuration; scrubber.value = 0; }
            updateTrimmerUI(0); startMusicLoop(); window.startRunningProgress(); 
        };
        pendingMusicFromSticker = null;
    } else {
        editorMusicUrl = null;
        document.getElementById('music-status-text').innerText = "No music";
        if(trimmerContainer) { trimmerContainer.classList.add('hidden'); trimmerContainer.style.display = 'none'; }
    }

    setTimeout(() => { resizeCanvas(); }, 150);

    const imgEl = document.getElementById('editor-preview-img');
    const vidEl = document.getElementById('editor-preview-video');
    imgEl.className = "hidden"; vidEl.className = "hidden";

    const reader = new FileReader();
    if(file.type.startsWith('video')) {
        reader.onload = (e) => { vidEl.src = e.target.result; vidEl.classList.remove('hidden'); vidEl.play().catch(err => console.log("Auto-play blocked")); };
    } else {
        reader.onload = (e) => { imgEl.src = e.target.result; imgEl.classList.remove('hidden'); };
    }
    reader.readAsDataURL(file);
    input.value = ""; 
};

window.closeStoryEditor = () => {
    document.getElementById('story-editor-modal').classList.add('hidden');
    if(editorPreviewAudio) editorPreviewAudio.pause();
    const vid = document.getElementById('editor-preview-video');
    if(vid) { vid.pause(); vid.src = ""; }
};

// --- DRAWING & TEXT TOOLS ---
function getTouchPos(e) {
    const rect = editorCanvas.getBoundingClientRect();
    const touch = e.touches[0];
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
}
function getMousePos(e) {
    const rect = editorCanvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function startDraw(e) {
    if(!drawMode) return;
    isDrawing = true;
    const pos = e.type.includes('touch') ? getTouchPos(e) : getMousePos(e);
    drawHistory.push({ color: drawColor, points: [{x: pos.x, y: pos.y}] });
    editorCtx.beginPath();
    editorCtx.strokeStyle = drawColor; editorCtx.lineWidth = 5; editorCtx.lineCap = 'round';
    editorCtx.moveTo(pos.x, pos.y);
}

function draw(e) {
    if(!isDrawing || !drawMode) return;
    if (e.cancelable) e.preventDefault();
    const pos = e.type.includes('touch') ? getTouchPos(e) : getMousePos(e);
    drawHistory[drawHistory.length - 1].points.push({x: pos.x, y: pos.y});
    editorCtx.lineTo(pos.x, pos.y); editorCtx.stroke();
}

function endDraw() { isDrawing = false; editorCtx.closePath(); }

window.toggleDrawTool = () => {
    drawMode = true;
    document.getElementById('editor-top-tools').classList.add('hidden');
    document.getElementById('editor-close-btn').classList.add('hidden');
    document.getElementById('draw-tools-header').classList.remove('hidden'); 
    document.getElementById('color-picker-bar').style.display = 'flex';
    document.getElementById('story-editor-modal').classList.add('drawing-mode-active');
    redrawCanvas();
};

window.finishDrawing = () => {
    drawMode = false;
    document.getElementById('draw-tools-header').classList.add('hidden');
    document.getElementById('editor-top-tools').classList.remove('hidden');
    document.getElementById('editor-close-btn').classList.remove('hidden');
    document.getElementById('color-picker-bar').style.display = 'none';
    document.getElementById('story-editor-modal').classList.remove('drawing-mode-active');
    redrawCanvas(); 
};

window.exitDrawing = () => {
    if (drawHistory.length > 0 && typeof window.showDynamicConfirm === 'function') {
        window.showDynamicConfirm("Discard Drawing?", "If you exit now, your drawings will be removed.", "fa-solid fa-trash", () => {
            drawHistory = []; redrawCanvas(); window.finishDrawing();
        });
    } else window.finishDrawing();
};

window.undoLastDraw = () => {
    if (drawHistory.length > 0) {
        drawHistory.pop(); redrawCanvas();
        if (navigator.vibrate) navigator.vibrate(30);
    }
};

window.clearCanvas = () => {
    if(typeof window.showDynamicConfirm === 'function') {
        window.showDynamicConfirm("Clear All Drawings?", "This will remove everything you drew.", "fa-solid fa-eraser", () => { drawHistory = []; redrawCanvas(); });
    }
};

window.setDrawColor = (color) => { 
    drawColor = color; 
    if (activeTextElement) {
        activeTextElement.style.color = color; activeTextElement.style.transition = "color 0.2s ease"; activeTextElement.focus();
    }
    document.querySelectorAll('.tool-btn').forEach(btn => { if(btn.querySelector('.fa-pen')) btn.style.color = color; });
    if (typeof redrawCanvas === 'function') redrawCanvas();
};

function redrawCanvas() {
    if (!editorCtx || !editorCanvas) return;
    editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
    drawHistory.forEach(line => {
        editorCtx.beginPath();
        editorCtx.strokeStyle = line.color; editorCtx.lineWidth = 5; editorCtx.lineCap = 'round'; editorCtx.lineJoin = 'round';
        line.points.forEach((pt, i) => { i === 0 ? editorCtx.moveTo(pt.x, pt.y) : editorCtx.lineTo(pt.x, pt.y); });
        editorCtx.stroke();
    });
}

window.toggleTextTool = () => {
    document.getElementById('draw-tools-header').classList.add('hidden');
    document.getElementById('editor-top-tools').classList.add('hidden');
    document.getElementById('editor-close-btn').classList.add('hidden');
    document.getElementById('text-done-btn').classList.remove('hidden');
    document.getElementById('color-picker-bar').style.display = 'flex';
    document.getElementById('story-editor-modal').classList.add('typing-mode-active');

    const container = document.getElementById('editor-canvas-container');
    const textDiv = document.createElement('div');
    textDiv.contentEditable = true; textDiv.className = 'editor-text-overlay';
    textDiv.innerText = "Type here...";
    textDiv.style.cssText = `color: ${drawColor}; top: 40%; left: 50%; transform: translate(-50%, -50%);`;
    
    isNewText = true; container.appendChild(textDiv);
    setupTextEvents(textDiv);
    setTimeout(() => textDiv.focus(), 100);
    redrawCanvas(); 
};

function setupTextEvents(el) {
    el.onfocus = () => {
        activeTextElement = el;
        if(el.innerText === "Type here...") el.innerText = "";
        document.getElementById('text-done-btn').classList.remove('hidden');
        document.getElementById('editor-top-tools').classList.add('hidden');
        document.getElementById('editor-close-btn').classList.add('hidden'); 
        document.getElementById('story-editor-modal').classList.add('typing-mode-active');
        document.getElementById('color-picker-bar').style.display = 'flex';
        redrawCanvas();
    };
    el.oninput = () => { el.style.color = drawColor; };
    el.onclick = (e) => {
        e.stopPropagation(); 
        if (!document.getElementById('story-editor-modal').classList.contains('typing-mode-active')) {
            isNewText = false; el.focus();
        }
    };
    makeElementDraggable(el);
}

document.getElementById('editor-canvas-container')?.addEventListener('mousedown', (e) => {
    if (document.getElementById('story-editor-modal').classList.contains('typing-mode-active')) {
        if (e.target.id === 'drawing-canvas' || e.target.id === 'editor-canvas-container') window.finishTextEditing(false);
    }
});

window.finishTextEditing = (shouldSave = true) => {
    if (!activeTextElement) return;
    const textValue = activeTextElement.innerText.trim();

    if ((!shouldSave && isNewText) || textValue === "" || textValue === "Type here...") activeTextElement.remove();
    else { activeTextElement.blur(); window.getSelection().removeAllRanges(); }

    document.getElementById('text-done-btn').classList.add('hidden');
    document.getElementById('editor-top-tools').classList.remove('hidden');
    document.getElementById('editor-close-btn').classList.remove('hidden');
    document.getElementById('draw-tools-header').classList.add('hidden');
    document.getElementById('story-editor-modal').classList.remove('typing-mode-active');
    document.getElementById('color-picker-bar').style.display = 'none';
    
    activeTextElement = null; isNewText = false;
    setTimeout(() => redrawCanvas(), 50);
};

function makeElementDraggable(elmnt) {
    if (!elmnt.dataset.x) { elmnt.dataset.x = 0; elmnt.dataset.y = 0; elmnt.dataset.scale = 1; elmnt.dataset.rotate = 0; }
    let startX, startY, initialDist = 0, initialAngle = 0;
    let currentX = parseFloat(elmnt.dataset.x), currentY = parseFloat(elmnt.dataset.y);
    let currentScale = parseFloat(elmnt.dataset.scale), currentRotate = parseFloat(elmnt.dataset.rotate);
    const trash = document.getElementById('editor-trash-container');

    elmnt.addEventListener('touchstart', (e) => {
        activeTextElement = elmnt; elmnt.style.zIndex = 500; elmnt.style.transition = 'none'; 
        if(trash) trash.classList.remove('hidden');
        currentX = parseFloat(elmnt.dataset.x); currentY = parseFloat(elmnt.dataset.y);
        currentScale = parseFloat(elmnt.dataset.scale); currentRotate = parseFloat(elmnt.dataset.rotate);

        if (e.touches.length === 2) {
            initialDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            initialAngle = Math.atan2(e.touches[1].pageY - e.touches[0].pageY, e.touches[1].pageX - e.touches[0].pageX) * 180 / Math.PI;
        } else {
            startX = e.touches[0].clientX - currentX; startY = e.touches[0].clientY - currentY;
        }
    }, { passive: true });

    elmnt.addEventListener('touchmove', (e) => {
        if (e.cancelable) e.preventDefault();
        if (e.touches.length === 2) {
            let dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
            let angle = Math.atan2(e.touches[1].pageY - e.touches[0].pageY, e.touches[1].pageX - e.touches[0].pageX) * 180 / Math.PI;
            let newScale = currentScale * (dist / initialDist);
            if (newScale < 0.5) newScale = 0.5; if (newScale > 6.0) newScale = 6.0;
            elmnt.dataset.scale = newScale;
            let newRotate = currentRotate + (angle - initialAngle);
            if (Math.abs(newRotate % 90) < 5) { newRotate = Math.round(newRotate / 90) * 90; if (navigator.vibrate) navigator.vibrate(10); }
            elmnt.dataset.rotate = newRotate;
        } else {
            elmnt.dataset.x = e.touches[0].clientX - startX; elmnt.dataset.y = e.touches[0].clientY - startY;
        }
        elmnt.style.transform = `translate(${elmnt.dataset.x}px, ${elmnt.dataset.y}px) scale(${elmnt.dataset.scale}) rotate(${elmnt.dataset.rotate}deg)`;
        
        if(trash) {
            const trashRect = trash.getBoundingClientRect();
            const tx = e.touches[0].clientX, ty = e.touches[0].clientY;
            if (tx > trashRect.left && tx < trashRect.right && ty > trashRect.top && ty < trashRect.bottom) {
                trash.classList.add('active'); elmnt.style.opacity = "0.3";
            } else { trash.classList.remove('active'); elmnt.style.opacity = "1"; }
        }
    }, { passive: false });

    elmnt.addEventListener('touchend', () => {
        elmnt.style.transition = 'transform 0.1s ease-out';
        if(trash) {
            trash.classList.add('hidden');
            if (trash.classList.contains('active')) {
                elmnt.style.transform += " scale(0)";
                if (navigator.vibrate) navigator.vibrate(50);
                setTimeout(() => elmnt.remove(), 200);
            }
            trash.classList.remove('active');
        }
    });
}

// --- STORY MUSIC & TRIMMER ---
async function syncMusicLibrary() {
    try {
        const q = query(collection(db, "songs"), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);
        musicLibrary = []; 
        snapshot.forEach(docSnap => musicLibrary.push({ id: docSnap.id, ...docSnap.data() }));
    } catch (e) { console.error("Music Fetch Error:", e); }
}

window.triggerMusicUpload = async () => {
    const modal = document.getElementById('music-search-modal');
    if(modal) {
        modal.classList.remove('hidden');
        const container = document.getElementById('music-list-container');
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#ff9f43;"><i class="fa-solid fa-spinner fa-spin"></i> Loading Tracks...</div>';
        await syncMusicLibrary(); 
        renderMusicList(musicLibrary);
    }
};

window.closeMusicSearch = () => { const modal = document.getElementById('music-search-modal'); if(modal) modal.classList.add('hidden'); };

function renderMusicList(songs) {
    const container = document.getElementById('music-list-container');
    if(!container) return;
    container.innerHTML = "";
    if(songs.length === 0) { container.innerHTML = `<div style="text-align:center; color:#555; padding:30px;">No music found in library.</div>`; return; }

    songs.forEach(song => {
        const div = document.createElement('div');
        div.className = "music-item fade-in";
        div.onclick = () => window.selectSongFromSearch(song); 
        div.innerHTML = `
            <img src="${song.cover || 'https://i.pravatar.cc/150?u=music'}" class="music-cover" onerror="this.src='https://i.pravatar.cc/150?u=error'">
            <div class="music-info"><b style="color:white; font-size:0.9rem;">${song.title}</b><span style="color:#888; font-size:0.75rem;">${song.artist}</span></div>
            <div style="margin-left:auto; color:var(--primary); font-size:1.1rem;"><i class="fa-solid fa-circle-play"></i></div>`;
        container.appendChild(div);
    });
}

window.filterMusicList = () => {
    const queryTxt = document.getElementById('music-search-bar').value.toLowerCase().trim();
    const filtered = musicLibrary.filter(s => (s.title || "").toLowerCase().includes(queryTxt) || (s.artist || "").toLowerCase().includes(queryTxt));
    renderMusicList(filtered);
};

window.removeStoryMusic = () => {
    if(editorPreviewAudio) editorPreviewAudio.pause();
    if(musicLoopInterval) clearInterval(musicLoopInterval);
    if(progressInterval) clearInterval(progressInterval);
    editorMusicUrl = null; editorMusicStartTime = 0;

    const trimmerContainer = document.getElementById('music-trimmer-container');
    if(trimmerContainer) { trimmerContainer.style.display = ""; trimmerContainer.classList.add('hidden'); }
    document.getElementById('music-status-text').innerHTML = "No music";
    if(typeof showToast === 'function') showToast("Removed", "Music removed", currentUser?.photoURL);
};

function formatTimeDuration(seconds) {
    const min = Math.floor(seconds / 60); const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

function startMusicLoop() {
    if(musicLoopInterval) clearInterval(musicLoopInterval);
    editorPreviewAudio.currentTime = editorMusicStartTime;
    editorPreviewAudio.play().catch(e => console.log("Play error"));
    musicLoopInterval = setInterval(() => {
        if (editorPreviewAudio.currentTime >= editorMusicStartTime + editorStoryDuration) editorPreviewAudio.currentTime = editorMusicStartTime;
    }, 500);
}

function onScrubberInput(e) {
    editorMusicStartTime = parseFloat(e.target.value);
    editorPreviewAudio.currentTime = editorMusicStartTime;
    updateTrimmerUI(editorMusicStartTime);
    
    const display = document.getElementById('trimmer-time-display');
    if(display) {
        const min = Math.floor(editorMusicStartTime / 60);
        const sec = Math.floor(editorMusicStartTime % 60);
        display.innerText = `${min}:${sec < 10 ? '0' : ''}${sec}`;
    }
}

function updateTrimmerUI(startTime) {
    const windowEl = document.getElementById('selection-window');
    const badgeEl = document.getElementById('selection-badge');
    const totalDuration = editorPreviewAudio.duration;
    if (!totalDuration) return;

    windowEl.style.width = (editorStoryDuration / totalDuration) * 100 + "%";
    windowEl.style.left = (startTime / totalDuration) * 100 + "%";
    if(badgeEl) badgeEl.innerText = editorStoryDuration + "s";
    
    const bars = document.querySelectorAll('.waveform-bar');
    const barsPerSec = bars.length / totalDuration;
    const startIdx = Math.floor(startTime * barsPerSec);
    const endIdx = Math.floor((startTime + editorStoryDuration) * barsPerSec);

    bars.forEach((bar, i) => {
        bar.style.background = (i >= startIdx && i <= endIdx) ? "#ff006e" : "rgba(255,255,255,0.15)";
        bar.style.opacity = (i >= startIdx && i <= endIdx) ? "1" : "0.3";
    });
}

window.startRunningProgress = () => {
    if(progressInterval) clearInterval(progressInterval);
    const progressEl = document.getElementById('selection-progress');
    if(!progressEl) return;
    progressInterval = setInterval(() => {
        if (!editorPreviewAudio.paused) {
            const elapsed = editorPreviewAudio.currentTime - editorMusicStartTime;
            const percent = (elapsed / editorStoryDuration) * 100;
            progressEl.style.width = Math.min(percent, 100) + "%";
            if (percent >= 100 || elapsed < 0) progressEl.style.width = "0%";
        }
    }, 50); 
};

window.changeStoryDuration = (sec) => {
    editorStoryDuration = sec; 
    document.querySelectorAll('.dur-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`dur-${sec}`);
    if(activeBtn) activeBtn.classList.add('active');

    const badge = document.getElementById('selection-badge');
    if(badge) badge.innerText = sec + "s";
    
    const scrubber = document.getElementById('music-scrubber');
    if (editorPreviewAudio.duration && scrubber) {
        scrubber.max = Math.floor(editorPreviewAudio.duration) - sec;
        updateTrimmerUI(editorMusicStartTime); startMusicLoop(); 
    }
    if(typeof showToast === 'function') showToast("Duration Set", `Story will last for ${sec} seconds`, currentUser?.photoURL);
};

window.finishMusicTrimming = () => {
    if(editorPreviewAudio) editorPreviewAudio.pause();
    if(musicLoopInterval) clearInterval(musicLoopInterval);

    const trimmerContainer = document.getElementById('music-trimmer-container');
    if(trimmerContainer) { trimmerContainer.classList.add('hidden'); trimmerContainer.style.display = 'none'; }

    const min = Math.floor(editorMusicStartTime / 60), sec = Math.floor(editorMusicStartTime % 60);
    const timeFmt = `${min}:${sec < 10 ? '0' : ''}${sec}`;
    document.getElementById('music-status-text').innerHTML = `🎵 Starts at ${timeFmt} <i class="fa-solid fa-xmark" onclick="removeStoryMusic()"></i>`;
    if(typeof showToast === 'function') showToast("Music Set", `Song starts from ${timeFmt}`, currentUser?.photoURL);
};

window.selectSongFromSearch = (song) => {
    if (!song || !song.url) return;
    editorPreviewAudio.pause();
    if(musicLoopInterval) clearInterval(musicLoopInterval);
    if(progressInterval) clearInterval(progressInterval);
    
    editorMusicUrl = song.url;
    editorPreviewAudio.src = song.url; editorPreviewAudio.load();

    const trimmerContainer = document.getElementById('music-trimmer-container');
    const scrubber = document.getElementById('music-scrubber');

    editorPreviewAudio.onloadedmetadata = () => {
        if(scrubber) { scrubber.max = Math.floor(editorPreviewAudio.duration) - editorStoryDuration; scrubber.value = 0; }
        editorMusicStartTime = 0;
        
        const wrapper = document.getElementById('waveform-wrapper');
        if(wrapper) {
            wrapper.querySelectorAll('.waveform-bar').forEach(b => b.remove());
            for (let i = 0; i < 60; i++) {
                const bar = document.createElement('div'); bar.className = 'waveform-bar';
                bar.style.height = (Math.floor(Math.random() * 80) + 20) + '%';
                wrapper.insertBefore(bar, scrubber);
            }
        }
        
        updateTrimmerUI(0); startMusicLoop(); window.startRunningProgress(); 
    };

    if (trimmerContainer) { trimmerContainer.style.display = 'block'; trimmerContainer.classList.remove('hidden'); }
    const musicStatus = document.getElementById('music-status-text');
    if (musicStatus) musicStatus.innerHTML = `🎵 ${song.title} <i class="fa-solid fa-xmark" onclick="removeStoryMusic()"></i>`;
    window.closeMusicSearch(); 
};

window.toggleMute = () => {
    editorPreviewAudio.muted = !editorPreviewAudio.muted;
    document.getElementById('editor-mute-btn').innerHTML = editorPreviewAudio.muted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
};

window.toggleEffects = () => {
    filterIndex = (filterIndex + 1) % filterList.length;
    editorCurrentFilter = filterList[filterIndex];
    document.getElementById('editor-preview-img').className = editorCurrentFilter; 
    document.getElementById('editor-preview-video').className = editorCurrentFilter;
};

// --- STORY UPLOADING & PROCESSING ---
async function getProcessedStoryBlob() {
    return new Promise((resolve) => {
        const img = document.getElementById('editor-preview-img');
        const drawingCanvas = document.getElementById('drawing-canvas');
        const textOverlays = document.querySelectorAll('.editor-text-overlay');
        const offCanvas = document.createElement('canvas'); const ctx = offCanvas.getContext('2d');
        
        offCanvas.width = img.naturalWidth; offCanvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0, offCanvas.width, offCanvas.height);
        ctx.drawImage(drawingCanvas, 0, 0, offCanvas.width, offCanvas.height);

        textOverlays.forEach(textEl => {
            const x = parseFloat(textEl.dataset.x || 0), y = parseFloat(textEl.dataset.y || 0);
            const scale = parseFloat(textEl.dataset.scale || 1), rotate = parseFloat(textEl.dataset.rotate || 0);
            const color = textEl.style.color, text = textEl.innerText;

            ctx.save();
            const container = document.getElementById('editor-canvas-container').getBoundingClientRect();
            const ratioX = offCanvas.width / container.width, ratioY = offCanvas.height / container.height;

            ctx.translate((container.width/2 + x) * ratioX, (container.height/2 + y) * ratioY);
            ctx.rotate(rotate * Math.PI / 180); ctx.scale(scale * ratioX * 0.5, scale * ratioY * 0.5); 
            ctx.font = "900 60px Outfit, sans-serif"; ctx.fillStyle = color; ctx.textAlign = "center";
            ctx.shadowBlur = 10; ctx.shadowColor = "black"; ctx.fillText(text, 0, 0);
            ctx.restore();
        });
        offCanvas.toBlob((blob) => { resolve(blob); }, 'image/jpeg', 0.9);
    });
}

function dataURLtoBlob(dataurl) {
    let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
}

window.uploadStoryFromEditor = async () => {
    if(!editorMediaFile) return alert("No media selected!");
    window.closeStoryEditor(); window.switchTab('home');

    const uploadArea = document.getElementById('upload-status-area');
    if (uploadArea) {
        uploadArea.innerHTML = `
            <div id="top-upload-bar" style="display: flex; align-items: center; background: #1e1e2d; padding: 10px 15px; border-bottom: 1px solid rgba(255,255,255,0.1); position: sticky; top: 0; z-index: 1000;">
                <img src="${currentVisualThumbnail}" class="upload-thumb" style="width: 35px; height: 35px; border-radius: 4px; object-fit: cover; border: 1px solid #444;">
                <div class="upload-details" style="flex:1; margin-left:12px;">
                    <div class="upload-text" style="color:white; font-size:0.85rem; font-weight:600; margin-bottom:4px;">Posting story...</div>
                    <div class="upload-progress-container" style="width:100%; height:3px; background:rgba(255,255,255,0.1); border-radius:10px; overflow:hidden;">
                        <div id="story-upload-fill" class="upload-progress-fill" style="width: 0%; height:100%; background:var(--primary); transition:width 0.3s ease;"></div>
                    </div>
                </div>
                <i class="fa-solid fa-xmark" style="color:#888; cursor:pointer; padding:5px; font-size:1.1rem; margin-left: 10px;" onclick="cancelUpload()"></i>
            </div>`;
    }

    const fillBar = document.getElementById('story-upload-fill');
    let userPhoto = currentUserData?.avatarBase64 || currentUser?.photoURL;

    try {
        let coverUrl = null;

        if (editorMediaType === 'video' && currentVisualThumbnail) {
            try {
                const coverBlob = dataURLtoBlob(currentVisualThumbnail);
                const coverUploadData = await uploadFile(coverBlob);
                coverUrl = coverUploadData.url;
            } catch (coverError) {
                console.warn("Cover image upload failed, proceeding with video only:", coverError);
            }
        }

        let finalFileToUpload = (editorMediaType === 'image') ? await getProcessedStoryBlob() : editorMediaFile;
        const uploadData = await uploadFile(finalFileToUpload, (p) => { if (fillBar) fillBar.style.width = p + "%"; });

        await addDoc(collection(db, "stories"), {
            userId: currentUser.uid, 
            userName: currentUser.displayName, 
            userPhoto: userPhoto,
            mediaUrl: uploadData.url, 
            mediaType: uploadData.type, 
            coverUrl: coverUrl, 
            timestamp: serverTimestamp(),
            views: [], 
            likes: [], 
            musicUrl: editorMusicUrl || null, 
            musicStart: editorMusicStartTime || 0, 
            musicDuration: editorStoryDuration || 15
        });

        if (fillBar) fillBar.style.width = "100%";
        setTimeout(() => {
            if (uploadArea) {
                uploadArea.style.transition = "0.4s cubic-bezier(0.4, 0, 0.2, 1)";
                uploadArea.style.transform = "translateY(-100%)"; uploadArea.style.opacity = "0";
                setTimeout(() => { uploadArea.innerHTML = ""; uploadArea.style.transform = "none"; uploadArea.style.opacity = "1"; loadStories(); }, 400);
            }
            if(typeof showToast === 'function') showToast("Success", "Story shared!", userPhoto);
        }, 800);
    } catch(e) {
        if (e === "Cancelled") return;
        console.error("Story Upload Error:", e);
        if (uploadArea) uploadArea.innerHTML = ""; alert("Story upload failed. Please try again.");
    } finally { currentUploadXHR = null; currentVisualThumbnail = null; }
};

// --- STORY VIEWER ---
window.viewStoryGroup = (uid) => {
    let stories = window.allGroupedStories ? window.allGroupedStories[uid] : [];
    if(!stories || stories.length === 0) return;
    activeStoryQueue = stories; currentStoryIdx = 0;
    window.toggleModal('story-view-modal', true); renderStoryUI();
}

window.shareCurrentStory = async () => {
    if(activeStoryQueue && activeStoryQueue.length > currentStoryIdx) {
        const story = activeStoryQueue[currentStoryIdx];
        let storyOwnerPhoto = story.userPhoto;
        try {
            const uDoc = await getDoc(doc(db, "users", story.userId));
            if(uDoc.exists()) { const uData = uDoc.data(); storyOwnerPhoto = uData.avatarBase64 || uData.photoURL || story.userPhoto; }
        } catch(e) {}
        if(typeof openShareModal === 'function') openShareModal(story.id, 'story', { url: story.mediaUrl, type: story.mediaType, ownerId: story.userId, ownerName: story.userName, ownerPhoto: storyOwnerPhoto });
    }
}

window.unmuteStoryVideo = () => {
    const v = document.querySelector('.story-media');
    if(v && v.tagName === 'VIDEO') { v.muted = false; document.getElementById('story-unmute-btn').style.display = 'none'; }
}

window.pauseStory = () => {
    if(isStoryPaused) return;
    isStoryPaused = true; 
    clearTimeout(storyTimer);
    window.stopVideoProgressLoop(); 

    const elapsed = Date.now() - storyStartTime;
    storyRemainingTime = Math.max(0, storyRemainingTime - elapsed);

    if(storyMusicAudio) storyMusicAudio.pause();
    
    const video = document.querySelector('.story-media');
    if(video && video.tagName === 'VIDEO') video.pause();
    
    const activeFill = document.getElementById('active-segment-fill');
    if(activeFill) { 
        const currentWidth = window.getComputedStyle(activeFill).getPropertyValue('width'); 
        activeFill.style.transition = 'none'; 
        activeFill.style.width = currentWidth; 
    }

    const modalContent = document.querySelector('#story-view-modal .modal-content');
    if (modalContent) {
        modalContent.classList.add('story-holding-active');
    }
};

window.resumeStory = () => {
    if(!isStoryPaused) return;
    isStoryPaused = false;
    
    if(storyMusicAudio && storyMusicAudio.src) storyMusicAudio.play();
    
    const video = document.querySelector('.story-media');
    let remaining = storyRemainingTime;

    if(video && video.tagName === 'VIDEO') {
        video.play(); 
    } else {
        storyStartTime = Date.now(); 
        storyTimer = setTimeout(window.nextStory, remaining);
        
        const activeFill = document.getElementById('active-segment-fill');
        if(activeFill) { 
            activeFill.style.transition = `width ${remaining}ms linear`; 
            activeFill.style.width = '100%'; 
        }
    }

    const modalContent = document.querySelector('#story-view-modal .modal-content');
    if (modalContent) {
        modalContent.classList.remove('story-holding-active');
    }
};

window.useMusicFromStory = (musicUrl) => {
    pendingMusicFromSticker = musicUrl; window.closeStory();
    setTimeout(() => { if(typeof showToast === 'function') showToast("Audio Selected", "Now select a photo or video", currentUser?.photoURL); document.getElementById('story-upload').click(); }, 500);
};

// --- STORY REPLY ---
window.sendStoryReply = async (targetUid) => {
    const input = document.getElementById('story-reply-input');
    if (!input) return;
    
    const text = input.value.trim();
    if (!text) return; 

    const story = activeStoryQueue[currentStoryIdx];
    if (!story) return;

    input.value = "";
    const sendBtn = document.getElementById('story-msg-send-btn');
    const actions = document.getElementById('story-footer-actions');
    if (sendBtn) sendBtn.style.display = 'none';
    if (actions) actions.style.opacity = '1';

    try {
        const ids = [currentUser.uid, targetUid].sort();
        const roomId = ids.join("_");
        const timestamp = Date.now();

        const msgData = {
            text: text,
            senderId: currentUser.uid,
            receiverId: targetUid,
            seen: false,
            timestamp: serverTimestamp(),
            
            isStoryReply: true,
            repliedStoryId: story.id,
            repliedStoryUrl: story.mediaUrl,
            repliedStoryType: story.mediaType,
            repliedOwnerId: story.userId,
            repliedOwnerName: story.userName,
            repliedOwnerPhoto: story.userPhoto
        };

        await addDoc(collection(db, "chats", roomId, "messages"), msgData);

        await setDoc(doc(db, "users", currentUser.uid), { 
            lastActive: timestamp, 
            interactions: { [targetUid]: timestamp } 
        }, { merge: true });

        try {
            await setDoc(doc(db, "users", targetUid), { 
                interactions: { 
                    [currentUser.uid]: timestamp 
                } 
            }, { merge: true });
        } catch (ruleError) {
            console.warn("Target user profile interaction bypassed by security rules:", ruleError.message);
        }

        if (typeof window.sendNotification === 'function') {
            await window.sendNotification(targetUid, 'reply_story', `Replied to your story: "${text}"`, story.id);
        }

        if (typeof playSendSound === 'function') {
            playSendSound();
        }

        if (typeof showToast === 'function') {
            const userPhoto = currentUserData?.avatarBase64 || currentUser?.photoURL;
            showToast("Reply Sent", "Message sent to inbox", userPhoto);
        }

    } catch (e) {
        console.error("Story reply final failure:", e);
        if (typeof showToast === 'function') {
            showToast("Failed", "Permission denied or network error", currentUser?.photoURL);
        }
    } finally {
        window.resumeStory();
    }
};

let videoProgressRaf = null;

window.startVideoProgressLoop = (videoEl, fillEl) => {
    if (videoProgressRaf) cancelAnimationFrame(videoProgressRaf);
    
    function update() {
        if (!videoEl.paused && !videoEl.seeking && videoEl.duration) {
            const pct = (videoEl.currentTime / videoEl.duration) * 100;
            fillEl.style.transition = 'none'; 
            fillEl.style.width = pct + '%';
        }
        videoProgressRaf = requestAnimationFrame(update);
    }
    update();
};

window.stopVideoProgressLoop = () => {
    if (videoProgressRaf) {
        cancelAnimationFrame(videoProgressRaf);
        videoProgressRaf = null;
    }
};

const prefetchedUrls = new Set(); 

window.preloadNextStories = () => {
    if (!activeStoryQueue || activeStoryQueue.length === 0) return;
    
    const PRELOAD_LIMIT = 2; 
    
    for (let i = 1; i <= PRELOAD_LIMIT; i++) {
        const nextIdx = currentStoryIdx + i;
        if (nextIdx < activeStoryQueue.length) {
            const nextStory = activeStoryQueue[nextIdx];
            if (nextStory && nextStory.mediaUrl) {
                prefetchMedia(nextStory.mediaUrl, nextStory.mediaType);
            }
        }
    }
};

function prefetchMedia(url, type) {
    if (prefetchedUrls.has(url)) return; 
    prefetchedUrls.add(url);

    if (type === 'video') {
        const videoPrefetch = document.createElement('video');
        videoPrefetch.src = url;
        videoPrefetch.preload = 'auto';
        videoPrefetch.muted = true;
        videoPrefetch.style.display = 'none';
        videoPrefetch.load(); 
    } else {
        const imgPrefetch = new Image();
        imgPrefetch.src = url;
    }
}

async function renderStoryUI() {
    if(currentStoryIdx >= activeStoryQueue.length) { window.closeStory(); return; }

    const story = activeStoryQueue[currentStoryIdx];
    const mediaContainer = document.getElementById('story-media-container');
    const unmuteBtn = document.getElementById('story-unmute-btn');
    const musicTag = document.getElementById('story-music-tag');
    const musicName = document.getElementById('story-music-display-name');
    
    let duration = story.mediaType === 'video' ? 15000 : (story.musicUrl && story.musicDuration ? story.musicDuration * 1000 : 5000);

    if(storyTimer) clearTimeout(storyTimer); 
    isStoryPaused = false; storyRemainingTime = duration; storyStartTime = Date.now();

    if (window.preloadNextStories) {
        window.preloadNextStories();
    }

    unmuteBtn.style.display = 'none';
    storyMusicAudio.pause(); storyMusicAudio.removeAttribute('src'); storyMusicAudio.load();

    if (story.musicUrl) {
        if(musicTag) {
            musicTag.classList.remove('hidden'); musicTag.style.display = 'flex';
            musicName.innerText = story.musicTitle || "Use Audio";
            musicTag.onclick = (e) => { e.stopPropagation(); window.useMusicFromStory(story.musicUrl); };
        }
        storyMusicAudio.src = story.musicUrl; storyMusicAudio.currentTime = story.musicStart || 0; 
        storyMusicAudio.play().catch(() => { unmuteBtn.style.display = 'block'; });
    } else {
        if(musicTag) { musicTag.classList.add('hidden'); musicTag.style.display = 'none'; }
    }

    mediaContainer.innerHTML = "";

    const modalContent = document.querySelector('#story-view-modal .modal-content');
    if (modalContent) {
        modalContent.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        };

        modalContent.onpointerdown = (e) => {
            if (
                e.target.closest('.story-footer-overlay') || 
                e.target.closest('.story-unmute-btn') || 
                e.target.closest('.story-user-info') || 
                e.target.closest('#story-music-tag') ||
                e.target.tagName === 'INPUT' || 
                e.target.tagName === 'BUTTON'
            ) {
                return;
            }

            try {
                modalContent.setPointerCapture(e.pointerId);
            } catch (err) {}

            window.pauseStory();
        };

        modalContent.onpointerup = (e) => {
            try {
                modalContent.releasePointerCapture(e.pointerId);
            } catch (err) {}

            if (isStoryPaused && !document.activeElement.classList.contains('story-reply-input')) {
                window.resumeStory();
            }
        };

        modalContent.onpointercancel = (e) => {
            try {
                modalContent.releasePointerCapture(e.pointerId);
            } catch (err) {}

            if (isStoryPaused && !document.activeElement.classList.contains('story-reply-input')) {
                window.resumeStory();
            }
        };

        modalContent.onpointerleave = null;
    }

    let blurBg = document.createElement('img');
    blurBg.src = story.coverUrl || story.mediaUrl; 
    blurBg.className = 'story-bg-blur';
    mediaContainer.appendChild(blurBg);

    let mediaEl;
    if (story.mediaType === 'video') {
        mediaEl = document.createElement('video'); 
        mediaEl.src = story.mediaUrl; 
        mediaEl.className = 'story-media'; 
        mediaEl.playsInline = true; 
        mediaEl.loop = false; 
        mediaEl.muted = !!story.musicUrl;
        
        if (story.coverUrl) {
            mediaEl.poster = story.coverUrl;
        }
        
        const spinner = document.createElement('div');
        spinner.className = 'story-video-spinner';
        spinner.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
        mediaContainer.appendChild(spinner);

        mediaEl.onwaiting = () => {
            spinner.style.display = 'block';
            if (window.stopVideoProgressLoop) window.stopVideoProgressLoop();
            if (storyMusicAudio) storyMusicAudio.pause();
        };

        mediaEl.onplaying = () => {
            spinner.style.display = 'none';
            const activeFill = document.getElementById('active-segment-fill');
            if (activeFill && window.startVideoProgressLoop) {
                window.startVideoProgressLoop(mediaEl, activeFill);
            }
            if (storyMusicAudio && !isStoryPaused) {
                storyMusicAudio.play().catch(() => {});
            }
        };

        mediaEl.onended = () => {
            if (window.stopVideoProgressLoop) window.stopVideoProgressLoop();
            window.nextStory();
        };

        mediaEl.play().catch(() => { 
            mediaEl.muted = true; 
            mediaEl.play(); 
            unmuteBtn.style.display = 'block'; 
        });
    } else {
        mediaEl = document.createElement('img'); 
        mediaEl.src = story.mediaUrl; 
        mediaEl.className = 'story-media';
    }
    mediaContainer.appendChild(mediaEl);

    const avatar = document.getElementById('story-view-avatar'), name = document.getElementById('story-view-name'), time = document.getElementById('story-view-time');
    const deleteBtn = document.getElementById('story-delete-btn'), footer = document.getElementById('story-footer-ui');
    const segmentsContainer = document.getElementById('story-segments-container'), replyInput = document.getElementById('story-reply-input');
    const likeBtn = document.getElementById('story-like-btn'), viewCountBtn = document.getElementById('story-view-count-btn'), viewNum = document.getElementById('story-view-num');
    
    document.querySelector('.story-user-info').onclick = () => { window.closeStory(); if(typeof window.viewUserProfile === 'function') window.viewUserProfile(story.userId); };

    avatar.src = story.userPhoto;
    try { const userSnap = await getDoc(doc(db, "users", story.userId)); if(userSnap.exists()) { const uData = userSnap.data(); if(uData.avatarBase64 || uData.photoURL) avatar.src = uData.avatarBase64 || uData.photoURL; } } catch(e) {}
    name.innerText = story.userName;
    time.innerText = typeof timeAgo === 'function' ? timeAgo(story.timestamp?.toMillis ? story.timestamp.toMillis() : Date.now()) : "Now";

    if(story.userId === currentUser.uid) {
        deleteBtn.style.display = 'block'; footer.style.display = 'none'; 
        if(viewCountBtn) viewCountBtn.classList.remove('hidden'); 
        if(viewNum) viewNum.innerText = story.views ? story.views.length : 0;
    } else {
        deleteBtn.style.display = 'none'; footer.style.display = 'flex'; 
        if(viewCountBtn) viewCountBtn.classList.add('hidden');
        if(!story.views || !story.views.includes(currentUser.uid)) updateDoc(doc(db, "stories", story.id), { views: arrayUnion(currentUser.uid) });
        
        if(unsubscribeStoryView) unsubscribeStoryView();
        unsubscribeStoryView = onSnapshot(doc(db, "stories", story.id), (docSnap) => {
            if(docSnap.exists()) {
                const fresh = docSnap.data();
                const isLiked = fresh.likes && fresh.likes.includes(currentUser.uid);
                if(isLiked) { likeBtn.classList.add('fa-solid', 'liked'); likeBtn.classList.remove('fa-regular'); }
                else { likeBtn.classList.remove('fa-solid', 'liked'); likeBtn.classList.add('fa-regular'); }
            }
        });
    }

    if(replyInput) {
        replyInput.value = "";
        replyInput.onfocus = () => window.pauseStory();
        replyInput.onkeydown = (e) => { if(e.key === 'Enter') { if(typeof sendStoryReply === 'function') sendStoryReply(story.userId); replyInput.blur(); } };
        replyInput.onblur = () => { setTimeout(() => { if (isStoryPaused) window.resumeStory(); }, 100); };
    }

    if(segmentsContainer) {
        segmentsContainer.innerHTML = "";
        activeStoryQueue.forEach((_, idx) => {
            const seg = document.createElement('div'); seg.className = 'story-segment';
            const fill = document.createElement('div'); fill.className = 'story-segment-fill';
            if (idx < currentStoryIdx) fill.style.width = '100%'; 
            else if (idx === currentStoryIdx) { 
                fill.id = 'active-segment-fill'; 
                fill.style.width = '0%'; 
                
                if (story.mediaType !== 'video') {
                    setTimeout(() => { 
                        fill.style.transition = `width ${duration}ms linear`; 
                        fill.style.width = '100%'; 
                    }, 50); 
                }
            } 
            else fill.style.width = '0%'; 
            seg.appendChild(fill); segmentsContainer.appendChild(seg);
        });
    }
    if(story.mediaType !== 'video') storyTimer = setTimeout(() => { window.nextStory(); }, duration); 
}

window.toggleStorySendBtn = () => {
    const input = document.getElementById('story-reply-input'), sendBtn = document.getElementById('story-msg-send-btn'), actions = document.getElementById('story-footer-actions');
    if (input.value.trim().length > 0) { sendBtn.style.display = 'block'; actions.style.opacity = '0.5'; } 
    else { sendBtn.style.display = 'none'; actions.style.opacity = '1'; }
};

window.handleStorySendAction = () => {
    const input = document.getElementById('story-reply-input'), story = activeStoryQueue[currentStoryIdx];
    if (!story || input.value.trim() === "") return;
    if(typeof sendStoryReply === 'function') sendStoryReply(story.userId);
    input.value = ""; input.blur(); document.getElementById('story-msg-send-btn').style.display = 'none'; document.getElementById('story-footer-actions').style.opacity = '1';
    window.resumeStory();
};

window.showStoryViewers = async () => {
    const story = activeStoryQueue[currentStoryIdx]; if(!story) return;
    viewersIndex = 0; isFetchingViewers = false; loadedViewersData = []; 
    
    const countHeader = document.getElementById('viewer-count-header'), searchInput = document.getElementById('viewer-search-input'), list = document.getElementById('story-viewers-list');
    if (countHeader) countHeader.innerText = `${story.views ? story.views.length : 0} Viewers`;
    if (searchInput) searchInput.value = "";
    
    window.toggleModal('story-viewers-modal', true); window.pauseStory();
    if (!list) return;

    list.innerHTML = '<div id="v-initial-loader" style="text-align:center; padding:20px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; color:var(--primary);"></i></div>';
    await loadNextViewersBatch();

    list.onscroll = () => {
        const query = searchInput ? searchInput.value.trim() : "";
        if (query === "" && !isFetchingViewers && list.scrollTop + list.clientHeight >= list.scrollHeight - 50) loadNextViewersBatch();
    };
}

async function loadNextViewersBatch() {
    const story = activeStoryQueue[currentStoryIdx];
    if (!story || !story.views || isFetchingViewers || viewersIndex >= story.views.length) return;
    isFetchingViewers = true; const list = document.getElementById('story-viewers-list');

    try {
        const nextBatchIds = story.views.slice(viewersIndex, viewersIndex + VIEWERS_LIMIT);
        if (nextBatchIds.length > 0) {
            const q = query(collection(db, "users"), where("uid", "in", nextBatchIds));
            const snap = await getDocs(q);
            const loader = document.getElementById('v-initial-loader'); if (loader) loader.remove();

            snap.forEach(d => {
                const u = d.data(), isLiked = story.likes && story.likes.includes(u.uid);
                if (!loadedViewersData.find(v => v.uid === u.uid)) loadedViewersData.push({...u, isLiked});
                renderViewerRow(u, isLiked);
            });
            viewersIndex += VIEWERS_LIMIT;
        }
    } catch (e) { console.error("Viewers Load Error:", e); } finally { isFetchingViewers = false; }
}

window.filterViewersList = () => {
    const queryTxt = document.getElementById('viewer-search-input').value.toLowerCase().trim(), list = document.getElementById('story-viewers-list'), story = activeStoryQueue[currentStoryIdx];
    if (!list || !story) return;

    if (queryTxt === "") { list.innerHTML = ""; loadedViewersData.forEach(u => renderViewerRow(u, u.isLiked)); return; }
    const filteredResults = allCachedUsers.filter(u => story.views.includes(u.uid) && (u.name.toLowerCase().includes(queryTxt) || (u.username && u.username.toLowerCase().includes(queryTxt))));
    list.innerHTML = ""; 
    
    if (filteredResults.length === 0) { list.innerHTML = `<div style="text-align:center;color:#888;padding:40px;">No viewers found for "${queryTxt}"</div>`; return; }
    filteredResults.forEach(u => { renderViewerRow(u, story.likes && story.likes.includes(u.uid)); });
}

function renderViewerRow(u, isLiked) {
    const list = document.getElementById('story-viewers-list'); if (!list) return;
    const avatar = u.avatarBase64 || u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}`;
    list.insertAdjacentHTML('beforeend', `
    <div class="chat-item viewer-row fade-in" style="display:flex; align-items:center; padding:12px; border-bottom:1px solid rgba(255,255,255,0.05);" onclick="closeStory(); if(typeof window.viewUserProfile === 'function') window.viewUserProfile('${u.uid}'); toggleModal('story-viewers-modal', false);">
        <img src="${avatar}" style="width:45px; height:45px; border-radius:50%; object-fit:cover; border:1.5px solid var(--primary);">
        <div style="font-weight:600; margin-left:12px; color:white; flex:1;">${u.name}</div>
        ${isLiked ? '<i class="fa-solid fa-heart" style="color:#ff006e;"></i>' : ''}
    </div>`);
}

window.nextStory = () => { if(currentStoryIdx < activeStoryQueue.length - 1) { currentStoryIdx++; renderStoryUI(); } else { window.closeStory(); } }
window.prevStory = () => { if(currentStoryIdx > 0) currentStoryIdx--; renderStoryUI(); }

window.closeStory = () => {
    window.toggleModal('story-view-modal', false);
    if (storyTimer) { clearTimeout(storyTimer); storyTimer = null; }
    if (storyMusicAudio) { storyMusicAudio.pause(); storyMusicAudio.removeAttribute('src'); storyMusicAudio.load(); }
    
    const videoEl = document.querySelector('.story-media');
    if (videoEl && videoEl.tagName === 'VIDEO') { videoEl.pause(); videoEl.removeAttribute('src'); videoEl.load(); }

    if (unsubscribeStoryView) { unsubscribeStoryView(); unsubscribeStoryView = null; }

    activeStoryQueue = []; currentStoryIdx = 0; isStoryPaused = false;
    const mediaContainer = document.getElementById('story-media-container');
    if (mediaContainer) mediaContainer.innerHTML = "";
    loadStories();
};

window.deleteCurrentStory = () => {
    const story = activeStoryQueue[currentStoryIdx]; if(!story) return;
    if(typeof window.showDynamicConfirm === 'function') {
        window.showDynamicConfirm("Delete Story", "Are you sure you want to delete this story?", "fa-solid fa-trash", async () => {
            activeStoryQueue.splice(currentStoryIdx, 1);
            try { await deleteDoc(doc(db, "stories", story.id)); } catch(e) {}
            if(activeStoryQueue.length === 0) window.closeStory();
            else { if(currentStoryIdx >= activeStoryQueue.length) currentStoryIdx = activeStoryQueue.length - 1; renderStoryUI(); }
        });
    }
};

// स्टोरी लाइक के लिए त्वरित स्पैम-क्लिक प्रोटेक्शन लॉक
window.storyLikeLock = window.storyLikeLock || new Set();

window.toggleStoryLike = async () => {
    const story = activeStoryQueue[currentStoryIdx]; 
    if(!story) return;

    // 🛡️ 1. स्पैम लॉक: यदि लाइक प्रक्रिया चल रही है, तो अन्य क्लिक रोकें
    if (window.storyLikeLock.has(story.id)) return;
    window.storyLikeLock.add(story.id);

    const likeBtn = document.getElementById('story-like-btn');
    const isLiked = likeBtn.classList.contains('liked');

    // 📱 2. सूक्ष्म वाइब्रेशन फ़ीडबैक (Premium Feel)
    if (navigator.vibrate) navigator.vibrate(25);

    // ⚡ 3. Optimistic UI Update (बिना इंतज़ार किए तुरंत बदलाव दिखाना)
    if (isLiked) {
        likeBtn.classList.remove('liked', 'fa-solid'); 
        likeBtn.classList.add('fa-regular');
    } else {
        likeBtn.classList.add('liked', 'fa-solid'); 
        likeBtn.classList.remove('fa-regular');
        
        // ऑडियो साउंड और उड़ने वाले दिलों का इफ़ेक्ट
        if (typeof playSendSound === 'function') playSendSound(); 
        if (typeof showFloatingHearts === 'function') showFloatingHearts();
    }

    const storyRef = window.doc(window.db, "stories", story.id);

    try {
        if (isLiked) {
            await window.updateDoc(storyRef, { likes: window.arrayRemove(window.currentUser.uid) });
        } else {
            await window.updateDoc(storyRef, { likes: window.arrayUnion(window.currentUser.uid) });
            
            // 🌟 4. खुद की स्टोरी होने पर नोटिफिकेशन ट्रिगर न करें, दूसरों की होने पर ही भेजें
            if (story.userId !== window.currentUser.uid && typeof window.sendNotification === 'function') {
                await window.sendNotification(story.userId, 'like_story', 'liked your story', story.id);
            }
        }
    } catch(e) {
        console.error("Story Like Update Error, rolling back UI:", e);
        
        // 🔄 5. नेटवर्क कनेक्टिविटी टूटने पर UI रीस्टोर (Rollback Mechanism)
        if (isLiked) {
            likeBtn.classList.add('liked', 'fa-solid'); 
            likeBtn.classList.remove('fa-regular');
        } else {
            likeBtn.classList.remove('liked', 'fa-solid'); 
            likeBtn.classList.add('fa-regular');
        }
    } finally {
        // प्रक्रिया समाप्त होने के बाद ताला खोलें
        window.storyLikeLock.delete(story.id);
    }
};
// ==========================================
// --- STORY ANIMATION (FLOATING HEARTS) ---
// ==========================================
window.showFloatingHearts = () => {
    const container = document.getElementById('story-hearts-container');
    if(!container) return;
    for(let i=0; i<5; i++) {
        setTimeout(() => {
            const heart = document.createElement('i');
            heart.classList.add('fa-solid', 'fa-heart', 'floating-heart');
            heart.style.right = (20 + Math.random() * 40) + 'px';
            container.appendChild(heart);
            setTimeout(() => heart.remove(), 2000);
        }, i * 200);
    }
}

// ==========================================
// --- UTILITIES ---
// ==========================================
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// ==========================================
// --- AUTH & USERNAME CHECKER ---
// ==========================================
window.checkUsernameAvailability = () => {
    const username = document.getElementById('reg-username').value.trim().toLowerCase();
    const icon = document.getElementById('username-check-icon');
    const btn = document.getElementById('btn-signup-action');
    
    if(username.length < 3) {
        icon.className = 'fa-solid username-status'; isUsernameAvailable = false; btn.disabled = true; return;
    }

    if(typeof usernameTimer !== 'undefined' && usernameTimer) clearTimeout(usernameTimer);
    icon.className = 'fa-solid fa-spinner fa-spin username-status';

    window.usernameTimer = setTimeout(async () => {
        const q = query(collection(db, "users"), where("username", "==", username));
        const snap = await getDocs(q);
        
        if(snap.empty) {
            icon.className = 'fa-solid fa-circle-check username-status status-valid';
            window.isUsernameAvailable = true; btn.disabled = false;
        } else {
            icon.className = 'fa-solid fa-circle-xmark username-status status-invalid';
            window.isUsernameAvailable = false; btn.disabled = true;
        }
    }, 500); 
}

// ==========================================
// --- REWARD LOGIC: USE EXISTING BOTS ---
// ==========================================
window.triggerBotArmyReward = async (referrerUid, count = 10) => {
    try {
        const botQuery = query(collection(db, "users"), where("isBot", "==", true), limit(50));
        const botSnap = await getDocs(botQuery);
        
        if (botSnap.empty) return;

        let allAvailableBots = [];
        botSnap.forEach(doc => allAvailableBots.push(doc.id));

        const selectedBotIds = allAvailableBots.sort(() => 0.5 - Math.random()).slice(0, count);

        if (selectedBotIds.length > 0) {
            await updateDoc(doc(db, "users", referrerUid), { followers: arrayUnion(...selectedBotIds) });
            const batch = writeBatch(db);
            selectedBotIds.forEach(botId => batch.update(doc(db, "users", botId), { following: arrayUnion(referrerUid) }));
            await batch.commit();
        }
    } catch (err) { console.error("Bot Reward Error:", err.message); }
};

// ==========================================
// --- AUTHENTICATION ACTIONS ---
// ==========================================
window.handleSignup = async () => {
    const emailEl = document.getElementById('reg-email'), passEl = document.getElementById('reg-pass');
    const nameEl = document.getElementById('reg-name'), userEl = document.getElementById('reg-username');
    const referralInput = document.getElementById('reg-referral-input')?.value.trim() || "";

    const checkFields = [
        { el: userEl, name: "Username" }, { el: nameEl, name: "Full Name" },
        { el: emailEl, name: "Email Address" }, { el: passEl, name: "Password" }
    ];

    for (let field of checkFields) {
        if (!field.el.value.trim()) {
            field.el.style.borderColor = "var(--danger)"; field.el.focus();
            if(typeof showCustomAlert === 'function') showCustomAlert("Missing Info", `Hey! You forgot to enter your ${field.name}.`, "warning");
            if (navigator.vibrate) navigator.vibrate([50, 100, 50]);
            return; 
        } else field.el.style.borderColor = "var(--success)";
    }

    const btn = document.getElementById('btn-signup-action'); 
    const originalText = btn.innerText;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Creating Account...`; btn.disabled = true;

    try {
        const email = emailEl.value.trim(), pass = passEl.value, name = nameEl.value.trim(), username = userEl.value.trim().toLowerCase();
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        const myUid = cred.user.uid, myReferCode = username + Math.floor(1000 + Math.random() * 9000);

        const userData = { 
            uid: myUid, name, username, email, 
            photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`,
            referralCode: myReferCode, referralsCount: 0, followers: [], following: [], lastActive: Date.now(), isBanned: false
        };
        await setDoc(doc(db, "users", myUid), userData);

        if (referralInput !== "") {
            const q = query(collection(db, "users"), where("referralCode", "==", referralInput));
            const snap = await getDocs(q);
            if (!snap.empty) {
                const rId = snap.docs[0].id, rData = snap.docs[0].data();
                if ((rData.referralsCount || 0) < 10) {
                    await updateDoc(doc(db, "users", rId), { referralsCount: (rData.referralsCount || 0) + 1 });
                    await window.triggerBotArmyReward(rId, 10);
                }
            }
        }
        if(typeof showCustomAlert === 'function') showCustomAlert("Success", `Welcome ${name}! Your account is ready. Code: ${myReferCode}`, "success");
    } catch(e) { 
        let errorMsg = "Something went wrong. Try again.";
        if (e.code === 'auth/email-already-in-use') errorMsg = "This email is already registered!";
        if (e.code === 'auth/invalid-email') errorMsg = "Please enter a valid email address.";
        if (e.code === 'auth/weak-password') errorMsg = "Password should be at least 6 characters.";
        if(typeof showCustomAlert === 'function') showCustomAlert("Signup Failed", errorMsg, "error");
    } finally { btn.innerText = originalText; btn.disabled = false; }
};

const resetLoginUI = (type = 'default') => {
    const dpImg = document.getElementById('login-user-dp'), defaultIcon = document.getElementById('login-user-icon');
    if (!dpImg || !defaultIcon) return;
    dpImg.classList.add('hidden'); dpImg.src = ""; defaultIcon.classList.remove('hidden');
    
    if (type === 'error') { defaultIcon.className = "fa-solid fa-user-xmark"; defaultIcon.style.color = "var(--danger)"; } 
    else { defaultIcon.className = "fa-solid fa-user"; defaultIcon.style.color = "#555"; }
};

window.handleLogin = async () => {
    const idEl = document.getElementById('login-email'), passEl = document.getElementById('login-pass');
    const identifier = idEl.value.trim().toLowerCase(), pass = passEl.value;

    if (!identifier || !pass) {
        const target = !identifier ? idEl : passEl;
        target.classList.add('input-error-shake'); target.focus();
        setTimeout(() => target.classList.remove('input-error-shake'), 500);
        return typeof showCustomAlert === 'function' ? showCustomAlert("Missing", "Please enter all details.", "warning") : alert("Missing details");
    }

    const btn = document.getElementById('btn-login-action'); 
    const originalText = btn.innerText;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Checking...`; btn.disabled = true;

    try { 
        let loginEmail = identifier;
        if (!identifier.includes('@')) {
            const q = query(collection(db, "users"), where("username", "==", identifier));
            const snap = await getDocs(q);
            if (snap.empty) {
                resetLoginUI('error'); idEl.classList.add('input-error-shake'); idEl.focus();
                throw { code: 'auth/user-not-found' }; 
            }
            loginEmail = snap.docs[0].data().email;
        }
        await signInWithEmailAndPassword(auth, loginEmail, pass); 
        if (navigator.vibrate) navigator.vibrate([30, 30]);
    } 
    catch(e) { 
        if (navigator.vibrate) navigator.vibrate([50, 100, 50]);
        let errorTitle = "Login Failed", errorMsg = "Something went wrong.";

        if (e.code === 'auth/user-not-found' || e.code === 'custom/user-not-found') {
            errorMsg = "This account doesn't exist."; resetLoginUI('error'); 
            idEl.focus(); idEl.classList.add('input-error-shake'); setTimeout(() => idEl.classList.remove('input-error-shake'), 500);
        } else if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
            errorTitle = "Wrong Password"; errorMsg = "Incorrect password! Please try again.";
            passEl.value = ""; passEl.focus(); passEl.classList.add('input-error-shake'); setTimeout(() => passEl.classList.remove('input-error-shake'), 500);
        } else if (e.code === 'auth/too-many-requests') {
            errorTitle = "Wait a moment"; errorMsg = "Too many attempts. Locked for security. Try again later.";
        }
        if(typeof showCustomAlert === 'function') showCustomAlert(errorTitle, errorMsg, "error");
    } finally { btn.innerText = originalText; btn.disabled = false; }
};

let loginCheckTimer = null;
window.checkLoginUser = () => {
    const identifier = document.getElementById('login-email').value.trim().toLowerCase();
    const dpImg = document.getElementById('login-user-dp'), defaultIcon = document.getElementById('login-user-icon');

    if(identifier.length === 0) { resetLoginUI(); return; }

    defaultIcon.className = "fa-solid fa-spinner fa-spin"; defaultIcon.style.color = "#aaa";
    defaultIcon.classList.remove('hidden'); dpImg.classList.add('hidden');

    if(loginCheckTimer) clearTimeout(loginCheckTimer);

    loginCheckTimer = setTimeout(async () => {
        try {
            const q = query(collection(db, "users"), where(identifier.includes('@') ? "email" : "username", "==", identifier));
            const snap = await getDocs(q);
            
            if (!snap.empty) {
                const userData = snap.docs[0].data();
                dpImg.src = userData.avatarBase64 || userData.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}`;
                dpImg.classList.remove('hidden'); defaultIcon.classList.add('hidden'); 
                dpImg.style.transform = "translateY(-50%) scale(1.1)"; setTimeout(() => dpImg.style.transform = "translateY(-50%) scale(1)", 200);
            } else resetLoginUI('error');
        } catch (e) { resetLoginUI(); }
    }, 600); 
};

// ==========================================
// --- SMART LOGOUT ---
// ==========================================
let pendingConfirmCallback = null;

window.showDynamicConfirm = (title, message, iconClass, callback) => {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-message').innerText = message;
    document.getElementById('confirm-icon').innerHTML = `<i class="${iconClass}"></i>`;
    pendingConfirmCallback = callback; 
    document.getElementById('custom-confirm-modal').classList.remove('hidden');
    if (navigator.vibrate) navigator.vibrate(50);
};

window.executeDynamicConfirm = () => {
    if (pendingConfirmCallback) pendingConfirmCallback(); 
    window.closeCustomConfirm();
};

window.closeCustomConfirm = () => { document.getElementById('custom-confirm-modal').classList.add('hidden'); };

window.triggerLogoutFromSettings = () => {
    if (navigator.vibrate) navigator.vibrate(20);
    if(typeof closeSettingsModal === 'function') closeSettingsModal();
    setTimeout(() => {
        window.showDynamicConfirm("Confirm Logout", "Are you sure you want to logout from DK Love Chats?", "fa-solid fa-right-from-bracket", () => {
            if (navigator.vibrate) navigator.vibrate([30, 30]);
            signOut(auth).then(() => { window.location.reload(); });
        });
    }, 250); 
};

window.handleLogout = window.triggerLogoutFromSettings; 

// ==========================================
// --- MEDIA PROCESSING & VIEWING ---
// ==========================================
async function processFile(file) {
    return new Promise(async (resolve, reject) => {
        const type = file.type.split('/')[0]; 
        try {
            if (type === 'image') {
                const imageSource = URL.createObjectURL(file);
                let bitmap;
                try { bitmap = await createImageBitmap(file); } 
                catch (e) {
                    const img = new Image(); img.src = imageSource;
                    await new Promise(r => img.onload = r); bitmap = img;
                }

                const MAX_SIZE = 1080;
                let width = bitmap.width, height = bitmap.height;
                if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
                else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }

                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d', { alpha: false }); 
                ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(bitmap, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/webp', 0.8);
                URL.revokeObjectURL(imageSource); if (bitmap.close) bitmap.close();
                resolve({ type: 'image', data: dataUrl });
            } else if (type === 'video') {
                resolve({ type: 'video', data: URL.createObjectURL(file) });
            } else reject("Unsupported file type");
        } catch (error) { reject("Error processing file"); }
    });
}

window.previewMedia = (inputId, labelTextId, previewImgId) => {
    const file = document.getElementById(inputId).files[0]; if(!file) return;
    if(inputId === 'post-file-input') selectedRawFile = file;
    if(inputId === 'profile-file-input') profileRawFile = file;
    processFile(file).then(r => { 
        selectedMediaBase64 = r.data; selectedMediaType = r.type; 
        if(previewImgId) { const imgEl = document.getElementById(previewImgId); if(r.type === 'image') { imgEl.src = r.data; imgEl.style.display = "block"; } else imgEl.style.display = "none"; }
        if(labelTextId) document.getElementById(labelTextId).innerText = `${r.type.toUpperCase()} Selected`;
    }).catch(e => alert(e));
};

window.viewFullMedia = (src, type) => {
    let container = document.getElementById('full-media-container');
    const modal = document.getElementById('media-viewer-modal');
    if (!container || !modal) return;

    modal.style.display = "block"; modal.classList.add('active');
    
    const newContainer = container.cloneNode(false);
    container.parentNode.replaceChild(newContainer, container);
    container = newContainer; 

    if (type === 'video') {
        container.innerHTML = `<video src="${src}" controls autoplay style="width:100%; height:100%; object-fit:contain;"></video>`;
    } else {
        container.innerHTML = `<img src="${src}" id="fullscreen-image" style="max-width:100%; max-height:100%; object-fit:contain; transition: transform 0.1s ease-out; cursor: grab;">`;
        const img = document.getElementById('fullscreen-image');
        
        let scale = 1, pointX = 0, pointY = 0, start = { x: 0, y: 0 }, initialDistance = 0, lastTap = 0;

        const updateTransform = () => {
            if (scale <= 1) { scale = 1; pointX = 0; pointY = 0; img.style.cursor = "grab"; } else img.style.cursor = "move";
            img.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
        };

        container.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) initialDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            else if (e.touches.length === 1) start = { x: e.touches[0].clientX - pointX, y: e.touches[0].clientY - pointY };
        }, { passive: false });

        container.addEventListener('touchmove', (e) => {
            e.preventDefault(); 
            if (e.touches.length === 2) {
                const currentDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                scale = Math.min(Math.max(1, scale * (currentDistance / initialDistance)), 5); 
                initialDistance = currentDistance; updateTransform();
            } else if (e.touches.length === 1 && scale > 1) {
                pointX = e.touches[0].clientX - start.x; pointY = e.touches[0].clientY - start.y; updateTransform();
            }
        }, { passive: false });

        container.addEventListener('touchend', (e) => {
            const tapLength = new Date().getTime() - lastTap;
            if (tapLength < 300 && tapLength > 0) {
                e.preventDefault();
                scale = (scale > 1) ? 1 : 2.5;
                if(scale === 1) { pointX = 0; pointY = 0; }
                img.style.transition = 'transform 0.3s cubic-bezier(0.2, 0, 0.2, 1)'; updateTransform();
                setTimeout(() => { img.style.transition = 'transform 0.1s ease-out'; }, 300);
            }
            lastTap = new Date().getTime();
        });
    }
};

window.closeFullScreenMedia = () => { 
    document.getElementById('media-viewer-modal').classList.remove('active'); 
    setTimeout(() => { document.getElementById('full-media-container').innerHTML = ""; }, 300);
};

function updateFollowButtonsUI(targetUid, isNowFollowing) {
    const feedBtns = document.querySelectorAll(`.follow-btn-${targetUid}`);
    feedBtns.forEach(btn => {
        if (isNowFollowing) { btn.classList.add('following'); btn.innerText = 'Following'; } 
        else { btn.classList.remove('following'); btn.innerText = 'Follow'; }
    });

    if (currentProfileUid === targetUid) {
        const profileBtn = document.getElementById('profile-follow-btn');
        if (profileBtn) {
            if (isNowFollowing) { profileBtn.classList.add('btn-following'); profileBtn.innerText = 'Following'; } 
            else { profileBtn.classList.remove('btn-following'); profileBtn.innerText = 'Follow'; }
        }
        
        const followersCountEl = document.getElementById('profile-followers-count');
        if(followersCountEl) {
            let currentCount = parseInt(followersCountEl.innerText) || 0;
            followersCountEl.innerText = isNowFollowing ? currentCount + 1 : Math.max(0, currentCount - 1);
        }
    }
    
    if (currentProfileUid === currentUser.uid) {
        const followingCountEl = document.getElementById('profile-following-count');
        if(followingCountEl) {
            let currentCount = parseInt(followingCountEl.innerText) || 0;
            followingCountEl.innerText = isNowFollowing ? currentCount + 1 : Math.max(0, currentCount - 1);
        }
    }
}

window.handleFollow = async (targetUid, event = null) => {
    if(event) event.stopPropagation(); 
    
    const targetRef = doc(db, "users", targetUid);
    const myRef = doc(db, "users", currentUser.uid);
    
    if (!currentUserData.following) currentUserData.following = [];
    let isFollowing = currentUserData.following.includes(targetUid);

    if(isFollowing) currentUserData.following = currentUserData.following.filter(id => id !== targetUid);
    else currentUserData.following.push(targetUid);
    
    updateFollowButtonsUI(targetUid, !isFollowing);

    try {
        if(isFollowing) {
            await updateDoc(targetRef, { followers: arrayRemove(currentUser.uid) });
            await updateDoc(myRef, { following: arrayRemove(targetUid) });
        } else {
            await updateDoc(targetRef, { followers: arrayUnion(currentUser.uid) });
            await updateDoc(myRef, { following: arrayUnion(targetUid) });
            if(typeof window.sendNotification === 'function') await window.sendNotification(targetUid, 'follow', 'started following you', currentUser.uid);
        }
    } catch(e) { console.error("Follow error", e); }
};

window.handleFollowFromFeed = window.handleFollow; 

// ==========================================
// --- SINGLE POST VIEW (MODAL) ---
// ==========================================
let unsubscribeSingleView = null;
window.openSinglePostView = async (postId) => {
    const modal = document.getElementById('single-post-view-modal');
    const container = document.getElementById('single-post-content');
    
    modal.classList.remove('hidden');
    if (!container.innerHTML || container.dataset.firstLoad === "true") {
        container.innerHTML = `<div id="sv-loader" style="text-align:center; padding-top:100px;"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:3rem; color:var(--primary);"></i></div>`;
    }

    try {
        const targetPostSnap = await window.getDoc(window.doc(window.db, "posts", postId));
        if (!targetPostSnap.exists()) return;
        
        const clickedData = targetPostSnap.data();
        const targetUserId = clickedData.userId;
        const isReelMode = clickedData.mediaType === 'video';

        if (isReelMode) { 
            container.classList.add('reels-container'); 
            container.style.scrollSnapType = "y mandatory"; 
            container.style.overflowY = "scroll";
            container.style.height = "100vh"; 
        } else { 
            container.classList.remove('reels-container'); 
            container.style.scrollSnapType = "none"; 
            container.style.background = "var(--bg-grad)"; 
        }

        if (unsubscribeSingleView) unsubscribeSingleView();

        unsubscribeSingleView = window.onSnapshot(window.query(window.collection(window.db, "posts"), window.where("userId", "==", targetUserId)), (snapshot) => {
            const loader = document.getElementById('sv-loader'); 
            if (loader) loader.remove();

            let postsData = [];
            snapshot.forEach(docSnap => postsData.push({ id: docSnap.id, ...docSnap.data() }));
            postsData.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

            const filteredData = postsData.filter(p => p.mediaType === (isReelMode ? 'video' : 'image'));

            filteredData.forEach((p) => {
                let existingItem = document.getElementById(`sv-item-${p.id}`);
                if (existingItem) {
                    const lCount = existingItem.querySelector(`#like-count-${p.id}`) || existingItem.querySelector('.reel-action-text');
                    const cCount = existingItem.querySelector(`#post-comment-count-${p.id}`) || existingItem.querySelector(`#reel-comment-count-${p.id}`);
                    if (lCount) lCount.innerText = p.likes?.length || 0;
                    if (cCount) cCount.innerText = p.commentCount || 0;
                } else {
                    let newEl = null;
                    if (isReelMode && typeof window.createReelElement === 'function') {
                        newEl = window.createReelElement(p.id, p);
                        newEl.id = `sv-item-${p.id}`; 
                        newEl.style.height = "100vh";
                        newEl.style.scrollSnapAlign = "start";
                    } else if (!isReelMode && typeof window.createPostElement === 'function') {
                        newEl = window.createPostElement(p.id, p);
                        newEl.id = `sv-item-${p.id}`; 
                    } else {
                        newEl = document.createElement('div');
                    }
                    container.appendChild(newEl);
                    if (p.id === postId) newEl.dataset.isTarget = "true"; 
                }
            });

            if (container.dataset.firstLoad === "true" || !container.dataset.firstLoad) {
                setTimeout(() => {
                    const target = container.querySelector('[data-is-target="true"]');
                    if (target) { 
                        target.scrollIntoView({ behavior: 'auto', block: 'start' }); 
                    }
                    container.dataset.firstLoad = "false";
                    
                    if (isReelMode && typeof window.setupReelObserver === 'function') {
                        window.setupReelObserver('single-post-content'); 
                    }
                }, 300);
            }
        });

        history.pushState({view: 'singlePost'}, null);
    } catch (e) { console.error("Error in Single View:", e); }
};

window.closeSinglePostView = () => {
    if (unsubscribeSingleView) unsubscribeSingleView();
    document.querySelectorAll('#single-post-content video').forEach(v => { v.pause(); v.src = ""; });
    document.getElementById('single-post-view-modal').classList.add('hidden');
    
    const container = document.getElementById('single-post-content');
    container.dataset.firstLoad = "true"; container.innerHTML = ""; container.className = ""; 

    if (typeof window.setupReelObserver === 'function') {
        window.setupReelObserver('reels-container');
    }
};

// ==========================================
// --- COMMENTS SYSTEM ---
// ==========================================
// ==========================================
// --- 🌟 SMART & SMOOTH COMMENTS SYSTEM ---
// ==========================================

window.openComments = (pid) => { 
    activeCommentPostId = pid; 
    window.toggleModal('comments-modal', true); 
    
    const l = document.getElementById('comments-list'); 
    if (l) {
        // सुंदर पुल इंडिकेटर और स्मूथ CSS लोडर
        l.innerHTML = `
            <div class="comment-header-indicator" style="width: 40px; height: 5px; background: #cbd5e1; border-radius: 10px; margin: 10px auto 5px;"></div>
            <div style="text-align:center; padding:30px;">
                <div class="splash-loader" style="width:30px; height:30px; margin:0 auto; border: 2px solid #ff006e; border-top-color: transparent; border-radius: 50%; animation: fa-spin 1s linear infinite;"></div>
            </div>`; 
    }
    
    if (unsubscribeComments) unsubscribeComments(); 
    
    unsubscribeComments = onSnapshot(
        query(collection(db, "posts", pid, "comments"), orderBy("timestamp", "asc")), 
        (s) => { 
            if (!l) return;
            
            // बार-बार DOM राइटिंग से बचने के लिए स्ट्रिंग असेंबलर का उपयोग (Fast Rendering)
            let htmlContent = `<div class="comment-header-indicator" style="width: 40px; height: 5px; background: #cbd5e1; border-radius: 10px; margin: 10px auto 5px;"></div>`; 
            
            if (s.empty) {
                l.innerHTML = htmlContent + `<div style="text-align:center; color:#94a3b8; padding:40px; font-weight:600; font-size:0.9rem;">No comments yet.<br><small style="font-weight:400; color:#cbd5e1;">Be the first to share your thoughts!</small></div>`;
                return;
            }
            
            s.forEach(d => { 
                const c = d.data();
                const cid = d.id;
                const avatar = c.userPhoto || "https://ui-avatars.com/api/?name=" + encodeURIComponent(c.userName); 
                const isLiked = c.likes && c.likes.includes(currentUser.uid);
                
                htmlContent += `
                <div class="comment-item fade-in" style="display: flex; align-items: flex-start; gap: 12px; padding: 15px; border-bottom: 1px solid #f1f5f9; will-change: transform, opacity;">
                    <img src="${avatar}" class="comment-avatar" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; cursor: pointer;" onclick="if(typeof window.viewUserProfile === 'function') window.viewUserProfile('${c.userId}'); window.toggleModal('comments-modal', false);">
                    <div class="comment-body" style="flex: 1;">
                        <div class="comment-user" style="font-weight: 800; color: #1a1a1a; font-size: 0.9rem; cursor: pointer;" onclick="if(typeof window.viewUserProfile === 'function') window.viewUserProfile('${c.userId}'); window.toggleModal('comments-modal', false);">${c.userName}</div>
                        <div class="comment-text" style="color: #475569; font-size: 0.85rem; margin-top: 2px; word-break: break-word;">${c.text}</div>
                    </div>
                    <div class="comment-like-container" onclick="window.handleLikeComment('${cid}', ${isLiked}, '${c.userId}', '${c.text}')" style="display: flex; flex-direction: column; align-items: center; cursor: pointer; color: #94a3b8; min-width: 30px;">
                        <i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart comment-like-btn ${isLiked ? 'liked' : ''}" style="font-size: 1rem; color: ${isLiked ? '#ff006e' : '#cbd5e1'}; transition: transform 0.1s ease;"></i>
                        <span style="font-size: 0.7rem; font-weight: 700; margin-top: 4px; color: #64748b;">${c.likes ? c.likes.length : 0}</span>
                    </div>
                </div>`;
            });
            l.innerHTML = htmlContent;
        },
        (error) => {
            console.error("Comments Realtime Sync error:", error);
        }
    ); 
};

// कमेंट्स लाइक के लिए त्वरित स्पैम-क्लिक प्रोटेक्शन लॉक
window.commentLikeLock = window.commentLikeLock || new Set();

window.handleLikeComment = async (commentId, isLiked, commentOwnerId, commentText) => {
    // 🛡️ 1. सुरक्षा लॉक: यदि लाइक प्रक्रिया चल रही है, तो अन्य क्लिक रोकें
    if (window.commentLikeLock.has(commentId)) return;
    window.commentLikeLock.add(commentId);

    // 📱 2. हल्का हैप्टिक वाइब्रेशन फ़ीडबैक
    if (navigator.vibrate) navigator.vibrate(25);

    const commentRef = window.doc(window.db, "posts", activeCommentPostId, "comments", commentId);
    
    try {
        if (isLiked) {
            await window.updateDoc(commentRef, { likes: window.arrayRemove(window.currentUser.uid) });
        } else {
            await window.updateDoc(commentRef, { likes: window.arrayUnion(window.currentUser.uid) });
            
            // 🌟 3. खुद के कमेंट पर पुश न भेजना + बैकएंड के लिए स्पष्ट टेक्स्ट मैपिंग
            if (commentOwnerId !== window.currentUser.uid && typeof window.sendNotification === 'function') {
                // 'liked your comment' टेक्स्ट को यहाँ जोड़ दिया गया है ताकि बैकएंड इसे सही ढंग से पार्स कर सके
                await window.sendNotification(
                    commentOwnerId, 
                    'like_comment', 
                    `liked your comment: "${commentText}"`, 
                    activeCommentPostId
                );
            }
        }
    } catch (e) {
        console.error("Comment like database error:", e);
    } finally {
        // प्रक्रिया समाप्त होने के बाद ताला खोलें
        window.commentLikeLock.delete(commentId);
    }
};

// त्वरित लगातार सबमिशन को रोकने के लिए सेंडिंग स्टेट
window.isCommentSending = window.isCommentSending || false;

window.handleSendComment = async () => { 
    const inputEl = document.getElementById('comment-input');
    if (!inputEl) return;
    
    const t = inputEl.value.trim(); 
    // 🛡️ 1. सुरक्षा लॉक: यदि पहले से कोई कमेंट सेंड हो रहा है या खाली है, तो रोकें
    if (!t || !activeCommentPostId || window.isCommentSending) return;

    window.isCommentSending = true;
    inputEl.value = ""; // तुरंत इनपुट खाली करें (Optimistic UI)
    
    try {
        let myPhoto = window.currentUserData?.avatarBase64 || window.currentUser?.photoURL;
        
        await window.addDoc(window.collection(window.db, "posts", activeCommentPostId, "comments"), {
            text: t, 
            userName: window.currentUser.displayName || "User", 
            userPhoto: myPhoto || "https://i.pravatar.cc/150", 
            userId: window.currentUser.uid, 
            timestamp: window.serverTimestamp(), 
            likes: []
        }); 

        const pRef = window.doc(window.db, "posts", activeCommentPostId);
        const pSnap = await window.getDoc(pRef);
        
        if (pSnap.exists()) {
            const pData = pSnap.data();
            const newCount = (pData.commentCount || 0) + 1;
            
            await window.updateDoc(pRef, { commentCount: newCount });
            
            // 📱 2. सफल सबमिशन पर हल्का हैप्टिक वाइब्रेशन
            if (navigator.vibrate) navigator.vibrate(25);

            // थंबनेल काउंटर को तुरंत अपडेट करना
            const reelCommentSpan = document.getElementById(`reel-comment-count-${activeCommentPostId}`);
            if (reelCommentSpan) reelCommentSpan.innerText = newCount;
            
            document.querySelectorAll(`#post-comment-count-${activeCommentPostId}`).forEach(span => { 
                span.innerText = newCount; 
            });

            // 🌟 3. पुश नोटिफिकेशन ट्रिगर (संरचित टेक्स्ट के साथ ताकि बैकएंड इसे सही से पार्स कर सके)
            if (pData.userId !== window.currentUser.uid && typeof window.sendNotification === 'function') {
                await window.sendNotification(
                    pData.userId, 
                    'comment', 
                    `commented on your post: "${t}"`, 
                    activeCommentPostId
                ); 
            }
        }
    } catch (e) { 
        console.error("Error sending comment:", e); 
        
        // 🔄 4. टेक्स्ट लॉस प्रोटेक्शन (Text Loss Protection on Fail):
        // यदि इंटरनेट जाने के कारण कमेंट सेंड नहीं होता, तो टाइप किया हुआ टेक्स्ट इनपुट बॉक्स में वापस आ जाएगा, ताकि यूज़र की मेहनत बेकार न हो।
        inputEl.value = t; 
        
        if (typeof window.showToast === 'function') {
            window.showToast("Failed to send", "Your comment was draft-restored. Try again.", "", "error");
        }
    } finally {
        window.isCommentSending = false;
    }
};
// ==========================================
// --- SHARED POST & NAVIGATION LOGIC ---
// ==========================================
window.openSharedPost = async (postId) => {
    const chatRoom = document.getElementById('chat-room');
    if (chatRoom && chatRoom.classList.contains('active') && typeof currentChatId !== 'undefined' && currentChatId) {
        returnToChatData = {
            targetUid: currentChatId.targetUid,
            targetName: document.getElementById('chat-room-title')?.innerText || "Chat",
            placeholder: document.getElementById('chat-header-img')?.src || "",
            isFake: currentChatId.isFake
        };
        targetSharedPostId = postId;
        
        chatRoom.classList.remove('active'); 
        if(typeof toggleSharedReturnButton === 'function') toggleSharedReturnButton(true); 
    }

    const docSnap = await getDoc(doc(db, "posts", postId));
    if(docSnap.exists()) { 
        const postData = docSnap.data();
        if(typeof window.goToPost === 'function') window.goToPost(postId, postData.mediaType);
    } else { 
        if(typeof window.showToast === 'function') window.showToast("Error", "This post or reel has been deleted.", currentUser?.photoURL); 
    }
};

window.checkContentStillExists = async (id, collectionName) => {
    try {
        const docSnap = await getDoc(doc(db, collectionName, id));
        return docSnap.exists();
    } catch (e) { return true; }
};

window.goToPost = async (postId, type) => {
    const tab = type === 'video' ? 'reels' : 'home';
    
    const chatRoom = document.getElementById('chat-room');
    if (chatRoom && chatRoom.classList.contains('active') && typeof currentChatId !== 'undefined' && currentChatId) {
        returnToChatData = {
            targetUid: currentChatId.targetUid,
            targetName: document.getElementById('chat-room-title')?.innerText || "Chat",
            placeholder: document.getElementById('chat-header-img')?.src || "",
            isFake: currentChatId.isFake
        };
        targetSharedPostId = postId;
        chatRoom.classList.remove('active'); 
        if (typeof toggleSharedReturnButton === 'function') toggleSharedReturnButton(true);
    }

    window.switchTab(tab, true);

    if (type === 'video') {
        let el = document.getElementById(`reel-${postId}`);
        if (typeof isFirstReelsLoad !== 'undefined' && isFirstReelsLoad) {
            window.forceTopReelId = postId; 
            if(typeof loadReels === 'function') loadReels(); 
        } else {
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.style.boxShadow = 'inset 0 0 100px rgba(0, 255, 204, 0.3)';
                setTimeout(() => { el.style.boxShadow = 'none'; }, 2000);
            } else {
                window.forceTopReelId = postId;
                if(typeof refreshReels === 'function') refreshReels();
            }
        }
    } else {
        const feedContainer = document.getElementById('feed-container');
        const homeView = document.getElementById('home-view');
        let existingPost = document.getElementById(`post-${postId}`);

        if (existingPost) {
            feedContainer.prepend(existingPost);
            homeView.scrollTo({ top: 0, behavior: 'smooth' });
            existingPost.style.boxShadow = "0 0 30px rgba(255, 0, 110, 0.4)";
            setTimeout(() => existingPost.style.boxShadow = "none", 2500);
        } else {
            try {
                const postDoc = await getDoc(doc(db, "posts", postId));
                if (postDoc.exists()) {
                    const pData = postDoc.data();
                    const newPostEl = typeof window.createPostElement === 'function' ? window.createPostElement(postDoc.id, pData) : null;
                    if(newPostEl) {
                        feedContainer.prepend(newPostEl);
                        homeView.scrollTo({ top: 0, behavior: 'smooth' });
                        newPostEl.classList.add('fade-in');
                        newPostEl.style.boxShadow = "0 0 30px rgba(255, 0, 110, 0.5)";
                        setTimeout(() => newPostEl.style.boxShadow = "none", 3000);
                    }
                } else {
                    if(typeof window.showToast === 'function') window.showToast("Deleted", "This post is no longer available.", currentUser?.photoURL);
                }
            } catch (e) { console.error("Jump to post error:", e); }
        }
    }
};

// ==========================================
// --- TIME & DATE HELPERS ---
// ==========================================
window.getDateLabel = (timestamp) => {
    if (!timestamp) return "Today";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    
    const now = new Date();
    const yesterday = new Date(now); 
    yesterday.setDate(now.getDate() - 1);
    
    if (date.toDateString() === now.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

window.getSeenTimeAgo = (timestamp) => {
    if (!timestamp) return "Seen";

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffSeconds = Math.floor((now - date) / 1000);

    if (diffSeconds < 60) return "Seen now";

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `Seen ${diffMinutes} min`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Seen ${diffHours} hr`;

    const diffDays = Math.floor(diffHours / 24);
    return `Seen ${diffDays} d`;
};

// ==========================================
// --- SETTINGS ---
// ==========================================
window.openSettingsModal = () => {
    window.toggleModal('settings-modal', true);
    
    const oldPwd = document.getElementById('setting-old-password');
    const newPwd = document.getElementById('setting-new-password');
    const confirmPwd = document.getElementById('setting-confirm-password');
    if(oldPwd) oldPwd.value = "";
    if(newPwd) newPwd.value = "";
    if(confirmPwd) confirmPwd.value = "";

    const pwdContainer = document.getElementById('old-pwd-container');
    if (pwdContainer) {
        if (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.chatPassword) {
            pwdContainer.style.display = "block";
        } else {
            pwdContainer.style.display = "none";
        }
    }
};

window.closeSettingsModal = () => {
    window.toggleModal('settings-modal', false);
};

// ==========================================
// --- STORY NAVIGATION FIX ---
// ==========================================
window.navigateToRepliedStory = async (storyId, ownerId) => {
    try {
        if (!currentUser) return;
        if(typeof window.showToast === 'function') window.showToast("Loading", "Opening story...", currentUser.photoURL);

        const storySnap = await getDoc(doc(db, "stories", storyId));
        if (!storySnap.exists()) {
            if(typeof showCustomAlert === 'function') showCustomAlert("Expired", "This story is no longer available.", "warning");
            return;
        }

        let stories = window.allGroupedStories ? window.allGroupedStories[ownerId] : [];
        
        if (!stories || stories.length === 0) {
            if(typeof loadStories === 'function') await loadStories(); 
            stories = window.allGroupedStories ? window.allGroupedStories[ownerId] : [];
        }

        if (stories && stories.length > 0) {
            const targetIdx = stories.findIndex(s => s.id === storyId);
            if (targetIdx !== -1) {
                activeStoryQueue = stories;
                currentStoryIdx = targetIdx;
                
                if (typeof openStoryModal === 'function') {
                    openStoryModal();
                } else {
                    window.toggleModal('story-view-modal', true);
                    if(typeof renderStoryUI === 'function') renderStoryUI();
                }
            } else {
                if(typeof showCustomAlert === 'function') showCustomAlert("Expired", "Story has expired or been deleted.", "warning");
            }
        } else {
            if(typeof showCustomAlert === 'function') showCustomAlert("Not Found", "Could not find any active stories for this user.", "error");
        }
    } catch (e) {
        console.error("Navigation error:", e);
        if(typeof window.showToast === 'function') window.showToast("Error", "Could not load story.", currentUser.photoURL);
    }
};

window.openInstagram = () => {
    const user = "dk_love_chats", appUri = `instagram://user?username=${user}`, webUri = `https://www.instagram.com/${user}/`;
    window.location.href = appUri; setTimeout(() => { if (!document.hidden) window.open(webUri, '_blank'); }, 600);
};

// ==========================================
// --- REFERRAL & BOT CREATION LOGIC ---
// ==========================================
window.processReferral = async (inputCode) => {
    if (!inputCode || typeof inputCode !== 'string') return;
    const cleanCode = inputCode.trim().toLowerCase();
    
    if (typeof currentUser !== 'undefined' && currentUser && currentUserData && currentUserData.referralCode === cleanCode) return;

    try {
        const q = query(collection(db, "users"), where("referralCode", "==", cleanCode), limit(1));
        const snap = await getDocs(q);

        if (!snap.empty) {
            const referrerDoc = snap.docs[0], referrerId = referrerDoc.id, referrerData = referrerDoc.data();
            const currentCount = referrerData.referralsCount || 0;

            if (currentCount >= 10) return;

            await updateDoc(doc(db, "users", referrerId), { referralsCount: currentCount + 1 });
            if(typeof triggerBotArmyReward === 'function') window.triggerBotArmyReward(referrerId, 10).catch(()=>{});
        }
    } catch (e) { console.error("Referral Processing Error:", e); }
};

window.createRealLookingBot = async (targetUserId) => {
    try {
        const botId = 'bot_' + Math.random().toString(36).substr(2, 9);
        const firstNames = ["Rahul", "Priya", "Amit", "Sana", "Vikram", "Neha", "Arjun", "Anjali", "Rohan", "Ishita"];
        const lastNames = ["Sharma", "Verma", "Khan", "Singh", "Das", "Malhotra", "Goel", "Patel"];
        const fakeBios = ["Living life!", "Love Chats User ❤️", "Traveler ✈️", "Music Lover 🎵", "Secure Chatting!", "Always Online 🚀"];

        const randomName = firstNames[Math.floor(Math.random() * firstNames.length)] + " " + lastNames[Math.floor(Math.random() * lastNames.length)];
        const randomBio = fakeBios[Math.floor(Math.random() * fakeBios.length)];
        
        await setDoc(doc(db, "users", botId), {
            uid: botId, name: randomName, username: randomName.toLowerCase().replace(/\s/g, '_') + Math.floor(Math.random() * 100),
            photoURL: `https://i.pravatar.cc/150?u=${botId}`, avatarBase64: null, bio: randomBio,
            isBot: true, lastActive: Date.now(), followers: [], following: [targetUserId] 
        });

        return botId;
    } catch (e) { return null; }
};

function formatTime(timestamp) {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    let hours = date.getHours(); const minutes = date.getMinutes(); const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12; hours = hours ? hours : 12; 
    return hours + ':' + (minutes < 10 ? '0' + minutes : minutes) + ' ' + ampm;
}

function timeAgo(timestamp) {
    if(!timestamp) return "Offline";
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}
window.timeAgo = timeAgo;

// ==========================================
// --- 🛡️ AUTH STATE & BAN SECURITY ---
// ==========================================
let isUserBanned = false;

onAuthStateChanged(auth, async (user) => {
    const splash = document.getElementById('splash-screen');
    const bannedModal = document.getElementById('banned-modal');
    const authSection = document.getElementById('auth-section');
    const appContainer = document.getElementById('app-container');
    
    if (user) {
        currentUser = user;
        
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if(userDoc.exists()) currentUserData = userDoc.data();
            else currentUserData = { following: [], followers: [], avatarBase64: null, lockedChats: [] };
        } catch (e) { console.log("Error fetching user data:", e); }

        if (currentUserData && currentUserData.isBanned === true) {
            isUserBanned = true; 
            if (authSection) authSection.classList.add('hidden');
            if (appContainer) appContainer.classList.add('hidden');
            if (splash) splash.classList.add('hidden');
            if (bannedModal) { bannedModal.classList.remove('hidden'); bannedModal.style.display = 'flex'; }
            signOut(auth); return; 
        }

        isUserBanned = false;
        if(typeof unsubscribeCurrentUser !== 'undefined' && unsubscribeCurrentUser) unsubscribeCurrentUser();
        
        if(typeof window.loadFeed === 'function') window.loadFeed(true);

        if (splash) { splash.classList.add('splash-hide'); setTimeout(() => splash.classList.add('hidden'), 500); }
        if (authSection) authSection.classList.add('hidden');
        if (appContainer) appContainer.classList.remove('hidden');
        if (bannedModal) bannedModal.classList.add('hidden');
        
        window.unsubscribeCurrentUser = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
            if(docSnap.exists()) {
                currentUserData = docSnap.data();
                if (currentUserData.isBanned === true) {
                    isUserBanned = true;
                    if (authSection) authSection.classList.add('hidden');
                    if (appContainer) appContainer.classList.add('hidden');
                    if (bannedModal) { bannedModal.classList.remove('hidden'); bannedModal.style.display = 'flex'; }
                    signOut(auth); return;
                }
            }
        });

        // 📅 दैनिक लॉगिन एक्टिविटी ट्रैकर सक्रिय करें (DK-love-Verified Integration)
        import("./DK-love-Verified.js")
            .then((module) => {
                if (typeof module.recordUserActivity === 'function') {
                    module.recordUserActivity(user.uid, db);
                }
            })
            .catch((err) => console.warn("Verification tracking bypassed:", err));

        let lastActiveTime = 0;
        document.body.addEventListener('click', () => {
            const now = Date.now();
            if (now - lastActiveTime > 60000) {
                lastActiveTime = now;
                setDoc(doc(db, "users", user.uid), { lastActive: now }, { merge: true }).catch(()=>{});
            }
        });

        if(typeof window.startNotificationListener === 'function') window.startNotificationListener(); 
        if(typeof loadStories === 'function') loadStories(); 

        // === 📞 CALL LISTENER INTEGRATION ===
        import('./call.js')
            .then((module) => {
                if (typeof module.setupCallListeners === 'function') {
                    module.setupCallListeners(user.uid);
                }
            })
            .catch((err) => {
                console.warn("Calling System dynamic initialization skipped or failed:", err);
            });
        // ====================================
        
        setTimeout(() => {
            if (typeof window.checkAndRedirectPendingDeepLinks === 'function') {
                window.checkAndRedirectPendingDeepLinks();
            }
        }, 1200); 
        
    } else {
        currentUser = null;
        if (splash) { splash.classList.add('splash-hide'); setTimeout(() => splash.classList.add('hidden'), 500); }
        
        if (isUserBanned === true) {
            if (authSection) authSection.classList.add('hidden');
            if (appContainer) appContainer.classList.add('hidden');
            if (bannedModal) { bannedModal.classList.remove('hidden'); bannedModal.style.display = 'flex'; }
        } else {
            if (authSection) authSection.classList.remove('hidden');
            if (appContainer) appContainer.classList.add('hidden');
            if (bannedModal) { bannedModal.classList.add('hidden'); bannedModal.style.display = 'none'; }
        }
    }
});
// ==========================================
// --- APP SETTINGS (MAINTENANCE & UPDATE) ---
// ==========================================
onSnapshot(doc(db, "app_settings", "maintenance"), (docSnap) => {
    const maintenanceModal = document.getElementById('maintenance-modal');
    if(maintenanceModal) {
        if(docSnap.exists() && docSnap.data().isActive === true) {
            maintenanceModal.classList.remove('hidden'); maintenanceModal.style.display = 'flex';
        } else {
            maintenanceModal.classList.add('hidden'); maintenanceModal.style.display = 'none';
        }
    }
});

onSnapshot(doc(db, "app_settings", "global_notice"), (docSnap) => {
    if(docSnap.exists()) {
        const data = docSnap.data(), noticeModal = document.getElementById('global-notice-modal');
        if(data.isActive === true && typeof APP_VERSION !== 'undefined' && APP_VERSION < parseFloat(data.targetVersion)) {
            document.getElementById('notice-ui-title').innerText = data.title;
            document.getElementById('notice-ui-msg').innerText = data.message;
            document.getElementById('notice-ui-link').href = data.link || "#";
            document.getElementById('notice-ui-close').style.display = data.forceUpdate === true ? 'none' : 'inline-block';
            if(noticeModal) { noticeModal.classList.remove('hidden'); noticeModal.style.display = 'flex'; }
        } else {
            if(noticeModal) { noticeModal.classList.add('hidden'); noticeModal.style.display = 'none'; }
        }
    }
});

// =========================================================
// --- RADAR UI ---
// =========================================================
let radarScanTimer = null;

window.openRadar = () => { document.getElementById('offline-radar-modal').classList.remove('hidden'); window.scanNearbyUsers(); };
window.closeRadar = () => { document.getElementById('offline-radar-modal').classList.add('hidden'); if(radarScanTimer) clearTimeout(radarScanTimer); };

window.scanNearbyUsers = () => {
    const container = document.getElementById('radar-users-container'), statusText = document.getElementById('radar-status-text');
    container.innerHTML = ""; statusText.innerHTML = `<i class="fa-solid fa-satellite-dish fa-fade"></i> Scanning for devices...`;
    if(radarScanTimer) clearTimeout(radarScanTimer);

    radarScanTimer = setTimeout(() => {
        const activeUsers = typeof allCachedUsers !== 'undefined' ? allCachedUsers.filter(u => currentUser && u.uid !== currentUser.uid && (Date.now() - u.lastActive) < 300000) : [];
        if(activeUsers.length === 0) { statusText.innerHTML = `<i class="fa-solid fa-circle-exclamation" style="color:var(--warning);"></i> No nearby devices found.`; return; }

        statusText.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#00b894;"></i> Found ${activeUsers.length} devices nearby!`;

        activeUsers.forEach((user, index) => {
            setTimeout(() => {
                const dot = document.createElement('div'); dot.className = 'radar-user-dot';
                const angle = Math.random() * Math.PI * 2, radius = 50 + Math.random() * 80;
                dot.style.left = `${160 + radius * Math.cos(angle)}px`; dot.style.top = `${160 + radius * Math.sin(angle)}px`;
                const avatar = user.avatarBase64 || user.photoURL || "https://i.pravatar.cc/150";
                
                dot.innerHTML = `<img src="${avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;"><div class="radar-user-name">${user.name.split(' ')[0]}</div>`;
                dot.onclick = () => { window.closeRadar(); if(typeof startPrivateChat === 'function') startPrivateChat(user.uid, user.name, avatar); };
                container.appendChild(dot);
                if(typeof playSendSound === 'function') playSendSound();
            }, index * 800);
        });
    }, 2000);
};

// ==========================================
// --- CUSTOM CARD BOARD ALERT SYSTEM ---
// ==========================================
window.showCustomAlert = (title, message, type = 'warning') => {
    const modal = document.getElementById('custom-alert-modal'), titleEl = document.getElementById('custom-alert-title'), msgEl = document.getElementById('custom-alert-message'), iconEl = document.getElementById('custom-alert-icon');
    titleEl.innerText = title; msgEl.innerText = message;

    if (type === 'error') { iconEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>'; iconEl.style.color = '#ff4757'; } 
    else if (type === 'success') { iconEl.innerHTML = '<i class="fa-solid fa-circle-check"></i>'; iconEl.style.color = '#00b894'; } 
    else { iconEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>'; iconEl.style.color = '#ffbe0b'; }

    modal.classList.remove('hidden'); if (navigator.vibrate) navigator.vibrate([50, 50, 50]); 
};

window.closeCustomAlert = () => { document.getElementById('custom-alert-modal').classList.add('hidden'); };

// ==========================================
// --- PREMIUM LOADING SCREEN ---
// ==========================================
window.initHighEndLoader = () => {
    const splash = document.getElementById('splash-screen'), fillBar = document.getElementById('fill-bar');
    const pcText = document.getElementById('load-pc'), stepText = document.getElementById('load-step');
    if(!splash || !fillBar) return;
    
    let progress = 0;
    const steps = ["Initializing Engine...", "Securing Handshake...", "Loading Media Assets...", "Rendering Premium UI..."];

    function update() {
        progress += Math.floor(Math.random() * 8) + 2;
        if (progress >= 100) {
            progress = 100; fillBar.style.width = "100%"; pcText.innerText = "100%";
            setTimeout(() => { splash.classList.add('splash-hide'); setTimeout(() => splash.style.display = 'none', 600); }, 500);
            return;
        }

        fillBar.style.width = progress + "%"; pcText.innerText = progress + "%";
        if (progress > 25 && progress < 50) stepText.innerText = steps[1];
        if (progress > 50 && progress < 75) stepText.innerText = steps[2];
        if (progress > 75) stepText.innerText = steps[3];

        setTimeout(update, 50 + Math.random() * 50);
    }
    update();
};

window.addEventListener('load', window.initHighEndLoader);
