// 👉 FIREBASE IMPORTS
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// ==========================================
// --- GLOBAL VARIABLES FOR POST & REEL ---
// ==========================================
let selectedRawFile = null;         
let selectedMediaBase64 = null;     
let selectedMediaType = 'image';    
let currentVisualThumbnail = null; // Contains permanent Base64 preview for Upload Bar
let thumbnailPromise = null;       // Tracks async thumbnail generation to prevent race condition
let currentUploadXHR = null;        
let alertTimeout = null;            

// ==========================================
// --- 1. DIRECT GALLERY LAUNCH BINDING ---
// ==========================================
function bindDirectGalleryTrigger() {
    const plusBtn = document.querySelector(".nav-item[onclick*='create-post-modal']");
    const fileInput = document.getElementById('post-file-input');

    if (plusBtn && fileInput) {
        plusBtn.removeAttribute('onclick');
        plusBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (navigator.vibrate) navigator.vibrate(15);
            fileInput.click(); 
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindDirectGalleryTrigger);
} else {
    bindDirectGalleryTrigger();
}

// ==========================================
// --- 2. INSTAGRAM STYLE CLEAN WHITE UI ---
// ==========================================
function rebuildInstagramComposer(type) {
    const modal = document.getElementById('create-post-modal');
    if (!modal) return;

    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: #ffffff !important;
        z-index: 5200;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        display: flex;
        flex-direction: column;
        transform: translate3d(0, 100%, 0);
        opacity: 0;
        transition: transform 0.35s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.35s ease;
        box-sizing: border-box;
    `;

    const userDp = window.currentUserData?.avatarBase64 || window.currentUserData?.photoURL || window.currentUser?.photoURL || "https://i.pravatar.cc/150";

    const mediaHeight = type === 'video' ? '45vh' : '35vh';
    const mediaAspect = type === 'video' ? '9/16' : '4/5';

    modal.innerHTML = `
        <div style="width: 100%; max-width: 600px; margin: 0 auto; display: flex; flex-direction: column; min-height: 100vh; background: #ffffff; box-sizing: border-box;">
            
            <!-- 1. LIGHT MODE HEADER -->
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1.5px solid #f1f5f9; background: #ffffff; position: sticky; top: 0; z-index: 10;">
                <span onclick="window.closeNewPostModal()" style="color: #262626; font-size: 1rem; font-weight: 600; cursor: pointer;">Cancel</span>
                <span style="color: #262626; font-weight: 800; font-size: 1.1rem; letter-spacing: -0.3px;">${type === 'video' ? 'New Reel' : 'New Post'}</span>
                <span onclick="window.handlePublish()" style="color: #0095f6; font-size: 1rem; font-weight: 800; cursor: pointer;">Share</span>
            </div>

            <!-- 2. ERROR/ALERT CONTAINER -->
            <div id="post-alert-banner" style="display: none; margin: 12px 15px; padding: 12px 16px; background: rgba(255, 45, 85, 0.08); border: 1px solid rgba(255, 45, 85, 0.2); border-radius: 12px; color: #ff3b30; font-size: 0.85rem; font-weight: 700; align-items: center; gap: 10px;">
                <i class="fa-solid fa-circle-exclamation"></i>
                <span id="post-alert-text" style="flex: 1; line-height: 1.3;"></span>
                <i class="fa-solid fa-xmark" style="cursor: pointer; opacity: 0.7;" onclick="window.hidePostAlertBanner()"></i>
            </div>

            <!-- 3. TOP SECTION: MEDIA PREVIEW FRAME -->
            <div style="width: 100%; display: flex; justify-content: center; background: #ffffff; padding: 15px 0; border-bottom: 1.5px solid #f1f5f9; position: relative;">
                <div id="preview-wrapper" style="
                    width: auto; 
                    height: ${mediaHeight}; 
                    aspect-ratio: ${mediaAspect}; 
                    border-radius: 16px; 
                    overflow: hidden; 
                    background: #f8fafc; 
                    border: 1.5px solid #e2e8f0; 
                    position: relative; 
                    box-shadow: 0 8px 25px rgba(0,0,0,0.05);
                ">
                    <!-- Dynamic preview loaded here -->
                </div>
            </div>

            <!-- 4. MIDDLE SECTION: USER PROFILE DP & CAPTION INPUT -->
            <div style="display: flex; gap: 15px; padding: 18px 20px; border-bottom: 1.5px solid #f1f5f9; align-items: flex-start; background: #ffffff; flex: 1;">
                <img src="${userDp}" style="width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 1px solid #e2e8f0; flex-shrink: 0;">
                <textarea id="post-caption" placeholder="Write a caption..." style="flex: 1; background: transparent; border: none; color: #262626; font-size: 0.95rem; line-height: 1.5; padding: 4px 0; height: 100px; resize: none; outline: none; box-sizing: border-box; font-family: inherit; font-weight: 500;"></textarea>
            </div>

            <div style="padding: 20px; color: #8e8e93; font-size: 0.78rem; line-height: 1.4; font-weight: 500; background: #ffffff;">
                Your ${type === 'video' ? 'Reel' : 'Post'} will be shared with your followers in their feeds, and will appear on your profile.
            </div>

            <!-- 5. BOTTOM SHARE BUTTON -->
            <div style="padding: 15px 20px; background: #ffffff; border-top: 1.5px solid #f1f5f9; position: sticky; bottom: 0; z-index: 10;">
                <button onclick="window.handlePublish()" style="
                    width: 100%; 
                    padding: 15px; 
                    border-radius: 12px; 
                    font-weight: 800; 
                    font-size: 0.95rem; 
                    background-color: #0095f6; 
                    color: #ffffff; 
                    border: none; 
                    cursor: pointer; 
                    transition: transform 0.1s ease;
                " onmousedown="this.style.transform='scale(0.98)';" onmouseup="this.style.transform='scale(1)';" ontouchstart="this.style.transform='scale(0.98)';" ontouchend="this.style.transform='scale(1)';">
                    Share ${type === 'video' ? 'Reel' : 'Post'}
                </button>
            </div>
        </div>
    `;

    const captionTextarea = document.getElementById('post-caption');
    if (captionTextarea) {
        captionTextarea.onfocus = () => {
            setTimeout(() => {
                captionTextarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 250);
        };
    }
}

// एरर बैनर शो और हाइड
window.showPostAlertBanner = (message) => {
    const banner = document.getElementById('post-alert-banner');
    const textSpan = document.getElementById('post-alert-text');
    if (!banner || !textSpan) return;

    if (alertTimeout) clearTimeout(alertTimeout);
    textSpan.innerText = message;
    banner.style.display = 'flex';
    
    banner.getBoundingClientRect(); // Reflow
    banner.style.opacity = '1';

    if (navigator.vibrate) navigator.vibrate([40, 30]);
    alertTimeout = setTimeout(() => { window.hidePostAlertBanner(); }, 2500);
};

window.hidePostAlertBanner = () => {
    const banner = document.getElementById('post-alert-banner');
    if (banner) banner.style.display = 'none';
};

// ==========================================
// --- 3. GALLERY SELECTION & PREVIEW ENGINE ---
// ==========================================
window.updatePostUI = async (input) => {
    const file = input.files[0];
    if (!file) return;

    window.hidePostAlertBanner();

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
        window.showPostAlertBanner("Please select only valid Photos or Videos!");
        input.value = "";
        return;
    }

    selectedRawFile = file;
    selectedMediaType = isVideo ? 'video' : 'image';
    
    if (selectedMediaBase64 && selectedMediaBase64.startsWith('blob:')) {
        URL.revokeObjectURL(selectedMediaBase64);
    }
    selectedMediaBase64 = URL.createObjectURL(file);

    rebuildInstagramComposer(selectedMediaType);

    const modal = document.getElementById('create-post-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.getBoundingClientRect(); // Reflow
        modal.style.transform = 'translate3d(0, 0, 0)';
        modal.style.opacity = '1';
    }

    const wrapper = document.getElementById('preview-wrapper');

    if (selectedMediaType === 'video') {
        wrapper.innerHTML = `
            <div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#f8fafc;">
                <i class="fa-solid fa-circle-notch fa-spin" style="color:#0095f6; font-size:1.5rem;"></i>
            </div>`;
        
        // 📹 गैलरी से सेलेक्ट करते ही तुरंत बैकग्राउंड में प्रॉमिस असाइन करें
        thumbnailPromise = generateVideoCover(file).then(cover => {
            currentVisualThumbnail = cover; 
            return cover;
        });

        const coverURL = await thumbnailPromise;
        
        wrapper.innerHTML = `
            <video id="preview-vid" src="${selectedMediaBase64}" poster="${coverURL}" autoplay loop playsinline muted style="width:100%; height:100%; object-fit:cover; display:block; cursor:pointer;"></video>
            <div id="hold-hint" style="position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.6); padding: 4px 8px; border-radius: 6px; font-size: 0.6rem; color: #fff; font-weight: 700; pointer-events: none; transition: opacity 0.2s;">
                <i class="fa-solid fa-volume-xmark" style="margin-right:2px;"></i> Hold to listen sound
            </div>
            <div style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.65); padding: 3px 6px; border-radius: 6px; font-size: 0.65rem; color: #fff; font-weight: 800; pointer-events: none;">
                <i class="fa-solid fa-video" style="font-size:0.6rem; margin-right:2px;"></i> Reel
            </div>`;

        const vid = document.getElementById('preview-vid');
        const hint = document.getElementById('hold-hint');
        let isHolding = false;
        let holdTimer = null;

        const unmuteSound = () => {
            vid.muted = false;
            if (hint) {
                hint.innerHTML = `<i class="fa-solid fa-volume-high" style="color:#00b894; margin-right:2px;"></i> Listening sound...`;
                hint.style.background = "rgba(0,184,148,0.85)";
            }
            if (navigator.vibrate) navigator.vibrate(20);
        };

        const muteSound = () => {
            vid.muted = true;
            if (hint) {
                hint.innerHTML = `<i class="fa-solid fa-volume-xmark" style="margin-right:2px;"></i> Hold to listen sound`;
                hint.style.background = "rgba(0,0,0,0.6)";
            }
        };

        const handleStart = (e) => {
            e.preventDefault();
            isHolding = false;
            
            holdTimer = setTimeout(() => {
                isHolding = true;
                unmuteSound();
            }, 250); 
        };

        const handleEnd = (e) => {
            e.preventDefault();
            if (holdTimer) clearTimeout(holdTimer);

            if (isHolding) {
                muteSound();
            } else {
                if (vid.paused) {
                    vid.play();
                } else {
                    vid.pause();
                }
            }
            isHolding = false;
        };

        vid.addEventListener('mousedown', handleStart);
        vid.addEventListener('touchstart', handleStart, { passive: false });

        vid.addEventListener('mouseup', handleEnd);
        vid.addEventListener('touchend', handleEnd, { passive: false });
        
        vid.addEventListener('mouseleave', () => { if (isHolding) { muteSound(); isHolding = false; } });
        vid.addEventListener('touchcancel', () => { if (isHolding) { muteSound(); isHolding = false; } });

    } else {
        thumbnailPromise = generateImageThumbnail(file).then(cover => {
            currentVisualThumbnail = cover;
            return cover;
        });
        await thumbnailPromise;
        wrapper.innerHTML = `<img src="${selectedMediaBase64}" style="width:100%; height:100%; object-fit:cover;">`;
    }
};

// 📹 तेज़ और सुरक्षित कवर जनरेटर (Timeouts और Error boundary के साथ)
function generateVideoCover(file) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const fileURL = URL.createObjectURL(file);
        
        // 2.5 सेकंड का सेफ्टी गार्ड ताकि प्रॉमिस कभी न अटके
        const timeoutId = setTimeout(() => {
            cleanup();
            // फ़ॉलबैक इमेज (हल्का ग्रे बॉक्स)
            resolve("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><rect width='120' height='120' fill='%23f1f5f9'/></svg>");
        }, 2500);

        function cleanup() {
            clearTimeout(timeoutId);
            video.onloadeddata = null;
            video.onseeked = null;
            video.onerror = null;
            URL.revokeObjectURL(fileURL);
        }

        video.src = fileURL;
        video.muted = true; 
        video.playsInline = true;
        video.preload = 'auto'; // ब्राउज़र को तुरंत लोड करने का निर्देश

        video.onloadeddata = () => { 
            video.currentTime = 0.2; // 0.2 सेकंड सीक करना ज्यादा तेज़ है
        }; 
        
        video.onseeked = () => {
            try {
                canvas.width = video.videoWidth || 360; 
                canvas.height = video.videoHeight || 640;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                // कंप्रेस्ड क्वालिटी 0.7 की ताकि जनरेशन इंस्टेंट हो
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7); 
                cleanup();
                resolve(dataUrl);
            } catch (e) {
                cleanup();
                resolve(""); 
            }
        };

        video.onerror = () => {
            cleanup();
            resolve(""); 
        };
    });
}

function generateImageThumbnail(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 120; 
                const scale = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.7)); 
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ==========================================
// --- 4. CLEANUP & RESET ---
// ==========================================
window.resetNewPostUI = () => {
    if (selectedMediaBase64 && selectedMediaBase64.startsWith('blob:')) {
        URL.revokeObjectURL(selectedMediaBase64); 
    }
    
    selectedRawFile = null;
    selectedMediaBase64 = null;
    currentVisualThumbnail = null;
    thumbnailPromise = null;

    const fileInput = document.getElementById('post-file-input');
    if (fileInput) fileInput.value = "";
    
    window.hidePostAlertBanner();
};

window.closeNewPostModal = () => {
    const modal = document.getElementById('create-post-modal');
    if (modal) {
        modal.style.transform = 'translate3d(0, 100%, 0)';
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.classList.add('hidden');
            window.resetNewPostUI();
        }, 350);
    }
};

// ==========================================
// --- 5. HIGH-SPEED CLOUDINARY UPLOADER ---
// ==========================================
function uploadFile(file, onProgress) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", "love_chats_unsigned");
        formData.append("cloud_name", "dknnmldye");

        const xhr = new XMLHttpRequest();
        currentUploadXHR = xhr; 
        xhr.open("POST", "https://api.gstatic.com/../../" ? "https://api.cloudinary.com/v1_1/dknnmldye/auto/upload" : "https://api.cloudinary.com/v1_1/dknnmldye/auto/upload");

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                resolve({ url: data.secure_url, type: data.resource_type });
            } else {
                reject(new Error("Cloudinary upload failed.")); 
            }
        };

        xhr.onerror = () => reject(new Error("Network connection lost."));
        xhr.onabort = () => reject(new Error("Cancelled"));
        xhr.send(formData);
    });
}

window.cancelUpload = () => {
    if (currentUploadXHR) { currentUploadXHR.abort(); currentUploadXHR = null; }
    const uploadArea = document.getElementById('upload-status-area');
    if (uploadArea) uploadArea.innerHTML = ""; 
    
    let userPhoto = window.currentUserData?.avatarBase64 || window.currentUserData?.photoURL || window.currentUser?.photoURL;
    if(typeof window.showToast === 'function') window.showToast("Cancelled", "Upload has been stopped.", userPhoto);
};

// ==========================================
// --- 6. FIRESTORE INTEGRATION & UPLOAD ---
// ==========================================
window.handlePublish = async () => {
    const captionInput = document.getElementById('post-caption');
    const caption = captionInput ? captionInput.value.trim() : "";
    const fileToUpload = selectedRawFile;
    
    if (!caption) {
        window.showPostAlertBanner("Write a caption before sharing!");
        return;
    }
    if (!fileToUpload) {
        window.showPostAlertBanner("No media file detected. Please retry.");
        return;
    }

    // 🌟 सुरक्षा जांच: यदि रील थंबनेल अभी जनरेट हो रहा है, तो उसके पूरे होने का इंतज़ार करें
    if (thumbnailPromise) {
        await thumbnailPromise;
    }

    const mediaPreview = currentVisualThumbnail; 

    window.hidePostAlertBanner();
    if (navigator.vibrate) navigator.vibrate(40);

    window.closeNewPostModal();
    window.switchTab('home');
    
    const homeView = document.getElementById('home-view');
    if (homeView) homeView.scrollTo({ top: 0, behavior: 'smooth' });

    const uploadArea = document.getElementById('upload-status-area');
    if (uploadArea) {
        uploadArea.innerHTML = `
            <div id="top-upload-bar" style="display: flex; align-items: center; background: #ffffff; padding: 12px 15px; border-bottom: 1.5px solid #e2e8f0; position: sticky; top: 0; z-index: 1000; box-shadow:0 4px 10px rgba(0,0,0,0.03);">
                <div style="position: relative; width: 40px; height: 40px; flex-shrink: 0;">
                    <!-- 📹 रील वीडियो से बना हुआ थंबनेल यहाँ सुरक्षित प्रदर्शित होगा -->
                    <img src="${mediaPreview}" style="width: 100%; height: 100%; border-radius: 6px; object-fit: cover; border: 1px solid #e2e8f0;">
                </div>
                <div style="flex: 1; margin-left: 15px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="color: #262626; font-size: 0.8rem; font-weight: 800;">${selectedMediaType === 'video' ? 'Posting Reel...' : 'Posting photo...'}</span>
                        <span id="upload-pc-text" style="color: #0095f6; font-size: 0.75rem; font-weight: 900;">0%</span>
                    </div>
                    <div style="width: 100%; height: 3px; background: rgba(0,0,0,0.05); border-radius: 10px; overflow: hidden;">
                        <div id="top-progress-fill" style="width: 0%; height: 100%; background: #0095f6; transition: width 0.3s ease-out;"></div>
                    </div>
                </div>
                <i class="fa-solid fa-xmark" style="color: #8e8e93; font-size: 1.1rem; padding: 10px; cursor: pointer;" onclick="cancelUpload()"></i>
            </div>`;
    }

    const fillBar = document.getElementById('top-progress-fill');
    const pcText = document.getElementById('upload-pc-text');
    let userPhoto = window.currentUserData?.avatarBase64 || window.currentUser?.photoURL || "https://i.pravatar.cc/150"; 

    try {
        const uploadData = await uploadFile(fileToUpload, (p) => {
             if (fillBar) fillBar.style.width = p + "%";
             if (pcText) pcText.innerText = p + "%";
        });

        await addDoc(collection(window.db, "posts"), {
            caption: caption, 
            mediaUrl: uploadData.url, 
            mediaType: uploadData.type, 
            userName: window.currentUser.displayName || "User", 
            userPhoto: userPhoto, 
            userId: window.currentUser.uid, 
            timestamp: serverTimestamp(), 
            likes: [], 
            commentCount: 0, 
            shareCount: 0
        });
        
        if (fillBar) fillBar.style.width = "100%";
        if (pcText) pcText.innerText = "Done";
        
        setTimeout(() => {
            if (uploadArea) {
                uploadArea.style.transform = "translate3d(0, -100%, 0)";
                uploadArea.style.opacity = "0";
                setTimeout(() => { 
                    uploadArea.innerHTML = ""; 
                    uploadArea.style.transform = "none"; 
                    uploadArea.style.opacity = "1"; 
                    if(typeof window.loadFeed === 'function') window.loadFeed(true); 
                }, 400);
            }
            if(typeof window.showToast === 'function') window.showToast("Success", "Shared successfully", userPhoto, "success");
            if (navigator.vibrate) navigator.vibrate([30, 30]); 
        }, 1000);

    } catch(e) { 
        if (e.message === "Cancelled") return;
        if (uploadArea) uploadArea.innerHTML = ""; 
        if(typeof window.showCustomAlert === 'function') {
            window.showCustomAlert("Upload Failed", "Could not complete upload. Please check connection.", "error"); 
        }
    } finally {
        currentUploadXHR = null;
        window.resetNewPostUI(); 
    }
};
