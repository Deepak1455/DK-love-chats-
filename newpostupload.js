// 👉 FIREBASE IMPORTS ADDED
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// ==========================================
// --- GLOBAL VARIABLES FOR POST UPLOAD ---
// ==========================================
let selectedRawFile = null;         
let selectedMediaBase64 = null;     
let selectedMediaType = 'image';    
let currentVisualThumbnail = null;  
let currentUploadXHR = null;        

// ==========================================
// --- 1. RESET & CLOSE UI ---
// ==========================================
window.resetNewPostUI = () => {
    if (selectedMediaBase64 && selectedMediaBase64.startsWith('blob:')) {
        URL.revokeObjectURL(selectedMediaBase64); 
    }
    
    selectedRawFile = null;
    selectedMediaBase64 = null;
    currentVisualThumbnail = null;

    const elements = {
        caption: document.getElementById('post-caption'),
        fileInput: document.getElementById('post-file-input'),
        removeBtn: document.getElementById('remove-btn'),
        wrapper: document.getElementById('preview-wrapper')
    };

    if (elements.caption) elements.caption.value = "";
    if (elements.fileInput) elements.fileInput.value = "";
    if (elements.removeBtn) {
        elements.removeBtn.style.opacity = '0';
        setTimeout(() => elements.removeBtn.style.display = 'none', 200);
    }
    if (elements.wrapper) {
        elements.wrapper.style.transition = "opacity 0.2s ease";
        elements.wrapper.style.opacity = "0";
        setTimeout(() => {
            elements.wrapper.innerHTML = `
                <div id="preview-placeholder" style="text-align: center; animation: fadeIn 0.4s ease-out;">
                    <div style="background: rgba(255,255,255,0.03); width: 100px; height: 100px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px; border: 1px solid rgba(255,255,255,0.05);">
                        <i class="fa-solid fa-cloud-arrow-up" style="font-size: 3rem; color: #444;"></i>
                    </div>
                    <p style="color: #666; font-size: 0.9rem; font-weight: 600; letter-spacing: 0.5px;">Photo or Video Preview</p>
                    <small style="color: #444; font-size: 0.75rem;">Selected media will appear here</small>
                </div>`;
            elements.wrapper.style.opacity = "1";
        }, 100);
    }
    if (navigator.vibrate) navigator.vibrate(10);
};

window.closeNewPostModal = () => {
    if (navigator.vibrate) navigator.vibrate(15);
    const captionInput = document.getElementById('post-caption');
    if (captionInput) captionInput.blur();
    window.toggleModal('create-post-modal', false);
};

// ==========================================
// --- 2. FILE SELECTION & PREVIEW ---
// ==========================================
window.updatePostUI = async (input) => {
    const file = input.files[0];
    if (!file) return;

    const isValid = file.type.startsWith('image/') || file.type.startsWith('video/');
    if (!isValid) {
        if(typeof window.showCustomAlert === 'function') window.showCustomAlert("Invalid File", "Please select only Photos or Videos!", "error");
        input.value = ""; return;
    }

    selectedRawFile = file;
    selectedMediaType = file.type.startsWith('video') ? 'video' : 'image';
    
    if (selectedMediaBase64 && selectedMediaBase64.startsWith('blob:')) URL.revokeObjectURL(selectedMediaBase64);
    selectedMediaBase64 = URL.createObjectURL(file);

    const wrapper = document.getElementById('preview-wrapper');
    const removeBtn = document.getElementById('remove-btn');
    if(removeBtn) removeBtn.style.display = 'flex'; 

    if (selectedMediaType === 'video') {
        wrapper.innerHTML = `<div style="color:var(--primary); font-weight:bold; text-align:center;"><i class="fa-solid fa-circle-notch fa-spin"></i> Generating Cover...</div>`;
        const coverURL = await generateVideoCover(file);
        currentVisualThumbnail = coverURL; 
        wrapper.innerHTML = `<video id="preview-vid" src="${selectedMediaBase64}" poster="${coverURL}" autoplay loop playsinline style="width:100%; height:100%; object-fit:cover;"></video>`;
        const vid = document.getElementById('preview-vid');
        vid.addEventListener('pointerdown', () => vid.pause());
        vid.addEventListener('pointerup', () => vid.play());
    } else {
        currentVisualThumbnail = selectedMediaBase64;
        wrapper.innerHTML = `<img id="preview-img" src="${selectedMediaBase64}" style="width:100%; height:100%; object-fit:contain; cursor:grab; transform-origin: center; touch-action: none; transition: transform 0.3s cubic-bezier(0.2, 0, 0.2, 1);">`;
        const img = document.getElementById('preview-img');
        let scale = 1, isDragging = false, startX, startY, transX = 0, transY = 0;

        img.ondblclick = () => {
            scale = (scale === 1) ? 3 : 1; 
            if(scale === 1) { transX = 0; transY = 0; }
            img.style.transform = `translate(${transX}px, ${transY}px) scale(${scale})`;
        };
        img.onpointerdown = (e) => {
            if (scale <= 1) return; 
            isDragging = true; img.style.transition = "none";
            startX = e.clientX - transX; startY = e.clientY - transY;
            img.setPointerCapture(e.pointerId); 
        };
        window.onpointermove = (e) => {
            if (!isDragging) return;
            transX = e.clientX - startX; transY = e.clientY - startY;
            requestAnimationFrame(() => img.style.transform = `translate(${transX}px, ${transY}px) scale(${scale})`);
        };
        window.onpointerup = () => { isDragging = false; img.style.transition = "transform 0.2s ease-out"; };
    }
};

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

// ==========================================
// --- 3. CLOUDINARY FILE UPLOAD ENGINE ---
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
            if (e.lengthComputable && onProgress) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                resolve({ url: data.secure_url, type: data.resource_type });
            } else {
                // 👉 BUGS FIXED: अब Cloudinary का असली एरर मैसेज मिलेगा
                let errorMsg = "Upload failed on server.";
                try {
                    const errData = JSON.parse(xhr.responseText);
                    errorMsg = errData.error.message || errorMsg;
                } catch(e) {}
                console.error("Cloudinary Detailed Error:", xhr.responseText);
                reject(new Error(errorMsg)); 
            }
        };

        xhr.onerror = () => reject(new Error("Network connection error."));
        xhr.onabort = () => reject(new Error("Cancelled"));
        xhr.send(formData);
    });
}

window.cancelUpload = () => {
    if (currentUploadXHR) { currentUploadXHR.abort(); currentUploadXHR = null; }
    const uploadArea = document.getElementById('upload-status-area');
    if (uploadArea) uploadArea.innerHTML = ""; 
    
    // 👉 SCOPE FIX: Using window.currentUserData
    let userPhoto = window.currentUserData?.avatarBase64 || window.currentUserData?.photoURL || window.currentUser?.photoURL;
    if(typeof window.showToast === 'function') window.showToast("Cancelled", "Upload has been stopped.", userPhoto);
};

// ==========================================
// --- 4. PUBLISH POST TO FIREBASE ---
// ==========================================
window.handlePublish = async () => {
    const captionInput = document.getElementById('post-caption');
    const caption = captionInput.value.trim();
    const fileToUpload = selectedRawFile;
    const mediaPreview = currentVisualThumbnail; 

    if(!fileToUpload) {
        return typeof window.showCustomAlert === 'function' ? window.showCustomAlert("Required", "Please select a photo or video to share.", "warning") : alert("Select media");
    }
    
    if (navigator.vibrate) navigator.vibrate(40);

    window.toggleModal('create-post-modal', false);
    window.switchTab('home');
    document.getElementById('home-view').scrollTo({ top: 0, behavior: 'smooth' });

    const uploadArea = document.getElementById('upload-status-area');
    if (uploadArea) {
        uploadArea.innerHTML = `
            <div id="top-upload-bar" style="display: flex; align-items: center; background: #1e1e2d; padding: 12px 15px; border-bottom: 2px solid rgba(255,255,255,0.05); position: sticky; top: 0; z-index: 1000; animation: slideDown 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                <div style="position: relative; width: 40px; height: 40px; flex-shrink: 0;">
                    <img src="${mediaPreview}" style="width: 100%; height: 100%; border-radius: 8px; object-fit: cover; border: 1.5px solid #444;">
                    <div id="upload-spinner" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                         <i class="fa-solid fa-circle-notch fa-spin" style="color: white; font-size: 0.8rem;"></i>
                    </div>
                </div>
                <div style="flex: 1; margin-left: 15px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span style="color: white; font-size: 0.85rem; font-weight: 800; letter-spacing: 0.5px;">Sharing post...</span>
                        <span id="upload-pc-text" style="color: var(--primary); font-size: 0.75rem; font-weight: 900;">0%</span>
                    </div>
                    <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 10px; overflow: hidden;">
                        <div id="top-progress-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--primary), #8338ec); transition: width 0.3s ease-out; box-shadow: 0 0 10px var(--primary);"></div>
                    </div>
                </div>
                <i class="fa-solid fa-xmark" style="color: #666; font-size: 1.2rem; padding: 10px; cursor: pointer;" onclick="cancelUpload()"></i>
            </div>`;
    }

    const fillBar = document.getElementById('top-progress-fill');
    const pcText = document.getElementById('upload-pc-text');
    
    // 👉 SCOPE FIX: Accessing user data globally from window
    let userPhoto = window.currentUserData?.avatarBase64 || window.currentUser?.photoURL || "https://i.pravatar.cc/150"; 

    try {
        const uploadData = await uploadFile(fileToUpload, (p) => {
             if (fillBar) fillBar.style.width = p + "%";
             if (pcText) pcText.innerText = p + "%";
        });

        // 👉 SCOPE FIX: Using imported 'addDoc', 'collection', 'serverTimestamp' and global 'window.db'
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
        const upSpinner = document.getElementById('upload-spinner');
        if(upSpinner) upSpinner.innerHTML = '<i class="fa-solid fa-check" style="color: #00b894;"></i>';
        
        setTimeout(() => {
            if (uploadArea) {
                uploadArea.style.transition = "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)";
                uploadArea.style.transform = "translateY(-100%)";
                uploadArea.style.opacity = "0";
                setTimeout(() => { 
                    uploadArea.innerHTML = ""; 
                    uploadArea.style.transform = "none"; 
                    uploadArea.style.opacity = "1"; 
                    if(typeof window.loadFeed === 'function') window.loadFeed(true); 
                }, 500);
            }
            if(typeof window.showToast === 'function') window.showToast("Success", "Your post is now live!", userPhoto, "success");
            if (navigator.vibrate) navigator.vibrate([30, 30]); 
        }, 1000);

    } catch(e) { 
        if (e.message === "Cancelled") return;
        console.error("Publish Error Details:", e);
        if (uploadArea) uploadArea.innerHTML = ""; 
        
        // 👉 BUGS FIXED: अब Error Message में सही कारण दिखेगा (जैसे Video Too Large)
        if(typeof window.showCustomAlert === 'function') {
            window.showCustomAlert("Upload Failed", e.message || "Failed to upload post.", "error"); 
        }
    } finally {
        currentUploadXHR = null;
        window.resetNewPostUI(); 
    }
};