// ==========================================
// --- HOME FEED STATE VARIABLES ---
// ==========================================
let lastVisiblePost = null;      
let isFetchingFeed = false;      
let feedEndReached = false;      
let loadedPostIds = new Set();   

if (!window.viewedPostsSession) {
    window.viewedPostsSession = new Set();
}

// रियल-टाइम हेडर लिसनर्स को ट्रैक करने के लिए मैप
window.activeHeaderListeners = window.activeHeaderListeners || new Map();

/**
 * पोस्ट कार्ड के यूजर डेटा (DP, Username, Online Status, Verified Badge) को रियल-टाइम सिंक करना
 */
window.bindRealtimeUserHeader = (pid, userId) => {
    // यदि इस पोस्ट के लिए पहले से कोई सक्रिय लिसनर है, तो उसे अनसब्सक्राइब करें
    if (window.activeHeaderListeners.has(pid)) {
        window.activeHeaderListeners.get(pid)();
    }

    const userDocRef = window.doc(window.db, "users", userId);
    
    // Firestore onSnapshot से वास्तविक समय में अपडेट्स प्राप्त करें
    const unsubscribe = window.onSnapshot(userDocRef, (docSnap) => {
        if (!docSnap.exists()) return;
        const userData = docSnap.data();
        const card = document.getElementById(`post-${pid}`);
        if (!card) return;

        // 1. प्रोफाइल फोटो (DP) का रियल-टाइम अपडेट
        const avatarImg = card.querySelector(`.feed-story-avatar`);
        if (avatarImg) {
            const freshPhoto = userData.avatarBase64 || userData.photoURL || 'https://i.pravatar.cc/150';
            if (avatarImg.src !== freshPhoto) {
                avatarImg.src = freshPhoto;
            }
        }

        // 🌟 2. नाम के बजाय यूज़रनेम (Username) और Rose Gold Verified Tick का रियल-टाइम अपडेट
        const freshUsername = userData.username || userData.name || 'user';
        
        // हेडर यूज़रनेम अपडेट
        const nameSpan = card.querySelector(`.post-username-span`);
        if (nameSpan) {
            const badgeHtml = userData.isVerified === true && typeof window.getVerifiedBadgeHTML === 'function'
                ? window.getVerifiedBadgeHTML(true, 16) // पोस्ट हेडर के लिए 16px का आकार
                : '';
            
            nameSpan.innerHTML = `${freshUsername} ${badgeHtml}`;
        }

        // कैप्शन के अंदर रेंडर होने वाले यूज़रनेम को रीयल-टाइम में अपडेट करना
        const captionUsernameEl = card.querySelector(`.post-caption b`);
        if (captionUsernameEl) {
            captionUsernameEl.innerText = freshUsername;
        }

        // 3. लाइव ऑनलाइन पल्स इंडिकेटर का रियल-टाइम अपडेट
        const avatarWrapper = card.querySelector(`.avatar-wrapper`);
        if (avatarWrapper) {
            const isOnline = userData.lastActive && (Date.now() - userData.lastActive < 120000);
            let pulseDot = avatarWrapper.querySelector(`.online-indicator-pulse`);

            if (isOnline) {
                if (!pulseDot) {
                    pulseDot = document.createElement('div');
                    pulseDot.className = 'online-indicator-pulse';
                    avatarWrapper.appendChild(pulseDot);
                }
            } else {
                if (pulseDot) pulseDot.remove();
            }
        }
    });

    window.activeHeaderListeners.set(pid, unsubscribe);
};

/**
 * बैकग्राउंड में पोस्ट का व्यू काउंट बढ़ाना
 */
window.incrementPostView = async (postId) => {
    if (!window.currentUser) return;
    if (window.viewedPostsSession.has(postId)) return;
    window.viewedPostsSession.add(postId);

    try {
        const postRef = window.doc(window.db, "posts", postId);
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
        console.error("Error updating post views silently:", err);
    }
};

/**
 * Intersection Observer सेटअप
 */
window.setupPostObserver = () => {
    if (window.postObserver) window.postObserver.disconnect();

    window.postObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                const postId = entry.target.id.replace('post-', '');
                if (postId && !window.viewedPostsSession.has(postId)) {
                    window.incrementPostView(postId);
                }
            }
        });
    }, { threshold: 0.5 });

    document.querySelectorAll('.post-card').forEach(postCard => {
        window.postObserver.observe(postCard);
    });
};

// ==========================================
// --- SMART & FAST LOAD FEED ---
// ==========================================
async function loadFeed(isRefresh = false) {
    const feedContainer = document.getElementById('feed-container');
    if (!feedContainer) return;
    
    if (isRefresh) {
        window.activeHeaderListeners.forEach((unsub) => unsub());
        window.activeHeaderListeners.clear();

        feedContainer.innerHTML = "";
        lastVisiblePost = null;
        feedEndReached = false;
        loadedPostIds.clear();
        if (window.viewedPostsSession) window.viewedPostsSession.clear();
    }

    if (feedEndReached || isFetchingFeed) return;
    isFetchingFeed = true;
    
    const skeletonId = 'feed-skeleton-' + Date.now();
    const skeletonLoader = document.createElement('div');
    skeletonLoader.id = skeletonId;
    skeletonLoader.innerHTML = `
        <div class="post-card fade-in" style="pointer-events:none; border:none; box-shadow:none; background: transparent;">
            <div style="display:flex; gap:12px; padding:15px 20px;">
                <div class="smart-shimmer" style="width:45px; height:45px; border-radius:50%;"></div>
                <div style="flex:1; display:flex; flex-direction:column; justify-content:center; gap:8px;">
                    <div class="smart-shimmer" style="width:40%; height:12px; border-radius:4px;"></div>
                    <div class="smart-shimmer" style="width:25%; height:10px; border-radius:4px;"></div>
                </div>
            </div>
            <div class="smart-shimmer" style="width:100%; height:380px; border-radius:12px;"></div>
            <div style="padding:15px 20px; display:flex; gap:15px;">
                <div class="smart-shimmer" style="width:25px; height:25px; border-radius:50%;"></div>
                <div class="smart-shimmer" style="width:25px; height:25px; border-radius:50%;"></div>
                <div class="smart-shimmer" style="width:25px; height:25px; border-radius:50%;"></div>
            </div>
        </div>`;
    feedContainer.appendChild(skeletonLoader);

    try {
        let q;
        if (isRefresh) {
            q = window.query(window.collection(window.db, "posts"), window.orderBy("timestamp", "desc"), window.limit(50));
        } else if (!lastVisiblePost) {
            q = window.query(window.collection(window.db, "posts"), window.orderBy("timestamp", "desc"), window.limit(8));
        } else {
            q = window.query(window.collection(window.db, "posts"), window.orderBy("timestamp", "desc"), window.startAfter(lastVisiblePost), window.limit(8));
        }

        const snapshot = await window.getDocs(q);
        
        const loaderEl = document.getElementById(skeletonId);
        if(loaderEl) loaderEl.remove();

        if (snapshot.empty) {
            feedEndReached = true;
            if(feedContainer.children.length === 0) {
                feedContainer.innerHTML = `<div style="text-align:center;padding:40px;color:#aaa;"><i class="fa-solid fa-camera" style="font-size:3rem; opacity:0.3; margin-bottom:10px;"></i><br>No posts yet.</div>`;
            } else {
                const caughtUpMsg = document.createElement('div');
                caughtUpMsg.innerHTML = `<div style="text-align:center; padding:30px; color:var(--primary); font-weight:800; font-size:1rem; opacity: 0.8; animation: slideUp 0.5s ease-out;"><i class="fa-solid fa-circle-check" style="margin-right:8px;"></i>You're all caught up!</div>`;
                feedContainer.appendChild(caughtUpMsg);
            }
            isFetchingFeed = false; return;
        }

        if (!isRefresh) lastVisiblePost = snapshot.docs[snapshot.docs.length - 1];

        let postsData = [];
        snapshot.forEach(doc => { 
            if (!loadedPostIds.has(doc.id)) postsData.push({ id: doc.id, ...doc.data() }); 
        });

        if (isRefresh) {
            for (let i = postsData.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [postsData[i], postsData[j]] = [postsData[j], postsData[i]];
            }
            postsData = postsData.slice(0, 15);
        }

        const fragment = document.createDocumentFragment();

        postsData.forEach(p => {
            if (p.mediaType === 'video') return; 
            if (!loadedPostIds.has(p.id)) {
                loadedPostIds.add(p.id); 
                const postEl = createPostElement(p.id, p);
                postEl.classList.add('fade-in'); 
                fragment.appendChild(postEl);
            }
        });

        feedContainer.appendChild(fragment);

        setTimeout(() => {
            window.setupPostObserver();
        }, 100);

    } catch (e) {
        console.error("Feed error:", e);
        const loaderEl = document.getElementById(skeletonId);
        if(loaderEl) loaderEl.remove();
    }
    
    setTimeout(() => { isFetchingFeed = false; }, 300);
}

// ==========================================
// --- 2. CREATE POST UI ---
// ==========================================
function createPostElement(pid, p) {
    if (!p) return document.createElement('div');
    
    const liked = p.likes?.includes(window.currentUser?.uid);
    const isMe = p.userId === window.currentUser?.uid;
    const isFollowing = window.currentUserData?.following?.includes(p.userId);
    const postMediaUrl = p.mediaUrl || p.imageUrl || '';

    // शुरुआती लोडिंग के लिए लोकल यूजर कैश से डेटा प्राप्त करें
    const liveUserData = window.allCachedUsers?.find(u => u.uid === p.userId);
    let currentLivePhoto = p.userPhoto || 'https://i.pravatar.cc/150'; 
    if (liveUserData) currentLivePhoto = liveUserData.avatarBase64 || liveUserData.photoURL || currentLivePhoto;

    // यूज़रनेम सेट करें
    const initialUsername = liveUserData?.username || p.username || 'user';

    // रोज़ गोल्ड टिक लोड करना
    const isVerified = liveUserData?.isVerified === true;
    const initialBadgeHtml = isVerified && typeof window.getVerifiedBadgeHTML === 'function'
        ? window.getVerifiedBadgeHTML(true, 16)
        : '';

    let dateObj = new Date();
    if (p.timestamp) {
        if (p.timestamp.toDate) dateObj = p.timestamp.toDate();
        else if (p.timestamp.seconds) dateObj = new Date(p.timestamp.seconds * 1000);
        else dateObj = new Date(p.timestamp);
    }
    const timeString = typeof timeAgo === 'function' ? timeAgo(dateObj) : "Just now";

    let mediaHTML = "";
    if (p.mediaType === 'video') {
        mediaHTML = `<div class="post-media-container" ondblclick="window.showHeartAnimation(this, '${pid}', '${p.userId}', '${postMediaUrl}')"><video src="${p.mediaUrl}" class="smooth-img" controls muted playsinline preload="metadata" style="opacity: 1;"></video></div>`;
    } else {
        mediaHTML = `<div class="post-media-container img-placeholder"><img src="${postMediaUrl}" class="smooth-img" loading="lazy" decoding="async" onload="this.classList.add('loaded'); this.parentElement.classList.remove('img-placeholder');" onclick="window.handleMediaClick(this, '${pid}', '${p.userId}', '${postMediaUrl}', 'image', event)"></div>`;
    }
    
    const hasStory = window.allGroupedStories && window.allGroupedStories[p.userId];
    let avatarClass = hasStory ? (window.hasUnseenStories(p.userId) ? "user-avatar story-border-unseen" : "user-avatar story-border-seen") : "user-avatar";
    let avatarClick = hasStory ? `viewStoryGroup('${p.userId}')` : `if(typeof window.viewUserProfile==='function') window.viewUserProfile('${p.userId}')`;

    // स्मार्ट कैप्शन कोलाप्स
    const rawCaption = p.caption || '';
    const captionLimit = 30; 
    let captionHTML = `<b>${initialUsername}</b> <span class="caption-text-content">${rawCaption}</span>`;

    if (rawCaption.length > captionLimit) {
        const truncated = rawCaption.substring(0, captionLimit);
        captionHTML = `
            <b>${initialUsername}</b> 
            <span class="caption-text-content" id="caption-short-${pid}">${truncated}...</span>
            <span class="caption-text-content" id="caption-full-${pid}" style="display:none;">${rawCaption}</span>
            <span class="read-more-btn" onclick="window.toggleCaptionCollapse('${pid}')">more</span>
        `;
    }

    const div = document.createElement('div'); 
    div.className = "post-card fade-in";
    div.id = `post-${pid}`;
    div.innerHTML = `
        <div class="post-header-board">
            <div class="user-info">
                <div class="avatar-wrapper" style="position:relative;">
                    <img src="${currentLivePhoto}" class="${avatarClass} feed-story-avatar" data-user-id="${p.userId}" onclick="${avatarClick}" onerror="this.src='https://i.pravatar.cc/150'" loading="lazy" decoding="async">
                </div>
                <div>
                    <div style="display:flex; align-items:center; gap: 8px;">
                        <span class="post-username-span" style="font-weight:800; font-size:0.95rem; color:#1a1a1a; display: flex; align-items: center;" onclick="if(typeof window.viewUserProfile==='function') window.viewUserProfile('${p.userId}')">${initialUsername} ${initialBadgeHtml}</span>
                        ${!isMe ? `<span class="feed-follow-btn follow-btn-${p.userId} ${isFollowing ? 'following' : ''}" onclick="window.handleFollowFromFeed('${p.userId}', event)">${isFollowing ? 'Following' : 'Follow'}</span>` : ''}
                    </div>
                    <span class="post-time">${timeString}</span>
                </div>
            </div>
        </div>
        ${mediaHTML}
        
        <!-- 🌟 एकीकृत कैप्शन्स, एक्शन्स और इमोजी रिएक्शंस बोर्ड -->
        <div class="post-actions">
            <!-- Row 1: Integrated Caption Text (At the very top) -->
            <div class="post-caption" id="caption-wrapper-${pid}">${captionHTML}</div>

            <!-- Row 2: Action Icons -->
            <div class="action-buttons-row">
                <div class="action-btn" style="position: relative;">
                    <i id="like-btn-${pid}" class="fa-${liked?'solid':'regular'} fa-heart ${liked?'liked':''}" onclick="window.handleLike('${pid}', '${p.userId}', this, '${postMediaUrl}')"></i>
                    <span id="like-count-${pid}">${p.likes?.length || 0}</span>
                </div>
                <div class="action-btn">
                    <i class="fa-regular fa-comment" onclick="window.openComments('${pid}')"></i>
                    <span id="post-comment-count-${pid}">${p.commentCount || 0}</span>
                </div>
                <div class="action-btn">
                    <i class="fa-regular fa-paper-plane" onclick="window.openShareModal('${pid}', 'post')"></i>
                    <span id="post-share-count-${pid}">${p.shareCount || 0}</span>
                </div>
            </div>
            
            <!-- Row 3: In-line Emojis inside the same cardboard -->
            <div class="quick-reactions-row">
                <span class="reaction-emoji" onclick="window.sendQuickReaction('${pid}', '👍', '${p.userId}', this)">👍</span>
                <span class="reaction-emoji" onclick="window.sendQuickReaction('${pid}', '❤️', '${p.userId}', this)">❤️</span>
                <span class="reaction-emoji" onclick="window.sendQuickReaction('${pid}', '😂', '${p.userId}', this)">😂</span>
                <span class="reaction-emoji" onclick="window.sendQuickReaction('${pid}', '😮', '${p.userId}', this)">😮</span>
                <span class="reaction-emoji" onclick="window.sendQuickReaction('${pid}', '😢', '${p.userId}', this)">😢</span>
                <span class="reaction-emoji" onclick="window.sendQuickReaction('${pid}', '🙏', '${p.userId}', this)">🙏</span>
            </div>
        </div>
    `;

    // एलिमेंट जेनरेट होने के तुरंत बाद रियल-टाइम बाइंडिंग शुरू करें
    setTimeout(() => {
        window.bindRealtimeUserHeader(pid, p.userId);
    }, 50);

    return div;
}
window.createPostElement = createPostElement;
window.loadFeed = loadFeed;

// ==========================================
// --- 3. NEW CAPTION COGNITIVE ACTIONS ---
// ==========================================

/**
 * स्मार्ट कैप्शन कोलाप्स / एक्सपेंड टॉगल फ़ंक्शन
 */
window.toggleCaptionCollapse = (pid) => {
    const shortEl = document.getElementById(`caption-short-${pid}`);
    const fullEl = document.getElementById(`caption-full-${pid}`);
    const wrapper = document.getElementById(`caption-wrapper-${pid}`);
    const btn = wrapper.querySelector('.read-more-btn');

    if (shortEl && fullEl && btn) {
        if (fullEl.style.display === "none") {
            fullEl.style.display = "inline";
            shortEl.style.display = "none";
            btn.innerText = "less";
        } else {
            fullEl.style.display = "none";
            shortEl.style.display = "inline";
            btn.innerText = "more";
        }
    }
};

/**
 * Floating Burst Effect for Quick Emojis
 */
window.triggerEmojiBurst = (element, emojiChar) => {
    if (!element) return;
    const parent = element.closest('.post-card'); 
    if (!parent) return;

    for (let i = 0; i < 6; i++) {
        const particle = document.createElement('span');
        particle.className = 'floating-emoji-particle';
        particle.innerText = emojiChar;
        
        // Random trajectory values
        const xRandom = (Math.random() - 0.5) * 140;
        const yRandom = -100 - (Math.random() * 120);
        const rotRandom = (Math.random() - 0.5) * 60;
        
        particle.style.cssText = `
            position: absolute;
            left: ${element.getBoundingClientRect().left - parent.getBoundingClientRect().left + 15}px;
            top: ${element.getBoundingClientRect().top - parent.getBoundingClientRect().top + 15}px;
            transform: translate(-50%, -50%) scale(0.5);
            font-size: 1.4rem;
            pointer-events: none;
            z-index: 120;
            will-change: transform, opacity;
            --tx: ${xRandom}px;
            --ty: ${yRandom}px;
            --rot: ${rotRandom}deg;
        `;
        
        parent.appendChild(particle);
        setTimeout(() => particle.remove(), 900);
    }
};

/**
 * क्विक इन-लाइन इमोजी रिएक्शंस बार
 */
window.sendQuickReaction = async (pid, emoji, ownerId, clickedElement = null) => {
    if (!window.currentUser) return;
    if (window.navigator.vibrate) window.navigator.vibrate(20);

    // Trigger floating emoji burst
    if (clickedElement) {
        window.triggerEmojiBurst(clickedElement, emoji);
    }

    const commentCountSpan = document.getElementById(`post-comment-count-${pid}`);
    if (commentCountSpan) {
        commentCountSpan.innerText = parseInt(commentCountSpan.innerText) + 1;
    }

    try {
        const myPhoto = window.currentUserData?.avatarBase64 || window.currentUser?.photoURL || '';
        
        await window.addDoc(window.collection(window.db, "posts", pid, "comments"), {
            text: emoji,
            userName: window.currentUser.displayName || "User",
            userPhoto: myPhoto,
            userId: window.currentUser.uid,
            timestamp: window.serverTimestamp(),
            likes: []
        });

        const postRef = window.doc(window.db, "posts", pid);
        const postSnap = await window.getDoc(postRef);
        if (postSnap.exists()) {
            const data = postSnap.data();
            const newCount = (data.commentCount || 0) + 1;
            await window.updateDoc(postRef, { commentCount: newCount });

            if (commentCountSpan) commentCountSpan.innerText = newCount;
        }

        if (ownerId !== window.currentUser.uid && typeof window.sendNotification === 'function') {
            await window.sendNotification(ownerId, 'comment', `Reacted on your post: ${emoji}`, pid);
        }

        if (typeof window.showToast === 'function') {
            window.showToast("Reaction Sent", `You reacted with ${emoji}`, myPhoto);
        }

    } catch (err) {
        console.error("Error sending quick reaction comment:", err);
    }
};

/**
 * माइक्रो-कॉन्फेटी प्रभाव
 */
window.triggerMicroConfetti = (element) => {
    const parent = element.parentElement;
    if (!parent) return;

    const colors = ['#ff006e', '#8338ec', '#00b894', '#ffbe0b', '#00d2ff', '#ff6b81'];
    const particleCount = 10;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('i');
        particle.className = 'fa-solid fa-heart micro-confetti-particle';
        
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        const randomAngle = (Math.random() * 360) * (Math.PI / 180);
        const randomDistance = 50 + Math.random() * 50;
        const rotRandom = (Math.random() - 0.5) * 90;

        const x = Math.cos(randomAngle) * randomDistance;
        const y = Math.sin(randomAngle) * randomDistance;

        particle.style.color = randomColor;
        particle.style.left = '50%';
        particle.style.top = '50%';
        particle.style.transform = 'translate(-50%, -50%) scale(0.4)';
        particle.style.setProperty('--tx', `${x}px`);
        particle.style.setProperty('--ty', `${y}px`);
        particle.style.setProperty('--rot', `${rotRandom}deg`);

        parent.appendChild(particle);

        setTimeout(() => {
            particle.remove();
        }, 800);
    }
};

/**
 * 💖 Like बटन के ठीक ऊपर तैरते हुए दिल (Mini floating hearts above like icon)
 */
window.triggerFloatingHeartsAboveLike = (element) => {
    if (!element) return;
    const parent = element.parentElement; // The container `.action-btn`
    if (!parent) return;

    for (let i = 0; i < 4; i++) {
        const miniHeart = document.createElement('i');
        miniHeart.className = 'fa-solid fa-heart floating-like-heart';
        
        // Trajectory math directly over the element location
        const xRandom = (Math.random() - 0.5) * 35;
        const yRandom = -45 - (Math.random() * 45); 
        const durationRandom = 0.6 + Math.random() * 0.3;

        miniHeart.style.cssText = `
            position: absolute;
            left: 50%;
            top: 10%;
            transform: translate(-50%, -50%) scale(0.3);
            color: #ff4757;
            font-size: 0.8rem;
            pointer-events: none;
            z-index: 110;
            will-change: transform, opacity;
            --tx: ${xRandom}px;
            --ty: ${yRandom}px;
            animation: floatHeartUp ${durationRandom}s ease-out forwards;
        `;
        
        parent.appendChild(miniHeart);
        setTimeout(() => miniHeart.remove(), durationRandom * 1000);
    }
};

// ==========================================
// --- 4. POST INTERACTIONS ---
// ==========================================
window.handleMediaClick = (element, pid, ownerId, mediaUrl, mediaType, event) => {
    if(event) event.stopPropagation();
    if (!element.clickTimeout) {
        element.clickTimeout = setTimeout(() => {
            element.clickTimeout = null;
            if(typeof window.viewFullScreenMedia === 'function') window.viewFullScreenMedia(mediaUrl, mediaType);
        }, 300); 
    } else {
        clearTimeout(element.clickTimeout);
        element.clickTimeout = null;
        if(typeof window.showHeartAnimation === 'function') window.showHeartAnimation(element.parentElement, pid, ownerId, mediaUrl);
    }
};

window.showHeartAnimation = (container, pid, ownerId, postMediaUrl = "") => {
    const btn = document.getElementById(`like-btn-${pid}`);
    const heart = document.createElement('i');
    heart.className = 'fa-solid fa-heart heart-pop';
    container.appendChild(heart);
    setTimeout(() => heart.remove(), 1000);
    window.handleLike(pid, ownerId, btn, postMediaUrl);
};

window.handleLike = async (pid, ownerId, btnElement, postMediaUrl = "") => { 
    const isCurrentlyLiked = btnElement.classList.contains('liked');
    const likeCountSpan = document.getElementById(`like-count-${pid}`);
    
    if(isCurrentlyLiked) {
        btnElement.classList.remove('liked'); btnElement.classList.replace('fa-solid', 'fa-regular');
        if(likeCountSpan) likeCountSpan.innerText = Math.max(0, parseInt(likeCountSpan.innerText) - 1);
    } else {
        btnElement.classList.add('liked'); btnElement.classList.replace('fa-regular', 'fa-solid');
        if(likeCountSpan) likeCountSpan.innerText = parseInt(likeCountSpan.innerText) + 1;
        
        // Trigger animations
        window.triggerMicroConfetti(btnElement);
        window.triggerFloatingHeartsAboveLike(btnElement);
    }

    const postRef = window.doc(window.db, "posts", pid);
    try {
        if(isCurrentlyLiked) await window.updateDoc(postRef, { likes: window.arrayRemove(window.currentUser.uid) });
        else {
            await window.updateDoc(postRef, { likes: window.arrayUnion(window.currentUser.uid) });
            if(ownerId !== window.currentUser.uid && typeof window.sendNotification === 'function') {
                await window.sendNotification(ownerId, 'like', 'liked your post', pid, postMediaUrl);
            }
        }
    } catch(e) {}
};

window.deletePost = (postId) => {
    if(typeof window.showDynamicConfirm === 'function') {
        window.showDynamicConfirm("Delete Post", "Are you sure you want to delete this post?", "fa-solid fa-trash", async () => {
            try { 
                await window.deleteDoc(window.doc(window.db, "posts", postId)); 
                const postEl = document.getElementById(`post-${postId}`);
                if(postEl) postEl.remove();
                if(typeof window.showCustomAlert === 'function') window.showCustomAlert("Deleted", "Post has been deleted successfully.", "success");
            } catch(e) {}
        });
    }
};

// ==========================================
// --- 5. SMART INFINITE SCROLL & REFRESH ---
// ==========================================
window.addEventListener('load', () => {
    const homeView = document.getElementById('home-view');
    if(homeView) {
        homeView.addEventListener('scroll', () => {
             if(homeView.scrollTop + homeView.clientHeight >= homeView.scrollHeight - 1000) {
                 loadFeed(false);
             }
        }, { passive: true }); 
    }
    setupPullToRefresh();
});

function setupPullToRefresh() {
    let pStart = {x: 0, y:0}, pCurrent = {x: 0, y:0}, loading = false;
    const main = document.getElementById('home-view'), ptr = document.getElementById('ptr-loader');

    if(!main || !ptr) return;

    main.addEventListener('touchstart', e => { 
        pStart.x = e.touches[0].screenX; pStart.y = e.touches[0].screenY; 
    }, {passive: true});
    
    main.addEventListener('touchmove', e => {
        if(loading || main.scrollTop > 0) return;
        pCurrent.x = e.touches[0].screenX; pCurrent.y = e.touches[0].screenY;
        const diff = pCurrent.y - pStart.y;
        
        if(diff > 0) {
            const ptrY = Math.min(diff / 2, 80);
            ptr.style.transform = `translateX(-50%) translateY(${ptrY}px) scale(${ptrY/60})`;
        }
    }, {passive: true});

    main.addEventListener('touchend', () => {
        if(loading || main.scrollTop > 0) return;
        const diff = pCurrent.y - pStart.y;
        if(diff > 80) {
            loading = true; ptr.classList.add('loading'); 
            ptr.style.transform = `translateX(-50%) translateY(80px)`;
            loadFeed(true).then(() => {
                setTimeout(() => {
                    loading = false; ptr.classList.remove('loading'); 
                    ptr.style.transform = `translateX(-50%) translateY(0) scale(0)`;
                }, 500);
            });
        } else { ptr.style.transform = `translateX(-50%) translateY(0) scale(0)`; }
    });
}

// ==========================================
// --- 6. 10-SECOND SMART ACTIVE CHECK & PRESENCE ---
// ==========================================
if (window.activeCheckInterval) clearInterval(window.activeCheckInterval);
window.activeCheckInterval = setInterval(() => {
    if (window.currentUser && document.visibilityState === 'visible') {
        const myRef = window.doc(window.db, "users", window.currentUser.uid);
        window.updateDoc(myRef, { lastActive: Date.now() }).catch(() => {});
    }

    document.querySelectorAll('.post-card').forEach(card => {
        const avatarWrapper = card.querySelector('.avatar-wrapper');
        const avatarImg = card.querySelector('.feed-story-avatar');
        if (!avatarWrapper || !avatarImg) return;

        const postUserId = avatarImg.getAttribute('data-user-id');
        const liveUserData = window.allCachedUsers?.find(u => u.uid === postUserId);
        
        if (liveUserData && liveUserData.lastActive) {
            const isOnline = (Date.now() - liveUserData.lastActive < 120000); 
            let pulseDot = avatarWrapper.querySelector('.online-indicator-pulse');

            if (isOnline) {
                if (!pulseDot) {
                    pulseDot = document.createElement('div');
                    pulseDot.className = 'online-indicator-pulse';
                    avatarWrapper.appendChild(pulseDot);
                }
            } else {
                if (pulseDot) {
                    pulseDot.style.transition = 'opacity 0.3s ease';
                    pulseDot.style.opacity = '0';
                    setTimeout(() => pulseDot.remove(), 300);
                }
            }
        }
    });
}, 10000);
