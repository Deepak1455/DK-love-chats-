// ==========================================
// --- FIREBASE IMPORTS FOR CHAT ---
// ==========================================
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, updateDoc, setDoc, getDoc, getDocs, where, writeBatch, limitToLast, collectionGroup } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// ==========================================
// --- CHAT GLOBAL VARIABLES ---
// ==========================================
window.chatDrafts = JSON.parse(localStorage.getItem('loveChats_drafts') || "{}");
window.unreadCounts = window.unreadCounts || {};
window.allCachedUsers = window.allCachedUsers || [];
window.currentChatId = null;
window.currentReplyData = null;
window.pendingUnlockData = null;
window.chatRawFile = null;
window.chatMediaBase64 = null;
window.chatMediaType = 'text';
window.typingTimeout = null;

// फ़्रंटएंड डबल-सबमिशन रोकने के लिए सेंडिंग लॉक स्टेट
window.isMessageSending = false;

let fullInboxUsers = [];     
let displayInboxUsers = [];  
let currentInboxIndex = 0;
let isFetchingInbox = false;

window.unsubscribeChatList = null;
window.unsubscribeUnread = null;
let unsubscribeUserStatus = null;
let unsubscribeTyping = null;
window.unsubscribeChat = null;

let selectedMsgId = null;
let selectedMsgText = null;
let inboxLongPressTimer = null;
let isInboxLongPress = false;
let startTouchY = 0;
let selectedInboxUid = null;
let moodTimeout = null;

// ==========================================
// --- AUTO START CHAT SYSTEM ---
// ==========================================
const auth = getAuth();
onAuthStateChanged(auth, (user) => {
    if (user) {
        const checkBoot = setInterval(() => {
            if (window.db && window.currentUser && window.currentUserData) {
                clearInterval(checkBoot);
                window.startUnreadListener();
                window.loadUserList();
            }
        }, 500);
    } else {
        if (window.unsubscribeChatList) window.unsubscribeChatList();
        if (window.unsubscribeUnread) window.unsubscribeUnread();
    }
});

// ==========================================
// --- UNREAD MESSAGES & NOTIFICATIONS ---
// ==========================================
window.startUnreadListener = () => {
    const currentUser = window.currentUser;
    const db = window.db;
    if (!currentUser || !db) return;
    
    if (window.unsubscribeUnread) window.unsubscribeUnread();
    
    const q = query(collectionGroup(db, "messages"), where("receiverId", "==", currentUser.uid), where("seen", "==", false));

    window.unsubscribeUnread = onSnapshot(q, (snapshot) => {
        window.unreadCounts = {}; 
        const activeTargetUid = window.currentChatId ? window.currentChatId.targetUid : null;

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const sender = data.senderId;
            if (activeTargetUid === sender && (!window.currentChatId || !window.currentChatId.isFake)) return; 
            window.unreadCounts[sender] = (window.unreadCounts[sender] || 0) + 1;
        });

        if (typeof window.updateBottomBadgeLocal === 'function') window.updateBottomBadgeLocal(); 
        if (typeof window.filterChatList === 'function') window.filterChatList(); 
    });
};

window.updateBottomBadgeLocal = () => {
    let total = 0;
    const currentUserData = window.currentUserData || {};
    const lockedChats = currentUserData.lockedChats || [];
    const activeTargetUid = window.currentChatId ? window.currentChatId.targetUid : null;

    Object.entries(window.unreadCounts || {}).forEach(([uid, count]) => {
        if (activeTargetUid === uid) return;
        if (lockedChats.includes(uid)) return;
        total += count;
    });
    
    const bottomBadge = document.getElementById('bottom-msg-badge');
    if(bottomBadge) {
        if(total > 0) { bottomBadge.innerText = total > 99 ? '99+' : total; bottomBadge.style.display = 'flex'; } 
        else bottomBadge.style.display = 'none';
    }
};

// ==========================================
// --- INBOX PAGINATION & RENDER LOGIC ---
// ==========================================
window.loadUserList = async () => {
    const currentUser = window.currentUser;
    const db = window.db;
    const listContainer = document.getElementById('chat-list-container');
    if(!listContainer || !currentUser || !db) return;
    
    if(window.unsubscribeChatList) window.unsubscribeChatList();

    window.unsubscribeChatList = onSnapshot(query(collection(db, "users")), (snapshot) => {
        const currentUserData = window.currentUserData || {};
        window.allCachedUsers = []; 
        fullInboxUsers = []; 

        snapshot.forEach(docSnap => {
            const uData = docSnap.data(); uData.uid = uData.uid || docSnap.id; 
            if(uData && uData.uid && uData.uid !== currentUser.uid) {
                window.allCachedUsers.push(uData); 
                
                const interactions = currentUserData.interactions || {};
                const hasChatted = interactions[uData.uid];
                const hasUnread = (window.unreadCounts || {})[uData.uid] > 0;
                const hasDraft = (window.chatDrafts || {})[uData.uid];
                const isTyping = uData.typingTo === currentUser.uid && (uData.typingExpiry > Date.now());

                if (hasChatted || hasUnread || hasDraft || isTyping) fullInboxUsers.push(uData);
            }
        });
        
        fullInboxUsers.sort((a, b) => {
            const interactions = currentUserData.interactions || {};
            const timeA = interactions[a.uid] || 0;
            const timeB = interactions[b.uid] || 0;
            if (timeB !== timeA) return timeB - timeA; 
            return (b.lastActive || 0) - (a.lastActive || 0); 
        });

        if(typeof window.renderActiveNowBar === 'function') window.renderActiveNowBar(window.allCachedUsers); 
        window.filterChatList();
    });
};

window.filterChatList = () => {
    const queryText = document.getElementById('chat-list-search')?.value.toLowerCase().trim();
    const listContainer = document.getElementById('chat-list-container');
    const allCachedUsers = window.allCachedUsers || [];
    
    if (queryText) {
        displayInboxUsers = allCachedUsers.filter(u => (u.name || "").toLowerCase().includes(queryText) || (u.username || "").toLowerCase().includes(queryText));
    } else { 
        displayInboxUsers = [...fullInboxUsers]; 
    }

    currentInboxIndex = 0; listContainer.innerHTML = ""; 
    
    if(displayInboxUsers.length === 0) {
        if (queryText) listContainer.innerHTML = `<div style="text-align:center; padding:50px; color:#aaa;">No users found</div>`;
        else listContainer.innerHTML = `<div style="text-align:center; padding:50px; color:#aaa;"><i class="fa-regular fa-comments" style="font-size:3rem; margin-bottom:15px; opacity:0.5;"></i><br>No recent messages.<br>Search above to start chatting!</div>`;
        return;
    }
    window.loadMoreInboxUsers();
};

window.loadMoreInboxUsers = () => {
    const currentUser = window.currentUser;
    const currentUserData = window.currentUserData || {};

    if (isFetchingInbox || currentInboxIndex >= displayInboxUsers.length) return;
    
    isFetchingInbox = true; 
    const listContainer = document.getElementById('chat-list-container');
    const loaderId = 'inbox-loader-' + Date.now();
    listContainer.insertAdjacentHTML('beforeend', `<div id="${loaderId}" style="text-align:center; padding:15px;"><div class="splash-loader" style="width:25px;height:25px;margin:0 auto;border-width:2px;border-color:var(--primary);"></div></div>`);
    
    const chunk = displayInboxUsers.slice(currentInboxIndex, currentInboxIndex + 20);
    let htmlChunk = ""; 
    const lockedChats = currentUserData.lockedChats || [];

    chunk.forEach(user => {
        const userId = user.uid, img = user.avatarBase64 || user.photoURL || "https://i.pravatar.cc/150";
        const isLocked = lockedChats.includes(userId), hasDraft = (window.chatDrafts || {})[userId];
        
        let count = (window.unreadCounts || {})[userId] || 0; 
        if (isLocked) count = 0; 
        
        let badgeHtml = "", nameStyle = "color: #000; font-weight: 700;", previewStyle = "color: #64748b; font-weight: 500;";

        if (count > 0) {
            badgeHtml = `<div class="unread-badge">${count > 99 ? '99+' : count}</div>`;
            nameStyle = "color: #000; font-weight: 900;"; previewStyle = "color: var(--primary); font-weight: 800;"; 
        }

        let statusHtml = "";
        const isTypingToMe = user.typingTo === currentUser.uid && (user.typingExpiry > Date.now());

        if (isTypingToMe) statusHtml = `<span class="active-status" style="color: #00b894; font-weight: 900; animation: pulse 1.5s infinite;"><i class="fa-solid fa-pen-clip"></i> typing...</span>`;
        else if (hasDraft) statusHtml = `<span class="active-status" style="color: #ff4757; font-weight: 700;">Draft: ${hasDraft}</span>`; 
        else {
            const isOnline = (Date.now() - user.lastActive) < 120000; 
            statusHtml = isOnline ? `<span class="active-status" style="color: #00b894; font-weight: 800;">Online</span>` : `<span class="active-status" style="color: #94a3b8;">${typeof window.timeAgo === 'function' ? window.timeAgo(user.lastActive) : 'Offline'}</span>`;
        }
        
        const hasStory = window.allGroupedStories && window.allGroupedStories[userId];
        let avatarClass = "user-avatar", avatarClick = `event.stopPropagation(); if(typeof window.viewFullMedia === 'function') window.viewFullMedia('${img}', 'image')`;

        if (hasStory) {
            avatarClass = typeof window.hasUnseenStories === 'function' && window.hasUnseenStories(userId) ? "user-avatar story-active" : "user-avatar story-seen";
            avatarClick = `event.stopPropagation(); if(typeof window.viewStoryGroup === 'function') window.viewStoryGroup('${userId}')`;
        }

        const lockBadgeHtml = isLocked ? `<div class="locked-chat-badge" style="position:absolute; bottom:-2px; left:-2px; background:#ffffff; color:#ff4757; font-size:0.65rem; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid #ff4757; z-index:5; box-shadow: 0 2px 5px rgba(0,0,0,0.1);"><i class="fa-solid fa-lock"></i></div>` : '';
        const safeName = user.name ? user.name.replace(/'/g, "\\'") : "User";

        htmlChunk += `
        <div class="chat-item fade-in" style="background: #ffffff; border-radius: 20px; margin: 10px 15px; border: 1.5px solid #f1f5f9; box-shadow: 0 4px 12px rgba(0,0,0,0.03);"
             onmousedown="window.startInboxPress('${userId}', '${safeName}', event)" onmouseup="window.cancelInboxPress(event)" onmouseleave="window.cancelInboxPress(event)"
             ontouchstart="window.startInboxPress('${userId}', '${safeName}', event)" ontouchend="window.cancelInboxPress(event)" ontouchmove="window.cancelInboxPress(event)"
             onclick="window.handleInboxClick('${userId}', '${safeName}', '${img}', event)">
            <div style="position:relative; width: 55px; height: 55px;">
                <img src="${img}" class="${avatarClass}" style="width:100%; height:100%; border-radius:50%; object-fit:cover; border: 2px solid #f8fafc;" onclick="${avatarClick}" loading="lazy">
                ${lockBadgeHtml}
                ${(Date.now() - user.lastActive) < 120000 ? '<div style="position:absolute; bottom:2px; right:2px; width:14px; height:14px; background:#00b894; border-radius:50%; border:2.5px solid #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"></div>' : ''}
            </div>
            <div style="flex:1; margin-left:15px; display:flex; flex-direction:column; justify-content:center; overflow:hidden;">
                <div style="font-size:1.05rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; ${nameStyle}">${user.name}</div>
                <div style="font-size:0.85rem; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; ${previewStyle}">${statusHtml}</div>
            </div>
            <div class="chat-item-meta" style="min-width: 30px;">${badgeHtml} ${count === 0 ? '<i class="fa-solid fa-chevron-right" style="font-size:0.8rem; color: #cbd5e1; margin-top:5px;"></i>' : ''}</div>
        </div>`;
    });

    const loaderEl = document.getElementById(loaderId); if (loaderEl) loaderEl.remove();
    listContainer.insertAdjacentHTML('beforeend', htmlChunk);
    currentInboxIndex += 20; isFetchingInbox = false;
};

// ==========================================
// --- SETTINGS & CHAT LOCK SYSTEM ---
// ==========================================
window.saveChatPassword = async () => {
    const currentUser = window.currentUser;
    const currentUserData = window.currentUserData;
    const db = window.db;

    const oldPwd = document.getElementById('setting-old-password').value;
    const newPwd = document.getElementById('setting-new-password').value;
    const confirmPwd = document.getElementById('setting-confirm-password').value;

    if (!newPwd || !confirmPwd) return window.showCustomAlert("Missing Info", "Please fill the new password fields.", "warning");
    if (newPwd !== confirmPwd) return window.showCustomAlert("Mismatch", "New passwords do not match!", "error");

    try {
        if (!currentUserData.chatPassword) {
            await updateDoc(doc(db, "users", currentUser.uid), { chatPassword: newPwd });
            currentUserData.chatPassword = newPwd;
            window.showToast("Success", "Password set successfully!", currentUser.photoURL);
        } else {
            if (!oldPwd) return window.showCustomAlert("Required", "Please enter your current password to reset.", "warning");
            if (oldPwd === currentUserData.chatPassword) {
                await updateDoc(doc(db, "users", currentUser.uid), { chatPassword: newPwd });
                currentUserData.chatPassword = newPwd;
                window.showToast("Success", "Real Password Updated successfully.", currentUser.photoURL);
            } else {
                await updateDoc(doc(db, "users", currentUser.uid), { fakeChatPassword: newPwd });
                currentUserData.fakeChatPassword = newPwd;
                window.showToast("Success", "Fake Password Updated successfully.", currentUser.photoURL); 
            }
        }
        window.closeSettingsModal();
    } catch (e) {
        window.showCustomAlert("Error", "Error: " + e.message, "error");
    }
};

window.toggleChatLock = async () => {
    const currentUser = window.currentUser;
    const currentUserData = window.currentUserData;
    const db = window.db;

    if(!window.currentChatId || window.currentChatId.isFake) return; 
    const targetUid = window.currentChatId.targetUid;
    
    if(!currentUserData.chatPassword) {
        window.showCustomAlert("Password Required", "Please set a Chat Password from Profile -> Settings first!", "warning");
        window.openSettingsModal();
        return;
    }

    let lockedChats = currentUserData.lockedChats || [];
    const isLocked = lockedChats.includes(targetUid);
    
    if(isLocked) {
        lockedChats = lockedChats.filter(id => id !== targetUid);
        const lockIcon = document.getElementById('chat-lock-icon');
        if(lockIcon) { lockIcon.className = "fa-solid fa-unlock"; lockIcon.style.color = "#aaa"; }
        window.showToast("Unlocked", "Chat removed from lock", currentUser.photoURL);
    } else {
        lockedChats.push(targetUid);
        const lockIcon = document.getElementById('chat-lock-icon');
        if(lockIcon) { lockIcon.className = "fa-solid fa-lock"; lockIcon.style.color = "var(--danger)"; }
        window.showToast("Locked", "Chat locked securely", currentUser.photoURL);
    }
    
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { lockedChats: lockedChats });
        currentUserData.lockedChats = lockedChats;
        
        window.unreadCounts = window.unreadCounts || {};
        if (window.unreadCounts[targetUid]) {
            delete window.unreadCounts[targetUid];
            window.updateBottomBadgeLocal();
        }
        window.loadUserList(); 
    } catch(e) {}
};

window.startPrivateChat = async (targetUid, targetName, placeholder) => {
    const currentUserData = window.currentUserData || {};
    const lockedChats = currentUserData.lockedChats || [];
    
    if (lockedChats.includes(targetUid)) {
        window.pendingUnlockData = { targetUid, targetName, placeholder };
        const pwdInput = document.getElementById('chat-unlock-password');
        if(pwdInput) pwdInput.value = "";
        window.toggleModal('password-prompt-modal', true);
    } else {
        window.openChatRoom(targetUid, targetName, placeholder, false);
    }
};

window.cancelUnlockChat = () => {
    window.pendingUnlockData = null;
    window.toggleModal('password-prompt-modal', false);
};

window.verifyChatPassword = () => {
    const currentUserData = window.currentUserData || {};
    const inputPwd = document.getElementById('chat-unlock-password').value;
    const realPwd = currentUserData.chatPassword;
    const fakePwd = currentUserData.fakeChatPassword; 

    if (!window.pendingUnlockData) return;
    
    if (inputPwd === realPwd) {
        window.toggleModal('password-prompt-modal', false);
        window.openChatRoom(window.pendingUnlockData.targetUid, window.pendingUnlockData.targetName, window.pendingUnlockData.placeholder, false);
        window.pendingUnlockData = null;
    } 
    else if (fakePwd && inputPwd === fakePwd) {
        window.toggleModal('password-prompt-modal', false);
        window.openChatRoom(window.pendingUnlockData.targetUid, window.pendingUnlockData.targetName, window.pendingUnlockData.placeholder, true);
        window.showToast("Connected", "Chat secured", window.pendingUnlockData.placeholder); 
        window.pendingUnlockData = null;
    } 
    else {
        window.showCustomAlert("Access Denied", "Incorrect Password!", "error");
        document.getElementById('chat-unlock-password').value = ""; 
    }
};

// ==========================================
// --- CHAT DRAFTS, REPLY & TYPING ---
// ==========================================
window.saveDraft = (uid, text) => {
    window.chatDrafts = window.chatDrafts || {};
    if(text && text.trim().length > 0) window.chatDrafts[uid] = text;
    else delete window.chatDrafts[uid];
    localStorage.setItem('loveChats_drafts', JSON.stringify(window.chatDrafts));
    
    const searchVal = document.getElementById('chat-list-search');
    if(searchVal && !searchVal.value) { window.loadUserList(); }
};

window.handleTyping = () => {
    if(!window.currentChatId || !window.currentChatId.roomId) return; 
    
    const currentUser = window.currentUser;
    const db = window.db;
    const text = document.getElementById('msg-input').value;
    
    window.saveDraft(window.currentChatId.targetUid, text);
    
    const chatRef = doc(db, "chats", window.currentChatId.roomId);
    const myUserRef = doc(db, "users", currentUser.uid); 

    if(window.typingTimeout) clearTimeout(window.typingTimeout);
    
    setDoc(chatRef, { typing: { [currentUser.uid]: true } }, { merge: true }).catch(()=>{});
    setDoc(myUserRef, { typingTo: window.currentChatId.targetUid, typingExpiry: Date.now() + 3000 }, { merge: true }).catch(()=>{});

    window.typingTimeout = setTimeout(() => { 
        setDoc(chatRef, { typing: { [currentUser.uid]: false } }, { merge: true }).catch(()=>{}); 
        setDoc(myUserRef, { typingTo: null }, { merge: true }).catch(()=>{}); 
    }, 2000);
};

window.handleChatFileSelect = () => {
    const file = document.getElementById('chat-file-input').files[0]; if(!file) return;
    window.chatRawFile = file;
    window.chatMediaType = file.type.startsWith('video/') ? 'video' : 'image';
    window.chatMediaBase64 = URL.createObjectURL(file); 

    const txt = document.getElementById('chat-file-preview-text');
    if(txt) {
        txt.innerText = `Attach: ${window.chatMediaType}`; 
        txt.style.display = 'block';
    }
};

// 🌟 सुधार: cancelReply फ़ंक्शन को पुनर्स्थापित (restore) किया गया
window.cancelReply = () => {
    window.currentReplyData = null;
    const bar = document.getElementById('reply-preview-bar');
    if(bar) bar.classList.add('hidden');
    const inputArea = document.querySelector('.chat-input-area');
    if(inputArea) inputArea.style.borderRadius = "40px";
};

// ==========================================
// --- CLOUDINARY UPLOAD HELPER ---
// ==========================================
window.currentUploadXHR = null; 
window.uploadFile = function(file, onProgress) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", "love_chats_unsigned");
        formData.append("cloud_name", "dknnmldye");

        const xhr = new XMLHttpRequest();
        window.currentUploadXHR = xhr; 

        xhr.upload.onprogress = function(event) {
            if (event.lengthComputable) {
                const percentComplete = Math.round((event.loaded / event.total) * 100);
                if(typeof onProgress === 'function') onProgress(percentComplete); 
            }
        };

        xhr.onload = function() {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                resolve({ 
                    url: response.secure_url, 
                    type: response.resource_type === 'video' ? 'video' : 'image' 
                }); 
            } else {
                const errorResponse = JSON.parse(xhr.responseText);
                reject(new Error(errorResponse.error?.message || "Upload failed"));
            }
        };

        xhr.onerror = function() { reject(new Error("Network Error!")); };
        xhr.onabort = function() { reject(new Error("Upload Cancelled.")); };

        xhr.open("POST", "https://api.cloudinary.com/v1_1/dknnmldye/auto/upload"); 
        xhr.send(formData);
    });
};

// ==========================================
// --- NAVIGATION: CLICK TO OPEN REEL/POST/STORY ---
// ==========================================
window.openSharedContentFromChat = (type, targetId, ownerId) => {
    const chatRoom = document.getElementById('chat-room');
    if (chatRoom && window.currentChatId) {
        window.returnToChatData = {
            targetUid: window.currentChatId.targetUid,
            targetName: document.getElementById('chat-room-title')?.innerText || "Chat",
            placeholder: document.getElementById('chat-header-img')?.src || "",
            isFake: window.currentChatId.isFake
        };
        window.targetSharedPostId = targetId;
        chatRoom.classList.remove('active'); 
    }

    if (typeof window.toggleSharedReturnButton === 'function') window.toggleSharedReturnButton(true);

    if (type === 'reel') {
        window.forceTopReelId = targetId;
        window.switchTab('reels', false); 
    } else if (type === 'post') {
        window.goToPost(targetId, 'image');
    } else if (type === 'story') {
        window.navigateToRepliedStory(targetId, ownerId);
    }
};

window.formatChatMsgTime = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    let hours = date.getHours(); 
    let minutes = date.getMinutes(); 
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12; hours = hours ? hours : 12; 
    return hours + ':' + (minutes < 10 ? '0' + minutes : minutes) + ' ' + ampm;
};

window.getSeenTimeAgo = (timestamp) => {
    if (!timestamp) return "Seen";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diffSeconds = Math.floor((Date.now() - date) / 1000);
    if (diffSeconds < 60) return "Seen now";
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `Seen ${diffMinutes} min`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Seen ${diffHours} hr`;
    return `Seen ${Math.floor(diffHours / 24)} d`;
};

// ==========================================
// --- CHAT ROOM INITIALIZATION & RENDER ---
// ==========================================
window.openChatRoom = async (targetUid, targetName, placeholder, isFake) => {
    try {
        const chatRoom = document.getElementById('chat-room');
        if(chatRoom) chatRoom.classList.add('active'); 
        
        const titleEl = document.getElementById('chat-room-title');
        const imgEl = document.getElementById('chat-header-img');
        const statusEl = document.getElementById('chat-user-status');
        const msgInputEl = document.getElementById('msg-input');
        const area = document.getElementById('chat-messages-area');

        if (titleEl) titleEl.innerText = targetName;
        if (imgEl) imgEl.src = placeholder;
        if (statusEl) statusEl.innerHTML = '<span style="color:#f59e0b; font-weight:600;"><i class="fa-solid fa-circle-notch fa-spin"></i> Connecting...</span>';

        if (area) {
            area.style.scrollBehavior = 'auto'; 
            area.innerHTML = `<div class="chat-sk-wrapper"><div class="sk-msg-bubble sk-msg-in"></div><div class="sk-msg-bubble sk-msg-out"></div></div><div id="chat-bottom-anchor" style="height: 1px; width: 100%;"></div>`;
            area.scrollTop = area.scrollHeight;
        }

        const currentUser = window.currentUser;
        const db = window.db;
        if (!currentUser || !db) return;

        const currentUserData = window.currentUserData || {};
        const allCachedUsers = window.allCachedUsers || [];

        const ids = [currentUser.uid, targetUid].sort();
        let roomId = ids.join("_");
        if (isFake) roomId = roomId + "_fake_" + currentUser.uid; 
        
        window.currentChatId = { roomId: roomId, targetUid: targetUid, isFake: isFake };
        
        const lockIcon = document.getElementById('chat-lock-icon');
        if(lockIcon) {
            const isLocked = currentUserData.lockedChats?.includes(targetUid);
            lockIcon.className = isLocked ? "fa-solid fa-lock" : "fa-solid fa-unlock";
            lockIcon.style.color = isLocked ? "#ff4757" : "#94a3b8";
        }

        const unreadMsgCount = (window.unreadCounts || {})[targetUid] || 0;
        window.firstUnreadMsgId = null; 
        window.hasScrolledToUnread = false;

        if (window.unreadCounts[targetUid]) {
            delete window.unreadCounts[targetUid];
            window.filterChatList(); 
            window.updateBottomBadgeLocal(); 
        }

        [titleEl, imgEl, statusEl].forEach(el => {
            if(el) { el.style.cursor = 'pointer'; el.onclick = () => window.openChatProfile(); }
        });
        
        if (msgInputEl) {
            let drafts = {};
            try { drafts = JSON.parse(localStorage.getItem('loveChats_drafts') || "{}"); } catch(e){}
            msgInputEl.value = drafts[targetUid] || "";
            msgInputEl.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.handleSendMsg(); }
            };
        }

        let alertBanner = document.getElementById('chat-new-msg-alert');
        if (!alertBanner && chatRoom) {
            alertBanner = document.createElement('div');
            alertBanner.id = 'chat-new-msg-alert';
            alertBanner.style.cssText = `
                position: absolute; top: 75px; left: 50%; transform: translateX(-50%) translateY(-50px);
                background: rgba(0, 0, 0, 0.75); color: #fff; padding: 6px 18px; border-radius: 20px;
                font-size: 0.8rem; font-weight: 700; z-index: 1000; opacity: 0;
                transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); pointer-events: none;
                box-shadow: 0 4px 10px rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1);
            `;
            chatRoom.appendChild(alertBanner);
        }

        let scrollBtn = document.getElementById('chat-scroll-to-bottom-btn');
        if (!scrollBtn && chatRoom) {
            scrollBtn = document.createElement('div');
            scrollBtn.id = 'chat-scroll-to-bottom-btn';
            scrollBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
            scrollBtn.style.cssText = `
                position: absolute; bottom: 80px; right: 20px; width: 40px; height: 40px;
                background: var(--primary, #00b894); color: white; border-radius: 50%;
                display: none; align-items: center; justify-content: center;
                box-shadow: 0 4px 10px rgba(0,0,0,0.2); cursor: pointer; z-index: 1000;
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            `;
            chatRoom.appendChild(scrollBtn);
            scrollBtn.onclick = () => {
                if (area) area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
                scrollBtn.style.background = 'var(--primary, #00b894)';
            };
        }

        try {
            const u = await getDoc(doc(db, "users", targetUid));
            if(imgEl) imgEl.src = u.exists() ? (u.data().avatarBase64 || u.data().photoURL) : placeholder;
        } catch(e) { if(imgEl) imgEl.src = placeholder; }

        if(window.unsubscribeUserStatus) window.unsubscribeUserStatus();
        window.unsubscribeUserStatus = onSnapshot(doc(db, "users", targetUid), (docSnap) => {
            if(!window.currentChatId || window.currentChatId.targetUid !== targetUid) return;
            if(statusEl && docSnap.exists()) {
                const data = docSnap.data();
                const isOnline = (Date.now() - data.lastActive) < 120000;
                statusEl.innerHTML = isOnline ? '<span style="color:#00b894; font-weight:800;">Online</span>' : `<span style="color:#64748b;">${typeof window.timeAgo === 'function' ? window.timeAgo(data.lastActive) : 'Offline'}</span>`;
            }
        });

        if(window.unsubscribeTyping) window.unsubscribeTyping();
        window.unsubscribeTyping = onSnapshot(doc(db, "chats", roomId), (docSnap) => {
            if(!window.currentChatId || window.currentChatId.roomId !== roomId) return;
            const typingEl = document.getElementById('chat-room-typing');
            if(typingEl && docSnap.exists()) {
                const isTyping = docSnap.data().typing?.[targetUid];
                typingEl.style.display = isTyping ? 'block' : 'none';
            }
        });

        if(!isFake) {
            const qSeen = query(collection(db, "chats", roomId, "messages"), where("senderId", "==", targetUid), where("seen", "==", false));
            getDocs(qSeen).then(snap => {
                if(!snap.empty) {
                    const batch = writeBatch(db);
                    snap.forEach(d => batch.update(d.ref, { seen: true, seenAt: serverTimestamp() }));
                    batch.commit().catch(()=>{});
                }
            }).catch(()=>{});
        }

        window.chatMsgLimit = 50;
        window.isFetchingHistory = false;
        window.isChatJustOpened = true;
        if(window.chatOpenScrollTimer) clearTimeout(window.chatOpenScrollTimer);
        window.chatOpenScrollTimer = setTimeout(() => { window.isChatJustOpened = false; }, 1000); 

        if (window.chatResizeObserver) window.chatResizeObserver.disconnect();
        window.chatResizeObserver = new ResizeObserver(() => {
            if (!area || window.isFetchingHistory) return;
            if (window.isChatJustOpened && !window.firstUnreadMsgId) {
                area.style.scrollBehavior = 'auto'; 
                area.scrollTop = area.scrollHeight;
            } else if (!window.isChatJustOpened) {
                const isUserNearBottom = (area.scrollHeight - area.scrollTop - area.clientHeight) <= 300;
                if (isUserNearBottom) area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
            }
        });
        if(area) window.chatResizeObserver.observe(area);

        const loadMessagesWithLimit = () => {
            const q = query(collection(db, "chats", roomId, "messages"), orderBy("timestamp", "asc"), limitToLast(window.chatMsgLimit));
            if(window.unsubscribeChat) window.unsubscribeChat();
            
            let isFirstLoad = true;

            window.unsubscribeChat = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
                if (!window.currentChatId || window.currentChatId.roomId !== roomId) return;
                if(!area) return;
                
                let oldScrollHeight = area.scrollHeight;
                let oldScrollTop = area.scrollTop;
                let isUserNearBottom = (area.scrollHeight - area.scrollTop - area.clientHeight) <= 400; 
                
                let didISendNewMessage = false;
                let didIReceiveNewMessage = false;

                if (isFirstLoad && !window.isFetchingHistory) { area.innerHTML = ""; }

                snapshot.docChanges().forEach((change) => {
                    const msg = change.doc.data();
                    const id = change.doc.id;

                    if (change.type === "added" || change.type === "modified") {
                        const isMe = msg.senderId === currentUser.uid;
                        const alreadyExists = document.getElementById(`wrapper-${id}`);
                        const isDeleted = msg.deleted || msg.text === "🚫 Message deleted";
                        
                        if (change.type === "added") {
                            if (isMe) {
                                if (!alreadyExists) didISendNewMessage = true; 
                            } else {
                                const msgTime = msg.timestamp?.toMillis ? msg.timestamp.toMillis() : Date.now();
                                if (Date.now() - msgTime < 10000 && !alreadyExists) didIReceiveNewMessage = true;
                            }
                        }

                        if (!isMe && msg.seen === false && unreadMsgCount > 0 && !window.firstUnreadMsgId && change.type === "added") {
                            window.firstUnreadMsgId = id;
                            const unreadDivider = document.createElement('div');
                            unreadDivider.className = 'chat-date-divider unread-divider-mark';
                            unreadDivider.style.cssText = "display:flex; align-items:center; justify-content:center; margin: 15px 0;";
                            unreadDivider.innerHTML = `<div style="flex:1; height:1px; background: rgba(255, 71, 87, 0.3);"></div><span style="background: #ff4757; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.7rem; font-weight: 800; margin: 0 10px;">${unreadMsgCount} UNREAD</span><div style="flex:1; height:1px; background: rgba(255, 71, 87, 0.3);"></div>`;
                            area.appendChild(unreadDivider);
                        }
                        
                        let wrapperDiv = alreadyExists;
                        let isNewElement = false;

                        if (!wrapperDiv) { 
                            wrapperDiv = document.createElement('div'); 
                            wrapperDiv.id = `wrapper-${id}`; 
                            wrapperDiv.className = `msg-wrapper ${isMe ? 'out' : 'in'}`;
                            isNewElement = true; 
                        }
                        
                        const existingTs = wrapperDiv.getAttribute('data-timestamp');
                        const tsMillis = msg.timestamp?.toMillis ? msg.timestamp.toMillis() : (existingTs ? parseInt(existingTs) : Date.now());
                        wrapperDiv.setAttribute('data-timestamp', tsMillis);

                        let reactionsHtml = "";
                        if (msg.reactions && !isDeleted) {
                            const totalCount = Object.keys(msg.reactions).length;
                            const grouped = {}; 
                            Object.entries(msg.reactions).forEach(([uid, emoji]) => { 
                                if (!grouped[emoji]) grouped[emoji] = []; 
                                grouped[emoji].push(uid); 
                            });
                            const entries = Object.entries(grouped);
                            if (entries.length > 0) {
                                reactionsHtml = `<div class="msg-reactions-wrapper">`;
                                entries.forEach(([emoji, uids]) => {
                                    reactionsHtml += `<div class="reaction-item-clean"><span class="reaction-emoji-only">${emoji}</span>${uids.length > 1 ? `<span class="reaction-count-num">${uids.length}</span>` : ''}</div>`;
                                });
                                reactionsHtml += `</div>`;
                            }
                        }

                        let replyHeaderHtml = "";
                        let replyCardHtml = "";
                        if (msg.replyToId && !isDeleted) {
                            let myLiveDP = currentUserData?.avatarBase64 || currentUser?.photoURL;
                            let displayDP = isMe ? myLiveDP : (msg.repliedOwnerPhoto || msg.repliedByPhoto);
                            if (!displayDP) {
                                const repliedUser = allCachedUsers.find(u => u.uid === msg.replyToId);
                                displayDP = repliedUser ? (repliedUser.avatarBase64 || repliedUser.photoURL) : 'https://i.pravatar.cc/150';
                            }
                            let labelText = isMe ? "You replied" : `${(msg.repliedOwnerName || msg.replyToName).split(' ')[0]} replied`;
                            replyHeaderHtml = `<div class="reply-external-header fade-in-up" style="display:flex; align-items:center; gap:6px; margin-bottom:4px; padding:0 8px;"><img src="${displayDP}" style="width:18px; height:18px; border-radius:50%; border:1.2px solid var(--primary); object-fit:cover;" loading="lazy"><span style="font-size:0.68rem; font-weight:800; color:#777;">${labelText}</span></div>`;
                            let mediaThumbHtml = msg.replyMediaUrl ? `<img src="${msg.replyMediaUrl}" class="reply-card-media-thumb" style="width:100%; height:120px; object-fit:cover; border-radius:8px; margin-bottom:6px;" loading="lazy">` : "";
                            replyCardHtml = `<div class="reply-card-board reply-pop-effect" style="width: fit-content; max-width: 250px; min-width: 100px; height: auto; padding: 10px 14px; background: #f1f5f9 !important; border-radius: 18px; margin-bottom: -5px; display: flex; flex-direction: column;" onclick="window.scrollToMessage('${msg.replyToId}')"><div class="reply-card-content-area" style="background: transparent; position: relative;">${mediaThumbHtml}<div class="reply-card-body" style="position: static; background: transparent; color: #1e293b !important; font-size: 0.85rem; font-weight: 700; line-height: 1.3; padding: 0; display: block; overflow: hidden; text-overflow: ellipsis;">${msg.replyToText || ""}</div></div></div>`;
                        }

                        let cardHtml = "";
                        let textHtml = "";

                        if (isDeleted) {
                            textHtml = `<div class="msg-deleted-text"><i class="fa-solid fa-ban"></i> Message deleted</div>`;
                        } else {
                            const isShare = msg.isReelShare || msg.isPostShare || msg.sharedStoryId || msg.isStoryReply;
                            if (isShare) {
                                let typeLabel = msg.isReelShare ? "Reel" : (msg.sharedStoryId ? "Story" : "Post");
                                let icon = msg.isReelShare ? "fa-clapperboard" : (msg.sharedStoryId ? "fa-paper-plane" : "fa-image");
                                let actionText = msg.isReelShare ? "Watch Reel" : (msg.sharedStoryId ? "View Story" : "View Photo");
                                let mediaUrl = msg.sharedPostUrl || msg.sharedReelUrl || msg.repliedStoryUrl;
                                let ownerName = msg.sharedOwnerName || msg.sharedReelOwnerName || msg.repliedStoryOwnerName || "User";
                                let ownerPhoto = msg.sharedOwnerPhoto || msg.sharedReelOwnerPhoto || msg.repliedStoryOwnerPhoto || 'https://i.pravatar.cc/150';
                                let typeStr = msg.isReelShare ? 'reel' : (msg.sharedStoryId ? 'story' : 'post');
                                let targetId = msg.sharedPostId || msg.sharedReelId || msg.repliedStoryId;
                                let ownerId = msg.repliedStoryOwnerId || msg.sharedOwnerId || msg.sharedReelOwnerId;
                                const navAction = `window.openSharedContentFromChat('${typeStr}', '${targetId}', '${ownerId}')`;
                                
                                cardHtml = `<div class="chat-shared-standalone-card reply-pop-effect" onclick="${navAction}"><div class="shared-card-header"><img src="${ownerPhoto}" class="shared-card-dp" loading="lazy"><div class="shared-card-user-info"><span class="shared-card-name">${ownerName}</span><span class="shared-card-type"><i class="fa-solid ${icon}"></i> ${typeLabel}</span></div></div><div class="shared-card-body" style="aspect-ratio: 16/9; background: #e2e8f0; overflow: hidden; border-radius: 12px;"><img src="${mediaUrl?.replace(/\.[^/.]+$/, ".jpg")}" class="shared-card-img" style="width:100%; height:100%; object-fit:cover;" loading="lazy">${msg.isReelShare ? '<div class="shared-play-btn"><i class="fa-solid fa-play"></i></div>' : ''}</div><div class="shared-card-footer"><span>${actionText}</span><i class="fa-solid fa-chevron-right"></i></div></div>`;
                            }
                            
                            if (msg.mediaUrl && !isShare) {
                                if (msg.mediaType === 'video') { 
                                    cardHtml = `<div class="chat-vid-box" style="aspect-ratio: 4/3; background: #e2e8f0; border-radius: 16px; overflow:hidden;" onclick="window.viewFullMedia('${msg.mediaUrl}', 'video')"><img src="${msg.mediaUrl.replace(/\.[^/.]+$/, ".jpg")}" class="chat-media-preview" style="width:100%; height:100%; object-fit:cover;" loading="lazy"><i class="fa-solid fa-circle-play"></i></div>`; 
                                } else if (msg.mediaType === 'audio') { 
                                    cardHtml = `
                                    <div class="insta-audio-player">
                                        <audio id="audio-${id}" data-duration="${msg.duration || 0}" src="${msg.mediaUrl}" ontimeupdate="window.updateAudioProgress('${id}')" onended="window.resetAudio('${id}')"></audio>
                                        <div class="audio-play-btn" onclick="window.toggleAudioPlay('${id}')">
                                            <i id="play-icon-${id}" class="fa-solid fa-play"></i>
                                        </div>
                                        <div class="audio-waveform-container">
                                            <div class="audio-waveform-progress" id="progress-${id}" onclick="window.seekAudioWaveform('${id}', event)">
                                                ${window.generateWaveformHTML()}
                                            </div>
                                            <div class="audio-timer-display" id="timer-${id}">0:00</div>
                                        </div>
                                        <div class="audio-speed-btn" id="speed-${id}" onclick="window.changeAudioSpeed('${id}')">1x</div>
                                    </div>`; 
                                } else { 
                                    cardHtml = `<div style="max-width: 250px; aspect-ratio: 1; background: #e2e8f0; border-radius: 16px; overflow: hidden;"><img src="${msg.mediaUrl}" class="chat-media-preview" style="width:100%; height:100%; object-fit:cover;" loading="lazy" onclick="window.viewFullMedia('${msg.mediaUrl}', 'image')"></div>`; 
                                }
                            }
                            if (msg.text) { textHtml = `<div class="real-text-msg">${msg.text}</div>`; }
                        }
                        
                        const isPending = change.doc.metadata.hasPendingWrites && !msg.timestamp;
                        let timeStr = isPending ? `<span style="color:#94a3b8;">Sending... <i class="fa-solid fa-circle-notch fa-spin" style="font-size:0.7rem; margin-left:2px;"></i></span>` : window.formatChatMsgTime(msg.timestamp || { toDate: () => new Date() });
                        
                        let seenHtml = "";
                        if (isMe && msg.seen && !isDeleted && !isFake && !isPending) {
                            const seenAtTimestamp = msg.seenAt?.toMillis ? msg.seenAt.toMillis() : Date.now();
                            seenHtml = `<span class="seen-label" data-time="${seenAtTimestamp}"> • ${window.getSeenTimeAgo(msg.seenAt)}</span>`;
                        }

                        if (isNewElement) {
                            wrapperDiv.innerHTML = `
                                <div class="swipe-reply-icon"><i class="fa-solid fa-reply"></i></div>
                                <div class="message-container-unit" style="display:flex; flex-direction:column; ${isMe ? 'align-items:flex-end;' : 'align-items:flex-start;'}">
                                    ${replyHeaderHtml}
                                    ${replyCardHtml}
                                    <div id="msg-${id}" class="message ${isMe ? 'msg-out' : 'msg-in'} standalone-mode" style="position:relative;">
                                        ${cardHtml}
                                        ${textHtml}
                                        <div class="reactions-container-target">${reactionsHtml}</div>
                                    </div>
                                    <div class="message-meta-board">
                                        <span class="meta-time">
                                            <span class="time-text-target">${timeStr}</span>
                                            <span class="seen-status-target">${seenHtml}</span>
                                        </span>
                                    </div> 
                                </div>`;

                            let anchor = document.getElementById('chat-bottom-anchor');
                            let referenceEl = anchor;
                            const existingWrappers = Array.from(area.querySelectorAll('.msg-wrapper'));

                            for (let i = 0; i < existingWrappers.length; i++) {
                                const currentTs = parseInt(existingWrappers[i].getAttribute('data-timestamp') || 0);
                                if (currentTs > tsMillis) {
                                    referenceEl = existingWrappers[i];
                                    break;
                                }
                            }
                            area.insertBefore(wrapperDiv, referenceEl);

                            const currentLabel = typeof window.getDateLabel === 'function' ? window.getDateLabel({toDate: () => new Date(tsMillis)}) : "Today";
                            const prevWrapper = wrapperDiv.previousElementSibling;
                            if (prevWrapper && prevWrapper.classList.contains('msg-wrapper')) {
                                const prevTs = parseInt(prevWrapper.getAttribute('data-timestamp') || 0);
                                const prevLabel = typeof window.getDateLabel === 'function' ? window.getDateLabel({toDate: () => new Date(prevTs)}) : "Today";
                                if (currentLabel !== prevLabel) {
                                    const divider = document.createElement('div');
                                    divider.className = 'chat-date-divider';
                                    divider.innerText = currentLabel;
                                    area.insertBefore(divider, wrapperDiv);
                                }
                            }
                        } else {
                            const reactionTarget = wrapperDiv.querySelector('.reactions-container-target');
                            if (reactionTarget && reactionTarget.innerHTML !== reactionsHtml) {
                                reactionTarget.innerHTML = reactionsHtml;
                            }
                            
                            const timeTarget = wrapperDiv.querySelector('.time-text-target');
                            if (timeTarget && timeTarget.innerHTML !== timeStr) {
                                timeTarget.innerHTML = timeStr;
                            }

                            const seenTarget = wrapperDiv.querySelector('.seen-status-target');
                            if (seenTarget && isMe) {
                                seenTarget.innerHTML = seenHtml;
                            }
                        }

                        const msgDiv = document.getElementById(`msg-${id}`);
                        if (msgDiv && isNewElement) {
                            msgDiv.oncontextmenu = (e) => { e.preventDefault(); window.openMsgOptions(id, isMe, msg.text); };
                            msgDiv.ondblclick = (e) => { e.stopPropagation(); window.handleMessageDoubleTap(msgDiv, id); };
                            
                            let touchTimer = null; let lastTap = 0; let startY = 0; let startX = 0;
                            msgDiv.addEventListener('touchstart', (e) => {
                                startX = e.touches[0].clientX; startY = e.touches[0].clientY;
                                touchTimer = setTimeout(() => { window.openMsgOptions(id, isMe, msg.text); }, 500); 
                            }, { passive: true });
                            msgDiv.addEventListener('touchmove', (e) => {
                                if(Math.abs(e.touches[0].clientY - startY) > 10 || Math.abs(e.touches[0].clientX - startX) > 10) clearTimeout(touchTimer);
                            }, { passive: true });
                            msgDiv.addEventListener('touchend', (e) => {
                                clearTimeout(touchTimer);
                                const currentTime = new Date().getTime();
                                const tapLength = currentTime - lastTap;
                                if (tapLength < 300 && tapLength > 0) window.handleMessageDoubleTap(msgDiv, id);
                                lastTap = currentTime;
                            }, { passive: true });
                            
                            if (!isDeleted) {
                                let currentMsgMedia = msg.mediaUrl || msg.sharedPostUrl || msg.sharedReelUrl || msg.repliedStoryUrl || null;
                                window.attachSwipeReplyListener(msgDiv, wrapperDiv, id, isMe ? "You" : targetName, msg.text || "Media Attachment", currentMsgMedia);
                            }
                        }
                    } else if (change.type === "removed") {
                        const wrapperDiv = document.getElementById(`wrapper-${id}`);
                        if (wrapperDiv) wrapperDiv.remove();
                    }
                });

                let anchor = document.getElementById('chat-bottom-anchor');
                if(!anchor) {
                    anchor = document.createElement('div');
                    anchor.id = 'chat-bottom-anchor';
                    anchor.style.height = '1px';
                    anchor.style.width = '100%';
                    area.appendChild(anchor);
                }

                if (isFirstLoad) {
                    if (window.isFetchingHistory) {
                        const heightDiff = area.scrollHeight - oldScrollHeight;
                        area.scrollTop = oldScrollTop + heightDiff; 
                        window.isFetchingHistory = false;
                        const loader = document.getElementById('chat-history-loader');
                        if (loader) loader.remove();
                    } else {
                        area.style.scrollBehavior = 'auto'; 
                        area.scrollTop = area.scrollHeight;
                    }
                    isFirstLoad = false;
                } else {
                    if (didISendNewMessage) area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
                    else if (didIReceiveNewMessage && isUserNearBottom) area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
                    else if (isUserNearBottom) area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
                }
            });
        };
        loadMessagesWithLimit();

        if (area) {
            area.onscroll = () => {
                if (area.scrollTop <= 5 && !window.isFetchingHistory) {
                    const renderedCount = area.querySelectorAll('.msg-wrapper').length;
                    if (renderedCount >= window.chatMsgLimit) {
                        window.isFetchingHistory = true;
                        window.chatMsgLimit += 50; 
                        const loader = document.createElement('div');
                        loader.id = 'chat-history-loader';
                        loader.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color:var(--primary); padding:10px;"></i>`;
                        loader.style.textAlign = 'center';
                        area.prepend(loader);
                        loadMessagesWithLimit(); 
                    }
                }
                const isUserNearBottom = (area.scrollHeight - area.scrollTop - area.clientHeight) <= 300;
                const sBtn = document.getElementById('chat-scroll-to-bottom-btn');
                if (sBtn) {
                    if (isUserNearBottom) { sBtn.style.display = 'none'; sBtn.style.background = 'var(--primary, #00b894)'; } 
                    else { sBtn.style.display = 'flex'; }
                }
            };
        }
    } catch (e) { console.error("Open Chat Room Error: ", e); }
};

setInterval(() => {
    const seenLabels = document.querySelectorAll('.seen-label');
    seenLabels.forEach(label => {
        const rawTime = label.getAttribute('data-time'); 
        if (rawTime) {
            const dateObj = new Date(parseInt(rawTime));
            label.innerText = ` • ${window.getSeenTimeAgo({ toDate: () => dateObj })}`;
        }
    });
}, 10000);

// ==========================================
// --- SENDING TEXT / IMAGES (SMART COUNTER IDs) ---
// ==========================================
window.handleSendMsg = () => {
    const currentUser = window.currentUser;
    const currentUserData = window.currentUserData || {};
    const db = window.db;

    const input = document.getElementById('msg-input'); 
    const text = input.value.trim();
    
    // सुरक्षा लॉक: यदि संदेश भेजने की प्रक्रिया पहले से चल रही है, तो रोकें।
    if (window.isMessageSending) return;
    if(!window.currentChatId || (!text && !window.chatRawFile)) return;
    
    window.isMessageSending = true; // लॉक सक्रिय करें

    const targetRoomId = window.currentChatId.roomId;
    const targetUserId = window.currentChatId.targetUid;
    const isFakeChat = window.currentChatId.isFake;
    
    if(typeof window.playSendSound === 'function') window.playSendSound();
    
    input.value = ""; input.focus(); 
    window.saveDraft(targetUserId, ""); 

    const area = document.getElementById('chat-messages-area');
    if(area) area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
    
    const myPhoto = currentUserData?.avatarBase64 || currentUser?.photoURL;
    const myName = currentUser.displayName;

    const replyPayload = window.currentReplyData ? {
        replyToId: window.currentReplyData.id, 
        replyToName: window.currentReplyData.name, 
        replyToText: window.currentReplyData.text,
        replyMediaUrl: window.currentReplyData.media || null,
        repliedOwnerName: window.currentReplyData.ownerName || null,
        repliedOwnerPhoto: window.currentReplyData.ownerDp || null,
        repliedByPhoto: myPhoto || 'https://i.pravatar.cc/150',
        repliedByName: myName || 'You'
    } : {};

    window.currentReplyData = null;
    window.cancelReply();
    const replyThumb = document.getElementById('reply-preview-img');
    if(replyThumb) replyThumb.style.display = 'none';

    (async () => {
        try {
            let url = null; let type = 'text';
            if(window.chatRawFile) {
                const progressBar = document.getElementById('chat-progress-bar');
                if(progressBar) progressBar.style.width = '5%';
                let blobToUpload = window.chatRawFile;
                if(window.chatMediaType === 'image' && window.chatMediaBase64) {
                     const res = await fetch(window.chatMediaBase64);
                     blobToUpload = await res.blob();
                }
                if(typeof window.uploadFile === 'function') {
                    const uploadData = await window.uploadFile(blobToUpload, (p) => { if(progressBar) progressBar.style.width = p + "%"; });
                    url = uploadData.url; type = uploadData.type;
                }
                window.chatRawFile = null;
                document.getElementById('chat-file-preview-text').style.display = 'none';
                if(progressBar) progressBar.style.width = '0%';
            }

            // 🌟 1. चैट रूम का डेटा प्राप्त करके करंट काउंटर्स पढ़ें (Sequential IDs)
            const roomRef = doc(db, "chats", targetRoomId);
            const roomSnap = await getDoc(roomRef);
            const roomData = roomSnap.exists() ? roomSnap.data() : {};

            let customId = "";
            let updateFields = {
                users: [currentUser.uid, targetUserId],
                lastMessage: text || (url ? `Sent a ${type}` : "Sent a message"),
                timestamp: serverTimestamp()
            };

            // 🌟 2. संदेश के प्रकार (Type) के अनुसार इंक्रीमेंटिंग आईडी तय करें
            if (type === 'video') {
                const currentCount = (roomData.videoCount || 0) + 1;
                customId = `video${currentCount}`;
                updateFields.videoCount = currentCount;
            } else if (type === 'image') {
                const currentCount = (roomData.photoCount || 0) + 1;
                customId = `photo${currentCount}`;
                updateFields.photoCount = currentCount;
            } else { // Standard text messages / audio
                const currentCount = (roomData.messageCount || 0) + 1;
                customId = `message${currentCount}`;
                updateFields.messageCount = currentCount;
            }

            // 🌟 3. सेट-डॉक (setDoc) के ज़रिए कस्टम क्रमबद्ध आईडी पर मैसेज लिखें
            const msgRef = doc(db, "chats", targetRoomId, "messages", customId);
            await setDoc(msgRef, {
                text, 
                mediaUrl: url, 
                mediaType: type, 
                senderId: currentUser.uid, 
                receiverId: targetUserId, 
                seen: false, 
                timestamp: serverTimestamp(), 
                notificationSent: false, 
                ...replyPayload 
            });

            // 🌟 4. रूम के काउंटर और लास्ट मैसेज को अपडेट करें
            await setDoc(roomRef, updateFields, { merge: true });

            updateDoc(doc(db, "users", currentUser.uid), { typingTo: null });

            if(!isFakeChat) {
                const timestamp = Date.now();
                setDoc(doc(db, "users", currentUser.uid), { lastActive: timestamp, interactions: { [targetUserId]: timestamp } }, { merge: true });
                setDoc(doc(db, "users", targetUserId), { interactions: { [currentUser.uid]: timestamp } }, { merge: true });
            }
        } catch(e) { 
            const progressBar = document.getElementById('chat-progress-bar');
            if(progressBar) progressBar.style.width = '0%'; 
            console.error("Message Error:", e);
            input.value = text; // विफलता पर पाठ पुनर्स्थापित करें (Text Restore)
            if(typeof window.showToast === 'function') window.showToast("Error", "Message failed to send.", currentUser?.photoURL);
        } finally {
            window.isMessageSending = false; // लॉक हटा दें
        }
    })(); 
};

// ==========================================
// --- MSG OPTIONS & DELETE ---
// ==========================================
window.openMsgOptions = (msgId, isMe, text) => {
    selectedMsgId = msgId; selectedMsgText = text;
    const modal = document.getElementById('msg-options-modal');
    const deleteOption = document.getElementById('msg-option-delete');
    
    if(isMe) deleteOption.style.display = 'flex'; else deleteOption.style.display = 'none'; 
    modal.style.zIndex = '9999999';
    modal.classList.remove('hidden');
    if(navigator.vibrate) navigator.vibrate(40);
};

window.closeChat = () => { 
    if(window.currentChatId) {
        const inputEl = document.getElementById('msg-input');
        if(inputEl) window.saveDraft(window.currentChatId.targetUid, inputEl.value);
        if(window.db && window.currentUser) {
            updateDoc(doc(window.db, "users", window.currentUser.uid), { typingTo: null }).catch(()=>{});
        }
    }
    if(typeof window.cancelReply === 'function') window.cancelReply(); 
    
    const chatRoom = document.getElementById('chat-room');
    if(chatRoom) chatRoom.classList.remove('active', 'mood-active-romantic', 'mood-active-angry', 'mood-active-sad');
    
    const scrollBtn = document.getElementById('chat-scroll-to-bottom-btn');
    if(scrollBtn) scrollBtn.style.display = 'none';
    
    const alertBanner = document.getElementById('chat-new-msg-alert');
    if(alertBanner) { alertBanner.style.opacity = '0'; alertBanner.style.transform = 'translateX(-50%) translateY(-50px)'; }

    const overlay = document.getElementById('chat-mood-overlay');
    if(overlay) { overlay.className = ''; overlay.innerHTML = ''; }
    
    if(typeof moodTimeout !== 'undefined' && moodTimeout) { clearTimeout(moodTimeout); moodTimeout = null; }

    if(window.chatResizeObserver) { window.chatResizeObserver.disconnect(); window.chatResizeObserver = null; }

    if(window.unsubscribeChat) { window.unsubscribeChat(); window.unsubscribeChat = null; }
    if(unsubscribeUserStatus) { unsubscribeUserStatus(); unsubscribeUserStatus = null; }
    if(unsubscribeTyping) { unsubscribeTyping(); unsubscribeTyping = null; }
    
    const chatMessagesArea = document.getElementById('chat-messages-area');
    if(chatMessagesArea) chatMessagesArea.innerHTML = ""; 

    window.currentChatId = null; 
};

window.closeMsgOptions = () => { document.getElementById('msg-options-modal').classList.add('hidden'); selectedMsgId = null; selectedMsgText = null; };

window.handleDeleteMessage = async () => {
    if(!selectedMsgId || !window.currentChatId) return;
    const msgRef = doc(window.db, "chats", window.currentChatId.roomId, "messages", selectedMsgId);
    try {
        await updateDoc(msgRef, { text: "🚫 Message deleted", mediaUrl: null, mediaType: null, deleted: true });
        if(typeof window.showToast === 'function') window.showToast("Deleted", "You deleted this message", window.currentUser?.photoURL);
    } catch(e) {}
    window.closeMsgOptions();
}; 

window.fallbackCopyText = (text, successMsg) => {
    const textArea = document.createElement("textarea"); textArea.value = text;
    textArea.style.position = "fixed"; textArea.style.left = "-9999px"; textArea.style.top = "0";
    document.body.appendChild(textArea); textArea.focus(); textArea.select();
    try {
        if(document.execCommand('copy') && successMsg) {
            if(typeof window.showToast === 'function') window.showToast("Copied", successMsg, window.currentUser?.photoURL, "success");
        }
    } catch (err) {}
    document.body.removeChild(textArea);
};

window.handleCopyMessage = () => {
    if (!selectedMsgText) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(selectedMsgText).then(() => { 
            if(typeof window.showToast === 'function') window.showToast("Copied", "Text copied to clipboard", window.currentUser?.photoURL, "success"); 
        }).catch(() => window.fallbackCopyText(selectedMsgText, "Text copied to clipboard"));
    } else { window.fallbackCopyText(selectedMsgText, "Text copied to clipboard"); }
    window.closeMsgOptions();
};

// ==========================================
// --- REACTIONS & DOUBLE TAP ---
// ==========================================
window.triggerEmojiExplosion = (emoji, x, y) => {
    const container = document.getElementById('emoji-animation-container');
    if (!container) return;
    if(typeof window.playSendSound === 'function') window.playSendSound();

    const startX = x || window.innerWidth / 2, startY = y || window.innerHeight / 2;

    for (let i = 0; i < 20; i++) {
        const el = document.createElement('div');
        el.innerText = emoji; el.className = 'super-reaction-emoji';
        
        const angle = Math.random() * Math.PI * 2; 
        const velocity = 100 + Math.random() * 250; 
        const destX = Math.cos(angle) * velocity;
        const destY = (Math.sin(angle) * velocity) - 150; 
        
        const rotation = (Math.random() * 720 - 360); 
        const scale = 0.6 + Math.random() * 1.5;

        el.style.left = `${startX}px`; el.style.top = `${startY}px`; el.style.fontSize = `${scale}rem`;
        container.appendChild(el);

        el.animate([
            { transform: 'translate(0, 0) scale(0.5) rotate(0deg)', opacity: 1 },
            { transform: `translate(${destX}px, ${destY}px) scale(${scale}) rotate(${rotation}deg)`, opacity: 0 }
        ], { duration: 800 + Math.random() * 600, easing: 'cubic-bezier(0.25, 1, 0.5, 1)', fill: 'forwards' });

        setTimeout(() => el.remove(), 1500);
    }
};

window.handleReactionSelect = async (emoji) => {
    const currentUser = window.currentUser;
    const db = window.db;

    const msgId = selectedMsgId, chatRoomId = window.currentChatId ? window.currentChatId.roomId : null;
    if (!msgId || !chatRoomId) return;

    window.closeMsgOptions();

    const msgEl = document.getElementById(`msg-${msgId}`); let x, y;
    if(msgEl) { const rect = msgEl.getBoundingClientRect(); x = rect.left + (rect.width / 2); y = rect.top; }

    window.triggerEmojiExplosion(emoji, x, y);
    if(navigator.vibrate) navigator.vibrate(40);

    const msgRef = doc(db, "chats", chatRoomId, "messages", msgId);
    try {
        const docSnap = await getDoc(msgRef);
        if (docSnap.exists()) {
            let currentReactions = docSnap.data().reactions || {};
            const myUid = currentUser.uid;
            if (currentReactions[myUid] === emoji) delete currentReactions[myUid];
            else currentReactions[myUid] = emoji;
            await updateDoc(msgRef, { reactions: currentReactions });
        }
    } catch (e) { console.error("Reaction Error:", e); }
};

window.scrollToMessage = (msgId) => {
    const wrapper = document.getElementById(`wrapper-${msgId}`);
    if (wrapper) {
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        wrapper.classList.remove('reply-target-flash');
        void wrapper.offsetWidth; 
        wrapper.classList.add('reply-target-flash');
        if (navigator.vibrate) navigator.vibrate([40, 30]);
        setTimeout(() => { wrapper.classList.remove('reply-target-flash'); }, 1500);
    } else {
        if(typeof window.showToast === 'function') window.showToast("Not Found", "Message found but hidden in history", window.currentUser?.photoURL);
    }
};

window.handleMessageDoubleTap = async (element, msgId) => {
    const currentUser = window.currentUser;
    const db = window.db;

    const bigHeart = document.createElement('i');
    bigHeart.className = 'fa-solid fa-heart msg-double-tap-heart';
    element.style.position = 'relative';
    element.appendChild(bigHeart);

    if(typeof window.playSendSound === 'function') window.playSendSound();
    if (navigator.vibrate) navigator.vibrate([40, 60, 40]); 

    setTimeout(() => { if(bigHeart) bigHeart.remove(); }, 1000);

    if (!window.currentChatId || !window.currentChatId.roomId) return;
    const msgRef = doc(db, "chats", window.currentChatId.roomId, "messages", msgId);
    try {
        const docSnap = await getDoc(msgRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            const myUid = currentUser.uid;
            let currentReactions = data.reactions || {};
            if (currentReactions[myUid] === '❤️') delete currentReactions[myUid];
            else currentReactions[myUid] = '❤️';
            await updateDoc(msgRef, { reactions: currentReactions });
        }
    } catch (e) { console.error("Double tap update error:", e); }
}; 

// ==========================================
// --- SWIPE TO REPLY ---
// ==========================================
window.activateReplyMode = (msgId, userName, text, mediaUrl = null, ownerName = null, ownerDp = null) => {
    window.currentReplyData = { id: msgId, name: userName, text: text, media: mediaUrl, ownerName: ownerName, ownerDp: ownerDp };
    document.getElementById('reply-to-name').innerText = ownerName || userName;
    document.getElementById('reply-to-text').innerText = text;
    
    const thumbEl = document.getElementById('reply-preview-img');
    if (thumbEl) {
        if (mediaUrl) { thumbEl.src = mediaUrl; thumbEl.style.display = 'block'; } 
        else { thumbEl.style.display = 'none'; }
    }
    const bar = document.getElementById('reply-preview-bar');
    if(bar) bar.classList.remove('hidden');
    document.getElementById('msg-input').focus();
    if(navigator.vibrate) navigator.vibrate(40);
};

window.attachSwipeReplyListener = (messageEl, wrapperEl, msgId, userName, text, currentMsgMedia) => {
    let startX = 0, currentX = 0, isSwiping = false;
    let replyIcon = wrapperEl.querySelector('.swipe-reply-icon');

    messageEl.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        messageEl.classList.remove('snap-back');
    }, { passive: true });

    messageEl.addEventListener('touchmove', (e) => {
        currentX = e.touches[0].clientX;
        const diff = currentX - startX;
        if (diff > 10) {
            isSwiping = true;
            messageEl.style.transform = `translateX(${Math.min(diff, 150)}px)`;
            if (replyIcon) {
                replyIcon.style.opacity = diff > 40 ? 1 : 0;
                replyIcon.style.left = `${Math.min(10, diff - 60)}px`;
            }
        }
    }, { passive: true });

    messageEl.addEventListener('touchend', () => {
        const diff = currentX - startX;
        messageEl.classList.add('snap-back');
        messageEl.style.transform = 'translateX(0)';
        
        if (replyIcon) { replyIcon.style.opacity = 0; replyIcon.style.left = '-40px'; }

        if (isSwiping && diff > 80) {
            const imgEl = messageEl.querySelector('.shared-card-img') || messageEl.querySelector('.chat-media-preview') || messageEl.querySelector('.card-thumb') || messageEl.querySelector('.chat-vid-box img');
            const ownerNameEl = messageEl.querySelector('.shared-card-name');
            const ownerDpEl = messageEl.querySelector('.shared-card-dp');

            const capturedMediaUrl = imgEl ? imgEl.src : currentMsgMedia;
            const capturedOwnerName = ownerNameEl ? ownerNameEl.innerText : null;
            const capturedOwnerDp = ownerDpEl ? ownerDpEl.src : null;

            if(navigator.vibrate) navigator.vibrate(50);
            window.activateReplyMode(msgId, userName, text, capturedMediaUrl, capturedOwnerName, capturedOwnerDp);
        }
        isSwiping = false; startX = 0; currentX = 0;
    });
};

// ==========================================
// --- CHAT PROFILE & MOODS ---
// ==========================================
window.analyzeAndApplyMood = (text, timestamp) => {
    if(!document.getElementById('chat-room').classList.contains('active')) return;
    if(timestamp && timestamp.toDate) { if(Date.now() - timestamp.toDate().getTime() > 5000) return; }
    if(!text) return;

    const moodKeywords = {
        romantic:['love', 'baby', 'sweetheart', 'miss you', 'kiss', 'hug', 'darling', '❤️', '😘', '😍', 'jaan', 'babu', 'pyaar', 'ishq', 'romantic', 'beautiful', 'cute', 'babe', 'shona'],
        angry:['hate', 'angry', 'mad', 'idiot', 'stupid', 'wtf', 'shut up', '😡', '🤬', 'gussa', 'pagal', 'bakwas', 'leave me', 'hell', 'fake', 'liar', 'dhokha'],
        sad:['sad', 'cry', 'tears', 'broken', 'hurt', 'leave', 'alone', '😭', '😢', '💔', 'rona', 'akela', 'dard', 'sadness', 'depressed', 'sorry', 'maaf']
    };

    const lowerText = text.toLowerCase(); let detectedMood = 'default';
    for (const mood in moodKeywords) { if (moodKeywords[mood].some(kw => lowerText.includes(kw))) { detectedMood = mood; break; } }
    if(detectedMood !== 'default') window.applyChatMood(detectedMood);
};

window.applyChatMood = (mood) => {
    const chatRoom = document.getElementById('chat-room'), overlay = document.getElementById('chat-mood-overlay');
    if(!chatRoom || !chatRoom.classList.contains('active') || !overlay) return;

    chatRoom.classList.remove('mood-active-romantic', 'mood-active-angry', 'mood-active-sad'); chatRoom.classList.add(`mood-active-${mood}`);
    overlay.innerHTML = ''; overlay.className = `mood-${mood}`; 

    if(mood === 'romantic') {
        for(let i=0; i<25; i++) { let p = document.createElement('div'); p.className = 'mood-petal'; p.style.left = Math.offSetWidth || Math.random() * 100 + 'vw'; p.style.animationDuration = (Math.random() * 3 + 3) + 's'; p.style.animationDelay = Math.random() * 2 + 's'; overlay.appendChild(p); }
    } else if(mood === 'angry') {
        for(let i=0; i<35; i++) { let e = document.createElement('div'); e.className = 'mood-ember'; e.style.left = Math.random() * 100 + 'vw'; e.style.animationDuration = (Math.random() * 2 + 1) + 's'; e.style.animationDelay = Math.random() * 1 + 's'; overlay.appendChild(e); }
    } else if(mood === 'sad') {
        for(let i=0; i<45; i++) { let d = document.createElement('div'); d.className = 'mood-raindrop'; d.style.left = Math.random() * 100 + 'vw'; d.style.animationDuration = (Math.random() * 0.5 + 0.5) + 's'; d.style.animationDelay = Math.random() * 1 + 's'; overlay.appendChild(d); }
    }

    if(moodTimeout) clearTimeout(moodTimeout);
    moodTimeout = setTimeout(() => { overlay.className = ''; overlay.innerHTML = ''; chatRoom.classList.remove('mood-active-romantic', 'mood-active-angry', 'mood-active-sad'); }, 12000);
};

window.startChatSearch = () => {
    window.closeChatProfile();
    let searchContainer = document.getElementById('chat-in-room-search');
    
    if (!searchContainer) {
        searchContainer = document.createElement('div');
        searchContainer.id = 'chat-in-room-search';
        searchContainer.style.cssText = `
            position: absolute; top: 70px; left: 0; width: 100%; padding: 10px 15px; 
            background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); 
            z-index: 100; display: flex; align-items: center; gap: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.05); transform: translateY(-100%); 
            transition: transform 0.3s ease; opacity: 0; pointer-events: none;
        `;
        searchContainer.innerHTML = `
            <div style="flex:1; position:relative;">
                <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:15px; top:50%; transform:translateY(-50%); color:#94a3b8;"></i>
                <input type="text" id="chat-search-input" placeholder="Search in chat..." oninput="window.performChatSearch(this.value)" 
                       style="width:100%; padding:10px 15px 10px 40px; border-radius:20px; border:1px solid #e2e8f0; background:#f8fafc; font-size:0.95rem; outline:none;">
            </div>
            <i class="fa-solid fa-xmark" style="font-size:1.2rem; color:#64748b; padding:10px; cursor:pointer;" onclick="window.closeChatSearch()"></i>
        `;
        document.getElementById('chat-room').appendChild(searchContainer);
    }
    
    setTimeout(() => {
        searchContainer.style.transform = 'translateY(0)';
        searchContainer.style.opacity = '1';
        searchContainer.style.pointerEvents = 'auto';
        document.getElementById('chat-search-input').focus();
    }, 300);
};

window.performChatSearch = (val) => {
    const text = val.toLowerCase();
    const wrappers = document.querySelectorAll('#chat-messages-area .msg-wrapper');
    wrappers.forEach(w => {
        if (!text) w.style.display = 'flex'; 
        else {
            if (w.innerText.toLowerCase().includes(text)) w.style.display = 'flex';
            else w.style.display = 'none';
        }
    });
};

window.closeChatSearch = () => {
    const searchContainer = document.getElementById('chat-in-room-search');
    const input = document.getElementById('chat-search-input');
    if (searchContainer && input) {
        input.value = ""; window.performChatSearch(""); 
        searchContainer.style.transform = 'translateY(-100%)';
        searchContainer.style.opacity = '0'; searchContainer.style.pointerEvents = 'none';
    }
};

window.toggleMuteChat = async () => {
    if (!window.currentChatId || !window.currentUserData) return;
    const uid = window.currentChatId.targetUid;
    let muted = window.currentUserData.mutedChats || [];
    const isCurrentlyMuted = muted.includes(uid);
    
    if (isCurrentlyMuted) muted = muted.filter(x => x !== uid);
    else muted.push(uid);
    
    window.currentUserData.mutedChats = muted;
    if(navigator.vibrate) navigator.vibrate(40);
    
    try {
        await updateDoc(doc(window.db, "users", window.currentUser.uid), { mutedChats: muted });
        document.getElementById('cp-mute-text').innerText = isCurrentlyMuted ? "Mute" : "Unmuted";
        document.getElementById('cp-mute-icon').className = isCurrentlyMuted ? "fa-solid fa-bell-slash" : "fa-solid fa-bell";
        document.getElementById('cp-mute-icon').style.color = isCurrentlyMuted ? "#475569" : "#00b894";
        if(typeof window.showToast === 'function') window.showToast(isCurrentlyMuted ? "Unmuted" : "Muted", isCurrentlyMuted ? "Chat notifications ON" : "Chat notifications OFF");
    } catch(e) {}
};

window.toggleBlockUser = async () => {
    if (!window.currentChatId || !window.currentUserData) return;
    const uid = window.currentChatId.targetUid;
    const name = document.getElementById('chat-room-title').innerText;
    let blocked = window.currentUserData.blockedUsers || [];
    
    if(confirm(`Are you sure you want to block ${name}? They won't be able to message you.`)) {
        if (!blocked.includes(uid)) blocked.push(uid);
        window.currentUserData.blockedUsers = blocked;
        
        try {
            await updateDoc(doc(window.db, "users", window.currentUser.uid), { blockedUsers: blocked });
            if(typeof window.showToast === 'function') window.showToast("Blocked", `${name} has been blocked.`, window.currentUser.photoURL, "error");
            window.closeChatProfile(); window.closeChat();
            if(typeof window.loadUserList === 'function') window.loadUserList(); 
        } catch(e) {}
    }
};

window.goToUserProfileFromChat = () => {
    if (!window.currentChatId) return;
    const uid = window.currentChatId.targetUid;
    if(navigator.vibrate) navigator.vibrate(30);
    window.closeChatProfile(); window.closeChat();
    setTimeout(() => { if(typeof window.viewUserProfile === 'function') window.viewUserProfile(uid); }, 300);
};

window.viewProfileDP = (src) => {
    const viewer = document.createElement('div');
    viewer.style.cssText = `position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.95); z-index:9999999; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity 0.3s; cursor:pointer;`;
    viewer.innerHTML = `<img src="${src}" style="max-width:90%; max-height:90%; border-radius:15px; transform:scale(0.8); transition:transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);"><i class="fa-solid fa-xmark" style="position:absolute; top:25px; right:25px; color:white; font-size:2rem;"></i>`;
    document.body.appendChild(viewer);
    
    setTimeout(() => { viewer.style.opacity = '1'; viewer.querySelector('img').style.transform = 'scale(1)'; }, 10);
    viewer.onclick = () => { viewer.style.opacity = '0'; viewer.querySelector('img').style.transform = 'scale(0.8)'; setTimeout(() => viewer.remove(), 300); };
};

window.openChatProfile = async () => {
    if (!window.currentChatId) return;
    const roomId = window.currentChatId.roomId;
    const targetUid = window.currentChatId.targetUid;
    const currentUserData = window.currentUserData || {};
    const isMuted = (currentUserData.mutedChats || []).includes(targetUid);
    
    if (!document.getElementById('chat-profile-modal')) {
        const style = document.createElement('style');
        style.innerHTML = `
            .cp-modal-overlay { position:fixed; top:0; left:0; width:100vw; height:100vh; background:#fff; z-index:999999; transform: translateX(100%); transition: transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275); display:flex; flex-direction:column; overflow: hidden; }
            .cp-modal-overlay.active { transform: translateX(0); }
            .cp-header { display:flex; align-items:center; padding:20px; border-bottom:1px solid #f1f5f9; font-size:1.3rem; font-weight:800; gap:20px; background:#fff; z-index: 10; }
            .cp-body { padding:30px 0 0 0; text-align:center; overflow-y:auto; flex:1; background:#f8fafc; }
            #cp-img { width:130px; height:130px; border-radius:50%; object-fit:cover; margin-bottom:15px; border:4px solid #fff; box-shadow:0 4px 15px rgba(0,0,0,0.05); cursor:pointer; transition:transform 0.2s;}
            #cp-img:active { transform: scale(0.95); }
            #cp-name { margin:0; font-size:1.6rem; font-weight:900; color:#1e293b; padding: 0 20px; }
            #cp-status { color:#64748b; margin-top:8px; font-size:0.95rem; font-weight:600; padding: 0 20px; }
            .cp-actions { display:flex; justify-content:space-evenly; margin:30px 10px; padding-bottom:30px; border-bottom:1px solid #e2e8f0; }
            .cp-action-btn { display:flex; flex-direction:column; align-items:center; gap:10px; cursor:pointer; font-size:0.8rem; font-weight:700; color:#475569; width:65px; }
            .cp-action-btn i { font-size:1.3rem; background:#fff; padding:15px; border-radius:50%; width:50px; height:50px; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(0,0,0,0.04); transition: transform 0.2s; }
            .cp-action-btn:active i { transform: scale(0.9); }
            .cp-media-section { text-align:left; background:#fff; height: 100%; border-radius: 20px 20px 0 0; box-shadow:0 -4px 15px rgba(0,0,0,0.03); display: flex; flex-direction: column; }
            .cp-tabs { display: flex; border-bottom: 1px solid #f1f5f9; width: 100%; }
            .cp-tab { flex: 1; text-align: center; padding: 15px 0; font-size: 0.95rem; font-weight: 800; color: #94a3b8; cursor: pointer; transition: all 0.3s; position: relative; }
            .cp-tab.active { color: #1e293b; }
            .cp-tab.active::after { content: ''; position: absolute; bottom: 0; left: 20%; width: 60%; height: 3px; background: var(--primary, #00b894); border-radius: 3px 3px 0 0; }
            .cp-grid-container { padding: 5px; flex: 1; overflow-y: auto; }
            .cp-media-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:4px; }
            .cp-media-item { width:100%; aspect-ratio:1; object-fit:cover; cursor:pointer; background:#f1f5f9; transition: opacity 0.2s; }
            .cp-media-item:active { opacity: 0.7; }
        `;
        document.head.appendChild(style);

        const html = `
            <div id="chat-profile-modal" class="cp-modal-overlay">
                <div class="cp-header"><i class="fa-solid fa-arrow-left" style="cursor:pointer;" onclick="window.closeChatProfile()"></i><span>Details</span></div>
                <div class="cp-body">
                    <img id="cp-img" src="" onclick="window.viewProfileDP(this.src)" />
                    <h2 id="cp-name"></h2><p id="cp-status"></p>
                    <div class="cp-actions">
                        <div class="cp-action-btn" onclick="window.goToUserProfileFromChat()"><i class="fa-regular fa-user" style="color:#3b82f6"></i><span>Profile</span></div>
                        <div class="cp-action-btn" onclick="window.toggleMuteChat()"><i id="cp-mute-icon" class="fa-solid fa-bell-slash"></i><span id="cp-mute-text">Mute</span></div>
                        <div class="cp-action-btn" onclick="window.startChatSearch()"><i class="fa-solid fa-magnifying-glass"></i><span>Search</span></div>
                        <div class="cp-action-btn" style="color:#ff4757" onclick="window.toggleBlockUser()"><i class="fa-solid fa-ban" style="color:#ff4757"></i><span>Block</span></div>
                    </div>
                    <div class="cp-media-section">
                        <div class="cp-tabs"><div id="tab-photos" class="cp-tab active" onclick="window.switchCpTab('photos')">Photos & Posts</div><div id="tab-reels" class="cp-tab" onclick="window.switchCpTab('reels')">Reels & Videos</div></div>
                        <div class="cp-grid-container"><div id="cp-grid-photos" class="cp-media-grid"></div><div id="cp-grid-reels" class="cp-media-grid" style="display:none;"></div></div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    const modal = document.getElementById('chat-profile-modal');
    const nameEl = document.getElementById('cp-name');
    const imgEl = document.getElementById('cp-img');
    const statusEl = document.getElementById('cp-status');
    const gridPhotos = document.getElementById('cp-grid-photos');
    const gridReels = document.getElementById('cp-grid-reels');
    
    document.getElementById('cp-mute-text').innerText = isMuted ? "Unmute" : "Mute";
    document.getElementById('cp-mute-icon').className = isMuted ? "fa-solid fa-bell" : "fa-solid fa-bell-slash";
    document.getElementById('cp-mute-icon').style.color = isMuted ? "#00b894" : "#475569";

    nameEl.innerText = document.getElementById('chat-room-title').innerText || "User";
    imgEl.src = document.getElementById('chat-header-img').src || "https://i.pravatar.cc/150";
    statusEl.innerHTML = document.getElementById('chat-user-status').innerHTML || "Offline";
    window.switchCpTab('photos'); 

    gridPhotos.innerHTML = '<div style="grid-column: span 3; text-align:center; padding: 40px; color: #94a3b8; font-weight:600;"><i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem; margin-bottom:10px;"></i><br>Loading...</div>';
    gridReels.innerHTML = '<div style="grid-column: span 3; text-align:center; padding: 40px; color: #94a3b8; font-weight:600;"><i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem; margin-bottom:10px;"></i><br>Loading...</div>';
    
    if(navigator.vibrate) navigator.vibrate(40);
    modal.classList.add('active');

    try {
        const q = query(collection(window.db, "chats", roomId, "messages"), orderBy("timestamp", "desc"), limitToLast(200));
        const snap = await getDocs(q);
        let photosHtml = "", reelsHtml = "";
        
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const mUrl = data.mediaUrl || data.sharedPostUrl || data.sharedReelUrl || data.repliedStoryUrl;
            
            if (mUrl && data.deleted !== true && data.mediaType !== 'audio') {
                let clickAction = ""; let isReelOrVideo = false;
                if (data.isReelShare) {
                    isReelOrVideo = true; clickAction = `window.closeChatProfile(); setTimeout(() => { window.openSharedContentFromChat('reel', '${data.sharedReelId}', '${data.sharedReelOwnerId}'); }, 300);`;
                } else if (data.isPostShare || data.sharedStoryId) {
                    isReelOrVideo = false;
                    let type = data.isPostShare ? 'post' : 'story';
                    let targetId = data.sharedPostId || data.repliedStoryId;
                    let ownerId = data.sharedOwnerId || data.repliedStoryOwnerId;
                    clickAction = `window.closeChatProfile(); setTimeout(() => { window.openSharedContentFromChat('${type}', '${targetId}', '${ownerId}'); }, 300);`;
                } else {
                    isReelOrVideo = (data.mediaType === 'video');
                    clickAction = `window.viewFullMedia('${mUrl}', '${isReelOrVideo ? 'video' : 'image'}')`;
                }

                const displayUrl = isReelOrVideo ? mUrl.replace(/\.[^/.]+$/, ".jpg") : mUrl; 
                const itemDiv = `<div style="position:relative; width:100%; aspect-ratio:1;"><img src="${displayUrl}" class="cp-media-item" onclick="${clickAction}" loading="lazy">${isReelOrVideo ? '<i class="fa-solid fa-play" style="position:absolute; top:8px; right:8px; color:white; font-size:1rem; text-shadow:0 2px 5px rgba(0,0,0,0.5);"></i>' : ''}${data.isReelShare || data.isPostShare ? '<i class="fa-brands fa-instagram" style="position:absolute; bottom:5px; left:5px; color:white; font-size:0.8rem; opacity:0.8;"></i>' : ''}</div>`;

                if (isReelOrVideo) reelsHtml += itemDiv; else photosHtml += itemDiv;
            }
        });
        
        const emptyState = (icon, text) => `<div style="grid-column: span 3; text-align:center; padding: 50px; color: #94a3b8; font-weight:700;"><i class="fa-regular ${icon}" style="font-size:3rem; margin-bottom:15px; opacity:0.3;"></i><br>${text}</div>`;

        gridPhotos.innerHTML = photosHtml === "" ? emptyState('fa-image', 'No photos or posts shared yet') : photosHtml;
        gridReels.innerHTML = reelsHtml === "" ? emptyState('fa-circle-play', 'No reels or videos shared yet') : reelsHtml;

    } catch(e) {
        gridPhotos.innerHTML = '<div style="grid-column: span 3; color: #ff4757;">Error loading media</div>';
        gridReels.innerHTML = '<div style="grid-column: span 3; color: #ff4757;">Error loading media</div>';
    }
};

window.switchCpTab = (tab) => {
    document.getElementById('tab-photos').classList.remove('active'); document.getElementById('tab-reels').classList.remove('active');
    document.getElementById('cp-grid-photos').style.display = 'none'; document.getElementById('cp-grid-reels').style.display = 'none';
    if (tab === 'photos') { document.getElementById('tab-photos').classList.add('active'); document.getElementById('cp-grid-photos').style.display = 'grid'; } 
    else { document.getElementById('tab-reels').classList.add('active'); document.getElementById('cp-grid-reels').style.display = 'grid'; }
    if(navigator.vibrate) navigator.vibrate(20);
};

window.closeChatProfile = () => {
    const modal = document.getElementById('chat-profile-modal');
    if (modal) { modal.classList.remove('active'); if(navigator.vibrate) navigator.vibrate(30); }
};

// ==========================================
// --- INBOX LONG PRESS ACTIONS ---
// ==========================================
window.startInboxPress = (uid, name, event) => {
    const el = event.currentTarget; startTouchY = event.touches ? event.touches[0].clientY : 0;
    isInboxLongPress = false; if(inboxLongPressTimer) clearTimeout(inboxLongPressTimer);
    el.classList.add('inbox-pressing');

    inboxLongPressTimer = setTimeout(() => {
        isInboxLongPress = true; selectedInboxUid = uid;
        const modal = document.getElementById('inbox-options-modal'), deleteText = document.getElementById('inbox-delete-text');
        modal.classList.remove('hidden'); if(deleteText) deleteText.innerText = `Delete chat with ${name.split(' ')[0]}`;
        if(navigator.vibrate) navigator.vibrate(60);
        el.classList.remove('inbox-pressing');
    }, 600); 
};

window.cancelInboxPress = (event) => {
    const el = event.currentTarget;
    if (event.type === 'touchmove') {
        if (Math.abs(event.touches[0].clientY - startTouchY) > 10) { clearTimeout(inboxLongPressTimer); el.classList.remove('inbox-pressing'); }
        return;
    }
    clearTimeout(inboxLongPressTimer); el.classList.remove('inbox-pressing');
};

window.handleInboxClick = (uid, name, photo, event) => {
    if(isInboxLongPress) { event.preventDefault(); event.stopPropagation(); return; }
    window.startPrivateChat(uid, name, photo);
};

window.closeInboxOptions = () => { selectedInboxUid = null; document.getElementById('inbox-options-modal').classList.add('hidden'); };

window.handleDeleteChat = async () => {
    const currentUser = window.currentUser; const db = window.db;
    if(!selectedInboxUid) return;
    const targetUid = selectedInboxUid;
    window.closeInboxOptions();
    
    delete window.chatDrafts[targetUid]; localStorage.setItem('loveChats_drafts', JSON.stringify(window.chatDrafts));

    try {
        const myRef = doc(db, "users", currentUser.uid), mySnap = await getDoc(myRef);
        if(mySnap.exists()) {
            let interactions = mySnap.data().interactions || {};
            if(interactions[targetUid]) { delete interactions[targetUid]; await updateDoc(myRef, { interactions: interactions }); }
        }
        if(typeof window.showToast === 'function') window.showToast("Deleted", "Chat removed from inbox", currentUser?.photoURL);
        
        displayInboxUsers = displayInboxUsers.filter(u => u.uid !== targetUid); fullInboxUsers = fullInboxUsers.filter(u => u.uid !== targetUid);
        const listContainer = document.getElementById('chat-list-container');
        listContainer.innerHTML = ""; currentInboxIndex = 0; isFetchingInbox = false;
        
        if(displayInboxUsers.length === 0) listContainer.innerHTML = `<div style="text-align:center; padding:50px; color:#aaa;">No recent messages.</div>`;
        else window.loadMoreInboxUsers();
    } catch(e) {}
};
