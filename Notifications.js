import { getMessaging, getToken, isSupported } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging.js";
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDocs, writeBatch, deleteDoc, where, getDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

// ===================================================
// --- GLOBAL STATE VARIABLES & CONFIG ---
// ===================================================
let messaging = null;
let unreadNotifsCount = 0;
let unsubscribeNotifs = null;

let activeToastInstance = null;
const toastRequestQueue = [];

let offlineActionQueue = JSON.parse(localStorage.getItem('offline_notif_actions') || "[]");

// स्मार्ट पेजिनेशन और जीरो-लैग एनीमेशन वेरिएबल्स
let currentNotifLimit = 10;
let isNotifsLoadingMore = false;
let hasMoreNotifications = true;
let animatedNotifIds = new Set(); // पहले से एनीमेट हो चुके कार्ड्स को ट्रैक करने के लिए

// ===================================================
// 🛠️ SMART CSS INJECTOR (ZERO-LAG SCROLLING & GPU COMPOSITING)
// ===================================================
const notifStyle = document.createElement('style');
notifStyle.innerHTML = `
    @keyframes notifShimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
    }
    .notif-skeleton-card {
        display: flex;
        align-items: center;
        gap: 15px;
        padding: 15px;
        background: #ffffff;
        border-radius: 20px;
        border: 1px solid #e2e8f0;
        margin-bottom: 8px;
    }
    .notif-sk-avatar {
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
        background-size: 200% 100%;
        animation: notifShimmer 1.5s infinite linear;
    }
    .notif-sk-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .notif-sk-line {
        height: 12px;
        border-radius: 6px;
        background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
        background-size: 200% 100%;
        animation: notifShimmer 1.5s infinite linear;
    }
    .notif-sk-thumbnail {
        width: 52px;
        height: 52px;
        border-radius: 12px;
        background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
        background-size: 200% 100%;
        animation: notifShimmer 1.5s infinite linear;
    }
    @keyframes notifPopIn {
        from {
            opacity: 0;
            transform: translate3d(0, 15px, 0);
        }
        to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
        }
    }
    .notif-item-pop {
        animation: notifPopIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        opacity: 0;
        will-change: transform, opacity;
    }
    
    /* ⚡ सुपर फास्ट स्क्रॉलिंग और वाइट स्क्रीन प्रोटेक्शन */
    #notif-full-modal {
        scroll-behavior: smooth;
        will-change: scroll-position;
        -webkit-overflow-scrolling: touch;
    }
    
    .notif-item-full {
        content-visibility: auto;
        contain-intrinsic-size: auto 120px;
        will-change: transform, opacity;
        transform: translate3d(0,0,0);
    }
    
    .notif-item-full img {
        image-rendering: -webkit-optimize-contrast;
        backface-visibility: hidden;
    }
    
    /* 🎯 स्मार्ट "क्लिक हियर टू टॉप" बटन - कार्ड्स से अलग सीधे स्क्रीन की बॉडी पर सेट */
    .notif-scroll-top-btn {
        position: fixed !important;  /* पूरे ब्राउज़र स्क्रीन पर लॉक रखने के लिए */
        bottom: 30px !important;    /* निचले हिस्से में बिल्कुल निश्चित स्थिति */
        right: 25px !important;     /* दाईं तरफ बिल्कुल निश्चित स्थिति */
        width: 50px;
        height: 50px;
        background: var(--primary-grad, linear-gradient(135deg, #ff006e, #8338ec));
        color: white;
        border: none;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        box-shadow: 0 6px 20px rgba(131, 56, 236, 0.4);
        cursor: pointer;
        z-index: 999999 !important; /* सभी नोटिफिकेशन कार्ड्स और मोडल के ऊपर रखने के लिए सर्वोच्च इंडेक्स */
        opacity: 0;
        transform: translateY(30px) scale(0.6);
        transition: opacity 0.25s cubic-bezier(0.25, 1, 0.5, 1), transform 0.25s cubic-bezier(0.25, 1, 0.5, 1);
        pointer-events: none;
        will-change: transform, opacity;
    }
    
    .notif-scroll-top-btn.visible {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
    }
    
    .notif-scroll-top-btn:active {
        transform: scale(0.9) translateY(2px);
        box-shadow: 0 4px 10px rgba(131, 56, 236, 0.3);
    }
`;
document.head.appendChild(notifStyle);

// ===================================================
// 🛠️ SAFE LAZY MESSAGING INITIALIZER
// ===================================================
function getMessagingSafely() {
    if (messaging) return messaging;
    if (window.app) {
        try {
            messaging = getMessaging(window.app);
            return messaging;
        } catch (e) {
            console.warn("Messaging failed to initialize:", e.message);
        }
    }
    return null;
}

// ===================================================
// --- NOTIFICATIONS UI & TOGGLES ---
// ===================================================
window.toggleNotificationDropdown = () => {
    const badge = document.getElementById('header-notif-badge');
    window.toggleNotifFullModal(true);
    
    currentNotifLimit = 10;
    animatedNotifIds.clear();
    window.startNotificationListener(currentNotifLimit, false);

    if (unreadNotifsCount > 0) {
        (async () => {
            try {
                const q = query(collection(window.db, "users", window.currentUser.uid, "notifications"), where("read", "==", false));
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    const batch = writeBatch(window.db);
                    snapshot.forEach(docSnap => batch.update(docSnap.ref, { read: true }));
                    await batch.commit();
                }
                unreadNotifsCount = 0;
                if (badge) { badge.innerText = '0'; badge.style.display = 'none'; }
            } catch (e) { console.error("Sync error:", e); }
        })();
    }
};

window.toggleNotifFullModal = (show) => {
    const modal = document.getElementById('notif-full-modal');
    if (!modal) return;
    
    const scrollTopBtn = document.getElementById('notif-scroll-top-btn');

    if (show) {
        modal.classList.remove('hidden');
        requestAnimationFrame(() => { 
            modal.classList.remove('modal-slide-down'); 
            modal.classList.add('modal-slide-up'); 
        });
        history.pushState({view: 'notifications'}, null);
    } else {
        modal.classList.remove('modal-slide-up'); 
        modal.classList.add('modal-slide-down');
        
        // मोडल बंद होते ही बैक टू टॉप बटन को तुरंत और बिना किसी देरी के छिपाएं
        if (scrollTopBtn) {
            scrollTopBtn.classList.remove('visible');
        }

        setTimeout(() => { 
            if (modal.classList.contains('modal-slide-down')) modal.classList.add('hidden'); 
        }, 300);
    }
};

// ===================================================
// --- FIREBASE MESSAGING PERMISSIONS ---
// ===================================================
isSupported().then(supported => {
    if (supported) {
        setTimeout(() => {
            const safeMsg = getMessagingSafely();
            if (safeMsg) checkNotificationPermission();
        }, 1500); 
    }
});

function checkNotificationPermission() {
    if (Notification.permission === 'default') {
        const notifBanner = document.getElementById('notif-perm-banner');
        if(notifBanner) notifBanner.classList.remove('hidden');
    }
}

window.enableNotifications = async () => {
    const safeMsg = getMessagingSafely();
    if (!safeMsg) return;

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        const notifBanner = document.getElementById('notif-perm-banner');
        if(notifBanner) notifBanner.classList.add('hidden');
        
        try {
            const token = await getToken(safeMsg, { vapidKey: "BMDJDsQo74FayFmBTyW0oXjjB-sUutaiI1FysNolYtCe_MI3w1ZVcIiXgyVDkcpFsbOV8B1CWVYZbcoGd9H8ywk" });
            if (token && window.currentUser) {
                await updateDoc(doc(window.db, "users", window.currentUser.uid), { fcmToken: token });
            }
        } catch (err) {
            console.error("Token generation failed: ", err);
        }
    }
};

// ===================================================
// --- CONTEXT-AWARE FILTERING & SUPPRESSION ---
// ===================================================
function shouldSuppressNotification(senderUid) {
    const chatRoom = document.getElementById('chat-room');
    const isChatActive = chatRoom && chatRoom.classList.contains('active');
    
    if (isChatActive && window.currentChatId && window.currentChatId.targetUid === senderUid) {
        return true; 
    }
    return false; 
}

// ===================================================
// --- NOTIFICATION AGGREGATION (GROUPING) ---
// ===================================================
function aggregateNotifications(rawNotifications) {
    const grouped = {};
    const finalResult = [];

    rawNotifications.forEach(n => {
        if (n.type === 'like' && n.payload) {
            const key = `${n.type}_${n.payload}`;
            if (!grouped[key]) {
                grouped[key] = { ...n, id: n.id, usersList: [n.fromName], count: 1 };
            } else {
                grouped[key].count += 1;
                if (!grouped[key].usersList.includes(n.fromName)) {
                    grouped[key].usersList.push(n.fromName);
                }
                if (n.timestamp?.toMillis && (!grouped[key].timestamp?.toMillis || n.timestamp.toMillis() > grouped[key].timestamp.toMillis())) {
                    grouped[key].timestamp = n.timestamp;
                }
            }
        } else {
            finalResult.push(n);
        }
    });

    Object.values(grouped).forEach(g => {
        if (g.count > 1) {
            const otherCount = g.count - 1;
            g.text = `${g.usersList[0]} and ${otherCount} other${otherCount > 1 ? 's' : ''} liked your content`;
        }
        finalResult.push(g);
    });

    return finalResult.sort((a, b) => {
        const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
        const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
        return timeB - timeA;
    });
}

// ===================================================
// --- ⚡ INSTANT FOLLOW/UNFOLLOW UI TOGGLE ---
// ===================================================
window.handleNotificationFollowToggle = async (btn, senderUid) => {
    if (navigator.vibrate) navigator.vibrate(30);

    const isCurrentlyFollowing = btn.classList.contains('unfollow-btn');

    if (isCurrentlyFollowing) {
        btn.className = "follow-back-btn";
        btn.innerText = "Follow Back";
        btn.style.background = "var(--primary-grad)";
        btn.style.color = "white";
        btn.style.border = "none";
        btn.style.boxShadow = "0 4px 10px rgba(255, 0, 110, 0.2)";
    } else {
        btn.className = "unfollow-btn";
        btn.innerText = "Unfollow";
        btn.style.background = "#e2e8f0";
        btn.style.color = "#475569";
        btn.style.border = "1px solid #cbd5e1";
        btn.style.boxShadow = "none";
    }

    if (typeof window.handleFollow === 'function') {
        await window.handleFollow(senderUid);
    }
};

// ===================================================
// --- ACTIONABLE NOTIFICATIONS (UI BUTTONS) ---
// ===================================================
function getActionButtonsHTML(nid, type, senderUid, payload) {
    if (type === 'follow') {
        const isFollowing = window.currentUserData?.following && window.currentUserData.following.includes(senderUid);
        
        if (isFollowing) {
            return `
            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <button onclick="event.stopPropagation(); window.handleNotificationFollowToggle(this, '${senderUid}');" class="unfollow-btn"
                        style="background: #e2e8f0; color: #475569; border: 1px solid #cbd5e1; padding: 6px 15px; border-radius: 12px; font-weight: bold; font-size: 0.75rem; cursor: pointer; transition: all 0.2s;">
                    Unfollow
                </button>
            </div>`;
        } else {
            return `
            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <button onclick="event.stopPropagation(); window.handleNotificationFollowToggle(this, '${senderUid}');" class="follow-back-btn"
                        style="background: var(--primary-grad); color: white; border: none; padding: 6px 15px; border-radius: 12px; font-weight: bold; font-size: 0.75rem; cursor: pointer; transition: all 0.2s;">
                    Follow Back
                </button>
            </div>`;
        }
    }
    
    if (type === 'comment') {
        return `
        <div style="display: flex; gap: 10px; margin-top: 10px; align-items: center;" onclick="event.stopPropagation();">
            <input type="text" id="quick-reply-input-${nid}" placeholder="Type quick reply to comment..." 
                   style="flex: 1; padding: 5px 10px; border-radius: 10px; border: 1px solid #cbd5e1; font-size: 0.75rem; outline: none; background: white; color: black;">
            <button onclick="window.sendQuickReplyDirectly('${nid}', '${payload}')" 
                    style="background: #10002b; color: white; border: none; padding: 5px 12px; border-radius: 10px; font-weight: bold; font-size: 0.75rem; cursor: pointer;">
                Reply
            </button>
        </div>`;
    }
    return "";
}

window.sendQuickReplyDirectly = async (nid, postId) => {
    const input = document.getElementById(`quick-reply-input-${nid}`);
    const text = input?.value.trim();
    if (!text || !postId) return;

    if (input) input.value = "";
    try {
        let myPhoto = window.currentUserData?.avatarBase64 || window.currentUser?.photoURL;
        
        await addDoc(collection(window.db, "posts", postId, "comments"), {
            text: text,
            userName: window.currentUser.displayName,
            userPhoto: myPhoto,
            userId: window.currentUser.uid,
            timestamp: serverTimestamp(),
            likes: []
        });

        const postRef = doc(window.db, "posts", postId);
        const postSnap = await getDoc(postRef);
        if (postSnap.exists()) {
            const currentCount = postSnap.data().commentCount || 0;
            await updateDoc(postRef, { commentCount: currentCount + 1 });
            document.querySelectorAll(`#post-comment-count-${postId}`).forEach(span => { span.innerText = currentCount + 1; });
        }

        window.showToast("Success", "कमेंट का उत्तर पोस्ट कर दिया गया है", myPhoto, "success");
    } catch (e) {
        console.error("Direct comment reply failed:", e);
        window.showToast("Error", "कमेंट सबमिट करने में विफल", "", "error");
    }
};

// ===================================================
// --- REAL-TIME NOTIFICATION LISTENERS ---
// ===================================================
window.handleNotificationClick = (type, payload) => {
    window.toggleNotifFullModal(false);
    setTimeout(async () => {
        if (type === 'follow') {
            if(typeof window.viewUserProfile === 'function') { 
                window.viewUserProfile(payload); 
                window.switchTab('profile'); 
            }
        } else if (type === 'like_story') {
            if (typeof window.navigateToRepliedStory === 'function' && window.currentUser) {
                window.navigateToRepliedStory(payload, window.currentUser.uid);
            }
        } else {
            try {
                const p = await window.getDoc(doc(window.db, "posts", payload));
                if (p.exists() && typeof window.goToPost === 'function') {
                    window.goToPost(payload, p.data().mediaType);
                }
                else if(typeof window.showCustomAlert === 'function') {
                    window.showCustomAlert("Expired", "This content was removed.", "warning");
                }
            } catch (e) {}
        }
    }, 150);
};

// ===================================================
// 🌟 SMART BACKGROUND PREVIEW LOADER (FALLBACK + IMAGEURL + VIDEO FALLBACK)
// ===================================================
window.loadNotificationMediaPreview = async (notifId, postId, type = 'post') => {
    const container = document.getElementById(`notif-media-${notifId}`);
    if (!container || !postId) return;

    try {
        const collectionName = type === 'like_story' ? "stories" : "posts";
        const postSnap = await getDoc(doc(window.db, collectionName, postId));
        if (postSnap.exists()) {
            const postData = postSnap.data();
            
            const coverSrc = postData.coverUrl || postData.imageUrl;
            const mediaSrc = postData.mediaUrl;
            
            const isVideo = postData.mediaType === 'video' || (mediaSrc && (mediaSrc.includes('.mp4') || mediaSrc.includes('.mov') || mediaSrc.includes('.webm') || mediaSrc.includes('.mkv')));
            
            container.style.display = "flex";
            if (coverSrc) {
                container.innerHTML = `<img src="${coverSrc}" style="width: 52px; height: 52px; object-fit: cover; border-radius: 8px;" class="fade-in" decoding="async" loading="lazy">`;
            } else if (isVideo && mediaSrc) {
                container.innerHTML = `
                <div style="position: relative; width: 52px; height: 52px; border-radius: 8px; overflow: hidden;">
                    <video src="${mediaSrc}#t=1" style="width: 100%; height: 100%; object-fit: cover;" muted playsinline></video>
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.5); width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.6rem;">
                        <i class="fa-solid fa-play"></i>
                    </div>
                </div>`;
            } else if (mediaSrc) {
                container.innerHTML = `<img src="${mediaSrc}" style="width: 52px; height: 52px; object-fit: cover; border-radius: 8px;" class="fade-in" decoding="async" loading="lazy">`;
            } else {
                container.remove(); 
            }
        } else {
            container.remove(); 
        }
    } catch (e) {
        console.warn("Failed to load thumbnail preview asynchronously:", e);
        container.remove();
    }
};

// ===================================================
// 🌟 SMART PRE-FETCH SENDER INTERCEPTOR
// ===================================================
async function sendNotification(targetUid, type, message, payload, mediaUrl = "", coverUrl = "") {
    if(!window.currentUser || targetUid === window.currentUser.uid) return;
    try {
        let fromPhoto = window.currentUser.photoURL;
        if(window.currentUserData && window.currentUserData.avatarBase64) {
            fromPhoto = window.currentUserData.avatarBase64;
        }

        let finalMediaUrl = mediaUrl;
        let finalCoverUrl = coverUrl;

        if (!finalMediaUrl && !finalCoverUrl && payload) {
            try {
                const collectionName = type === 'like_story' ? "stories" : "posts";
                const postSnap = await getDoc(doc(window.db, collectionName, payload));
                if (postSnap.exists()) {
                    const pData = postSnap.data();
                    if (pData.mediaType === 'video') {
                        finalCoverUrl = pData.coverUrl || "";
                        finalMediaUrl = pData.mediaUrl || "";
                    } else {
                        finalMediaUrl = pData.mediaUrl || pData.imageUrl || "";
                        finalCoverUrl = "";
                    }
                }
            } catch (e) {
                console.warn("Pre-fetch in sendNotification skipped:", e);
            }
        }

        await addDoc(collection(window.db, "users", targetUid, "notifications"), {
            type: type, 
            fromName: window.currentUser.displayName, 
            fromPhoto: fromPhoto, 
            senderUid: window.currentUser.uid, 
            text: message, 
            timestamp: serverTimestamp(), 
            read: false, 
            payload: payload || "",
            mediaUrl: finalMediaUrl || "",
            coverUrl: finalCoverUrl || ""
        });
    } catch(e) {
        console.error("Error sending notification:", e);
    }
}
window.sendNotification = sendNotification;

// ===================================================
// 🌟 SKELETON RENDERER
// ===================================================
function renderNotificationSkeletons(container, count = 5) {
    let skHTML = "";
    for (let i = 0; i < count; i++) {
        skHTML += `
        <div class="notif-skeleton-card">
            <div class="notif-sk-avatar"></div>
            <div class="notif-sk-info">
                <div class="notif-sk-line" style="width: 40%;"></div>
                <div class="notif-sk-line" style="width: 75%;"></div>
                <div class="notif-sk-line" style="width: 25%; height: 8px; margin-top: 4px;"></div>
            </div>
            <div class="notif-sk-thumbnail"></div>
        </div>`;
    }
    container.innerHTML = skHTML;
}

// ===================================================
// 🌟 सेंडर की डीटेल्स को रीयल-टाइम में सुनने और अपडेट करने वाला इंजन (Rose Gold Tick के साथ)
// ===================================================
function bindRealTimeSenderDetails(cardId, senderUid, fallbackName, fallbackPhoto) {
    if (!senderUid || !window.db) return;

    // डॉक्यूमेंट पाथ सेट करें
    const docRef = doc(window.db, "users", senderUid);
    
    // Firestore का रीयल-टाइम लिसनर बाइंड करें
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
        const card = document.getElementById(cardId);
        
        // सुरक्षा जांच: अगर कार्ड अब DOM में मौजूद नहीं है (जैसे यूजर ने नोटिफिकेशन डिलीट कर दी),
        // तो इस लिसनर को तुरंत अनसब्सक्राइब करें ताकि मेमोरी लीक न हो।
        if (!card) {
            unsubscribe();
            return;
        }

        if (docSnap.exists()) {
            const userData = docSnap.data();
            const nameEl = card.querySelector('.sender-name-text');
            const imgEl = card.querySelector('.sender-avatar-img');
            const badgeContainer = card.querySelector('.sender-badge-container');

            // मान प्राप्त करें (प्राइमरी या फॉलबैक)
            const updatedName = userData.name || fallbackName;
            const updatedPhoto = userData.avatarBase64 || userData.photoURL || fallbackPhoto;
            
            // वेरिफिकेशन स्टेटस जांचें
            const isVerified = userData.isVerified === true || 
                               userData.verified === true || 
                               userData.verificationStatus === 'verified' || 
                               userData.verificationType === 'gold' || 
                               userData.verificationType === 'premium';

            // रीयल-टाइम नाम अपडेट करें
            if (nameEl && nameEl.innerText !== updatedName) {
                nameEl.innerText = updatedName;
            }

            // रीयल-टाइम प्रोफाइल पिक्चर (DP) अपडेट करें
            if (imgEl && imgEl.src !== updatedPhoto) {
                imgEl.src = updatedPhoto;
            }

            // रीयल-टाइम Rose Gold Verified Tick अपडेट करें
            if (badgeContainer) {
                if (isVerified) {
                    badgeContainer.innerHTML = `
                    <svg width="15" height="15" viewBox="0 0 128 128" style="vertical-align: middle; display: inline-block; margin-left: 5px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.15));">
                        <defs>
                            <linearGradient id="roseGoldNotifSeal" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#fae3e0"/>
                                <stop offset="40%" stop-color="#f3a193"/>
                                <stop offset="100%" stop-color="#b76e79"/>
                            </linearGradient>
                        </defs>
                        <path d="M64 10L79 22L98 20L96 39L110 54L96 69L98 88L79 86L64 100L49 86L30 88L32 69L18 54L32 39L30 20L49 22Z" fill="url(#roseGoldNotifSeal)"/>
                        <circle cx="64" cy="54" r="30" fill="#FFFFFF" opacity="0.12"/>
                        <path d="M47 55L59 67L82 44" fill="none" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>`;
                } else {
                    badgeContainer.innerHTML = "";
                }
            }
        }
    }, (err) => {
        console.warn("Real-time sender update subscription skipped or failed:", err.message);
    });
}

// ===================================================
// 🌟 SMART CARD HTML CREATOR (FOR IN-PLACE DOM INSERTION)
// ===================================================
function createNotificationCardElement(n, animationDelay) {
    const notifTime = n.timestamp?.toMillis ? n.timestamp.toMillis() : Date.now();
    const timeText = window.timeAgo ? window.timeAgo(notifTime) : "Just now";
    const clickAction = `handleNotificationClick('${n.type}', '${n.payload}')`;
    const actionButtonsHTML = getActionButtonsHTML(n.id, n.type, n.senderUid, n.payload);

    const coverSrc = n.coverUrl;
    const mediaSrc = n.mediaUrl;
    const isVideo = (coverSrc && (coverSrc.includes('.mp4') || coverSrc.includes('.mov') || coverSrc.includes('.webm'))) || 
                    (mediaSrc && (mediaSrc.includes('.mp4') || mediaSrc.includes('.mov') || mediaSrc.includes('.webm') || mediaSrc.includes('.mkv')));
    
    let contentTypeLabel = "Post ";
    if (n.type === 'like_story') {
        contentTypeLabel = "Story ";
    } else if (isVideo) {
        contentTypeLabel = "Reel ";
    }

    let mainDescription = n.text;
    if (mainDescription && mainDescription.includes("content")) {
        mainDescription = mainDescription.replace("content", contentTypeLabel);
    }

    let commentTextSnippetHTML = "";
    let typeBadgeHTML = "";

    if (n.type === 'like') {
        typeBadgeHTML = `<span style="background: #fee2e2; color: #ef4444; padding: 4px 10px; border-radius: 12px; font-size: 0.7rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; border: 1px solid #fecaca;"><i class="fa-solid fa-heart"></i> Reel Liked</span>`;
    } else if (n.type === 'comment') {
        mainDescription = `commented on your ${contentTypeLabel}`;
        typeBadgeHTML = `<span style="background: #f3e8ff; color: #a855f7; padding: 4px 10px; border-radius: 12px; font-size: 0.7rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; border: 1px solid #e9d5ff;"><i class="fa-solid fa-comment"></i> Commented</span>`;
        commentTextSnippetHTML = `<div style="background: #f8fafc; border-left: 3.5px solid #a855f7; padding: 10px 14px; border-radius: 12px; margin-top: 10px; font-size: 0.8rem; color: #475569; font-style: italic; font-weight: 600; line-height: 1.4; border: 1px solid #e2e8f0; overflow-wrap: break-word;">"${n.text}"</div>`;
    } else if (n.type === 'like_comment') {
        mainDescription = `liked your comment on your ${contentTypeLabel}`;
        typeBadgeHTML = `<span style="background: #fce7f3; color: #db2777; padding: 4px 10px; border-radius: 12px; font-size: 0.7rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; border: 1px solid #fbcfe8;"><i class="fa-solid fa-heart-circle-check"></i> Comment Liked</span>`;
        commentTextSnippetHTML = `<div style="background: #f8fafc; border-left: 3.5px solid #db2777; padding: 10px 14px; border-radius: 12px; margin-top: 10px; font-size: 0.8rem; color: #475569; font-style: italic; font-weight: 600; line-height: 1.4; border: 1px solid #e2e8f0; overflow-wrap: break-word;">"${n.text}"</div>`;
    } else if (n.type === 'like_story') {
        mainDescription = `liked your story`;
        typeBadgeHTML = `<span style="background: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 12px; font-size: 0.7rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; border: 1px solid #bae6fd;"><i class="fa-solid fa-circle-play"></i> Story Liked</span>`;
    } else if (n.type === 'follow') {
        typeBadgeHTML = `<span style="background: #dbeafe; color: #2563eb; padding: 4px 10px; border-radius: 12px; font-size: 0.7rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; border: 1px solid #bfdbfe;"><i class="fa-solid fa-user-plus"></i> New Follow</span>`;
    }

    let mediaThumbnailHTML = "";
    if (n.type === 'like' || n.type === 'comment' || n.type === 'like_comment' || n.type === 'like_story') {
        const isCoverVideo = coverSrc && (coverSrc.includes('.mp4') || coverSrc.includes('.mov') || coverSrc.includes('.webm'));
        
        // --- CLEAN DESIGN FIXED (No more 3D card borders with rainbow gradients) ---
        if (coverSrc && !isCoverVideo) {
            mediaThumbnailHTML = `
            <div style="width: 52px; height: 52px; background: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 2px 6px rgba(0,0,0,0.05); display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;" onclick="${clickAction}">
                <img src="${coverSrc}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;" decoding="async" loading="lazy">
            </div>`;
        } else {
            const videoUrl = isCoverVideo ? coverSrc : mediaSrc;
            const isVideoFile = videoUrl && (videoUrl.includes('.mp4') || videoUrl.includes('.mov') || videoUrl.includes('.webm') || videoUrl.includes('.mkv'));
            
            if (isVideoFile) {
                mediaThumbnailHTML = `
                <div style="width: 52px; height: 52px; background: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 2px 6px rgba(0,0,0,0.05); display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;" onclick="${clickAction}">
                    <div style="position: relative; width: 100%; height: 100%; border-radius: 8px; overflow: hidden;">
                        <video src="${videoUrl}#t=1" style="width: 100%; height: 100%; object-fit: cover;" muted playsinline></video>
                        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.5); width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.5rem;">
                            <i class="fa-solid fa-play"></i>
                        </div>
                    </div>
                </div>`;
            } else if (mediaSrc) {
                mediaThumbnailHTML = `
                <div style="width: 52px; height: 52px; background: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 2px 6px rgba(0,0,0,0.05); display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;" onclick="${clickAction}">
                    <img src="${mediaSrc}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;" decoding="async" loading="lazy">
                </div>`;
            } else {
                mediaThumbnailHTML = `
                <div id="notif-media-${n.id}" style="width: 52px; height: 52px; background: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 2px 6px rgba(0,0,0,0.05); display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;" onclick="${clickAction}">
                     <div class="skeleton" style="width: 100%; height: 100%; border-radius: 8px;"></div>
                </div>`;
            }
        }
    }

    const isNewItem = !animatedNotifIds.has(n.id);
    if (isNewItem) {
        animatedNotifIds.add(n.id);
    }
    const animationClass = isNewItem ? "notif-item-pop" : "";
    const inlineAnimStyle = isNewItem ? `animation-delay: ${animationDelay}ms;` : "";

    const card = document.createElement('div');
    card.id = `notif-${n.id}`;
    card.className = `notif-item-full ${animationClass}`;
    card.style.cssText = `display: flex; flex-direction: column; padding: 15px; background: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; margin-bottom: 8px; transition: 0.3s; box-shadow: 0 10px 25px rgba(0,0,0,0.05); will-change: transform, opacity; ${inlineAnimStyle}`;
    
    card.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 15px;">
            <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                <img class="sender-avatar-img" src="${n.fromPhoto}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary);" onclick="${clickAction}" decoding="async" loading="lazy">
                <div style="flex: 1;" onclick="${clickAction}">
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <span class="sender-name-text" style="font-weight: 800; color: #000; font-size: 0.95rem;">${n.fromName}</span>
                        <span class="sender-badge-container"></span>
                    </div>
                    <div style="color: #475569; font-size: 0.85rem; font-weight: 600; line-height: 1.3;">${mainDescription}</div>
                    <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
                        <span style="color: var(--primary); font-size: 0.7rem; font-weight: 700;">${timeText}</span>
                        ${typeBadgeHTML}
                    </div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                ${mediaThumbnailHTML}
                <div style="padding: 10px; cursor: pointer;" onclick="window.smartDeleteNotification('${n.id}')">
                    <i class="fa-solid fa-trash-can" style="color: #ff4757; font-size: 1.1rem;"></i>
                </div>
            </div>
            ${!n.read ? '<div class="unread-dot" style="width: 8px; height: 8px; background: var(--primary); border-radius: 50%; margin-left: 5px;"></div>' : ''}
        </div>
        ${commentTextSnippetHTML}
        ${actionButtonsHTML}
    `;

    return card;
}

// ===================================================
// --- REAL-TIME NOTIFICATION LISTENERS (LAZY CODELOAD) ---
// ===================================================
window.startNotificationListener = async (notifLimit = 10, isScrollAppend = false) => {
    if(unsubscribeNotifs && !isScrollAppend) unsubscribeNotifs();
    
    const notifFullList = document.getElementById('notif-full-list');
    
    if(notifFullList && !isScrollAppend) {
        renderNotificationSkeletons(notifFullList, 6);
    }
    
    const q = query(collection(window.db, "users", window.currentUser.uid, "notifications"), orderBy("timestamp", "desc"), limit(notifLimit));
    
    unsubscribeNotifs = onSnapshot(q, async (snapshot) => {
        const badgeHeader = document.getElementById('header-notif-badge');
        
        let rawNotifs = [];
        let count = 0;
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;

        hasMoreNotifications = snapshot.docs.length >= notifLimit;

        for (const docSnap of snapshot.docs) {
            const n = docSnap.data();
            const nid = docSnap.id;
            const notifTime = n.timestamp?.toMillis ? n.timestamp.toMillis() : Date.now();

            if ((now - notifTime) > oneDayMs) {
                deleteDoc(doc(window.db, "users", window.currentUser.uid, "notifications", nid)); 
                continue; 
            }

            if (n.type !== 'message' && n.payload && n.type !== 'follow') {
                const collectionName = n.type === 'like_story' ? 'stories' : 'posts';
                const exists = await window.checkContentStillExists(n.payload, collectionName);
                if (!exists) { 
                    deleteDoc(doc(window.db, "users", window.currentUser.uid, "notifications", nid)); 
                    continue; 
                }
            }

            if(n.type !== 'message') {
                if(!n.read) count++;
                rawNotifs.push({ id: nid, ...n });
            }
        }

        const aggregatedNotifs = aggregateNotifications(rawNotifs);

        if(notifFullList) {
            const oldLoader = document.getElementById('notif-load-more-indicator');
            if(oldLoader) oldLoader.remove();
            const oldEndNotice = document.getElementById('notif-end-notice');
            if(oldEndNotice) oldEndNotice.remove();

            if (!isScrollAppend && notifFullList.querySelector('.notif-skeleton-card')) {
                notifFullList.innerHTML = "";
            }

            let animationDelay = 0;
            let currentChild = notifFullList.firstElementChild;

            aggregatedNotifs.forEach((n) => {
                let existingCard = document.getElementById(`notif-${n.id}`);

                if (existingCard) {
                    if (existingCard !== currentChild) {
                        notifFullList.insertBefore(existingCard, currentChild);
                    } else {
                        currentChild = currentChild.nextElementSibling;
                    }
                    
                    if (n.read) {
                        const dot = existingCard.querySelector('.unread-dot');
                        if (dot) dot.remove();
                    }

                    if (!existingCard.dataset.subscribed) {
                        existingCard.dataset.subscribed = "true";
                        bindRealTimeSenderDetails(existingCard.id, n.senderUid, n.fromName, n.fromPhoto);
                    }
                } else {
                    const newCard = createNotificationCardElement(n, animationDelay);
                    notifFullList.insertBefore(newCard, currentChild);
                    animationDelay += 45;

                    if ((n.type === 'like' || n.type === 'comment' || n.type === 'like_comment' || n.type === 'like_story') && !n.coverUrl && !n.mediaUrl) {
                        window.loadNotificationMediaPreview(n.id, n.payload, n.type);
                    }

                    if (!newCard.dataset.subscribed) {
                        newCard.dataset.subscribed = "true";
                        bindRealTimeSenderDetails(newCard.id, n.senderUid, n.fromName, n.fromPhoto);
                    }
                }
            });

            while (currentChild) {
                const next = currentChild.nextElementSibling;
                if (!currentChild.classList.contains('notif-scroll-top-btn')) {
                    currentChild.remove();
                }
                currentChild = next;
            }

            if (hasMoreNotifications) {
                const loadMoreIndicator = document.createElement('div');
                loadMoreIndicator.id = "notif-load-more-indicator";
                loadMoreIndicator.style.cssText = "text-align: center; padding: 15px; color: #64748b;";
                loadMoreIndicator.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.3rem; color: var(--primary);"></i>`;
                notifFullList.appendChild(loadMoreIndicator);
            } else if (aggregatedNotifs.length > 0) {
                const endNotice = document.createElement('div');
                endNotice.id = "notif-end-notice";
                endNotice.style.cssText = "text-align: center; padding: 25px 15px; color: #64748b; font-size: 0.85rem; font-weight: 700; border-top: 1px dashed #e2e8f0; margin-top: 15px;";
                endNotice.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #10b981; margin-right: 6px;"></i> You are all caught up! ✨`;
                notifFullList.appendChild(endNotice);
            }

            isNotifsLoadingMore = false;

            if (aggregatedNotifs.length === 0) {
                notifFullList.innerHTML = `
                <div style="text-align:center; padding:60px 20px; color:#aaa; animation: fadeIn 0.5s;">
                    <i class="fa-solid fa-bell-slash" style="font-size: 3.5rem; margin-bottom: 15px; opacity: 0.2;"></i><br>
                    <span style="font-weight: 600; font-size: 1.1rem; color: #333;">No notifications left.</span><br>
                    <small style="color: #888;">Your inbox is clean!</small>
                </div>`;
            }
        }

        if(badgeHeader) {
            if(count > 0) { 
                badgeHeader.innerText = count; 
                badgeHeader.style.display = 'flex'; 
                unreadNotifsCount = count; 
            } else { 
                badgeHeader.style.display = 'none'; 
                unreadNotifsCount = 0; 
            }
        }
    });
};

// ===================================================
// --- SMART PAGINATION, SCROLL LOADER & SCROLL-TO-TOP ---
// ===================================================
function setupNotifScrollLoader() {
    const modal = document.getElementById('notif-full-modal');
    if (!modal) return;

    let scrollTopBtn = document.getElementById('notif-scroll-top-btn');
    if (!scrollTopBtn) {
        scrollTopBtn = document.createElement('button');
        scrollTopBtn.id = 'notif-scroll-top-btn';
        scrollTopBtn.className = 'notif-scroll-top-btn';
        scrollTopBtn.innerHTML = `<i class="fa-solid fa-arrow-up-long"></i>`;
        
        document.body.appendChild(scrollTopBtn);
        
        scrollTopBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            modal.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    let isButtonVisible = false;
    let scrollAnimationFrameActive = false;

    modal.addEventListener('scroll', () => {
        if (!scrollAnimationFrameActive) {
            requestAnimationFrame(() => {
                const shouldBeVisible = modal.scrollTop > 250;
                if (shouldBeVisible !== isButtonVisible) {
                    isButtonVisible = shouldBeVisible;
                    if (isButtonVisible) {
                        scrollTopBtn.classList.add('visible');
                    } else {
                        scrollTopBtn.classList.remove('visible');
                    }
                }
                scrollAnimationFrameActive = false;
            });
            scrollAnimationFrameActive = true;
        }

        if (modal.scrollTop + modal.clientHeight >= modal.scrollHeight - 60) {
            if (!isNotifsLoadingMore && hasMoreNotifications) {
                isNotifsLoadingMore = true;
                currentNotifLimit += 50; 
                window.startNotificationListener(currentNotifLimit, true);
            }
        }
    }, { passive: true });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupNotifScrollLoader);
} else {
    setupNotifScrollLoader();
}

// ===================================================
// --- OFFLINE & ONLINE CRITICAL OPERATIONS ---
// ===================================================
window.smartDeleteNotification = async (nid) => {
    if (!navigator.onLine) {
        if (!offlineActionQueue.includes(nid)) {
            offlineActionQueue.push(nid);
            localStorage.setItem('offline_notif_actions', JSON.stringify(offlineActionQueue));
        }
        document.getElementById(`notif-${nid}`)?.remove();
        window.showToast("Offline Deleted", "इंटरनेट आने पर बदलाव सिंक हो जाएंगे", "", "warning");
        return;
    }
    await window.deleteSingleNotification(nid);
};

window.deleteSingleNotification = async (nid) => {
    if (!nid) return;
    const el = document.getElementById(`notif-${nid}`);
    if (navigator.vibrate) navigator.vibrate(40);

    if (el) {
        el.style.transition = "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
        el.style.transform = "translateX(100px)"; 
        el.style.opacity = "0"; 
    }

    try {
        await deleteDoc(doc(window.db, "users", window.currentUser.uid, "notifications", nid));
        setTimeout(() => { if (el) el.remove(); }, 400);
    } catch (e) {
        if (el) { el.style.transform = "translateX(0)"; el.style.opacity = "1"; }
    }
};

window.addEventListener('online', async () => {
    if (offlineActionQueue.length === 0) return;

    const batch = writeBatch(window.db);
    offlineActionQueue.forEach((nid) => {
        const docRef = doc(window.db, "users", window.currentUser.uid, "notifications", nid);
        batch.delete(docRef);
    });

    try {
        await batch.commit();
        offlineActionQueue = [];
        localStorage.removeItem('offline_notif_actions');
        window.showToast("Synced", "ऑफ़लाइन बदलाव सिंक हो चुके हैं", "", "success");
    } catch (e) {
        console.error("Offline sync failed:", e);
    }
});

// ===================================================
// --- AUTO-CLEANUP OPERATIONS (SMART TTL) ---
// ===================================================
async function autoCleanOldNotifications() {
    if (!window.currentUser) return;
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    try {
        const q = query(collection(window.db, "users", window.currentUser.uid, "notifications"), where("read", "==", true));
        const snapshot = await getDocs(q);
        const batch = writeBatch(window.db);
        let hasDeletions = false;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const notifTime = data.timestamp?.toMillis ? data.timestamp.toMillis() : 0;
            if (notifTime > 0 && (now - notifTime) > oneDayMs) {
                batch.delete(docSnap.ref);
                hasDeletions = true;
            }
        });

        if (hasDeletions) await batch.commit();
    } catch (e) {
        console.warn("Auto-cleanup skipped:", e.message);
    }
}

onAuthStateChanged(window.auth, (user) => {
    if (user) {
        setTimeout(autoCleanOldNotifications, 4000);
    }
});

// ===================================================
// --- 🌟 SMART TOAST NOTIFICATION ENGINE ---
// ===================================================
window.showToast = (title, body, img, type = 'default', actionCallback = null) => {
    toastRequestQueue.push({ title, body, img, type, actionCallback });
    processToastQueue();
};

function processToastQueue() {
    if (activeToastInstance || toastRequestQueue.length === 0) return;
    const nextToast = toastRequestQueue.shift();
    displaySmartToast(nextToast);
}

function displaySmartToast(toastData) {
    const toast = document.getElementById('notification-toast');
    if (!toast) return;

    activeToastInstance = toast;
    
    const imgEl = document.getElementById('notif-img');
    const titleEl = document.getElementById('notif-title');
    const bodyEl = document.getElementById('notif-body');

    if (imgEl) imgEl.src = toastData.img || "https://i.pravatar.cc/150";
    if (titleEl) titleEl.innerText = toastData.title || "Notification";
    if (bodyEl) bodyEl.innerText = toastData.body || "";

    toast.style.borderLeft = "4px solid var(--primary)";
    if (toastData.type === 'success') toast.style.borderLeft = "4px solid #00b894";
    if (toastData.type === 'error') toast.style.borderLeft = "4px solid #ff4757";
    if (toastData.type === 'warning') toast.style.borderLeft = "4px solid #ff9f43";

    if (toastData.actionCallback) {
        toast.style.cursor = "pointer";
        toast.onclick = (e) => {
            e.stopPropagation();
            toastData.actionCallback();
            dismissToast();
        };
    } else {
        toast.style.cursor = "default";
        toast.onclick = null;
    }

    let startX = 0;
    let currentX = 0;
    let isDragging = false;

    const onTouchStart = (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
        toast.style.transition = 'none';
    };

    const onTouchMove = (e) => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX - startX;
        toast.style.transform = `translate(calc(-50% + ${currentX}px), 0)`;
        toast.style.opacity = Math.max(0, 1 - Math.abs(currentX) / 150);
    };

    const onTouchEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        if (Math.abs(currentX) > 80) {
            toast.style.transition = 'transform 0.2s ease-out, opacity 0.2s';
            toast.style.transform = `translate(calc(-50% + ${currentX > 0 ? 300 : -300}px), 0)`;
            toast.style.opacity = '0';
            setTimeout(dismissToast, 200);
        } else {
            toast.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s';
            toast.style.transform = "translate(-50%, 0)";
            toast.style.opacity = "1";
        }
    };

    toast.addEventListener('touchstart', onTouchStart, { passive: true });
    toast.addEventListener('touchmove', onTouchMove, { passive: true });
    toast.addEventListener('touchend', onTouchEnd, { passive: true });

    const wordCount = (toastData.body || "").split(/\s+/).length;
    const baseTime = 2000; 
    const timePerWord = 300; 
    const duration = Math.min(6000, baseTime + (wordCount * timePerWord)); 

    toast.style.transition = "transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s";
    toast.style.transform = "translate(-50%, 0)";
    toast.style.opacity = "1";
    toast.style.pointerEvents = "auto";

    let autoDismissTimer = setTimeout(() => { dismissToast(); }, duration);

    function dismissToast() {
        clearTimeout(autoDismissTimer);
        toast.removeEventListener('touchstart', onTouchStart);
        toast.removeEventListener('touchmove', onTouchMove);
        toast.removeEventListener('touchend', onTouchEnd);

        toast.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s';
        toast.style.transform = "translate(-50%, -150%)";
        toast.style.opacity = "0";
        toast.style.pointerEvents = "none";

        setTimeout(() => {
            activeToastInstance = null;
            processToastQueue(); 
        }, 400);
    }
}

// ===================================================
// --- 🎯 SMART ACTION TOAST TRIGGER (Actionable on Tap) ---
// ===================================================
window.triggerNotificationToast = (notifData) => {
    const { type, fromName, fromPhoto, senderUid, text, payload } = notifData;
    if (shouldSuppressNotification(senderUid)) return;

    let tapAction = null;
    if (type === 'comment') {
        tapAction = () => { if (typeof window.openComments === 'function') window.openComments(payload); };
    } else if (type === 'like' || type === 'like_comment' || type === 'like_story') {
        tapAction = () => { if (typeof window.openSinglePostView === 'function') window.openSinglePostView(payload); };
    } else if (type === 'follow') {
        tapAction = () => {
            if (typeof window.viewUserProfile === 'function') {
                window.viewUserProfile(payload);
                window.switchTab('profile');
            }
        };
    } else if (type === 'message') {
        tapAction = () => { if (typeof window.startPrivateChat === 'function') window.startPrivateChat(senderUid, fromName, fromPhoto); };
    }

    window.showToast(fromName, text, fromPhoto, 'default', tapAction);
};
