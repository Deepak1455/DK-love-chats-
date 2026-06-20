/**
 * popscreen.js - Unified Pop-Screens Engine (Comments & Instagram Bottom Sheet)
 * Fully Sync-Optimized with Swipe-to-Expand, Dynamic State Binding, 
 * Reverted Message Text Link Payload, and Locked Instagram UI Layouts.
 * [Bug Fix Update]: Resolves parameter mismatch for shared posts, reels, and stories in cardboard.
 * [Stable Update]: Resolves display state toggles, pointer-blocking, and missing story intent.
 * [Perfect Sync]: Corrects Reels/Posts/Stories navigation. Eliminates external HTTP text links.
 */

// --- 🎖️ ROSE GOLD VERIFIED TICK SVG ---
const ROSE_GOLD_TICK_SVG = `
<svg width="13" height="14" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; display: inline-block; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.25)); margin-left: 4px; flex-shrink: 0;">
  <defs>
    <linearGradient id="roseGoldCommentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFE5B4"/>
      <stop offset="50%" stop-color="#FF9F1C"/>
      <stop offset="100%" stop-color="#FF5400"/>
    </linearGradient>
  </defs>
  <path
    d="M64 10L79 22L98 20L96 39L110 54L96 69L98 88L79 86L64 100L49 86L30 88L32 69L18 54L32 39L30 20L49 22Z"
    fill="url(#roseGoldCommentGrad)"
  />
  <circle cx="64" cy="54" r="30" fill="#FFFFFF" opacity="0.12" />
  <path
    d="M47 55L59 67L82 44"
    fill="none"
    stroke="#FFFFFF"
    stroke-width="10"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>`;

const APP_SHARE_URL = "https://deepak1455.github.io/DK-love-chats-/";
const APP_SHARE_TEXT = "Hey! ❤️ Join me on DK Love Chats - A secure and fun way to chat! ❤️ Join here: ";

// =========================================================
// --- 🔗 DYNAMIC LINK GENERATOR HELPERS ---
// =========================================================
window.getGenerateShareUrl = (id, type, mediaType) => {
    if (!id) return APP_SHARE_URL;
    const baseUrl = APP_SHARE_URL.endsWith('/') ? APP_SHARE_URL : APP_SHARE_URL + '/';
    
    if (type === 'story') {
        return `${baseUrl}?story=${id}`;
    } else if (mediaType === 'video' || type === 'reel') {
        return `${baseUrl}?reel=${id}`;
    } else {
        return `${baseUrl}?post=${id}`;
    }
};

const getShareLink = (itemId, itemType) => {
    return window.getGenerateShareUrl(itemId, itemType);
};

// ==========================================
// --- CORE CLIPBOARD COPY UTILITY ---
// ==========================================
window.fallbackCopyText = (text, successMsg) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed"; 
    textArea.style.left = "-9999px"; 
    textArea.style.top = "0";
    document.body.appendChild(textArea); 
    textArea.focus(); 
    textArea.select();
    try {
        if (document.execCommand('copy') && successMsg) {
            if (typeof window.showToast === 'function') {
                window.showToast("Copied", successMsg, window.currentUser?.photoURL, "success");
            }
        }
    } catch (err) { 
        console.error('Copy fallback failed', err); 
    }
    document.body.removeChild(textArea);
};

// =========================================================
// --- SECTION 1: COMMENTS MODULE (REAL-TIME LOCKED) ---
// =========================================================
window.commentUsersStore = window.commentUsersStore || new Map();
window.commentUserListeners = window.commentUserListeners || new Map();

function updateDOMForUser(userId) {
    const liveUser = window.commentUsersStore.get(userId);
    if (!liveUser) return;
    
    const rows = document.querySelectorAll(`.comment-author-${userId}`);
    rows.forEach(row => {
        const img = row.querySelector('.comment-avatar');
        if (img && img.src !== liveUser.avatar) {
            img.src = liveUser.avatar;
        }
        const nameSpan = row.querySelector('.comment-user');
        if (nameSpan && nameSpan.innerText !== liveUser.name) {
            nameSpan.innerText = liveUser.name;
        }
        const handleDiv = row.querySelector('.comment-handle');
        if (handleDiv && handleDiv.innerText !== liveUser.username) {
            handleDiv.innerText = liveUser.username;
        }
        const badgeContainer = row.querySelector('.comment-badge-container');
        if (badgeContainer) {
            const hasBadge = badgeContainer.querySelector('svg') !== null;
            if (liveUser.isVerified && !hasBadge) {
                badgeContainer.innerHTML = ROSE_GOLD_TICK_SVG;
            } else if (!liveUser.isVerified && hasBadge) {
                badgeContainer.innerHTML = '';
            }
        }
    });
}

function subscribeToCommentAuthor(userId) {
    if (window.commentUserListeners.has(userId)) return;

    const userRef = window.doc(window.db, "users", userId);
    
    const unsubscribe = window.onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            const userData = docSnap.data();
            window.commentUsersStore.set(userId, {
                name: userData.name || "User",
                username: userData.username ? `@${userData.username.replace(/^@/, '')}` : `@${userData.name.toLowerCase().replace(/\s+/g, '')}`,
                avatar: userData.avatarBase64 || userData.photoURL || "https://i.pravatar.cc/150",
                isVerified: userData.isVerified === true || userData.verified === true || userData.verifiedStatus === "accomplished"
            });
            updateDOMForUser(userId);
        }
    }, (err) => {
        console.warn(`Profile sync listener skipped for ${userId}:`, err.message);
    });

    window.commentUserListeners.set(userId, unsubscribe);
}

function unsubscribeAllCommentAuthors() {
    window.commentUserListeners.forEach(unsub => { if (typeof unsub === "function") unsub(); });
    window.commentUserListeners.clear();
    window.commentUsersStore.clear();
}

window.openComments = (pid) => { 
    window.activeCommentPostId = pid; 
    window.toggleModal('comments-modal', true); 
    
    const listContainer = document.getElementById('comments-list'); 
    if (listContainer) {
        listContainer.innerHTML = `
            <div class="comment-header-indicator" style="width: 40px; height: 5px; background: #cbd5e1; border-radius: 10px; margin: 10px auto 15px; flex-shrink: 0;"></div>
            <div id="comments-items-wrapper" style="display: flex; flex-direction: column; overflow-y: auto; flex: 1;">
                <div id="comments-loading-state" style="text-align:center; padding:30px;">
                    <div class="splash-loader" style="width:30px; height:30px; margin:0 auto; border: 2px solid #ff006e; border-top-color: transparent; border-radius: 50%; animation: fa-spin 1s linear infinite;"></div>
                </div>
            </div>`; 
    }
    
    const itemsWrapper = document.getElementById('comments-items-wrapper');
    
    if (window.unsubscribeComments) {
        window.unsubscribeComments();
        window.unsubscribeComments = null;
    }
    unsubscribeAllCommentAuthors();

    const commentsQuery = window.query(
        window.collection(window.db, "posts", pid, "comments"), 
        window.orderBy("timestamp", "asc")
    );

    window.unsubscribeComments = window.onSnapshot(commentsQuery, (snapshot) => { 
        if (!itemsWrapper) return;
        
        const loader = document.getElementById('comments-loading-state');
        if (loader) loader.remove();
        
        if (snapshot.empty) {
            itemsWrapper.innerHTML = `
                <div id="comments-empty-placeholder" style="text-align:center; color:#94a3b8; padding:40px; font-weight:600; font-size:0.9rem;">
                    No comments yet.<br>
                    <small style="font-weight:400; color:#cbd5e1;">Be the first to share your thoughts!</small>
                </div>`;
            return;
        }
        
        const placeholder = document.getElementById('comments-empty-placeholder');
        if (placeholder) placeholder.remove();
        
        snapshot.forEach(docSnap => { 
            const commentData = docSnap.data();
            const commentId = docSnap.id;
            const isLiked = commentData.likes && commentData.likes.includes(window.currentUser.uid);
            
            const liveUser = window.commentUsersStore.get(commentData.userId) || {
                name: commentData.userName || "User",
                username: `@${(commentData.userName || "user").toLowerCase().replace(/\s+/g, '')}`,
                avatar: commentData.userPhoto || "https://i.pravatar.cc/150",
                isVerified: false
            };

            subscribeToCommentAuthor(commentData.userId);

            let existingRow = document.getElementById(`comment-row-${commentId}`);
            
            if (existingRow) {
                const likeIcon = existingRow.querySelector('.comment-like-btn');
                const likeCountSpan = existingRow.querySelector('.comment-like-count');
                const likeContainer = existingRow.querySelector('.comment-like-container');
                
                if (likeContainer) {
                    likeContainer.setAttribute('data-liked', isLiked ? 'true' : 'false');
                }
                if (likeIcon) {
                    if (isLiked) {
                        likeIcon.className = "fa-solid fa-heart comment-like-btn";
                        likeIcon.style.color = "#ff006e";
                    } else {
                        likeIcon.className = "fa-regular fa-heart comment-like-btn";
                        likeIcon.style.color = "#cbd5e1";
                    }
                }
                if (likeCountSpan) {
                    likeCountSpan.innerText = commentData.likes ? commentData.likes.length : 0;
                }
            } else {
                const newRow = document.createElement('div');
                newRow.id = `comment-row-${commentId}`;
                newRow.className = `comment-item comment-author-${commentData.userId} fade-in`;
                
                newRow.style.cssText = "display: flex; align-items: flex-start; gap: 12px; padding: 15px; border-bottom: 1px solid #f1f5f9; box-sizing: border-box; overflow: hidden; min-height: 75px;";
                
                newRow.innerHTML = `
                    <img src="${liveUser.avatar}" class="comment-avatar" style="width: 40px; height: 40px; min-width: 40px; min-height: 40px; border-radius: 50%; object-fit: cover; cursor: pointer; border: 2.5px solid var(--primary, #ff006e); background: #f1f5f9; flex-shrink: 0;" 
                         onclick="if(typeof window.viewUserProfile === 'function') window.viewUserProfile('${commentData.userId}'); window.toggleModal('comments-modal', false);">
                    <div class="comment-body" style="flex: 1; text-align: left; min-width: 0;">
                        
                        <!-- 💡 FULL NAME ROW: यहाँ से वेरिफिकेशन बैच को पूर्णतः हटा दिया गया है -->
                        <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap; height: 18px; overflow: hidden;">
                            <span class="comment-user" style="font-weight: 800; color: #1a1a1a; font-size: 0.9rem; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;"
                                  onclick="if(typeof window.viewUserProfile === 'function') window.viewUserProfile('${commentData.userId}'); window.toggleModal('comments-modal', false);">
                                  ${liveUser.name}
                            </span>
                        </div>
                        
                        <!-- 💡 USERNAME @ ROW: रोज़ गोल्ड वेरिफिकेशन टिक को यहाँ यूज़रनेम के साथ सिंक किया गया है -->
                        <div style="display: flex; align-items: center; gap: 4px; height: 16px; margin-top: 1px;">
                            <span class="comment-handle" style="font-size: 0.75rem; color: #64748b; font-weight: 600; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;"
                                 onclick="if(typeof window.viewUserProfile === 'function') window.viewUserProfile('${commentData.userId}'); window.toggleModal('comments-modal', false);">
                                 ${liveUser.username}
                            </span>
                            <span class="comment-badge-container" style="display: inline-flex; align-items: center; height: 14px; margin-bottom: 1px;">
                                ${liveUser.isVerified ? ROSE_GOLD_TICK_SVG : ''}
                            </span>
                        </div>

                        <div class="comment-text" style="color: #475569; font-size: 0.85rem; margin-top: 4px; word-break: break-word; line-height: 1.4;">
                            ${commentData.text}
                        </div>
                    </div>
                    <div class="comment-like-container" 
                         data-liked="${isLiked ? 'true' : 'false'}"
                         onclick="window.handleLikeComment('${commentId}', this, '${commentData.userId}')" 
                         style="display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; color: #94a3b8; min-width: 32px; max-width: 32px; flex-shrink: 0; box-sizing: border-box; margin-top: 2px;">
                        <i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart comment-like-btn" id="like-icon-${commentId}" style="font-size: 1rem; color: ${isLiked ? '#ff006e' : '#cbd5e1'}; transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); display: inline-block; width: 16px; height: 16px; text-align: center;"></i>
                        <span class="comment-like-count" id="like-count-${commentId}" style="font-size: 0.7rem; font-weight: 700; margin-top: 4px; color: #64748b; line-height: 1; text-align: center; display: block; width: 100%;">${commentData.likes ? commentData.likes.length : 0}</span>
                    </div>`;
                
                itemsWrapper.appendChild(newRow);
            }
        });
    }, (error) => {
        console.error("Comments Observer Error:", error);
    }); 
};
window.commentLikeLock = window.commentLikeLock || new Set();

window.handleLikeComment = async (commentId, containerEl, commentOwnerId) => {
    if (window.commentLikeLock.has(commentId)) return;
    window.commentLikeLock.add(commentId);

    if (navigator.vibrate) navigator.vibrate(20);

    const likeIcon = containerEl.querySelector('.comment-like-btn');
    const likeCountSpan = containerEl.querySelector('.comment-like-count');
    
    const textElement = containerEl.parentElement.querySelector('.comment-text');
    const commentText = textElement ? textElement.innerText : "comment";
    
    const isCurrentlyLiked = containerEl.getAttribute('data-liked') === 'true';
    const nextLikedState = !isCurrentlyLiked;
    
    let currentCount = parseInt(likeCountSpan?.innerText || "0", 10);
    let nextCount = nextLikedState ? currentCount + 1 : Math.max(0, currentCount - 1);

    containerEl.setAttribute('data-liked', nextLikedState ? 'true' : 'false');
    
    if (likeIcon && likeCountSpan) {
        if (nextLikedState) {
            likeIcon.className = "fa-solid fa-heart comment-like-btn";
            likeIcon.style.color = "#ff006e";
            likeIcon.style.transform = "scale(1.3)";
            setTimeout(() => { likeIcon.style.transform = "scale(1)"; }, 200);
        } else {
            likeIcon.className = "fa-regular fa-heart comment-like-btn";
            likeIcon.style.color = "#cbd5e1";
        }
        likeCountSpan.innerText = nextCount;
    }

    const commentRef = window.doc(window.db, "posts", window.activeCommentPostId, "comments", commentId);
    
    try {
        if (isCurrentlyLiked) {
            await window.updateDoc(commentRef, { likes: window.arrayRemove(window.currentUser.uid) });
        } else {
            await window.updateDoc(commentRef, { likes: window.arrayUnion(window.currentUser.uid) });
            
            if (commentOwnerId !== window.currentUser.uid && typeof window.sendNotification === 'function') {
                await window.sendNotification(
                    commentOwnerId, 
                    'like_comment', 
                    `liked your comment: "${commentText}"`, 
                    window.activeCommentPostId
                );
            }
        }
    } catch (e) {
        console.error("Comment Like Action Failed, Rolling Back:", e);
        containerEl.setAttribute('data-liked', isCurrentlyLiked ? 'true' : 'false');
        if (likeIcon && likeCountSpan) {
            if (isCurrentlyLiked) {
                likeIcon.className = "fa-solid fa-heart comment-like-btn";
                likeIcon.style.color = "#ff006e";
            } else {
                likeIcon.className = "fa-regular fa-heart comment-like-btn";
                likeIcon.style.color = "#cbd5e1";
            }
            likeCountSpan.innerText = currentCount;
        }
    } finally {
        window.commentLikeLock.delete(commentId);
    }
};

window.isCommentSending = window.isCommentSending || false;

window.handleSendComment = async () => { 
    const inputEl = document.getElementById('comment-input');
    if (!inputEl) return;
    
    const commentText = inputEl.value.trim(); 
    if (!commentText || !window.activeCommentPostId || window.isCommentSending) return;

    window.isCommentSending = true;
    inputEl.value = ""; 

    try {
        const userPhoto = window.currentUserData?.avatarBase64 || window.currentUser?.photoURL || "https://i.pravatar.cc/150";
        
        await window.addDoc(window.collection(window.db, "posts", window.activeCommentPostId, "comments"), {
            text: commentText, 
            userName: window.currentUser.displayName || "User", 
            userPhoto: userPhoto, 
            userId: window.currentUser.uid, 
            timestamp: window.serverTimestamp(), 
            likes: []
        }); 

        const postRef = window.doc(window.db, "posts", window.activeCommentPostId);
        const postSnap = await window.getDoc(postRef);
        
        if (postSnap.exists()) {
            const postData = postSnap.data();
            const newCount = (postData.commentCount || 0) + 1;
            
            await window.updateDoc(postRef, { commentCount: newCount });
            
            if (navigator.vibrate) navigator.vibrate(25);

            const reelCommentSpan = document.getElementById(`reel-comment-count-${window.activeCommentPostId}`);
            if (reelCommentSpan) reelCommentSpan.innerText = newCount;
            
            document.querySelectorAll(`#post-comment-count-${window.activeCommentPostId}`).forEach(span => { 
                span.innerText = newCount; 
            });

            if (postData.userId !== currentUser.uid && typeof window.sendNotification === 'function') {
                await window.sendNotification(
                    postData.userId, 
                    'comment', 
                    `commented on your post: "${commentText}"`, 
                    activeCommentPostId
                ); 
            }
        }
    } catch (e) { 
        console.error("Error sending comment:", e); 
        inputEl.value = commentText; 
    } finally {
        window.isCommentSending = false;
    }
};


// ==========================================
// --- SECTION 2: SHARE SYSTEM LOGIC ---
// ==========================================
window.commentSelectedUsers = window.commentSelectedUsers || [];
window.commentShareListeners = window.commentShareListeners || new Map();

window.shareUsersLimit = 25;
window.hasMoreShareUsers = true;
window.shareUsersLimitLoading = false;

// DOM अपडेट हेल्पर
function updateDOMForShareUser(userId, liveUser) {
    const row = document.getElementById(`share-row-${userId}`);
    if (!row) return;

    const img = row.querySelector('.share-grid-avatar');
    if (img && img.src !== liveUser.avatar) img.src = liveUser.avatar;

    const nameSpan = row.querySelector('.share-grid-name');
    if (nameSpan && nameSpan.innerText !== liveUser.name) nameSpan.innerText = liveUser.name;

    const handleSpan = row.querySelector('.share-grid-handle');
    if (handleSpan && handleSpan.innerText !== liveUser.username) handleSpan.innerText = liveUser.username;

    const badgeContainer = row.querySelector('.share-grid-badge-container');
    if (badgeContainer) {
        const hasBadge = badgeContainer.querySelector('svg') !== null;
        if (liveUser.isVerified && !hasBadge) {
            badgeContainer.innerHTML = ROSE_GOLD_TICK_SVG;
        } else if (!liveUser.isVerified && hasBadge) {
            badgeContainer.innerHTML = '';
        }
    }

    const avatarWrapper = row.querySelector('.share-avatar-wrapper');
    if (avatarWrapper) {
        let statusDot = avatarWrapper.querySelector('.share-status-dot');
        if (liveUser.isActive) {
            if (!statusDot) {
                statusDot = document.createElement('div');
                statusDot.className = 'share-status-dot';
                statusDot.style.cssText = "position: absolute; bottom: 1px; right: 1px; width: 13px; height: 13px; background: #00b894; border: 2.5px solid #ffffff; border-radius: 50%; box-shadow: 0 0 6px rgba(0, 184, 148, 0.4); z-index: 5;";
                avatarWrapper.appendChild(statusDot);
            }
        } else if (statusDot) {
            statusDot.remove();
        }
    }
}

window.ensureShareBottomLoader = () => {
    const wrapper = document.getElementById('share-users-wrapper');
    let loader = document.getElementById('share-bottom-loader');
    if (wrapper && !loader) {
        loader = document.createElement('div');
        loader.id = 'share-bottom-loader';
        loader.style.cssText = "grid-column: span 3; text-align: center; padding: 15px; color: #cbd5e1; font-size: 1.2rem; display: flex; align-items: center; justify-content: center;";
        loader.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin" style="color: var(--primary, #ff006e); font-size: 1.4rem;"></i>`;
        wrapper.appendChild(loader);
    }
};

window.loadMoreShareUsers = () => {
    const inboxUsers = window.fullInboxUsers || [];
    if (window.shareUsersLimit >= inboxUsers.length) {
        window.hasMoreShareUsers = false;
        return;
    }
    
    window.shareUsersLimitLoading = true;
    window.shareUsersLimit += 25; 
    
    window.ensureShareBottomLoader();
    setTimeout(() => {
        window.updateShareModalList();
        window.shareUsersLimitLoading = false;
    }, 200);
};

window.updateShareModalList = () => {
    const usersWrapper = document.getElementById('share-users-wrapper');
    const initialLoader = document.getElementById('share-loading-state');
    const searchInput = document.getElementById('share-list-search');
    
    if (searchInput && searchInput.value.trim().length > 0) return;
    if (!usersWrapper) return;
    if (initialLoader) initialLoader.remove();

    const inboxUsers = window.fullInboxUsers || [];
    const slicedUsers = inboxUsers.slice(0, window.shareUsersLimit);
    
    if (inboxUsers.length === 0) {
        usersWrapper.innerHTML = `
            <div id="share-empty-placeholder" style="grid-column: span 3; text-align:center; color:#94a3b8; padding:40px; font-weight:600; font-size:0.9rem;">
                No recent chats to share with.<br>
                <small style="font-weight:400; color:#cbd5e1;">Start a conversation in your inbox first!</small>
            </div>`;
        window.hasMoreShareUsers = false;
        const bottomLoader = document.getElementById('share-bottom-loader');
        if (bottomLoader) bottomLoader.remove();
        return;
    }

    const placeholder = document.getElementById('share-empty-placeholder');
    if (placeholder) placeholder.remove();

    if (slicedUsers.length < inboxUsers.length) {
        window.hasMoreShareUsers = true;
        window.ensureShareBottomLoader();
    } else {
        window.hasMoreShareUsers = false;
        const bottomLoader = document.getElementById('share-bottom-loader');
        if (bottomLoader) bottomLoader.remove();
    }

    const currentUids = new Set(slicedUsers.map(u => u.uid));

    slicedUsers.forEach(user => {
        const userId = user.uid;
        const now = Date.now();
        const isActive = (now - (user.lastActive || 0)) < 120000;

        const liveUser = {
            name: user.name || "User",
            username: user.username ? `@${user.username.replace(/^@/, '')}` : `@${user.name.toLowerCase().replace(/\s+/g, '')}`,
            avatar: user.avatarBase64 || user.photoURL || "https://i.pravatar.cc/150",
            isVerified: user.isVerified === true || user.verified === true || user.verifiedStatus === "accomplished",
            isActive: isActive
        };

        // 🛡️ क्रैश से सुरक्षा: जाँचें कि फ़ंक्शन स्क्रिप्ट में मौजूद है या नहीं
        if (typeof subscribeToCommentAuthor === 'function') {
            subscribeToCommentAuthor(userId);
        }

        const isSelected = window.commentSelectedUsers.includes(userId);
        let existingRow = document.getElementById(`share-row-${userId}`);

        if (existingRow) {
            updateDOMForShareUser(userId, liveUser);
        } else {
            const gridItem = document.createElement('div');
            gridItem.id = `share-row-${userId}`;
            gridItem.className = `share-grid-item comment-author-${userId} fade-in`;
            gridItem.style.cssText = "display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; cursor: pointer; padding: 8px 4px; box-sizing: border-box;";
            
            gridItem.onclick = () => window.toggleShareUserSelection(userId, gridItem);

            gridItem.innerHTML = `
                <div class="share-avatar-wrapper" style="position: relative; width: 64px; height: 64px; flex-shrink: 0; margin-bottom: 8px; display: inline-block;">
                    <img class="share-grid-avatar" src="${liveUser.avatar}" 
                             style="width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2.5px solid ${isSelected ? 'var(--primary, #ff006e)' : 'transparent'}; padding: ${isSelected ? '2px' : '0'}; box-shadow: ${isSelected ? '0 4px 12px rgba(255, 0, 110, 0.25)' : 'none'}; transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); background: #f1f5f9;">
                    
                    ${liveUser.isActive ? `
                    <div class="share-status-dot" style="position: absolute; bottom: 1px; right: 1px; width: 13px; height: 13px; background: #00b894; border: 2.5px solid #ffffff; border-radius: 50%; box-shadow: 0 0 6px rgba(0, 184, 148, 0.4); z-index: 5;"></div>
                    ` : ''}

                    <div class="share-grid-check" style="position: absolute; top: -2px; right: -2px; width: 20px; height: 20px; border-radius: 50%; background: var(--primary-grad, linear-gradient(45deg, #ff006e, #ff8e53)); border: 2px solid #ffffff; display: ${isSelected ? 'flex' : 'none'}; align-items: center; justify-content: center; z-index: 6; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                        <i class="fa-solid fa-check" style="color: white; font-size: 0.65rem;"></i>
                    </div>
                </div>
                
                <span class="share-grid-name" style="font-weight: 700; color: #1e293b; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 90px; line-height: 1.2; display: block;">
                    ${liveUser.name}
                </span>
                <div style="display: flex; align-items: center; justify-content: center; gap: 2px; width: 100%; height: 14px; overflow: hidden; margin-top: 2px;">
                    <span class="share-grid-handle" style="font-size: 0.72rem; color: #64748b; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px; line-height: 1; display: inline-block;">
                        ${liveUser.username}
                    </span>
                    <span class="share-grid-badge-container" style="display: inline-flex; align-items: center; height: 12px; margin-bottom: 2px;">
                        ${liveUser.isVerified ? ROSE_GOLD_TICK_SVG : ''}
                    </span>
                </div>
            `;
            usersWrapper.appendChild(gridItem);
        }
    });

    Array.from(usersWrapper.children).forEach(child => {
        const childId = child.id?.replace("share-row-", "");
        if (childId && childId !== 'share-bottom-loader' && !currentUids.has(childId)) {
            child.remove();
        }
    });
};

window.openShareModal = async (itemId, itemType, itemMeta = {}) => {
    // 🌟 पैरामीटर सैनिटाइज़र: script.js और नए फ़ॉर्मेट के बीच तालमेल बिठाने के लिए
    let normalizedType = itemType;
    if (itemType === 'video') normalizedType = 'reel';
    if (itemType === 'image') normalizedType = 'post';

    // 🌟 सुरक्षा फ़ेच (Dynamic Firestore Auto-Fetch): यदि मेटाडेटा अधूरा है, तो फ़ायरस्टोर से लाइव डेटा लाएँ
    let mediaUrl = itemMeta.url || itemMeta.sharedContentUrl || itemMeta.mediaUrl || "";
    let mediaType = itemMeta.type || itemMeta.sharedContentType || (normalizedType === 'reel' ? 'video' : 'image');
    let ownerId = itemMeta.ownerId || itemMeta.sharedContentOwnerId || itemMeta.userId || "";
    let ownerName = itemMeta.ownerName || itemMeta.sharedContentOwnerName || itemMeta.userName || "";
    let ownerPhoto = itemMeta.ownerPhoto || itemMeta.sharedContentOwnerPhoto || itemMeta.userPhoto || "";

    // यदि डेटा अधूरा है, तो फ़ायरस्टोर से पोस्ट/रील का लाइव डेटा फ़ेच करें
    if ((!mediaUrl || !ownerName) && (normalizedType === 'post' || normalizedType === 'reel')) {
        try {
            if (typeof window.getDoc === 'function' && typeof window.doc === 'function') {
                const docSnap = await window.getDoc(window.doc(window.db, "posts", itemId));
                if (docSnap.exists()) {
                    const p = docSnap.data();
                    mediaUrl = p.mediaUrl || "";
                    mediaType = p.mediaType || (normalizedType === 'reel' ? 'video' : 'image');
                    ownerId = p.userId || "";
                    ownerName = p.userName || "User";
                    ownerPhoto = p.userPhoto || "";
                }
            }
        } catch (err) {
            console.error("Error auto-fetching post metadata for share sheet:", err);
        }
    } else if (normalizedType === 'story' && (!mediaUrl || !ownerName)) {
        try {
            if (typeof window.getDoc === 'function' && typeof window.doc === 'function') {
                const docSnap = await window.getDoc(window.doc(window.db, "stories", itemId));
                if (docSnap.exists()) {
                    const s = docSnap.data();
                    mediaUrl = s.mediaUrl || "";
                    mediaType = s.mediaType || 'image';
                    ownerId = s.userId || "";
                    ownerName = s.userName || "User";
                    ownerPhoto = s.userPhoto || "";
                }
            }
        } catch (err) {
            console.error("Error auto-fetching story metadata for share sheet:", err);
        }
    }

    window.activeShareData = { 
        itemId: itemId, 
        itemType: normalizedType, 
        url: mediaUrl,
        type: mediaType,
        ownerId: ownerId,
        ownerName: ownerName,
        ownerPhoto: ownerPhoto
    };
    
    window.commentSelectedUsers = []; 
    
    window.shareUsersLimit = 25;
    window.hasMoreShareUsers = true;
    window.shareUsersLimitLoading = false;

    const sheet = document.getElementById('share-sheet-container');
    const dragIcon = document.getElementById('share-drag-icon');
    const externalChannels = document.getElementById('external-share-channels');

    if (sheet) {
        sheet.style.height = "68dvh";
        sheet.style.borderRadius = "24px 24px 0 0";
    }
    if (dragIcon) {
        dragIcon.className = "fa-solid fa-chevron-up";
    }
    if (externalChannels) {
        externalChannels.style.maxHeight = "80px";
        externalChannels.style.opacity = "1";
        externalChannels.style.pointerEvents = "auto";
        externalChannels.style.marginTop = "5px";
    }

    const searchInput = document.getElementById('share-list-search');
    if (searchInput) searchInput.value = ""; 

    const sendBtn = document.getElementById('btn-send-share');
    if (sendBtn) {
        sendBtn.style.display = 'none';
    }

    window.toggleModal('share-modal', true);

    const shareOptions = document.getElementById('share-options');
    if (shareOptions) {
        shareOptions.style.background = "#ffffff";
        shareOptions.style.borderRadius = "20px 20px 0 0";
        
        shareOptions.innerHTML = `
            <div id="share-loading-state" style="text-align:center; padding:30px;">
                <div class="splash-loader" style="width:30px; height:30px; margin:0 auto; border: 2px solid #ff006e; border-top-color: transparent; border-radius: 50%; animation: fa-spin 1s linear infinite;"></div>
            </div>
            <div id="share-users-wrapper" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px 10px; padding: 20px 15px; background: #ffffff;"></div>
        `;

        shareOptions.onscroll = () => {
            if (window.shareUsersLimitLoading) return;
            if (shareOptions.scrollTop + shareOptions.clientHeight >= shareOptions.scrollHeight - 100) {
                window.loadMoreShareUsers();
            }
        };
    }

    window.updateShareModalList();
};

// ==========================================
// --- 🔍 REAL-TIME SHARE LIST SEARCH SYSTEM ---
// ==========================================
window.handleShareListSearch = () => {
    const searchInput = document.getElementById('share-list-search');
    const usersWrapper = document.getElementById('share-users-wrapper');
    if (!searchInput || !usersWrapper) return;

    const queryText = searchInput.value.toLowerCase().trim();
    const shareOptions = document.getElementById('share-options');

    if (queryText === "") {
        if (shareOptions) {
            shareOptions.onscroll = () => {
                if (window.shareUsersLimitLoading) return;
                if (shareOptions.scrollTop + shareOptions.clientHeight >= shareOptions.scrollHeight - 100) {
                    window.loadMoreShareUsers();
                }
            };
        }
        window.updateShareModalList();
        return;
    }

    if (shareOptions) shareOptions.onscroll = null;

    const followingIds = window.currentUserData?.following || [];
    const followersIds = window.currentUserData?.followers || [];
    const connectedIds = new Set([...followingIds, ...followersIds]);

    const allCached = window.allCachedUsers || [];

    let matchedUsers = allCached.filter(u => {
        const matchesQuery = (u.name || "").toLowerCase().includes(queryText) || 
                             (u.username && u.username.toLowerCase().includes(queryText));
        
        const isConnected = connectedIds.has(u.uid) || 
                            window.fullInboxUsers?.some(fu => fu.uid === u.uid);

        return matchesQuery && isConnected && u.uid !== window.currentUser.uid;
    });

    if (matchedUsers.length === 0) {
        matchedUsers = allCached.filter(u => 
            u.uid !== window.currentUser.uid && (
                (u.name || "").toLowerCase().includes(queryText) || 
                (u.username && u.username.toLowerCase().includes(queryText))
            )
        );
    }

    const bottomLoader = document.getElementById('share-bottom-loader');
    if (bottomLoader) bottomLoader.remove();

    if (matchedUsers.length === 0) {
        usersWrapper.innerHTML = `
            <div id="share-empty-placeholder" style="grid-column: span 3; text-align:center; color:#94a3b8; padding:40px; font-weight:600; font-size:0.9rem;">
                No friends found for "${queryText}"
            </div>`;
        return;
    }

    const placeholder = document.getElementById('share-empty-placeholder');
    if (placeholder) placeholder.remove();

    usersWrapper.innerHTML = "";
    matchedUsers.slice(0, 50).forEach(user => {
        const userId = user.uid;
        const now = Date.now();
        const isActive = (now - (user.lastActive || 0)) < 120000;

        const liveUser = {
            name: user.name || "User",
            username: user.username ? `@${user.username.replace(/^@/, '')}` : `@${user.name.toLowerCase().replace(/\s+/g, '')}`,
            avatar: user.avatarBase64 || user.photoURL || "https://i.pravatar.cc/150",
            isVerified: user.isVerified === true || user.verified === true || user.verifiedStatus === "accomplished",
            isActive: isActive
        };

        const isSelected = window.commentSelectedUsers.includes(userId);
        const gridItem = document.createElement('div');
        gridItem.id = `share-row-${userId}`;
        gridItem.className = `share-grid-item comment-author-${userId} fade-in`;
        gridItem.style.cssText = "display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; cursor: pointer; padding: 8px 4px; box-sizing: border-box;";
        
        gridItem.onclick = () => window.toggleShareUserSelection(userId, gridItem);

        gridItem.innerHTML = `
            <div class="share-avatar-wrapper" style="position: relative; width: 64px; height: 64px; flex-shrink: 0; margin-bottom: 8px; display: inline-block;">
                <img class="share-grid-avatar" src="${liveUser.avatar}" 
                             style="width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2.5px solid ${isSelected ? 'var(--primary, #ff006e)' : 'transparent'}; padding: ${isSelected ? '2px' : '0'}; box-shadow: ${isSelected ? '0 4px 12px rgba(255, 0, 110, 0.25)' : 'none'}; transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); background: #f1f5f9;">
                
                ${liveUser.isActive ? `
                <div class="share-status-dot" style="position: absolute; bottom: 1px; right: 1px; width: 13px; height: 13px; background: #00b894; border: 2.5px solid #ffffff; border-radius: 50%; box-shadow: 0 0 6px rgba(0, 184, 148, 0.4); z-index: 5;"></div>
                ` : ''}

                <div class="share-grid-check" style="position: absolute; top: -2px; right: -2px; width: 20px; height: 20px; border-radius: 50%; background: var(--primary-grad, linear-gradient(45deg, #ff006e, #ff8e53)); border: 2px solid #ffffff; display: ${isSelected ? 'flex' : 'none'}; align-items: center; justify-content: center; z-index: 6; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                    <i class="fa-solid fa-check" style="color: white; font-size: 0.65rem;"></i>
                </div>
            </div>
            
            <span class="share-grid-name" style="font-weight: 700; color: #1e293b; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 90px; line-height: 1.2; display: block;">
                ${liveUser.name}
            </span>
            <div style="display: flex; align-items: center; justify-content: center; gap: 2px; width: 100%; height: 14px; overflow: hidden; margin-top: 2px;">
                <span class="share-grid-handle" style="font-size: 0.72rem; color: #64748b; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px; line-height: 1; display: inline-block;">
                    ${liveUser.username}
                </span>
                <span class="share-grid-badge-container" style="display: inline-flex; align-items: center; height: 12px; margin-bottom: 2px;">
                    ${liveUser.isVerified ? ROSE_GOLD_TICK_SVG : ''}
                </span>
            </div>
        `;
        usersWrapper.appendChild(gridItem);
    });
};

window.toggleShareUserSelection = (userId, gridItem) => {
    if (navigator.vibrate) navigator.vibrate(15);
    
    const avatar = gridItem.querySelector('.share-grid-avatar');
    const checkBadge = gridItem.querySelector('.share-grid-check');
    const sendBtn = document.getElementById('btn-send-share');
    const externalChannels = document.getElementById('external-share-channels');
    const idx = window.commentSelectedUsers.indexOf(userId);

    if (idx > -1) {
        window.commentSelectedUsers.splice(idx, 1);
        if (avatar) {
            avatar.style.border = "2.5px solid transparent";
            avatar.style.padding = "0";
            avatar.style.boxShadow = "none";
        }
        if (checkBadge) checkBadge.style.display = "none";
    } else {
        window.commentSelectedUsers.push(userId);
        if (avatar) {
            avatar.style.border = "2.5px solid var(--primary, #ff006e)";
            avatar.style.padding = "2px";
            avatar.style.boxShadow = "0 4px 12px rgba(255, 0, 110, 0.25)";
        }
        if (checkBadge) checkBadge.style.display = "flex";
    }

    if (window.commentSelectedUsers.length > 0) {
        if (sendBtn) {
            sendBtn.style.display = 'block';
            sendBtn.innerText = `Send to ${window.commentSelectedUsers.length} Friend${window.commentSelectedUsers.length > 1 ? 's' : ''}`;
        }
        if (externalChannels) {
            externalChannels.style.maxHeight = "0px";
            externalChannels.style.opacity = "0";
            externalChannels.style.pointerEvents = "none";
            externalChannels.style.marginTop = "0px";
        }
    } else {
        if (sendBtn) {
            sendBtn.style.display = 'none';
        }
        if (externalChannels) {
            externalChannels.style.maxHeight = "80px";
            externalChannels.style.opacity = "1";
            externalChannels.style.pointerEvents = "auto";
            externalChannels.style.marginTop = "1px";
        }
    }
};

// ======================================================================
// --- 🛡️ BACKEND DUAL-PAYLOAD COMPATIBILITY ENGINE (STABLE RE-SYNC) ---
// ======================================================================
window.sendBatchShare = async () => {
    if (window.commentSelectedUsers.length === 0 || !window.activeShareData) return;

    const sendBtn = document.getElementById('btn-send-share');
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Sending...`;
    }

    const { itemId, itemType, url, type, ownerId, ownerName, ownerPhoto } = window.activeShareData;
    const batch = window.writeBatch(window.db);

    try {
        window.commentSelectedUsers.forEach(targetUid => {
            const ids = [window.currentUser.uid, targetUid].sort();
            const roomId = ids.join("_");
            const messageRef = window.doc(window.collection(window.db, "chats", roomId, "messages"));
            
            // 🌟 लिंक न भेजने का नियम (No HTTP Link Send): पेलोड में कोई बाहरी यूआरएल सेंड नहीं होगा।
            let cleanDescriptor = "";
            if (itemType === 'reel') {
                cleanDescriptor = " Shared a Reel";
            } else if (itemType === 'story') {
                cleanDescriptor = " Shared a Story";
            } else {
                cleanDescriptor = " Shared a Post";
            }

            const sharedData = {
                senderId: window.currentUser.uid,
                receiverId: targetUid,
                seen: false,
                timestamp: window.serverTimestamp(),
                
                // 🌟 HTTP लिंक के बिना साफ़ टेक्स्ट डिस्क्रिप्शन
                text: cleanDescriptor,
                
                // 🌟 Old share.js parameters mapping (For legacy rendering compatibility)
                isSharedContent: true, 
                sharedContentId: itemId,
                sharedContentType: itemType === 'reel' ? 'video' : (itemType === 'story' ? 'story' : 'image'),
                sharedContentUrl: url || "",
                sharedContentOwnerId: ownerId || "",
                sharedContentOwnerName: ownerName || "User",
                sharedContentOwnerPhoto: ownerPhoto || "",

                // 🌟 Modern chats.js payload mapping (Cardboard Visuals)
                isSharedPost: true,
                sharedPostId: itemId,
                sharedPostType: itemType, 
                sharedPostUrl: url || "",
                sharedMediaType: type || (itemType === 'reel' ? 'video' : 'image'),
                sharedOwnerId: ownerId || "",
                sharedOwnerName: ownerName || "",
                sharedOwnerPhoto: ownerPhoto || "",
                sharedLink: "" // 🌟 NO URL LINK ATTACHED
            };

            // रीयल-टाइम अपडेट: आइटम टाइप के आधार पर फ़ायरस्टोर सिंक पैरामीटर्स का सटीक असाइनमेंट
            if (itemType === 'reel') {
                sharedData.isReelShare = true;
                sharedData.sharedReelId = itemId;
                sharedData.sharedReelUrl = url || "";
                sharedData.sharedReelOwnerId = ownerId || "";
                sharedData.sharedReelOwnerName = ownerName || "";
                sharedData.sharedReelOwnerPhoto = ownerPhoto || "";
                
                // Backup fields to ensure standard post cardboard fallback works
                sharedData.isPostShare = true;
                sharedData.sharedPostId = itemId;
                sharedData.sharedPostUrl = url || "";
                sharedData.sharedOwnerId = ownerId || "";
                sharedData.sharedOwnerName = ownerName || "";
                sharedData.sharedOwnerPhoto = ownerPhoto || "";
            } else if (itemType === 'post') {
                sharedData.isPostShare = true;
                sharedData.sharedPostId = itemId;
                sharedData.sharedPostUrl = url || "";
                sharedData.sharedOwnerId = ownerId || "";
                sharedData.sharedOwnerName = ownerName || "";
                sharedData.sharedOwnerPhoto = ownerPhoto || "";
            } else if (itemType === 'story') {
                sharedData.sharedStoryId = itemId;
                sharedData.repliedStoryUrl = url || "";
                sharedData.repliedStoryOwnerId = ownerId || "";
                sharedData.repliedStoryOwnerName = ownerName || "";
                sharedData.repliedStoryOwnerPhoto = ownerPhoto || "";
                
                // Backup mappings for story replies
                sharedData.isStoryReply = true;
                sharedData.repliedStoryId = itemId;
                sharedData.repliedStoryType = type || 'image';
                sharedData.repliedOwnerId = ownerId || "";
                sharedData.repliedOwnerName = ownerName || "";
                sharedData.repliedOwnerPhoto = ownerPhoto || "";
            }

            batch.set(messageRef, sharedData);

            // इनबॉक्स सूची में लास्ट मैसेज अपडेट
            const roomRef = window.doc(window.db, "chats", roomId);
            batch.set(roomRef, {
                users: [window.currentUser.uid, targetUid],
                lastMessage: cleanDescriptor,
                timestamp: window.serverTimestamp()
            }, { merge: true });
        });

        await batch.commit();

        if (navigator.vibrate) navigator.vibrate([30, 30]);
        window.toggleModal('share-modal', false);

        if (typeof window.showToast === 'function') {
            const myPhoto = window.currentUserData?.avatarBase64 || window.currentUser?.photoURL;
            window.showToast("Success", `Shared with ${window.commentSelectedUsers.length} friends`, myPhoto);
        }
    } catch (e) {
        console.error("Batch sharing failed:", e);
        if (typeof window.showToast === 'function') {
            window.showToast("Failed", "Network or permission error", window.currentUser?.photoURL);
        }
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerText = "Send";
        }
        if (window.unsubscribeShareUsers) {
            window.unsubscribeShareUsers();
            window.unsubscribeShareUsers = null;
        }
    }
};

// ==========================================
// --- 🌟 REAL REEL/POST TO STORY SHARING ENGINE ---
// ==========================================
window.handleShareReelToStory = async () => {
    if (!window.currentUser) {
        if (typeof window.showCustomAlert === 'function') window.showCustomAlert("Auth Error", "Please login first to share.", "error");
        return;
    }
    if (!window.activeShareData || !window.activeShareData.itemId) {
        if (typeof window.showCustomAlert === 'function') window.showCustomAlert("Data Error", "No media selected to share.", "warning");
        return;
    }

    const { itemId, itemType, url, type } = window.activeShareData;
    const storyBtn = document.querySelector('#share-quick-actions button');
    let originalBtnHTML = "";
    
    if (storyBtn) {
        originalBtnHTML = storyBtn.innerHTML;
        storyBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Sharing...`;
        storyBtn.disabled = true;
    }

    try {
        const mediaUrl = url;
        const mediaType = type || (itemType === 'reel' ? 'video' : 'image');
        let coverUrl = null;

        // यदि वीडियो है, तो स्टोरी कवर के लिए थंबনেল प्लेसहोल्डर जेनरेट करें
        if (mediaType === 'video' && mediaUrl) {
            coverUrl = mediaUrl.replace(/\.[^/.]+$/, ".jpg");
        }

        const fallbackTimestamp = Date.now();
        const storyData = {
            userId: window.currentUser.uid,
            userName: window.currentUser.displayName || "User",
            userPhoto: window.currentUserData?.avatarBase64 || window.currentUser?.photoURL || "https://i.pravatar.cc/150",
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            coverUrl: coverUrl,
            timestamp: window.serverTimestamp ? window.serverTimestamp() : fallbackTimestamp,
            views: [],
            likes: [],
            musicUrl: null,
            musicStart: 0,
            musicDuration: 15
        };

        await window.addDoc(window.collection(window.db, "stories"), storyData);

        window.toggleModal('share-modal', false);
        if (typeof window.showToast === 'function') {
            window.showToast("Success", "Added to your Story!", window.currentUserData?.avatarBase64 || window.currentUser?.photoURL);
        }
        if (typeof window.loadStories === 'function') window.loadStories();
    } catch (e) {
        console.error("Error sharing to story:", e);
        if (typeof window.showCustomAlert === 'function') window.showCustomAlert("Upload Failed", "Could not share to story.", "error");
    } finally {
        if (storyBtn) {
            storyBtn.innerHTML = originalBtnHTML;
            storyBtn.disabled = false;
        }
    }
};

// ==========================================
// --- 🌟 BRANDED EXTERNAL SHARE INTENTS ---
// ==========================================
window.shareExternalPlatform = (platform) => {
    if (!window.activeShareData) return;
    const { itemId, itemType, type } = window.activeShareData;
    const link = getShareLink(itemId, itemType);
    
    let shareText = APP_SHARE_TEXT;
    if (type === 'video' || itemType === 'reel') {
        shareText = `Hey! Check out this awesome Reel on DK Love Chats: ${link}`;
    } else if (itemType === 'story') {
        shareText = `Hey! Check out this Story on DK Love Chats: ${link}`;
    } else {
        shareText = `Hey! Check out this post on DK Love Chats: ${link}`;
    }
    
    const text = encodeURIComponent(shareText);

    let intentUrl = "";
    if (platform === "whatsapp") {
        intentUrl = `https://api.whatsapp.com/send?text=${text}`;
    } else if (platform === "facebook") {
        intentUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;
    } else if (platform === "instagram") {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(link).then(() => {
                if(typeof window.showToast === 'function') {
                    window.showToast("Copied", "Link copied! Opening Instagram...", window.currentUser?.photoURL, "success");
                }
                setTimeout(() => {
                    window.location.href = "instagram://sharesheet"; 
                }, 800);
            }).catch(() => {
                window.location.href = "https://instagram.com";
            });
        } else {
            window.location.href = "https://instagram.com";
        }
        return;
    }

    if (intentUrl) {
        window.open(intentUrl, "_blank");
    }
};

window.copyCurrentItemLink = () => {
    if (!window.activeShareData) return;
    const { itemId, itemType } = window.activeShareData;
    const link = getShareLink(itemId, itemType);
    
    if (navigator.vibrate) navigator.vibrate(15);
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(() => {
            if (typeof window.showToast === 'function') {
                const label = itemType === 'story' ? 'Story' : (itemType === 'reel' ? 'Reel' : 'Post');
                window.showToast("Copied", `${label} link is ready to share.`, window.currentUser?.photoURL, "success");
            }
        }).catch(() => {
            window.fallbackCopyText(link, "Link copied!");
        });
    } else {
        window.fallbackCopyText(link, "Link copied!");
    }
    window.toggleModal('share-modal', false);
};

// ==========================================
// --- 🌟 APP PROMOTIONAL URL SHARE INTENTS ---
// ==========================================
window.copyAppURL = async () => {
    if (navigator.vibrate) navigator.vibrate(15);
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) { 
            await navigator.clipboard.writeText(APP_SHARE_URL); 
            handleCopySuccess();
        } else {
            throw new Error('Clipboard API unavailable');
        }
    } catch (err) { 
        window.fallbackCopyText(APP_SHARE_URL, "App link copied!"); 
        window.closeAllShare(); 
    }
};

function handleCopySuccess() {
    if (typeof window.showToast === 'function') {
        window.showToast("Link Copied!", "App link is ready to share.", window.currentUserData?.avatarBase64 || window.currentUser?.photoURL, "success");
    }
    if (typeof window.showCustomAlert === 'function') {
        window.showCustomAlert("Success", "App link copied! Now paste it on WhatsApp, Instagram or Telegram to invite friends. 🚀", "success");
    }
    window.closeAllShare(); 
    if (navigator.vibrate) navigator.vibrate([30, 30]);
}

window.shareToPlatform = async (platform) => {
    if (navigator.vibrate) navigator.vibrate(10);
    const fullText = encodeURIComponent(APP_SHARE_TEXT + APP_SHARE_URL);

    switch (platform) {
        case 'whatsapp': 
            window.open(`https://wa.me/?text=${fullText}`, '_blank'); 
            break;
        case 'telegram': 
            window.open(`https://t.me/share/url?url=${APP_SHARE_URL}&text=${encodeURIComponent(APP_SHARE_TEXT)}`, '_blank'); 
            break;
        case 'facebook': 
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(APP_SHARE_URL)}`, '_blank'); 
            break;
        case 'native':
            if (navigator.share) {
                try { 
                    await navigator.share({ title: 'DK Love Chats', text: APP_SHARE_TEXT, url: APP_SHARE_URL }); 
                } catch (e) { 
                    if (e.name !== 'AbortError') window.copyAppURL(); 
                }
            } else {
                window.copyAppURL();
            }
            break;
    }
};

window.openAllShare = () => {
    const modal = document.getElementById('all-share-modal'); 
    if (!modal) return;
    modal.style.display = 'flex';
    requestAnimationFrame(() => { 
        modal.classList.remove('hidden'); 
        modal.classList.add('fade-in'); 
        if (navigator.vibrate) navigator.vibrate(15); 
    });
};

window.closeAllShare = () => {
    const modal = document.getElementById('all-share-modal'); 
    if (!modal) return;
    modal.classList.add('fade-out'); 
    setTimeout(() => { 
        modal.style.display = 'none'; 
        modal.classList.add('hidden'); 
        modal.classList.remove('fade-out'); 
    }, 300);
};

window.shareApp = () => { 
    if (window.innerWidth < 768 && navigator.share) {
        window.shareToPlatform('native'); 
    } else {
        window.openAllShare(); 
    }
};

window.copyLink = (pid) => {
    const finalLink = window.getGenerateShareUrl(pid, 'post', 'image');
    navigator.clipboard.writeText(finalLink);
    if (typeof window.showToast === 'function') {
        window.showToast("Success", "Link copied to clipboard", window.currentUser?.photoURL);
    }
    window.toggleModal('share-modal', false);
};

// ==========================================
// --- 🌟 HEIGHT GESTURE & SIZE TOGGLES ---
// ==========================================
window.toggleShareSheetSize = () => {
    const sheet = document.getElementById('share-sheet-container');
    const dragIcon = document.getElementById('share-drag-icon');
    if (!sheet) return;

    const currentHeight = sheet.style.height;
    if (currentHeight === "100dvh" || currentHeight === "100%") {
        sheet.style.height = "68dvh";
        sheet.style.borderRadius = "24px 24px 0 0";
        if (dragIcon) dragIcon.className = "fa-solid fa-chevron-up";
    } else {
        sheet.style.height = "100dvh";
        sheet.style.borderRadius = "0";
        if (dragIcon) dragIcon.className = "fa-solid fa-chevron-down";
    }
    if (navigator.vibrate) navigator.vibrate(20);
};

window.expandShareSheetToFullScreen = () => {
    const sheet = document.getElementById('share-sheet-container');
    const dragIcon = document.getElementById('share-drag-icon');
    if (sheet) {
        sheet.style.height = "100dvh";
        sheet.style.borderRadius = "0"; 
        if (dragIcon) dragIcon.className = "fa-solid fa-chevron-down";
        if (navigator.vibrate) navigator.vibrate(20);
    }
};

// जेस्चर डिटेक्टर्स (Gesture Detectors)
setTimeout(() => {
    const dragBar = document.getElementById('share-drag-bar');
    const sheet = document.getElementById('share-sheet-container');
    let startY = 0;
    if (dragBar && sheet) {
        dragBar.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
        }, { passive: true });
        
        dragBar.addEventListener('touchmove', (e) => {
            const currentY = e.touches[0].clientY;
            const diff = startY - currentY;
            
            if (diff > 40) { 
                const currentHeight = sheet.style.height;
                if (currentHeight !== "100dvh" && currentHeight !== "100%") {
                    window.expandShareSheetToFullScreen();
                }
            } else if (diff < -40) { 
                const currentHeight = sheet.style.height;
                if (currentHeight === "100dvh" || currentHeight === "100%") {
                    window.toggleShareSheetSize();
                } else {
                    window.toggleModal('share-modal', false);
                }
            }
        }, { passive: true });
    }
}, 1000);

// =========================================================================
// --- 🌟 WRAP TOGGLE MODAL FOR NATIVE-LIKE HALF-SCREEN BOTTOM SHEET TRANSITIONS ---
// =========================================================================
const originalToggleModal = window.toggleModal;
window.toggleModal = (id, show) => {
    if (id === 'share-modal') {
        const modal = document.getElementById('share-modal');
        const sheet = document.getElementById('share-sheet-container');
        if (!modal || !sheet) return;

        if (show) {
            modal.style.display = "flex"; 
            modal.classList.remove('hidden');
            void modal.offsetWidth; // Force reflow
            modal.style.opacity = "1";
            modal.style.pointerEvents = "auto"; 
            sheet.style.transform = "translate3d(0, 0, 0)";
        } else {
            sheet.style.transform = "translate3d(0, 100%, 0)";
            modal.style.opacity = "0";
            modal.style.pointerEvents = "none"; 
            
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.style.display = "none"; 
                if (window.unsubscribeShareUsers) {
                    window.unsubscribeShareUsers();
                    window.unsubscribeShareUsers = null;
                }
            }, 280); 
        }
        return;
    }
    
    if (typeof originalToggleModal === "function") {
        originalToggleModal(id, show);
    }
};

// =========================================================================
// --- 🌟 REAL-TIME CARDBOARD AUTO-UPDATE OBSERVER (ZERO-CONFIGURATION) ---
// =========================================================================
window.cardboardUsersStore = window.cardboardUsersStore || new Map();
window.cardboardUserListeners = window.cardboardUserListeners || new Map();

window.subscribeToCardboardAuthor = (userId) => {
    if (!userId || window.cardboardUserListeners.has(userId)) return;

    const userRef = window.doc(window.db, "users", userId);
    const unsubscribe = window.onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            const userData = docSnap.data();
            window.cardboardUsersStore.set(userId, {
                name: userData.name || "User",
                username: userData.username ? `@${userData.username.replace(/^@/, '')}` : `@${userData.name.toLowerCase().replace(/\s+/g, '')}`,
                avatar: userData.avatarBase64 || userData.photoURL || "https://i.pravatar.cc/150",
                isVerified: userData.isVerified === true || userData.verified === true || userData.verifiedStatus === "accomplished"
            });
            updateDOMForCardboardUser(userId);
        }
    }, (err) => {
        console.warn(`Cardboard live profile sync error for ${userId}:`, err.message);
    });

    window.cardboardUserListeners.set(userId, unsubscribe);
};

function updateDOMForCardboardUser(userId) {
    const liveUser = window.cardboardUsersStore.get(userId);
    if (!liveUser) return;

    // संपूर्ण डॉक्यूमेंट में इस आईडी से जुड़े सभी कार्डबोर्ड खोजें
    const targets = document.querySelectorAll(`[data-cardboard-owner="${userId}"]`);
    targets.forEach(container => {
        // Live DP Update
        const avatarImg = container.querySelector('.shared-owner-avatar, .cardboard-avatar, img');
        if (avatarImg && avatarImg.src !== liveUser.avatar) {
            avatarImg.src = liveUser.avatar;
        }

        // Live Name Update
        const nameEl = container.querySelector('.shared-owner-name, .cardboard-name, b, span');
        if (nameEl && nameEl.innerText !== liveUser.name) {
            nameEl.innerText = liveUser.name;
        }

        // Live Handle Update
        const handleEl = container.querySelector('.shared-owner-handle, .cardboard-handle, small');
        if (handleEl && handleEl.innerText !== liveUser.username) {
            handleEl.innerText = liveUser.username;
        }

        // Live Verified Badge Update
        const badgeEl = container.querySelector('.shared-owner-badge, .cardboard-badge, .comment-badge-container');
        if (badgeEl) {
            const hasBadge = badgeEl.querySelector('svg') !== null;
            if (liveUser.isVerified && !hasBadge) {
                badgeEl.innerHTML = ROSE_GOLD_TICK_SVG;
            } else if (!liveUser.isVerified && hasBadge) {
                badgeEl.innerHTML = '';
            }
        }
    });
}

// नया मैसेज लोड होने पर आटोमैटिक ट्रैक करने के लिए MutationObserver
const cardboardObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const cardboards = node.querySelectorAll('[data-cardboard-owner]');
                cardboards.forEach(cb => {
                    const ownerId = cb.getAttribute('data-cardboard-owner');
                    if (ownerId) window.subscribeToCardboardAuthor(ownerId);
                });
                
                if (node.hasAttribute('data-cardboard-owner')) {
                    const ownerId = node.getAttribute('data-cardboard-owner');
                    if (ownerId) window.subscribeToCardboardAuthor(ownerId);
                }
            }
        });
    });
});

cardboardObserver.observe(document.body, { childList: true, subtree: true });

// फ़ॉल-बैक इनिशियल स्कैन
setTimeout(() => {
    document.querySelectorAll('[data-cardboard-owner]').forEach(cb => {
        const ownerId = cb.getAttribute('data-cardboard-owner');
        if (ownerId) window.subscribeToCardboardAuthor(ownerId);
    });
}, 1500);


// =========================================================================
// --- 🌟 JUMP TO REELS TAB SMART OVERRIDES (NAV STABLE ENGINE) ---
// =========================================================================
window.goToPost = async (postId, type) => {
    const normalizedType = (type || "").toLowerCase().trim();
    // यदि type 'video' या 'reel' है, तो सीधे 'reels' स्क्रीन चुनें
    const tab = (normalizedType === 'video' || normalizedType === 'reel') ? 'reels' : 'home';
    
    console.log(`[Smart-Jump] Navigating to ${tab} for post ${postId} (Type: ${type})`);

    const chatRoom = document.getElementById('chat-room');
    if (chatRoom && chatRoom.classList.contains('active') && typeof currentChatId !== 'undefined' && currentChatId) {
        window.returnToChatData = {
            targetUid: currentChatId.targetUid,
            targetName: document.getElementById('chat-room-title')?.innerText || "Chat",
            placeholder: document.getElementById('chat-header-img')?.src || "",
            isFake: currentChatId.isFake
        };
        window.targetSharedPostId = postId;
        chatRoom.classList.remove('active'); 
        if (typeof window.toggleSharedReturnButton === 'function') window.toggleSharedReturnButton(true);
    }

    window.switchTab(tab, true);

    if (tab === 'reels') {
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
                const postDoc = await window.getDoc(window.doc(window.db, "posts", postId));
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
                    if(typeof window.showToast === 'function') window.showToast("Deleted", "This post is no longer available.", window.currentUser?.photoURL);
                }
            } catch (e) { console.error("Jump to post error:", e); }
        }
    }
};

window.openSharedPost = async (postId) => {
    const chatRoom = document.getElementById('chat-room');
    if (chatRoom && chatRoom.classList.contains('active') && typeof currentChatId !== 'undefined' && currentChatId) {
        window.returnToChatData = {
            targetUid: currentChatId.targetUid,
            targetName: document.getElementById('chat-room-title')?.innerText || "Chat",
            placeholder: document.getElementById('chat-header-img')?.src || "",
            isFake: currentChatId.isFake
        };
        window.targetSharedPostId = postId;
        
        chatRoom.classList.remove('active'); 
        if (typeof window.toggleSharedReturnButton === 'function') window.toggleSharedReturnButton(true); 
    }

    try {
        // 1. Try to fetch from posts collection (for Posts and Reels)
        const postDoc = await window.getDoc(window.doc(window.db, "posts", postId));
        if (postDoc.exists()) {
            const postData = postDoc.data();
            const mediaType = postData.mediaType || 'image'; // 'video' represents reel, 'image' represents post
            if (typeof window.goToPost === 'function') {
                window.goToPost(postId, mediaType);
            }
            return;
        }

        // 2. If not found in posts, try to fetch from stories collection (for Stories)
        const storyDoc = await window.getDoc(window.doc(window.db, "stories", postId));
        if (storyDoc.exists()) {
            const storyData = storyDoc.data();
            const ownerId = storyData.userId;
            if (typeof window.navigateToRepliedStory === 'function') {
                window.navigateToRepliedStory(postId, ownerId);
            } else if (typeof window.showToast === 'function') {
                window.showToast("Opening Story", "Loading active story...", window.currentUser?.photoURL);
            }
            return;
        }

        // 3. Fallback: If item is deleted
        if (typeof window.showToast === 'function') {
            window.showToast("Deleted", "This item has been deleted or expired.", window.currentUser?.photoURL, "error");
        }
    } catch (err) {
        console.error("[openSharedPost] Unified navigation error:", err);
    }
};
