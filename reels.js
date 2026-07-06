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
        
        <!-- ⚡ स्मार्ट और इंटरैक्टिव प्रोग्रेस बार कंटेनर (टच करने के लिए 14px का चौड़ा क्षेत्र, पर दृश्यमान बार केवल 3px का रहेगा) -->
        <div class="reel-progress-container" style="
            position: absolute; 
            bottom: 75px; 
            left: 0; 
            width: 100%; 
            height: 14px; 
            background: transparent; 
            z-index: 15; 
            cursor: pointer;
            display: flex;
            align-items: flex-end;
            pointer-events: auto; /* टच/क्लिक सक्षम करें */
        ">
            <!-- वास्तविक दृश्यमान ट्रैक -->
            <div class="reel-progress-track" style="width: 100%; height: 3px; background: rgba(255, 255, 255, 0.15);">
                <div class="reel-progress-bar" style="height: 100%; width: 0%; background: #ff006e; transition: width 0.1s linear; box-shadow: 0 0 8px #ff006e;"></div>
            </div>
        </div>

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

            <!-- 🌟 कार्ड-बोर्ड कैप्शन कंटेनर (वर्टिकल स्क्रॉल सक्षम) -->
            <div class="reel-caption" style="
                background: rgba(20, 20, 20, 0.6); 
                backdrop-filter: blur(8px); 
                -webkit-backdrop-filter: blur(8px); 
                border: 1px solid rgba(255, 255, 255, 0.12); 
                border-radius: 12px; 
                padding: 10px 14px; 
                margin-top: 8px; 
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3); 
                text-shadow: 0 1px 2px rgba(0,0,0,0.4); 
                max-width: 90%; 
                max-height: 110px;                  
                overflow-y: auto;                   
                scrollbar-width: none;              
                -webkit-overflow-scrolling: touch;   
                word-break: break-word;
                font-size: 0.95rem;
                line-height: 1.4;
            ">
                ${formattedCaption}
            </div>
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
            
            <!-- ⚡ नया "Modes Options" बटन जो कैप्शन एट्रिब्यूट को सुरक्षित रखता है -->
            <div class="reel-action-btn" data-caption="${(data.caption || '').replace(/"/g, '&quot;')}" onclick="window.openReelModesModal('${id}', this)">
                <i class="fa-solid fa-sliders"></i><span class="reel-action-text" style="font-size: 10px;">Modes</span>
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
    const progressBar = div.querySelector('.reel-progress-bar'); // प्रोग्रेस बार एलिमेंट
    const progressContainer = div.querySelector('.reel-progress-container'); // प्रोग्रेस कंटेनर
    let lastTapTime = 0, clickTimeout = null;

    // ⚡ ऑटो-स्क्रॉल के सेव किए गए स्टेट को रेंडरिंग के समय लागू करें
    video.loop = !window.isAutoScrollEnabled;
    video.onended = () => {
        if (window.isAutoScrollEnabled) {
            const activeReel = document.getElementById(`reel-${id}`) || document.getElementById(`sv-item-${id}`);
            if (activeReel && activeReel.nextElementSibling) {
                activeReel.nextElementSibling.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    };

    video.onwaiting = () => { loadingSpinner.style.display = 'block'; }; 
    video.onplaying = () => { loadingSpinner.style.display = 'none'; };

    // ⚡ कंट्रोल/सीकिंग (Scrubbing) लॉजिक
    let isDragging = false;

    const handleSeek = (e) => {
        if (!video.duration) return;
        const rect = progressContainer.getBoundingClientRect();
        
        // माउस या टच कोऑर्डिनेट्स प्राप्त करें
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX);
        if (clientX === undefined) return;

        let offsetX = clientX - rect.left;
        offsetX = Math.max(0, Math.min(offsetX, rect.width)); // सीमा तय करें
        const percentage = offsetX / rect.width;

        // बिना लैग के त्वरित विज़ुअल फीडबैक के लिए विड्थ तुरंत सेट करें
        progressBar.style.width = `${percentage * 100}%`;
        
        // वीडियो के करंट टाइम को अपडेट करें
        video.currentTime = percentage * video.duration;
    };

    // पॉइंटर डाउन (टैप या क्लिक स्टार्ट)
    progressContainer.addEventListener('pointerdown', (e) => {
        isDragging = true;
        video.pause(); // सीक करते समय अस्थायी रूप से वीडियो को रोकें
        handleSeek(e);
        progressContainer.setPointerCapture(e.pointerId); // पॉइंटर को कैप्चर करें ताकि बाहर जाने पर भी ड्रैग काम करे
    });

    // पॉइंटर मूव (ड्रैगिंग चालू होने पर)
    progressContainer.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        handleSeek(e);
    });

    // पॉइंटर अप (टैप या ड्रैग समाप्त)
    progressContainer.addEventListener('pointerup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        progressContainer.releasePointerCapture(e.pointerId);
        video.play().catch(() => {}); // रिलीज़ करने के बाद वीडियो वापस चालू करें
    });

    // ⚡ प्रोग्रेस बार इवेंट्स: वीडियो टाइम के साथ सिंक करना
    video.ontimeupdate = () => {
        if (isDragging) return; // ड्रैग करते समय वीडियो टाइम द्वारा बार को ओवरराइड होने से रोकें
        if (!video.duration || video.paused) return;
        const percentage = (video.currentTime / video.duration) * 100;
        progressBar.style.width = `${percentage}%`;
    };

    video.onseeked = () => {
        if (video.currentTime === 0) {
            progressBar.style.width = '0%';
        }
    };

    const showStatusPop = (iconName) => {
        statusIcon.innerHTML = `<i class="fa-solid ${iconName}"></i>`; 
        statusIcon.classList.remove('status-pop');
        void statusIcon.offsetWidth; 
        statusIcon.classList.add('status-pop');
    };

    div.addEventListener('pointerup', (e) => {
        // ⚡ प्रोग्रेस कंटेनर पर क्लिक करने पर मुख्य प्ले/पॉज या लाइक ट्रिगर होने से रोकें
        if(e.target.closest('.reel-follow-btn') || e.target.closest('.reel-action-btn') || e.target.closest('.reel-avatar') || e.target.closest('.reel-user-name') || e.target.closest('.reel-caption span') || e.target.closest('.reel-caption') || e.target.closest('.reel-progress-container')) return;
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

// ⚡ 1. मिनी लाइक एक्सप्लोजन के लिए नया हेल्पर फ़ंक्शन (reels.js में कहीं भी नीचे जोड़ें)
function triggerMiniLikeExplosion(btnElement) {
    btnElement.style.position = 'relative'; // सुनिश्चित करें कि पैरेंट रिलेटिव हो
    const colors = ['#ff006e', '#ff85a1', '#8338ec', '#ffbe0b', '#0095f6'];
    const numParticles = 6; // निकलने वाले मिनी हार्ट्स की संख्या

    for (let i = 0; i < numParticles; i++) {
        const particle = document.createElement('i');
        particle.className = 'fa-solid fa-heart mini-like-particle';
        
        // चारों तरफ बिखराव के लिए कोण (angle) और दूरी (distance) कैलकुलेट करें
        const angle = (i * (360 / numParticles)) * (Math.PI / 180);
        const distance = Math.random() * 20 + 20; // 20px से 40px का दायरा
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;
        
        particle.style.setProperty('--tx', `${tx}px`);
        particle.style.setProperty('--ty', `${ty}px`);
        particle.style.color = colors[Math.floor(Math.random() * colors.length)];
        
        // आइकॉन के बिल्कुल सेंटर में रखें
        particle.style.left = '40%';
        particle.style.top = '30%';
        particle.style.animation = 'particle-explode 0.6s cubic-bezier(0.1, 0.8, 0.3, 1) forwards';
        
        btnElement.appendChild(particle);
        
        // एनीमेशन पूरा होने पर नोड को डिलीट करें
        setTimeout(() => particle.remove(), 600);
    }
}

// ⚡ 2. window.handleReelLike फ़ंक्शन के अंदर केवल "Like" वाले ब्लॉक को अपडेट करें:
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
        
        // 🌟 आइकॉन पॉप एनीमेशन ट्रिगर करें
        icon.classList.add('heart-pop-active');
        icon.addEventListener('animationend', () => {
            icon.classList.remove('heart-pop-active');
        }, { once: true });

        // 🌟 मिनी एक्सप्लोजन ट्रिगर करें
        triggerMiniLikeExplosion(btnElement);
        
        if (typeof window.playSendSound === 'function') window.playSendSound(); 
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
    } finally {
        window.reelLikeLock.delete(pid);
    }
};

// --- ⚡ REELS TOOLS & AUTO SCROLL ENGINE ---

// ⚡ सबसे ऊपर: लोकल स्टोरेज से ऑटो स्क्रॉल स्टेट लोड करें (यदि पहले कभी सेट नहीं किया, तो डिफ़ॉल्ट रूप से false रहेगा)
window.isAutoScrollEnabled = localStorage.getItem('isAutoScrollEnabled') === 'true';

/**
 * ऑटो-स्क्रॉल चालू/बंद करने का इंजन
 */
/**
 * ऑटो-स्क्रॉल चालू/बंद करने और स्टेट को परमानेंटली सेव करने का इंजन
 */
window.toggleAutoScroll = (enable) => {
    window.isAutoScrollEnabled = enable;
    
    // ⚡ सेटिंग को लोकल स्टोरेज में सेव करें
    try {
        localStorage.setItem('isAutoScrollEnabled', enable);
    } catch (e) {
        console.warn("Unable to save settings to localStorage:", e);
    }

    const allVideos = document.querySelectorAll('.reel-video');
    allVideos.forEach(video => {
        // यदि ऑटो-स्क्रॉल ऑन है, तो वीडियो लूपिंग बंद करें
        video.loop = !enable;
        
        if (enable) {
            video.onended = function() {
                if (window.isAutoScrollEnabled) {
                    const activeReel = this.closest('.reel-item');
                    if (activeReel && activeReel.nextElementSibling) {
                        activeReel.nextElementSibling.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            };
        } else {
            video.onended = null;
        }
    });

    if (navigator.vibrate) navigator.vibrate(15);
};

/**
 * फुल-स्क्रीन मोड पॉपअप खोलने का फ़ंक्शन
 */
window.openReelModesModal = (reelId, btnEl) => {
    // 1. वीडियो को थोड़ी देर के लिए बैकग्राउंड में रोकें
    window.pauseAllReels();

    const rawCaption = btnEl.getAttribute('data-caption') || '';
    
    // यदि पेज पर मोडल मौजूद नहीं है, तो उसे डायनामिक रूप से बनाएं
    let modal = document.getElementById('reel-modes-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'reel-modes-modal';
        modal.className = 'reel-modes-overlay';
        document.body.appendChild(modal);
    }

    // मोडल का फुल-स्क्रीन ग्लासमोर्फिक लेआउट
    modal.innerHTML = `
        <div class="reel-modes-content">
            <div class="reel-modes-header">
                <h3>Reels Toolbox</h3>
                <button class="reel-modes-close" onclick="window.closeReelModesModal()"><i class="fa-solid fa-xmark"></i></button>
            </div>
            
            <div class="reel-modes-body">
                <!-- 🚀 ऑटो स्क्रॉल विकल्प (Auto Scroll Switch) -->
                <div class="tool-row">
                    <div class="tool-info">
                        <i class="fa-solid fa-square-caret-down"></i>
                        <div>
                            <h4>Auto Scroll Mode</h4>
                            <p>वीडियो खत्म होते ही अगली रील पर खुद ले जाएं</p>
                        </div>
                    </div>
                    <label class="ios-switch">
                        <input type="checkbox" id="auto-scroll-toggle" ${window.isAutoScrollEnabled ? 'checked' : ''} onchange="window.toggleAutoScroll(this.checked)">
                        <span class="ios-slider"></span>
                    </label>
                </div>

                <hr class="tool-divider">

                <!-- 📝 कैप्शन कॉपी करने का कार्ड-बोर्ड -->
                <div class="tool-caption-card">
                    <div class="tool-caption-header">
                        <span><i class="fa-solid fa-hashtag"></i> Caption & Tags</span>
                        <button class="copy-btn" onclick="window.copyReelCaption(this, \`${rawCaption.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)">
                            <i class="fa-solid fa-clone"></i> Copy
                        </button>
                    </div>
                    <div class="tool-caption-text">
                        ${rawCaption ? rawCaption : '<span style="color: #666; font-style: italic;">No caption provided.</span>'}
                    </div>
                </div>
            </div>
        </div>
    `;

    // मोडल दिखाएं
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
};

/**
 * पॉपअप बंद करने का फ़ंक्शन
 */
/**
 * मोडल को स्मार्ट, स्मूथ और सुपर-फास्ट बंद करने का फ़ंक्शन
 */
window.closeReelModesModal = () => {
    const modal = document.getElementById('reel-modes-modal');
    if (modal) {
        // 1. एनीमेशन क्लास हटाएं (स्लाइड और स्केल डाउन शुरू होगा)
        modal.classList.remove('active');
        
        // 🚀 SMART UX TRICK: वीडियो को तुरंत प्ले करें ताकि एनीमेशन खत्म होने तक यह पहले से ही चल रहा हो!
        window.resumeActiveReel(); 
        
        // 2. 180ms (CSS ट्रांजिशन टाइम) के बाद डिस्प्ले को पूरी तरह ब्लॉक करें
        setTimeout(() => {
            modal.style.display = 'none';
        }, 180); 
    }
};


window.copyReelCaption = async (btn, text) => {
    if (!text) return;
    
    let success = false;
    
    // 1. सबसे पहले मॉडर्न Clipboard API आज़माएं (यह केवल HTTPS / localhost पर काम करता है)
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(text);
            success = true;
        } catch (err) {
            console.warn("Modern clipboard copy failed, switching to fallback...", err);
        }
    }

    // 2. यदि ऊपर वाला तरीका फेल या अनसपोर्टेड हो, तो HTTP Fallback आज़माएं (लोकल IP के लिए)
    if (!success) {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            
            // स्क्रीन लेआउट हिलने से बचाने के लिए CSS सेटिंग्स
            textArea.style.position = "fixed";
            textArea.style.top = "0";
            textArea.style.left = "0";
            textArea.style.opacity = "0";
            textArea.style.pointerEvents = "none";
            
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            // पुराना लेकिन भरोसेमंद कॉपी कमांड निष्पादित करें
            success = document.execCommand("copy");
            document.body.removeChild(textArea);
        } catch (err) {
            console.error("Fallback copy mechanism failed too:", err);
        }
    }

    // 3. कॉपी होने पर यूजर को विज़ुअल फीडबैक दें
    if (success) {
        if (navigator.vibrate) navigator.vibrate(30);
        
        const originalText = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
        btn.style.background = '#00f64c20';
        btn.style.color = '#00f64c';
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
            btn.style.color = '';
        }, 1500);
    } else {
        console.error("Unable to copy text in this environment.");
    }
};
window.shareReelToStory = window.handleShareReelToStory;
