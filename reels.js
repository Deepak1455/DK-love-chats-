// ==========================================
// REELS.JS - Reels Logic & UI Handling (SILENT VIEWS TRACKING & SMART OVERLAY CONTROL)
// ==========================================

// --- Global State Variables for Reels ---
window.isFirstReelsLoad = true;
window.reelObserver = null;
window.forceTopReelId = null;
window.currentVisibleReelId = null;
let unsubscribeReels = null;

// रियल-टाइम रील हेडर लिसनर्स को ट्रैक करने के लिए मैप
window.activeReelHeaderListeners = window.activeReelHeaderListeners || new Map();

// सेशन के दौरान पहले से देखे जा चुके रील्स को ट्रैक करने के लिए सेट (Set)
if (!window.viewedReelsSession) {
    window.viewedReelsSession = new Set();
}

/**
 * सभी चल रहे रील्स वीडियो को एक साथ पॉज करने का ग्लोबल फ़ंक्शन
 */
window.pauseAllReels = () => {
    document.querySelectorAll('.reel-video').forEach(video => {
        video.pause();
    });
};

/**
 * वर्तमान में स्क्रीन पर सक्रिय रील को पुनः चालू (Play) करने का ग्लोबल फ़ंक्शन
 */
window.resumeActiveReel = () => {
    const activeTab = document.getElementById('reels-view');
    // सुनिश्चित करें कि यूजर वर्तमान में रील्स टैब पर ही है
    if (activeTab && !activeTab.classList.contains('active-view')) return;

    if (window.currentVisibleReelId) {
        const activeReelEl = document.getElementById(`reel-${window.currentVisibleReelId}`) || document.getElementById(`sv-item-${window.currentVisibleReelId}`);
        if (activeReelEl) {
            const video = activeReelEl.querySelector('.reel-video');
            if (video && video.paused) {
                video.play().catch(() => {});
            }
        }
    }
};

/**
 * 🌟 रील्स से सीधे सर्च स्क्रीन पर नेविगेट करने का हाई-स्पीड फ़ंक्शन
 */
window.searchHashtagFromReels = (tag) => {
    // 1. वीडियो को तुरंत पॉज करें
    window.pauseAllReels();
    
    // 2. वाइब्रेशन फ़ीडबैक
    if (navigator.vibrate) navigator.vibrate(15);
    
    // 3. ग्लोबल सर्च स्क्रीन खोलें (स्लाइड एनीमेशन के साथ)
    if (typeof window.openGlobalSearch === 'function') {
        window.openGlobalSearch();
    } else {
        const searchModal = document.getElementById('global-search-modal');
        if (searchModal) {
            searchModal.classList.remove('hidden');
            setTimeout(() => { searchModal.style.transform = 'translateY(0)'; }, 10);
        }
    }
    
    // 4. सर्च इनपुट भरें और एनीमेशन के साथ रीयल-टाइम परिणाम लोड करें
    setTimeout(() => {
        const searchInput = document.getElementById('global-search-input');
        if (searchInput) {
            searchInput.value = `#${tag}`;
            window.activeSearchTab = 'foryou'; // फ़ॉर यू टैब को एक्टिव करें
            if (typeof window.updateSearchTabsUI === 'function') window.updateSearchTabsUI();
            if (typeof window.handleGlobalSearch === 'function') window.handleGlobalSearch();
        }
    }, 320); // सर्च स्क्रीन के स्लाइड-अप एनीमेशन (300ms) के साथ सिंक किया गया है
};

/**
 * 🌟 हैशटैग्स को नीले रंग में बदलने और रील्स-सर्च चैनल से जोड़ने वाला फ़ंक्शन
 */
function highlightReelHashtags(text) {
    if (!text) return "";
    return text.replace(/#([\p{L}\p{N}_]+)/gu, (match, tag) => {
        return `<span class="reel-hashtag-link" style="color: #0095f6 !important; font-weight: 700; cursor: pointer; text-shadow: 0 1px 2px rgba(0,0,0,0.3); transition: opacity 0.15s;" onclick="event.stopPropagation(); window.searchHashtagFromReels('${tag}')">${match}</span>`;
    });
}

/**
 * ब्राउज़र टैब चेंज या ऐप मिनिमाइज़ होने पर वीडियो कंट्रोल
 */
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        window.pauseAllReels();
    } else {
        window.resumeActiveReel();
    }
});

/**
 * 🌟 स्मार्ट मोडल इंटरसेप्टर:
 * जब भी कोई मोडल स्क्रीन पर खुलेगा, बैकग्राउंड रील स्वतः रुक जाएगी।
 */
if (typeof window.toggleModal === 'function') {
    const originalToggleModal = window.toggleModal;
    window.toggleModal = (id, show) => {
        originalToggleModal(id, show);
        if (show) {
            window.pauseAllReels();
        } else {
            setTimeout(window.resumeActiveReel, 150);
        }
    };
}

// कमेंट मोडल ओपन होने पर सिंक
if (typeof window.openComments === 'function') {
    const originalOpenComments = window.openComments;
    window.openComments = (id) => {
        originalOpenComments(id);
        window.pauseAllReels();
    };
}

/**
 * रील्स को रीफ्रेश करने का फंक्शन (सभी रीयल-टाइम लिसनर्स की सफाई के साथ)
 */
window.refreshReels = () => {
    if (unsubscribeReels) { 
        unsubscribeReels(); 
        unsubscribeReels = null; 
    }
    
    // सभी एक्टिव रीयल-टाइम हेडर लिसनर्स को साफ करें
    if (window.activeReelHeaderListeners) {
        window.activeReelHeaderListeners.forEach((unsub) => unsub());
        window.activeReelHeaderListeners.clear();
    }

    window.isFirstReelsLoad = true;
    if (typeof window.loadReels === 'function') window.loadReels();
};

/**
 * रील के यूज़र डेटा (Avatar, Username @, Verified Tick) को रियल-टाइम सिंक करने का फ़ंक्शन
 */
window.bindRealtimeReelHeader = (reelId, userId) => {
    if (window.activeReelHeaderListeners.has(reelId)) {
        window.activeReelHeaderListeners.get(reelId)();
    }

    const userDocRef = window.doc(window.db, "users", userId);
    
    const unsubscribe = window.onSnapshot(userDocRef, (docSnap) => {
        if (!docSnap.exists()) return;
        const userData = docSnap.data();
        const item = document.getElementById(`reel-${reelId}`);
        if (!item) return;

        // 1. प्रोफाइल फोटो (Avatar) का रियल-टाइम अपडेट
        const avatarImg = item.querySelector(`.reel-avatar`);
        if (avatarImg) {
            const freshPhoto = userData.avatarBase64 || userData.photoURL || 'https://i.pravatar.cc/150';
            if (avatarImg.src !== freshPhoto) {
                avatarImg.src = freshPhoto;
            }
        }

        // 2. नाम के बजाय यूज़रनेम (Username @) और रोज़ गोल्ड वेरिफिकेशन बैच का रियल-टाइम अपडेट
        const nameSpan = item.querySelector(`.reel-user-name`);
        if (nameSpan) {
            const freshUsername = userData.username || userData.name || 'user';
            const badgeHtml = userData.isVerified === true && typeof window.getVerifiedBadgeHTML === 'function'
                ? window.getVerifiedBadgeHTML(true, 16) // रील्स हेडर के लिए 16px आकार
                : '';
            
            nameSpan.innerHTML = `@${freshUsername}${badgeHtml}`;
        }
    });

    window.activeReelHeaderListeners.set(reelId, unsubscribe);
};

/**
 * डेटाबेस (Firestore) से रील्स लोड करने का मुख्य फंक्शन
 */
window.loadReels = async () => {
    const container = document.getElementById('reels-container');
    if (!container) return;

    const q = window.query(
        window.collection(window.db, "posts"), 
        window.where("mediaType", "==", "video"), 
        window.orderBy("timestamp", "desc"), 
        window.limit(40)
    );
    
    unsubscribeReels = window.onSnapshot(q, async (snapshot) => {
        let reelsArray = [];
        snapshot.forEach(doc => { 
            reelsArray.push({ id: doc.id, ...doc.data() }); 
        });

        if (window.forceTopReelId) {
            const targetIdx = reelsArray.findIndex(r => r.id === window.forceTopReelId);
            if (targetIdx !== -1) {
                const [targetReel] = reelsArray.splice(targetIdx, 1);
                reelsArray.unshift(targetReel);
            }
        } else {
            reelsArray.sort(() => Math.random() - 0.5);
        }

        // नए लोड से पहले पुराने रीयल-टाइम लिसनर्स साफ़ करें
        window.activeReelHeaderListeners.forEach((unsub) => unsub());
        window.activeReelHeaderListeners.clear();

        container.innerHTML = ''; 
        reelsArray.forEach(data => { 
            container.appendChild(createReelElement(data.id, data)); 
        });

        setTimeout(() => {
            if (typeof window.setupReelObserver === 'function') window.setupReelObserver();
            
            if (window.forceTopReelId) {
                const el = document.getElementById(`reel-${window.forceTopReelId}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'auto', block: 'center' });
                    window.forceTopReelId = null; 
                }
            }
        }, 300);
        window.isFirstReelsLoad = false;
    });
};

/**
 * बैकग्राउंड में रील का व्यू काउंट बढ़ाने का स्मार्ट फ़ंक्शन (Silent Tracking)
 */
window.incrementReelView = async (reelId) => {
    if (!window.currentUser) return;
    
    if (window.viewedReelsSession.has(reelId)) return;
    window.viewedReelsSession.add(reelId);

    try {
        const postRef = window.doc(window.db, "posts", reelId);
        
        if (typeof window.arrayUnion === 'function') {
            await window.updateDoc(postRef, {
                views: window.arrayUnion(window.currentUser.uid)
            });
        } else if (typeof window.increment === 'function') {
            await window.updateDoc(postRef, {
                views: window.increment(1)
            });
        }
    } catch (err) {
        console.error("Error updating views silently:", err);
    }
};

/**
 * सिंगल रील का HTML स्ट्रक्चर बनाने का फंक्शन
 */
function createReelElement(id, data) {
    const isLiked = data.likes?.includes(window.currentUser?.uid);
    const likeCount = data.likes?.length || 0;
    const commentCount = data.commentCount || 0;
    const shareCount = data.shareCount || 0;

    const isMe = data.userId === window.currentUser?.uid;
    const isFollowing = window.currentUserData?.following?.includes(data.userId);
    
    let followBtnHtml = isMe ? "" : `<span class="reel-follow-btn follow-btn-${data.userId} ${isFollowing ? 'following' : ''}" onclick="window.handleFollowFromReels('${data.userId}', event)">${isFollowing ? 'Following' : 'Follow'}</span>`;

    let videoUrl = data.mediaUrl;
    if (videoUrl.includes('cloudinary.com')) {
        videoUrl = videoUrl.replace('/upload/', '/upload/q_auto:eco,f_auto/');
    }

    const posterUrl = data.coverUrl || videoUrl.replace(/\.[^/.]+$/, ".jpg");

    const liveUserData = window.allCachedUsers?.find(u => u.uid === data.userId);
    const initialUsername = liveUserData?.username || data.username || 'user';
    const isVerified = liveUserData?.isVerified === true;
    
    const initialBadgeHtml = isVerified && typeof window.getVerifiedBadgeHTML === 'function'
        ? window.getVerifiedBadgeHTML(true, 16)
        : '';

    // 🌟 रीयल-टाइम में ब्लू हैशटैग्स और रिडायरेक्शन रेंडर करें
    const formattedCaption = highlightReelHashtags(data.caption || "");

    const div = document.createElement('div'); 
    div.className = 'reel-item'; 
    div.id = `reel-${id}`;

    div.innerHTML = `
        <video data-original-src="${videoUrl}" src="" poster="${posterUrl}" class="reel-video" loop playsinline preload="none"></video>
        <div class="reel-overlay-ui" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 100; display: flex; align-items: center; justify-content: center;">
            <div class="reel-loading-spinner" style="display: none;"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
            <div class="reel-status-icon"></div>
        </div>
        <div class="reel-info-gradient"></div> 
        <div class="reel-info" style="z-index: 10;">
            <div class="reel-user">
                <img src="${data.userPhoto || 'https://i.pravatar.cc/150'}" class="reel-avatar" onclick="if(typeof window.viewUserProfile === 'function') window.viewUserProfile('${data.userId}')" loading="lazy" style="cursor: pointer;">
                <div class="reel-user-detail">
                    <!-- 🌟 यूज़रनेम पर क्लिक करने पर सीधे यूज़र प्रोफाइल खुलने का इवेंट बाइंड किया गया है -->
                    <span class="reel-user-name" onclick="if(typeof window.viewUserProfile === 'function') window.viewUserProfile('${data.userId}')" style="display: inline-flex; align-items: center; gap: 4px; cursor: pointer; font-weight: 800; text-shadow: 0 1px 3px rgba(0,0,0,0.5);">@${initialUsername}${initialBadgeHtml}</span>${followBtnHtml}
                </div>
            </div>
            <div class="reel-caption" style="text-shadow: 0 1px 2px rgba(0,0,0,0.4);">${formattedCaption}</div>
        </div>
        <div class="reel-actions" style="z-index: 10;">
            <div class="reel-action-btn ${isLiked ? 'liked' : ''}" id="reel-like-btn-${id}" onclick="window.handleReelLike('${id}', '${data.userId}', this, '${posterUrl}')">
                <i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart"></i><span class="reel-action-text">${likeCount}</span>
            </div>
            <div class="reel-action-btn" onclick="window.openComments('${id}')">
                <i class="fa-solid fa-comment-dots"></i><span id="reel-comment-count-${id}">${commentCount}</span>
            </div>
            <div class="reel-action-btn" onclick="window.openShareModal('${id}', 'reel', { url: '${videoUrl}', type: 'video', ownerId: '${data.userId}', ownerName: '${initialUsername.replace(/'/g, "\\'")}', ownerPhoto: '${(data.userPhoto || "https://i.pravatar.cc/150").replace(/'/g, "\\'")}' })">
                <i class="fa-solid fa-paper-plane"></i><span id="reel-share-count-${id}">${shareCount}</span>
            </div>
        </div>
    `;

    // एलिमेंट रेंडर होने के तुरंत बाद रीयल-टाइम अपडेट इंजन बाइंड करें
    setTimeout(() => {
        window.bindRealtimeReelHeader(id, data.userId);
    }, 50);

    const video = div.querySelector('.reel-video');
    const statusIcon = div.querySelector('.reel-status-icon');
    const loadingSpinner = div.querySelector('.reel-loading-spinner');
    let lastTapTime = 0, clickTimeout = null;

    video.onwaiting = () => { loadingSpinner.style.display = 'block'; }; 
    video.onplaying = () => { loadingSpinner.style.display = 'none'; };

    const showStatusPop = (iconName) => {
        statusIcon.innerHTML = `<i class="fa-solid ${iconName}"></i>`; 
        statusIcon.classList.remove('status-pop');
        void statusIcon.offsetWidth; 
        statusIcon.classList.add('status-pop');
    };

    div.addEventListener('pointerup', (e) => {
        if(e.target.closest('.reel-follow-btn') || e.target.closest('.reel-action-btn') || e.target.closest('.reel-avatar') || e.target.closest('.reel-user-name') || e.target.closest('.reel-caption span')) return;
        const currentTime = Date.now(), tapInterval = currentTime - lastTapTime;

        if (tapInterval < 300 && tapInterval > 0) {
            if (clickTimeout) { clearTimeout(clickTimeout); clickTimeout = null; }
            window.triggerReelDoubleTap(id, data.userId, div, posterUrl);
        } else {
            clickTimeout = setTimeout(() => {
                if (video.paused) { 
                    video.play().catch(()=>{}); 
                    showStatusPop('fa-play'); 
                } else { 
                    video.pause(); 
                    showStatusPop('fa-pause'); 
                }
                clickTimeout = null;
            }, 250); 
        }
        lastTapTime = currentTime;
    });

    return div;
}

/**
 * रील पर डबल टैप करने पर उड़ने वाले दिलों का एनीमेशन
 */
window.triggerReelDoubleTap = (pid, ownerId, container, coverUrl = "") => {
    const overlay = container.querySelector('.reel-overlay-ui');
    const likeBtn = container.querySelector(`[id^="reel-like-btn-"]`);
    const isAlreadyLiked = likeBtn.classList.contains('liked');

    if (navigator.vibrate) navigator.vibrate([40, 30]);
    if (typeof window.playSendSound === 'function') window.playSendSound();

    const bigHeart = document.createElement('i'); 
    bigHeart.className = 'fa-solid fa-heart big-heart-burst'; 
    overlay.appendChild(bigHeart);
    bigHeart.animate([
        { transform: 'scale(0) rotate(-15deg)', opacity: 0 }, 
        { transform: 'scale(1.5) rotate(0deg)', opacity: 1, offset: 0.5 }, 
        { transform: 'scale(2) rotate(15deg)', opacity: 0 }
    ], { duration: 800, easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)', fill: 'forwards' });

    const heartColors = ['#ff006e', '#ff85a1', '#8338ec', '#ffbe0b', '#fb5607', '#ff0054'];
    for (let i = 0; i < 15; i++) {
        const miniHeart = document.createElement('i'); 
        miniHeart.className = 'fa-solid fa-heart flying-mini-heart';
        const size = Math.random() * 1.5 + 1;
        const color = heartColors[Math.floor(Math.random() * heartColors.length)];
        const startX = (Math.random() - 0.5) * 100;
        
        miniHeart.style.fontSize = `${size}rem`; 
        miniHeart.style.color = color; 
        miniHeart.style.left = `calc(50% + ${startX}px)`; 
        miniHeart.style.top = `60%`; 
        overlay.appendChild(miniHeart);

        const destX = (Math.random() - 0.5) * 400;
        const destY = - (Math.random() * 500 + 200);
        const rotation = Math.random() * 360;
        
        miniHeart.animate([
            { transform: 'translate(0, 0) scale(0) rotate(0deg)', opacity: 0 }, 
            { transform: `translate(${destX / 2}px, ${destY / 2}px) scale(1.2) rotate(${rotation / 2}deg)`, opacity: 1, offset: 0.3 }, 
            { transform: `translate(${destX}px, ${destY}px) scale(0.5) rotate(${rotation}deg)`, opacity: 0 }
        ], { duration: 1000 + Math.random() * 1000, easing: 'cubic-bezier(0.1, 0.8, 0.3, 1)', fill: 'forwards' });
        
        setTimeout(() => miniHeart.remove(), 2000);
    }

    if (!isAlreadyLiked && typeof window.handleReelLike === 'function') {
        window.handleReelLike(pid, ownerId, likeBtn, coverUrl);
    }
    setTimeout(() => bigHeart.remove(), 800);
};

/**
 * रील से सीधे फॉलो करने का फंक्शन
 */
window.handleFollowFromReels = async (targetUid, event) => {
    event.stopPropagation(); 
    if(navigator.vibrate) navigator.vibrate(40);
    if (typeof window.handleFollow === 'function') {
        await window.handleFollow(targetUid, event);
    }
};

/**
 * Intersection Observer (साइलेंट व्यू ट्रैकिंग एक्टिव)
 */
window.setupReelObserver = (targetContainerId = 'reels-container') => {
    if (window.reelObserver) window.reelObserver.disconnect();
    
    const container = document.getElementById(targetContainerId); 
    if (!container) return; 

    window.reelObserver = new IntersectionObserver((entries) => {
        entries.forEach(async (entry) => {
            const video = entry.target.querySelector('video'); 
            if (!video) return;
            const reelId = entry.target.id.replace('reel-', '').replace('sv-item-', ''); 

            if (entry.isIntersecting) {
                window.currentVisibleReelId = reelId;
                
                if (typeof window.incrementReelView === 'function') {
                    window.incrementReelView(reelId);
                }

                if (!video.src || video.src === "" || video.src !== video.getAttribute('data-original-src')) { 
                    video.src = video.getAttribute('data-original-src'); 
                    video.load(); 
                }
                try { 
                    const playPromise = video.play(); 
                    if (playPromise !== undefined) await playPromise; 
                } catch (err) { 
                    video.muted = true; 
                    video.play().catch(e => {}); 
                }
            } else {
                video.pause();
                const rect = entry.boundingClientRect;
                const distance = Math.abs(rect.top);
                if (distance > window.innerHeight * 2) { 
                    video.removeAttribute('src'); 
                    video.load(); 
                }
            }
        });
    }, { root: container, threshold: 0.7 }); 

    container.querySelectorAll('.reel-item').forEach(reel => window.reelObserver.observe(reel));
};

window.createReelElement = createReelElement;

/**
 * स्मूथ स्क्रोलिंग के लिए प्रीलोड
 */
function preloadNeighborReels(currentReel) {
    [currentReel.nextElementSibling, currentReel.previousElementSibling].forEach(neighbor => {
        if (neighbor) {
            const navVid = neighbor.querySelector('video');
            if (navVid && (!navVid.src || navVid.src === "")) { 
                navVid.src = navVid.getAttribute('data-original-src'); 
                navVid.preload = "auto"; 
            }
        }
    });
}

/**
 * रील को लाइक / अनलाइक करने का लॉजिक (Database Update)
 */
window.reelLikeLock = window.reelLikeLock || new Set();

window.handleReelLike = async (pid, ownerId, btnElement, coverUrl = "") => {
    if (window.reelLikeLock.has(pid)) return;
    window.reelLikeLock.add(pid);

    const isCurrentlyLiked = btnElement.classList.contains('liked');
    const textSpan = btnElement.querySelector('.reel-action-text');
    const icon = btnElement.querySelector('i');
    
    const originalCount = parseInt(textSpan.innerText) || 0;

    if (navigator.vibrate) navigator.vibrate(25);

    if (isCurrentlyLiked) {
        btnElement.classList.remove('liked'); 
        icon.className = 'fa-regular fa-heart'; 
        textSpan.innerText = Math.max(0, originalCount - 1);
    } else {
        btnElement.classList.add('liked'); 
        icon.className = 'fa-solid fa-heart'; 
        textSpan.innerText = originalCount + 1;
        
        if (typeof window.playSendSound === 'function') window.playSendSound(); 
        
        if (typeof window.triggerMicroConfetti === 'function') {
            window.triggerMicroConfetti(btnElement);
        } else {
            const heart = document.createElement('i'); 
            heart.classList.add('fa-solid', 'fa-heart', 'heart-pop'); 
            const reelItem = btnElement.closest('.reel-item');
            if (reelItem) {
                reelItem.appendChild(heart); 
                setTimeout(() => heart.remove(), 1000);
            }
        }
    }

    const postRef = window.doc(window.db, "posts", pid);
    
    try {
        if (isCurrentlyLiked) {
            await window.updateDoc(postRef, { likes: window.arrayRemove(window.currentUser.uid) });
        } else { 
            await window.updateDoc(postRef, { likes: window.arrayUnion(window.currentUser.uid) }); 
            
            if (ownerId !== window.currentUser.uid && typeof window.sendNotification === 'function') {
                await window.sendNotification(ownerId, 'like', 'liked your reel', pid, "", coverUrl); 
            }
        }
    } catch(e) {
        console.error("Reel Like Error, rolling back UI changes:", e);
        
        if (isCurrentlyLiked) {
            btnElement.classList.add('liked');
            icon.className = 'fa-solid fa-heart';
            textSpan.innerText = originalCount;
        } else {
            btnElement.classList.remove('liked');
            icon.className = 'fa-regular fa-heart';
            textSpan.innerText = originalCount;
        }
        
        if (typeof window.showToast === 'function') {
            window.showToast("Connection Error", "Failed to register like. Try again.", "", "error");
        }
    } finally {
        window.reelLikeLock.delete(pid);
    }
};

window.shareReelToStory = window.handleShareReelToStory;
