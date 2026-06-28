// =========================================================
// --- DK LOVE CHATS - PROFILE & USER LIST SYSTEM ENGINE ---
// =========================================================

// 1. संख्या को शॉर्ट फॉर्मेट में बदलने के लिए हेल्पर (जैसे: 1500 -> 1.5K)
window.formatCount = (num) => {
    if (!num || isNaN(num)) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
};

// 2. प्रोफ़ाइल टैब स्विचिंग (Posts / Reels)
window.switchProfileTab = (tab) => {
    const targetBtn = document.getElementById(`tab-${tab}`);
    const targetGrid = document.getElementById(`profile-${tab}-grid`);
    
    if (!targetBtn || !targetGrid || targetBtn.classList.contains('active')) return;
    if (navigator.vibrate) navigator.vibrate(8);

    document.querySelectorAll('.profile-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.profile-grid').forEach(grid => {
        grid.style.opacity = "0"; 
        grid.classList.add('hidden');
    });

    targetBtn.classList.add('active'); 
    targetGrid.classList.remove('hidden');

    requestAnimationFrame(() => {
        targetGrid.style.transition = "opacity 0.25s ease, transform 0.25s ease";
        targetGrid.style.opacity = "1"; 
        targetGrid.style.transform = "translateY(0)";
    });
};

// 3. रेफरल कोड कॉपी करने का फ़ंक्शन
window.copyReferCode = () => {
    const codeElement = document.getElementById('profile-refer-code');
    if (!codeElement) return;
    const codeToCopy = codeElement.innerText;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(codeToCopy).then(() => {
            if (typeof showCustomAlert === 'function') showCustomAlert("Copied!", "Referral Code copied to clipboard!", "success");
            else alert("Referral Code Copied: " + codeToCopy);
        }).catch(err => console.error("Copy failed", err));
    } else {
        const textArea = document.createElement("textarea"); 
        textArea.value = codeToCopy;
        textArea.style.position = "fixed"; 
        document.body.appendChild(textArea); 
        textArea.select(); 
        try {
            document.execCommand('copy');
            if(typeof showCustomAlert === 'function') showCustomAlert("Copied!", "Code copied successfully!", "success");
        } catch (err) {
            console.error("Fallback copy failed", err);
        }
        document.body.removeChild(textArea);
    }
};

// 4. रील्स और अन्य बैकग्राउंड मीडिया को रोकने का लॉजिक
window.forceStopAllReels = () => {
    if (window.reelObserver) { 
        window.reelObserver.disconnect(); 
        window.reelObserver = null; 
    }
    document.querySelectorAll('video').forEach(vid => {
        if (vid) { 
            vid.pause(); 
            vid.muted = true; 
            vid.currentTime = 0; 
            vid.removeAttribute('src'); 
            vid.load(); 
        }
    });
    if (typeof currentPlayingReelId !== 'undefined') currentPlayingReelId = null;
    if (typeof isFirstReelsLoad !== 'undefined') isFirstReelsLoad = true;
    if (window.storyMusicAudio) { 
        try { window.storyMusicAudio.pause(); window.storyMusicAudio.src = ""; } catch(e){}
    }
};

// ==========================================
// --- PROFILE VIEWING LOGIC (REAL-TIME) ---
// ==========================================
// =========================================================
// --- UPDATE: PROFILE VIEWING LOGIC (REAL-TIME SYNCED) ---
// =========================================================
window.viewUserProfile = async (targetUid) => {
    if (typeof window.forceStopAllReels === 'function') window.forceStopAllReels();

    const postsGrid = document.getElementById('profile-posts-grid');
    const reelsGrid = document.getElementById('profile-reels-grid');
    if(postsGrid) postsGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:50px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; color:var(--primary);"></i></div>';
    if(reelsGrid) reelsGrid.innerHTML = "";

    window.currentProfileUid = targetUid;
    
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active-view')); 
    const profileView = document.getElementById('profile-view');
    if (profileView) profileView.classList.add('active-view');
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active')); 
    document.querySelectorAll('.nav-item')[5]?.classList.add('active'); 

    try {
        const uDoc = await window.getDoc(window.doc(window.db, "users", targetUid));
        if(!uDoc.exists()) return;

        const d = uDoc.data(), targetId = d.uid || uDoc.id; 
        
        // फुल नेम
        const nameEl = document.getElementById('profile-name');
        if (nameEl) {
            nameEl.innerText = d.name || "User";
        }

        // यूज़रनेम
        const usernameEl = document.getElementById('profile-username');
        if (usernameEl) {
            const badgeHtml = (d.isVerified && typeof window.getVerifiedBadgeHTML === 'function') 
                ? window.getVerifiedBadgeHTML(true, 18) 
                : "";
            usernameEl.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 4px;">@${d.username || "user"}${badgeHtml}</span>`;
        }

        document.getElementById('profile-bio').innerText = d.bio || "No bio yet.";
        
        // मुख्य प्रोफ़ाइल इमेज
        const profileImgEl = document.getElementById('profile-img');
        if (profileImgEl) {
            profileImgEl.src = d.avatarBase64 || d.photoURL || "https://i.pravatar.cc/150";
        }
        
        document.getElementById('profile-followers-count').innerText = d.followers ? d.followers.length : 0;
        document.getElementById('profile-following-count').innerText = d.following ? d.following.length : 0;
        
        const actions = document.getElementById('profile-actions');
        const referCard = document.getElementById('my-referral-card'); 

        // 🌟 यदि यूज़र स्वयं की प्रोफ़ाइल देख रहा है
        if(window.currentUser && targetId === window.currentUser.uid) {
            if(referCard) {
                referCard.classList.remove('hidden');
                
                // 🛠️ BUG FIX: पहले के मैन्युअल लोडिंग को नए ऑटो-सिंक इंजन से रिप्लेस किया गया
                if (typeof window.syncReferralData === 'function') {
                    window.syncReferralData();
                }
            }
            if (actions) {
                actions.innerHTML = `
                    <div class="profile-btn-container" style="width:100%; display:flex; flex-direction:column; gap:12px; margin-top:15px;">
                        <div style="display:flex; gap:10px; width:100%;">
                            <button class="btn-edit" style="flex:1; height:45px;" onclick="openEditProfile()">Edit Profile</button>
                            <button class="btn-edit" style="flex:1; height:45px;" onclick="openSettingsModal()"><i class="fa-solid fa-gear"></i> Settings</button>
                        </div>

                        <button class="btn-share-app" style="width:100%; height:48px;" onclick="shareApp()">
                            <i class="fa-solid fa-share-nodes"></i> Share DK Love Chats
                        </button>
                    </div>
                `;
            }
        } else {
            // यदि दूसरे यूज़र की प्रोफ़ाइल देखी जा रही है
            if(referCard) referCard.classList.add('hidden');
            const isFollowing = window.currentUserData?.following && window.currentUserData.following.includes(targetId);
            if (actions) {
                actions.innerHTML = `
                    <div style="display:flex; gap:10px; width:100%; justify-content:center; margin-top:15px;">
                        <button id="profile-follow-btn" class="btn-follow ${isFollowing ? 'btn-following' : ''}" onclick="handleFollow('${targetId}')" style="flex:1; height:45px;">
                            ${isFollowing ? 'Following' : 'Follow'}
                        </button>
                        <button class="btn-msg" onclick="startPrivateChat('${targetId}', '${d.name || "User"}', '${d.photoURL || ""}')" style="flex:1; height:45px;">
                            Message
                        </button>
                    </div>
                `;
            }
        }

        window.loadUserPosts(targetId);

        if (typeof window.updateProfileVerificationUI === 'function') {
            window.updateProfileVerificationUI(targetId, d.isVerified);
        }

        // ==========================================
        // --- REAL-TIME SYNC SNAPSHOT LISTENER -----
        // ==========================================
        if (window.unsubscribeProfileUser) {
            window.unsubscribeProfileUser();
        }
        
        window.unsubscribeProfileUser = window.onSnapshot(window.doc(window.db, "users", targetUid), (docSnap) => {
            if (docSnap.exists()) {
                const liveData = docSnap.data();
                
                const followersEl = document.getElementById('profile-followers-count');
                const followingEl = document.getElementById('profile-following-count');
                
                if(followersEl) followersEl.innerText = liveData.followers ? liveData.followers.length : 0;
                if(followingEl) followingEl.innerText = liveData.following ? liveData.following.length : 0;

                const liveNameEl = document.getElementById('profile-name');
                if (liveNameEl) {
                    liveNameEl.innerText = liveData.name || "User";
                }

                // सुरक्षित रियल-टाइम इमेज चेकर (Flickering से बचने के लिए)
                const liveImgEl = document.getElementById('profile-img');
                if (liveImgEl) {
                    const nextImgSrc = liveData.avatarBase64 || liveData.photoURL || "https://i.pravatar.cc/150";
                    // अपलोड के दौरान ओवरराइट होने से रोकें
                    const isMe = window.currentUser && targetId === window.currentUser.uid;
                    if (!(isMe && (window.profileRawFile || window.selectedMediaBase64))) {
                        if (!liveImgEl.src.includes(nextImgSrc)) {
                            liveImgEl.src = nextImgSrc;
                        }
                    }
                }

                if (window.currentUser && targetId === window.currentUser.uid) {
                    window.currentUserData = liveData; 
                    
                    // 🌟 लाइव सिंक अपडेट: यदि डेटाबेस में लाइव रेफ़रल काउंट बदलता है, तो उसे तुरंत रिफ्लेक्ट करें
                    if (typeof window.syncReferralData === 'function') {
                        window.syncReferralData();
                    }

                    const myStoryImg = document.getElementById('my-story-ring-img');
                    if (myStoryImg) {
                        const nextImgSrc = liveData.avatarBase64 || liveData.photoURL || "https://i.pravatar.cc/150";
                        if (!myStoryImg.src.includes(nextImgSrc)) {
                            myStoryImg.src = nextImgSrc;
                        }
                    }
                }

                const liveUsernameEl = document.getElementById('profile-username');
                if (liveUsernameEl) {
                    const liveBadgeHtml = (liveData.isVerified && typeof window.getVerifiedBadgeHTML === 'function') 
                        ? window.getVerifiedBadgeHTML(true, 18) 
                        : "";
                    liveUsernameEl.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 4px;">@${liveData.username || "user"}${liveBadgeHtml}</span>`;
                }

                if (typeof window.updateProfileVerificationUI === 'function') {
                    window.updateProfileVerificationUI(targetId, liveData.isVerified);
                }

                if (window.currentUser && targetId !== window.currentUser.uid) {
                    const profileBtn = document.getElementById('profile-follow-btn');
                    if (profileBtn) {
                        const amIFollowing = liveData.followers && liveData.followers.includes(window.currentUser.uid);
                        if (amIFollowing) {
                            profileBtn.classList.add('btn-following');
                            profileBtn.innerText = 'Following';
                        } else {
                            profileBtn.classList.remove('btn-following');
                            profileBtn.innerText = 'Follow';
                        }
                    }
                }
            }
        }, (err) => console.error("Snapshot error:", err));

    } catch (e) { console.error("Profile Error:", e); }
    window.switchProfileTab('posts');
};

// 5. यूज़र पोस्ट्स और रील्स को लोड करना
window.loadUserPosts = async (uid) => {
    if (window.unsubscribeProfilePosts) {
        window.unsubscribeProfilePosts();
    }

    const postsGrid = document.getElementById('profile-posts-grid');
    const reelsGrid = document.getElementById('profile-reels-grid');
    const isMe = (window.currentUser && uid === window.currentUser.uid);

    if (!postsGrid || !reelsGrid) return;

    const q = window.query(window.collection(window.db, "posts"), window.where("userId", "==", uid));

    window.unsubscribeProfilePosts = window.onSnapshot(q, (snapshot) => {
        postsGrid.innerHTML = ""; 
        reelsGrid.innerHTML = "";

        if (snapshot.empty) {
            postsGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#aaa;">No posts yet.</div>`;
            reelsGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#aaa;">No reels yet.</div>`;
            const postsCountEl = document.getElementById('profile-posts-count');
            if (postsCountEl) postsCountEl.innerText = "0";
            return;
        }

        let allPosts = [];
        snapshot.forEach(docSnap => allPosts.push({ id: docSnap.id, ...docSnap.data() }));
        allPosts.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        const postsCountEl = document.getElementById('profile-posts-count');
        if (postsCountEl) postsCountEl.innerText = allPosts.length;

        allPosts.forEach(p => {
            const item = document.createElement('div'); 
            item.className = 'grid-item fade-in';
            
            const likes = p.likes ? p.likes.length : 0;
            const viewsCount = p.views ? (Array.isArray(p.views) ? p.views.length : p.views) : 0;
            
            const formattedLikes = window.formatCount(likes);
            const formattedViews = window.formatCount(viewsCount);

            const deleteBtnHtml = isMe ? `
                <div class="delete-grid-btn" onclick="event.stopPropagation(); deletePost('${p.id}')" style="position:absolute; top:8px; right:8px; background:rgba(255, 71, 87, 0.9); color:white; width:28px; height:28px; border-radius:8px; display:flex; align-items:center; justify-content:center; z-index:15; cursor:pointer;">
                    <i class="fa-solid fa-trash-can" style="font-size:0.8rem;"></i>
                </div>` : '';
            
            const overlayHtml = `
                <div class="grid-overlay">
                    <span style="display:flex; align-items:center; gap:5px;"><i class="fa-solid fa-heart"></i> ${formattedLikes}</span>
                    <span style="display:flex; align-items:center; gap:5px;"><i class="fa-solid fa-eye"></i> ${formattedViews}</span>
                </div>`;

            if (p.mediaType === 'video') {
                let thumb = p.mediaUrl ? p.mediaUrl.replace(/\.[^/.]+$/, ".jpg") : ""; 
                const reelViewsIndicator = `
                    <div style="position: absolute; bottom: 8px; left: 8px; background: rgba(0, 0, 0, 0.55); color: white; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; display: flex; align-items: center; gap: 4px; z-index: 4; backdrop-filter: blur(2px);">
                        <i class="fa-solid fa-play" style="font-size: 0.65rem;"></i> ${formattedViews}
                    </div>`;

                item.innerHTML = `
                    ${deleteBtnHtml}
                    <img src="${thumb}" class="grid-media" loading="lazy" decoding="async" style="width:100%; height:100%; object-fit:cover;">
                    ${reelViewsIndicator}
                    ${overlayHtml}
                `;
            } else {
                const postViewsIndicator = `
                    <div style="position: absolute; bottom: 8px; left: 8px; background: rgba(0, 0, 0, 0.55); color: white; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; display: flex; align-items: center; gap: 4px; z-index: 4; backdrop-filter: blur(2px);">
                        <i class="fa-solid fa-eye" style="font-size: 0.65rem;"></i> ${formattedViews}
                    </div>`;

                item.innerHTML = `
                    ${deleteBtnHtml}
                    <img src="${p.mediaUrl || p.imageUrl || ''}" class="grid-media" loading="lazy" decoding="async" style="width:100%; height:100%; object-fit:cover;">
                    ${postViewsIndicator}
                    ${overlayHtml}
                `;
            }

            item.onclick = () => window.openSinglePostView(p.id);
            
            if (p.mediaType === 'video') {
                reelsGrid.appendChild(item);
            } else {
                postsGrid.appendChild(item);
            }
        });
    }, (err) => console.error("Posts Snapshot error:", err));
};

// ==========================================
// --- EDIT PROFILE MODULE (RE-DESIGNED) ---
// ==========================================
let editUsernameTimer = null;
let isEditUsernameAvailable = true;

// नई डीपी चुनने पर प्रिव्यू लोड करने की क्रिया
window.handleProfileFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    window.profileRawFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        const previewEl = document.getElementById('edit-profile-preview');
        if (previewEl) {
            previewEl.src = e.target.result;
        }
        window.selectedMediaBase64 = e.target.result;
        window.selectedMediaType = 'image';
    };
    reader.readAsDataURL(file);
};

// 🌟 प्रिव्यू इमेज पर क्लिक करके सीधे फाइल पिकर ट्रिगर करने और बाइंड करने का फ़ंक्शन
window.initProfileImagePicker = () => {
    const previewEl = document.getElementById('edit-profile-preview');
    const fileInput = document.getElementById('edit-profile-input') || document.getElementById('edit-avatar-input');
    
    if (previewEl && fileInput) {
        previewEl.style.cursor = 'pointer';
        previewEl.onclick = () => fileInput.click();
        fileInput.onchange = (e) => {
            window.handleProfileFileSelect(e);
        };
    }
};

window.openEditProfile = () => { 
    if (!window.currentUser) return;
    window.toggleModal('edit-profile-modal', true); 
    
    const nameInput = document.getElementById('edit-name');
    const bioInput = document.getElementById('edit-bio');
    const usernameInput = document.getElementById('edit-username');

    // रीयल-टाइम डेटा पॉपुलेशन
    nameInput.value = window.currentUserData?.name || window.currentUser.displayName || ""; 
    bioInput.value = window.currentUserData?.bio || "";
    usernameInput.value = window.currentUserData?.username || "";
    
    const profileImg = document.getElementById('profile-img');
    const previewImg = document.getElementById('edit-profile-preview');
    if (profileImg && previewImg) {
        previewImg.src = profileImg.src;
    }
    
    document.getElementById('edit-username-check-icon').className = 'fa-solid fa-circle-check username-status status-valid';
    isEditUsernameAvailable = true; 

    // आटोमैटिक इमेज पिकर बाइंडिंग एक्टिवेट करें
    window.initProfileImagePicker();

    // इमोजी और कैरेक्टर लिमिट फ़िल्टर
    const sanitizeAndClean = (e, limit = null) => {
        let val = e.target.value;
        const emojiPattern = /[\uD800-\uDFFF]|\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;
        val = val.replace(emojiPattern, '');
        
        if (limit && val.length > limit) {
            val = val.substring(0, limit);
        }
        
        if (e.target.value !== val) {
            e.target.value = val;
        }
    };

    nameInput.oninput = (e) => {
        sanitizeAndClean(e, 15);
    };

    usernameInput.oninput = (e) => {
        sanitizeAndClean(e);
        window.checkEditUsernameAvailability();
    };
};

window.checkEditUsernameAvailability = () => {
    let username = document.getElementById('edit-username').value.trim().toLowerCase();
    if(username.startsWith('@')) username = username.substring(1);
    
    const icon = document.getElementById('edit-username-check-icon');
    const btn = document.getElementById('btn-save-profile');
    
    if(username.length < 3) {
        icon.className = 'fa-solid fa-circle-xmark username-status status-invalid'; 
        isEditUsernameAvailable = false; 
        if(btn) btn.disabled = true; 
        return;
    }

    if(window.currentUserData && username === window.currentUserData.username) {
        icon.className = 'fa-solid fa-circle-check username-status status-valid';
        isEditUsernameAvailable = true; 
        if(btn) btn.disabled = false; 
        return;
    }

    if(editUsernameTimer) clearTimeout(editUsernameTimer);
    icon.className = 'fa-solid fa-spinner fa-spin username-status';

    editUsernameTimer = setTimeout(async () => {
        try {
            const q = window.query(window.collection(window.db, "users"), window.where("username", "==", username));
            const snap = await window.getDocs(q);
            
            if(snap.empty) {
                icon.className = 'fa-solid fa-circle-check username-status status-valid';
                isEditUsernameAvailable = true; 
                if(btn) btn.disabled = false;
            } else {
                icon.className = 'fa-solid fa-circle-xmark username-status status-invalid';
                isEditUsernameAvailable = false; 
                if(btn) btn.disabled = true;
                if(typeof showCustomAlert === 'function') showCustomAlert("Unavailable", "This username is already taken!", "warning");
            }
        } catch (err) {
            console.error("Username check error:", err);
        }
    }, 600); 
};

// 🌟 प्रोफ़ाइल सेविंग क्रियान्वयक (फ़ास्ट और फ़्लिकर-मुक्त अपडेट)
window.handleSaveProfile = async () => { 
    let n = document.getElementById('edit-name').value.trim(); 
    let b = document.getElementById('edit-bio').value.trim(); 
    let u = document.getElementById('edit-username').value.trim().toLowerCase();
    
    if(u.startsWith('@')) u = u.substring(1); 

    const emojiPattern = /[\uD800-\uDFFF]|\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;
    n = n.replace(emojiPattern, '').substring(0, 15);
    u = u.replace(emojiPattern, '');

    if(!n) return typeof showCustomAlert === 'function' ? showCustomAlert("Required", "Name is required", "warning") : alert("Name required");
    if(!u) return typeof showCustomAlert === 'function' ? showCustomAlert("Required", "Username is required", "warning") : alert("Username required");
    if(!isEditUsernameAvailable) return typeof showCustomAlert === 'function' ? showCustomAlert("Invalid", "Please choose a valid username.", "error") : alert("Invalid username");
    
    const btn = document.getElementById('btn-save-profile');
    const originalContent = btn ? btn.innerHTML : "Save Changes";
    
    if(btn) { 
        btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...`; 
        btn.disabled = true; 
    }

    try {
        let url = null;
        
        // 🌟 तात्कालिक स्थानीय ऑब्जेक्ट प्रिव्यू (बिना किसी देरी के सबसे तेज प्रिव्यू अनुभव के लिए)
        let localPreviewUrl = null;
        if (window.profileRawFile) {
            localPreviewUrl = URL.createObjectURL(window.profileRawFile);
        } else if (window.selectedMediaBase64) {
            localPreviewUrl = window.selectedMediaBase64;
        }

        // स्क्रीन पर डीपी तुरंत बदलें
        if (localPreviewUrl) {
            const profileImg = document.getElementById('profile-img');
            if (profileImg) profileImg.src = localPreviewUrl;
            
            const myStoryImg = document.getElementById('my-story-ring-img');
            if (myStoryImg) myStoryImg.src = localPreviewUrl;
        }

        // फ़ाइल अपलोड प्रोसेस
        if(window.profileRawFile) {
            if (typeof window.uploadFile === 'function') {
                try {
                    let blobToUpload = window.profileRawFile;
                    if(window.selectedMediaType === 'image' && window.selectedMediaBase64) {
                         const res = await fetch(window.selectedMediaBase64);
                         blobToUpload = await res.blob();
                    }
                    const uploadData = await window.uploadFile(blobToUpload);
                    url = uploadData?.url || uploadData;
                } catch (uploadErr) {
                    console.warn("Storage upload failed, falling back to base64 data", uploadErr);
                    url = window.selectedMediaBase64; // बैकअप
                }
            } else {
                url = window.selectedMediaBase64; // बैकअप
            }
        }
        
        // फ़ायरबेस ऑथ प्रोफ़ाइल को अपडेट करें
        if (typeof window.updateProfile === 'function' && window.currentUser) {
            await window.updateProfile(window.currentUser, { 
                displayName: n, 
                photoURL: url || window.currentUser.photoURL 
            });
        }
        
        // अंतिम डीपी का चयन
        const finalAvatar = url || localPreviewUrl || window.currentUserData?.avatarBase64 || window.currentUserData?.photoURL || "";
        
        const updateData = { name: n, bio: b, username: u }; 
        if(finalAvatar) { 
            updateData.avatarBase64 = finalAvatar; 
            updateData.photoURL = finalAvatar; 
        }
        
        // फ़ायरस्टोर डेटाबेस डॉक्यूमेंट अपडेट करें
        await window.updateDoc(window.doc(window.db, "users", window.currentUser.uid), updateData); 

        // रीयल-टाइम लोकल स्टेट कैश सिंक करें
        if (window.currentUserData) {
            window.currentUserData.name = n;
            window.currentUserData.bio = b;
            window.currentUserData.username = u;
            if(finalAvatar) { 
                window.currentUserData.avatarBase64 = finalAvatar; 
                window.currentUserData.photoURL = finalAvatar; 
            }
        }

        // 🌟 डोम पर टेक्स्ट और डीपी तुरंत रिफ्लेक्ट करें (बिना स्क्रीन को रीसेट किए)
        const profileImg = document.getElementById('profile-img');
        if (profileImg && finalAvatar) profileImg.src = finalAvatar;

        const myStoryImg = document.getElementById('my-story-ring-img');
        if (myStoryImg && finalAvatar) myStoryImg.src = finalAvatar;

        const profileName = document.getElementById('profile-name');
        if (profileName) profileName.innerText = n;

        const profileBio = document.getElementById('profile-bio');
        if (profileBio) profileBio.innerText = b;

        const profileUsername = document.getElementById('profile-username');
        if (profileUsername) {
            const badgeHtml = (window.currentUserData?.isVerified && typeof window.getVerifiedBadgeHTML === 'function') 
                ? window.getVerifiedBadgeHTML(true, 18) 
                : "";
            profileUsername.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 4px;">@${u}${badgeHtml}</span>`;
        }

        // प्रोफ़ाइल फाइल कैश साफ़ करें
        window.profileRawFile = null;
        window.selectedMediaBase64 = null;
        
        // एडिट मोडल को बंद करें
        window.toggleModal('edit-profile-modal', false); 
        
        if(typeof showCustomAlert === 'function') {
            showCustomAlert("Success", "Your profile has been saved successfully!", "success");
        }
    } catch(e) { 
        console.error("Save profile error:", e);
        if(typeof showCustomAlert === 'function') {
            showCustomAlert("Error", e.message || "Something went wrong.", "error"); 
        }
    } finally { 
        if(btn) { 
            btn.innerHTML = originalContent; 
            btn.disabled = false; 
        }
    }
};

// ==========================================
// --- FOLLOWERS / FOLLOWING LIST MODULE ---
// ==========================================
let currentListUids = [], filteredListUids = [], currentListIndex = 0, isFetchingList = false;

window.openUserList = async (type, uid) => {
    const title = document.getElementById('user-list-title'); 
    const content = document.getElementById('user-list-content');
    const searchInput = document.getElementById('user-list-search');
    
    if(title) title.innerText = type; 
    if(content) content.innerHTML = '<div class="splash-loader" style="width:30px;height:30px;margin:20px auto;"></div>';
    if(searchInput) searchInput.value = ""; 
    
    window.toggleModal('user-list-modal', true);
    
    try {
        const uDoc = await window.getDoc(window.doc(window.db, "users", uid));
        if(!uDoc.exists()) return;
        
        currentListUids = type === 'Followers' ? (uDoc.data().followers || []) : (uDoc.data().following || []);
        filteredListUids = [...currentListUids]; 
        currentListIndex = 0; 
        isFetchingList = false;
        
        if(filteredListUids.length === 0) { 
            if(content) content.innerHTML = `<div style="text-align:center; padding:20px; color:#aaa;">No ${type.toLowerCase()} yet.</div>`; 
            return; 
        }
        
        if(content) {
            content.innerHTML = "";
            await window.loadMoreUsersList();
            
            content.onscroll = () => { 
                if (content.scrollTop + content.clientHeight >= content.scrollHeight - 50) { 
                    window.loadMoreUsersList(); 
                } 
            };
        }
    } catch (err) {
        console.error("Error opening user list:", err);
    }
};

window.showFollowers = async () => { window.openUserList('Followers', window.currentProfileUid); }
window.showFollowing = async () => { window.openUserList('Following', window.currentProfileUid); }

window.handleUserListSearch = () => {
    const queryText = document.getElementById('user-list-search').value.toLowerCase().trim();
    const content = document.getElementById('user-list-content');
    
    if (!queryText) {
        filteredListUids = [...currentListUids];
    } else {
        filteredListUids = currentListUids.filter(uid => {
            const userObj = window.allCachedUsers && window.allCachedUsers.find(u => u.uid === uid);
            if (userObj && userObj.name) {
                return userObj.name.toLowerCase().includes(queryText) || (userObj.username && userObj.username.toLowerCase().includes(queryText));
            }
            return false;
        });
    }
    
    currentListIndex = 0; 
    if(content) content.innerHTML = "";
    
    if (filteredListUids.length === 0) {
        if(content) content.innerHTML = `<div style="text-align:center; padding:40px; color:#aaa;"><i class="fa-solid fa-magnifying-glass" style="font-size:2rem; margin-bottom:10px; opacity:0.5;"></i><br>No users found.</div>`;
        return;
    }
    window.loadMoreUsersList();
};

window.loadMoreUsersList = async () => {
    if (isFetchingList || currentListIndex >= filteredListUids.length) return;
    
    isFetchingList = true; 
    const content = document.getElementById('user-list-content');
    if(!content) return;

    const loaderId = 'list-loader-' + Date.now();
    content.insertAdjacentHTML('beforeend', `<div id="${loaderId}" style="text-align:center; padding:10px;"><div class="splash-loader" style="width:20px;height:20px;margin:0 auto;border-width:2px;"></div></div>`);
    
    const chunk = filteredListUids.slice(currentListIndex, currentListIndex + 20);
    
    try {
        const promises = chunk.map(async (id) => {
            let uData = window.allCachedUsers ? window.allCachedUsers.find(u => u.uid === id) : null;
            if (!uData) { 
                const dSnap = await window.getDoc(window.doc(window.db, "users", id)); 
                if (dSnap.exists()) uData = { uid: id, ...dSnap.data() }; 
            }
            return uData;
        });
        
        const docs = await Promise.all(promises);
        const loaderEl = document.getElementById(loaderId); 
        if(loaderEl) loaderEl.remove();
        
        let htmlChunk = "";
        docs.forEach(u => {
            if(u) {
                const userId = u.uid; 
                const avatar = u.avatarBase64 || u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}`;
                const isMe = window.currentUser && userId === window.currentUser.uid;
                const displayName = isMe ? `${u.name} <span style="color:#00b894; font-size:0.8rem; margin-left:5px;">(You)</span>` : u.name;
                const borderStyle = isMe ? 'border: 2px solid #00b894;' : 'border: 1px solid #ff006e;';

                let followBtnHtml = "";
                if (!isMe && window.currentUserData) {
                    const isFollowing = window.currentUserData.following && window.currentUserData.following.includes(userId);
                    followBtnHtml = `<span class="feed-follow-btn follow-btn-${userId} ${isFollowing ? 'following' : ''}" style="margin-left: auto; z-index: 10; padding: 6px 16px; font-size: 0.8rem;" onclick="handleFollow('${userId}', event)">${isFollowing ? 'Following' : 'Follow'}</span>`;
                }

                htmlChunk += `
                <div class="chat-item" style="display: flex; align-items: center; padding: 12px 15px; cursor:pointer;" onclick="if(typeof window.viewUserProfile === 'function') window.viewUserProfile('${userId}'); toggleModal('user-list-modal', false);">
                    <img src="${avatar}" style="width:45px;height:45px;border-radius:50%;object-fit:cover; flex-shrink:0; ${borderStyle}" loading="lazy">
                    <div style="flex:1; font-weight:600; margin-left: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${displayName}</div>
                    ${followBtnHtml}
                </div>`;
            }
        });
        content.insertAdjacentHTML('beforeend', htmlChunk); 
        currentListIndex += 20;
    } catch(e) { 
        console.error("Error loading users:", e); 
    } finally { 
        isFetchingList = false; 
    }
};
// =========================================================
// --- 🛠️ SAFE GLOBAL SCOPE INJECTION FOR MODAL COPY ------
// =========================================================

// यह फ़ंक्शन बिना किसी स्कोप ब्लॉक के सीधे विंडो (Global Object) पर रजिस्टर होता है
window.copyModalReferCode = function() {
    const codeElement = document.getElementById('modal-refer-code');
    if (!codeElement) return;
    const codeToCopy = codeElement.innerText || codeElement.textContent;

    // कम्पन फीडबैक (Touch Vibe)
    if (navigator.vibrate) navigator.vibrate(15);

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(codeToCopy).then(() => {
            // टोस्ट या अलर्ट प्रदर्शित करें
            if (typeof window.showCustomAlert === 'function') {
                window.showCustomAlert("Copied!", "Referral Code copied to clipboard!", "success");
            } else if (typeof window.showToast === 'function') {
                window.showToast("Copied!", "Code copied!", window.currentUser?.photoURL, "success");
            } else {
                alert("Referral Code Copied: " + codeToCopy);
            }
        }).catch(err => {
            console.error("Clipboard API copy failed, trying fallback:", err);
            executeFallback(codeToCopy);
        });
    } else {
        executeFallback(codeToCopy);
    }

    // फ़ॉलबैक मेथड (यदि ब्राउज़र क्लिपबोर्ड सपोर्ट न करे)
    function executeFallback(text) {
        if (typeof window.fallbackCopyText === 'function') {
            window.fallbackCopyText(text, "Referral Code copied!");
        } else {
            const textArea = document.createElement("textarea"); 
            textArea.value = text;
            textArea.style.position = "fixed"; 
            textArea.style.left = "-9999px"; 
            textArea.style.top = "0";
            document.body.appendChild(textArea); 
            textArea.focus();
            textArea.select(); 
            try {
                document.execCommand('copy');
                if (typeof window.showCustomAlert === 'function') {
                    window.showCustomAlert("Copied!", "Code copied successfully!", "success");
                } else {
                    alert("Referral Code Copied: " + text);
                }
            } catch (err) {
                console.error("Fallback execution failed:", err);
            }
            document.body.removeChild(textArea);
        }
    }
};
