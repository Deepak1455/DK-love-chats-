// ==========================================
// --- SHARE SYSTEM GLOBAL STATE ---
// ==========================================
let sharePayload = null; 
let selectedShareUsers = new Set();
let shareListUids = []; 
let filteredShareListUids = []; 
let currentShareListIndex = 0; 
let isFetchingShareList = false;

// बेस URL को नए डोमेन पर अपडेट किया गया है
const APP_SHARE_URL = "https://deepak1455.github.io/DK-love-chats-/";
const APP_SHARE_TEXT = "Hey! ❤️ Join me on DK Love Chats - A secure and fun way to chat! ❤️ Join here: ";

// ==========================================
// --- SHARE URL GENERATOR HELPER ---
// ==========================================
/**
 * पोस्ट, रील या स्टोरी के लिए सटीक और क्लीन यूआरएल जेनरेट करता है।
 */
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

// ==========================================
// --- CORE UTILITIES ---
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

// ==========================================
// --- OPEN SHARE MODAL ---
// ==========================================
window.openShareModal = async (id, type, dataObj = null) => {
    sharePayload = { id, type, url: dataObj?.url };
    selectedShareUsers.clear(); 
    
    const btn = document.getElementById('btn-send-share');
    if (btn) btn.style.display = 'none';

    if (type === 'post') {
        try {
            if (typeof window.getDoc === 'function' && typeof window.doc === 'function') {
                const docSnap = await window.getDoc(window.doc(window.db, "posts", id));
                if (docSnap.exists()) {
                    const p = docSnap.data();
                    sharePayload.caption = p.caption; 
                    sharePayload.mediaUrl = p.mediaUrl; 
                    sharePayload.mediaType = p.mediaType;
                    sharePayload.ownerName = p.userName; 
                    sharePayload.ownerPhoto = p.userPhoto; 
                    sharePayload.ownerId = p.userId; 
                    sharePayload.postId = id;
                }
            }
        } catch (err) {
            console.error("Error fetching post details for share:", err);
        }
    } else if (type === 'story') {
        sharePayload.caption = "Check out this story!"; 
        sharePayload.mediaType = dataObj?.type || 'image';
        sharePayload.ownerId = dataObj?.ownerId; 
        sharePayload.ownerName = dataObj?.ownerName; 
        sharePayload.ownerPhoto = dataObj?.ownerPhoto;
    }

    const searchInput = document.getElementById('share-list-search');
    if (searchInput) searchInput.value = ""; 

    const options = document.getElementById('share-options');
    if (options) {
        options.innerHTML = '<div class="splash-loader" style="width:30px;height:30px;margin:30px auto;border-width:2px;"></div>';
    }

    let combinedUids = new Set();
    const currentUserData = window.currentUserData || {};
    
    if (currentUserData.interactions) Object.keys(currentUserData.interactions).forEach(uid => combinedUids.add(uid));
    if (currentUserData.following) currentUserData.following.forEach(uid => combinedUids.add(uid));
    if (currentUserData.followers) currentUserData.followers.forEach(uid => combinedUids.add(uid));
    
    const cachedUsers = window.allCachedUsers || [];
    if (combinedUids.size === 0 && cachedUsers.length > 0) {
        cachedUsers.forEach(u => combinedUids.add(u.uid));
    }
    
    if (window.currentUser) {
        combinedUids.delete(window.currentUser.uid); 
    }

    shareListUids = Array.from(combinedUids); 

    const missingUids = shareListUids.filter(uid => !cachedUsers.some(u => u.uid === uid));
    if (missingUids.length > 0 && typeof window.query === 'function') {
        try {
            const chunks = [];
            for (let i = 0; i < missingUids.length; i += 30) {
                chunks.push(missingUids.slice(i, i + 30));
            }
            
            for (const chunk of chunks) {
                const q = window.query(window.collection(window.db, "users"), window.where("uid", "in", chunk));
                const snap = await window.getDocs(q);
                snap.forEach(docSnap => {
                    const uData = { uid: docSnap.id, ...docSnap.data() };
                    if (!cachedUsers.some(u => u.uid === uData.uid)) {
                        cachedUsers.push(uData);
                    }
                });
            }
            window.allCachedUsers = cachedUsers;
        } catch (err) {
            console.error("Error pre-caching share users:", err);
        }
    }

    filteredShareListUids = [...shareListUids]; 
    currentShareListIndex = 0; 
    isFetchingShareList = false;

    window.toggleModal('share-modal', true);
    if (options) {
        options.innerHTML = `<div style="padding:10px; font-weight:800; color:#888; font-size:0.75rem; letter-spacing:1px; margin-bottom: 5px;">SUGGESTED FRIENDS</div>`;
        options.onscroll = () => { 
            if (options.scrollTop + options.clientHeight >= options.scrollHeight - 50) {
                loadMoreShareUsersList(); 
            }
        };
    }
    await loadMoreShareUsersList();
};

// ==========================================
// --- SEARCH SHARE LIST ---
// ==========================================
window.handleShareListSearch = () => {
    const searchInput = document.getElementById('share-list-search');
    const options = document.getElementById('share-options');
    if (!searchInput || !options) return;

    const rawQuery = searchInput.value.toLowerCase().trim();
    const cachedUsers = window.allCachedUsers || [];
    
    if (!rawQuery) {
        filteredShareListUids = [...shareListUids]; 
    } else {
        const cleanQuery = rawQuery.startsWith('@') ? rawQuery.substring(1) : rawQuery;

        filteredShareListUids = shareListUids.filter(uid => {
            const uObj = cachedUsers.find(u => u.uid === uid);
            if (uObj) {
                const nameMatch = uObj.name ? uObj.name.toLowerCase().includes(cleanQuery) : false;
                const usernameMatch = uObj.username ? uObj.username.toLowerCase().includes(cleanQuery) : false;
                return nameMatch || usernameMatch;
            }
            return false;
        });
    }
    
    currentShareListIndex = 0; 
    options.innerHTML = "";
    
    if (filteredShareListUids.length === 0) {
        options.innerHTML = `<div style="text-align:center; padding:40px; color:#aaa;"><i class="fa-solid fa-user-xmark" style="font-size:2rem; margin-bottom:10px; opacity:0.5;"></i><br>No friends found for "${rawQuery}"</div>`;
        return;
    }
    
    loadMoreShareUsersList();
};

// ==========================================
// --- LOAD MORE USERS IN LIST ---
// ==========================================
async function loadMoreShareUsersList() {
    if (isFetchingShareList || currentShareListIndex >= filteredShareListUids.length) return;
    isFetchingShareList = true; 
    
    const options = document.getElementById('share-options');
    if (!options) return;
    
    const loaderId = 'share-loader-' + Date.now();
    options.insertAdjacentHTML('beforeend', `<div id="${loaderId}" style="text-align:center; padding:10px;"><div class="splash-loader" style="width:20px;height:20px;margin:0 auto;border-width:2px;"></div></div>`);
    
    const chunk = filteredShareListUids.slice(currentShareListIndex, currentShareListIndex + 20);
    const cachedUsers = window.allCachedUsers || [];
    const currentUserData = window.currentUserData || {};
    
    try {
        let htmlChunk = "";
        const promises = chunk.map(async (id) => {
            let uData = cachedUsers.find(u => u.uid === id);
            if (!uData && typeof window.getDoc === 'function') { 
                const dSnap = await window.getDoc(window.doc(window.db, "users", id)); 
                if (dSnap.exists()) uData = { uid: id, ...dSnap.data() }; 
            }
            return uData;
        });
        const docs = await Promise.all(promises);
        
        const loaderEl = document.getElementById(loaderId); 
        if (loaderEl) loaderEl.remove(); 
        
        docs.forEach(u => {
            if (u) {
                const userId = u.uid; 
                const avatar = u.avatarBase64 || u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}`;
                const isFollowing = currentUserData.following?.includes(userId);
                const followsMe = currentUserData.followers?.includes(userId);
                
                let followTag = "";
                if (isFollowing && followsMe) {
                    followTag = `<span style="font-size:0.7rem; color:#aaa; border:1px solid rgba(255,255,255,0.2); padding:2px 8px; border-radius:12px; background: rgba(0,0,0,0.3);">Mutual</span>`;
                } else if (isFollowing) {
                    followTag = `<span style="font-size:0.7rem; color:#00b894; border:1px solid rgba(0,184,148,0.3); padding:2px 8px; border-radius:12px; background: rgba(0,184,148,0.1);">Following</span>`;
                } else if (followsMe) {
                    followTag = `<span style="font-size:0.7rem; color:#ffbe0b; border:1px solid rgba(255,190,11,0.3); padding:2px 8px; border-radius:12px; background: rgba(255,190,11,0.1);">Follows you</span>`;
                }

                const isSelected = selectedShareUsers.has(userId);
                const selectedClass = isSelected ? 'share-user-selected' : '';
                const checkIcon = isSelected ? 
                    `<i class="fa-solid fa-circle-check check-icon" style="color: var(--success); font-size: 1.3rem;"></i>` : 
                    `<i class="fa-regular fa-circle check-icon" style="color: #555; font-size: 1.3rem;"></i>`;

                htmlChunk += `
                <div class="share-option ${selectedClass}" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 15px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: 0.2s; border-radius: 12px; margin-bottom: 5px;" onclick="toggleShareUser(this, '${userId}')">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <img src="${avatar}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.1);" loading="lazy">
                        <div>
                            <div style="font-weight:600; color:white; font-size: 0.95rem;">${u.name}</div>
                            <div style="margin-top:5px;">${followTag}</div>
                        </div>
                    </div>
                    <div class="selection-box" style="margin-right: 10px;">${checkIcon}</div>
                </div>`;
            }
        });
        options.insertAdjacentHTML('beforeend', htmlChunk); 
        currentShareListIndex += 20;
    } catch (e) { 
        console.error("Error loading share users:", e); 
    } finally { 
        isFetchingShareList = false; 
    }
}

// ==========================================
// --- TOGGLE USER SELECTION ---
// ==========================================
window.toggleShareUser = (element, uid) => {
    const iconContainer = element.querySelector('.selection-box');
    if (selectedShareUsers.has(uid)) {
        selectedShareUsers.delete(uid); 
        element.classList.remove('share-user-selected');
        if (iconContainer) iconContainer.innerHTML = `<i class="fa-regular fa-circle check-icon" style="color: #555; font-size: 1.3rem;"></i>`;
    } else {
        selectedShareUsers.add(uid); 
        element.classList.add('share-user-selected');
        if (iconContainer) iconContainer.innerHTML = `<i class="fa-solid fa-circle-check check-icon" style="color: var(--success); font-size: 1.3rem;"></i>`;
    }
    
    const btn = document.getElementById('btn-send-share');
    if (btn) {
        if (selectedShareUsers.size > 0) { 
            btn.style.display = 'block'; 
            btn.innerText = `Send (${selectedShareUsers.size})`; 
            btn.style.animation = "slideUp 0.3s ease"; 
        } else {
            btn.style.display = 'none'; 
        }
    }
};

// ==========================================
// --- SEND BATCH SHARE (INBOX) ---
// ==========================================
window.sendBatchShare = async () => {
    if (!sharePayload || selectedShareUsers.size === 0 || !window.currentUser) return;
    if (typeof window.addDoc !== 'function') {
        console.error("Firebase write functions are not fully loaded on window yet.");
        return;
    }
    
    const btn = document.getElementById('btn-send-share'); 
    if (btn) btn.innerText = 'Sending...';
    
    const promises = [];
    const timestamp = Date.now(); 
    let myInteractions = {}; 
    
    selectedShareUsers.forEach(targetUid => {
        const ids = [window.currentUser.uid, targetUid].sort();
        const roomId = ids.join("_");
        
        let textPrefix = 'Shared a post';
        if (sharePayload.type === 'story') textPrefix = 'Shared a story';
        else if (sharePayload.mediaType === 'video') textPrefix = 'Shared a reel';
        
        const caption = sharePayload.caption ? `: ${sharePayload.caption}` : '';
        const msgData = {
            text: `${textPrefix}${caption}`, 
            mediaUrl: sharePayload.mediaUrl || sharePayload.url, 
            mediaType: sharePayload.mediaType,
            senderId: window.currentUser.uid, 
            receiverId: targetUid, 
            seen: false, 
            timestamp: window.serverTimestamp ? window.serverTimestamp() : timestamp
        };
        const ownerPhoto = sharePayload.ownerPhoto || 'https://i.pravatar.cc/150';

        if (sharePayload.type === 'post' && sharePayload.mediaType === 'video') {
            msgData.isReelShare = true; 
            msgData.sharedReelId = sharePayload.postId || sharePayload.id; 
            msgData.sharedReelUrl = sharePayload.mediaUrl;
            msgData.sharedReelOwnerName = sharePayload.ownerName; 
            msgData.sharedReelOwnerPhoto = ownerPhoto; 
            msgData.sharedReelOwnerId = sharePayload.ownerId;
        } else if (sharePayload.type === 'story') {
            msgData.sharedStoryId = sharePayload.id; 
            msgData.sharedOwnerName = sharePayload.ownerName;
            msgData.sharedOwnerPhoto = ownerPhoto; 
            msgData.sharedOwnerId = sharePayload.ownerId;
            msgData.repliedStoryUrl = sharePayload.mediaUrl || sharePayload.url; 
            msgData.repliedStoryType = sharePayload.mediaType || 'image';
        } else {
            msgData.isPostShare = true; 
            msgData.sharedPostId = sharePayload.postId || sharePayload.id; 
            msgData.sharedPostUrl = sharePayload.mediaUrl;
            msgData.sharedOwnerName = sharePayload.ownerName; 
            msgData.sharedOwnerPhoto = ownerPhoto; 
            msgData.sharedOwnerId = sharePayload.ownerId;
        }

        promises.push(window.addDoc(window.collection(window.db, "chats", roomId, "messages"), msgData));
        promises.push(window.setDoc(window.doc(window.db, "users", targetUid), { interactions: { [window.currentUser.uid]: timestamp } }, { merge: true }));
        myInteractions[targetUid] = timestamp;
    });
    
    promises.push(window.setDoc(window.doc(window.db, "users", window.currentUser.uid), { lastActive: timestamp, interactions: myInteractions }, { merge: true }));
    
    try {
        await Promise.all(promises);

        if (sharePayload.type === 'post') {
            const targetId = sharePayload.postId || sharePayload.id;
            const pRef = window.doc(window.db, "posts", targetId); 
            const pSnap = await window.getDoc(pRef);
            if (pSnap.exists()) {
                const newShareCount = (pSnap.data().shareCount || 0) + selectedShareUsers.size;
                await window.updateDoc(pRef, { shareCount: newShareCount });
                
                const reelShareSpan = document.getElementById(`reel-share-count-${targetId}`); 
                if (reelShareSpan) reelShareSpan.innerText = newShareCount;
                const postShareSpan = document.getElementById(`post-share-count-${targetId}`); 
                if (postShareSpan) postShareSpan.innerText = newShareCount;
            }
        }
        
        if (typeof window.showToast === 'function') {
            window.showToast("Sent", `Shared with ${selectedShareUsers.size} users`, window.currentUser.photoURL);
        }
    } catch (err) {
        console.error("Error in batch sharing:", err);
    }
    
    window.toggleModal('share-modal', false);
};

// ==========================================
// --- SHARE REEL/POST TO USER STORY ---
// ==========================================
window.handleShareReelToStory = async () => {
    if (!window.currentUser) {
        if (typeof window.showCustomAlert === 'function') window.showCustomAlert("Auth Error", "Please login first to share.", "error");
        return;
    }
    if (!sharePayload || !sharePayload.id) {
        if (typeof window.showCustomAlert === 'function') window.showCustomAlert("Data Error", "No media selected to share.", "warning");
        return;
    }
    if (typeof window.addDoc !== 'function') {
        console.error("Firebase write functions are not loaded on window.");
        return;
    }

    const quickActionsContainer = document.getElementById('share-quick-actions');
    const storyBtn = quickActionsContainer ? quickActionsContainer.querySelector('button') : null;
    let originalBtnHTML = "";
    
    if (storyBtn) {
        originalBtnHTML = storyBtn.innerHTML;
        storyBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Sharing...`;
        storyBtn.disabled = true;
    }

    try {
        const mediaUrl = sharePayload.mediaUrl || sharePayload.url;
        const mediaType = sharePayload.mediaType || 'image';
        let coverUrl = null;

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
// --- SHARE EXTERNAL PLATFORMS ---
// ==========================================
window.shareExternalPlatform = (platform) => {
    let finalShareUrl = APP_SHARE_URL;
    let shareText = "Hey! ❤️ Join me on DK Love Chats!";

    if (sharePayload && sharePayload.id) {
        finalShareUrl = window.getGenerateShareUrl(sharePayload.id, sharePayload.type, sharePayload.mediaType);
        
        if (sharePayload.mediaType === 'video' || sharePayload.type === 'reel') {
            shareText = `Hey! Check out this awesome Reel on DK Love Chats: ${finalShareUrl}`;
        } else if (sharePayload.type === 'story') {
            shareText = `Hey! Check out this Story on DK Love Chats: ${finalShareUrl}`;
        } else {
            shareText = `Hey! Check out this post on DK Love Chats: ${finalShareUrl}`;
        }
    }
    
    const encodedText = encodeURIComponent(shareText);

    switch (platform) {
        case 'whatsapp':
            window.open(`https://wa.me/?text=${encodedText}`, '_blank');
            break;
        case 'facebook':
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(finalShareUrl)}`, '_blank');
            break;
        case 'instagram':
            window.location.href = "instagram://camera";
            setTimeout(() => {
                if (!document.hidden) window.open("https://instagram.com", '_blank');
            }, 800);
            break;
    }
    window.toggleModal('share-modal', false);
};

// ==========================================
// --- COPY ITEM LINK ---
// ==========================================
window.copyCurrentItemLink = () => {
    let finalShareUrl = APP_SHARE_URL;

    if (sharePayload && sharePayload.id) {
        finalShareUrl = window.getGenerateShareUrl(sharePayload.id, sharePayload.type, sharePayload.mediaType);
    }

    if (navigator.vibrate) navigator.vibrate(15);
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(finalShareUrl).then(() => {
            if (typeof window.showToast === 'function') {
                const label = sharePayload?.type === 'story' ? 'Story' : (sharePayload?.mediaType === 'video' ? 'Reel' : 'Post');
                window.showToast("Link Copied!", `${label} link is ready to share.`, window.currentUserData?.avatarBase64 || window.currentUser?.photoURL, "success");
            }
        }).catch(() => {
            window.fallbackCopyText(finalShareUrl, "Link copied!");
        });
    } else {
        window.fallbackCopyText(finalShareUrl, "Link copied!");
    }
    window.toggleModal('share-modal', false);
};

// ==========================================
// --- APP URL SHARE LOGIC ---
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
