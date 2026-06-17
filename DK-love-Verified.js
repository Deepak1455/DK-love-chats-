// =========================================================
// DK-love-Verified.js - Consolidated Smart Verification & Achievements Engine
// =========================================================
import { 
    doc, 
    updateDoc, 
    getDoc, 
    getDocs, 
    query, 
    collection, 
    where, 
    arrayUnion,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// रीयल-टाइम स्नैपशॉट को ट्रैक और साफ़ करने के लिए वेरिएबल
window.unsubscribeHubUser = window.unsubscribeHubUser || null;

// आज की तारीख प्राप्त करने के लिए आंतरिक हेल्पर (YYYY-MM-DD)
function getTodayDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 1. दैनिक लॉगिन एक्टिविटी ट्रैकर
 */
export async function recordUserActivity(userId, db) {
    if (!userId || !db) return;
    const today = getTodayDateString();
    const userRef = doc(db, "users", userId);

    try {
        await updateDoc(userRef, {
            loginDays: arrayUnion(today)
        });
        console.log("[Verification Engine] Activity logged for:", today);
    } catch (e) {
        console.error("[Verification Engine] Error recording daily activity:", e.message);
    }
}

/**
 * 2. पात्रता (Eligibility) की समीक्षा और लाइव डेटा संकलन
 */
export async function checkVerificationEligibility(userId, db) {
    if (!userId || !db) return null;

    try {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return null;

        const userData = userSnap.data();
        const loginDaysCount = userData.loginDays ? userData.loginDays.length : 0;

        let followerCount = 0;
        if (userData.followers) {
            if (Array.isArray(userData.followers)) {
                followerCount = userData.followers.length;
            } else {
                followerCount = parseInt(userData.followers) || 0;
            }
        }

        const postsQuery = query(collection(db, "posts"), where("userId", "==", userId));
        const querySnapshot = await getDocs(postsQuery);

        let imagePostCount = 0;
        let videoReelCount = 0;
        let totalLikes = 0;
        let totalViews = 0;

        querySnapshot.forEach((docSnap) => {
            const post = docSnap.data();
            
            if (post.mediaType === 'video') {
                videoReelCount++;
            } else {
                imagePostCount++;
            }

            if (post.likes && Array.isArray(post.likes)) {
                totalLikes += post.likes.length;
            }

            const viewsVal = post.views ? (Array.isArray(post.views) ? post.views.length : post.views) : 0;
            totalViews += parseInt(viewsVal) || 0;
        });

        const eligible = {
            loginDays: { current: loginDaysCount, target: 15, met: loginDaysCount >= 15 },
            posts: { current: imagePostCount, target: 25, met: imagePostCount >= 25 },
            reels: { current: videoReelCount, target: 50, met: videoReelCount >= 50 },
            likes: { current: totalLikes, target: 100, met: totalLikes >= 100 },
            views: { current: totalViews, target: 5000, met: totalViews >= 5000 },
            followers: { current: followerCount, target: 1000, met: followerCount >= 1000 }
        };

        const isFullyEligible = eligible.loginDays.met && 
                                eligible.posts.met && 
                                eligible.reels.met && 
                                eligible.likes.met && 
                                eligible.views.met &&
                                eligible.followers.met;

        if (isFullyEligible && !userData.isVerified) {
            await updateDoc(userRef, { isVerified: true });
            if (typeof window.showCustomAlert === 'function') {
                window.showCustomAlert("Unlocked 🎉", "Congratulations! Your account is now verified.", "success");
            }
            userData.isVerified = true;
        }

        return { 
            ...eligible, 
            isVerified: userData.isVerified === true || isFullyEligible 
        };

    } catch (e) {
        console.error("[Verification Engine] Error analyzing verification metrics:", e.message);
        return null;
    }
}

/**
 * 3. प्रीमियम रोज़ गोल्ड वेरिफिकेशन बैच रेंडरर
 */
export function getVerifiedBadgeHTML(isVerified, size = 32) {
    if (!isVerified) return "";
    
    const uniqueSuffix = Math.random().toString(36).substring(2, 8);
    const gradId = `premiumGradient_${uniqueSuffix}`;
    const glowId = `premiumGlow_${uniqueSuffix}`;

    return `
    <svg width="${size}" height="${size}" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-left: 6px; display: inline-block; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.4));" title="Verified Creator Profile">
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFE5B4"/>
          <stop offset="50%" stop-color="#FF9F1C"/>
          <stop offset="100%" stop-color="#FF5400"/>
        </linearGradient>
        <filter id="${glowId}">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <path
        d="M64 10L79 22L98 20L96 39L110 54L96 69L98 88L79 86L64 100L49 86L30 88L32 69L18 54L32 39L30 20L49 22Z"
        fill="url(#${gradId})"
        filter="url(#${glowId})"
      />
      <circle
        cx="64"
        cy="54"
        r="30"
        fill="#FFFFFF"
        opacity="0.12"
      />
      <path
        d="M47 55L59 67L82 44"
        fill="none"
        stroke="#FFFFFF"
        stroke-width="8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>`;
}

window.getVerifiedBadgeHTML = getVerifiedBadgeHTML;

/**
 * 4. यूआई चेकलिस्ट लेआउट जनरेटर (CSS क्लास बाइंडिंग के साथ)
 */
function buildChecklistHTML(data, forceComplete = false) {
    const loginDaysCurrent = forceComplete ? Math.max(data.loginDays.current, 15) : data.loginDays.current;
    const postsCurrent = forceComplete ? Math.max(data.posts.current, 25) : data.posts.current;
    const reelsCurrent = forceComplete ? Math.max(data.reels.current, 50) : data.reels.current;
    const likesCurrent = forceComplete ? Math.max(data.likes.current, 100) : data.likes.current;
    const viewsCurrent = forceComplete ? Math.max(data.views.current, 5000) : data.views.current;
    const followersCurrent = forceComplete ? Math.max((data.followers?.current || 0), 1000) : (data.followers?.current || 0);

    const loginDaysMet = forceComplete ? true : data.loginDays.met;
    const postsMet = forceComplete ? true : data.posts.met;
    const reelsMet = forceComplete ? true : data.reels.met;
    const likesMet = forceComplete ? true : data.likes.met;
    const viewsMet = forceComplete ? true : data.views.met;
    const followersMet = forceComplete ? true : (data.followers?.met || false);

    const followersTarget = data.followers?.target || 1000;

    return `
        <!-- 📅 Active Login Days -->
        <div class="verification-checklist-item" style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); animation: fadeIn 0.3s ease-out;">
            <span style="display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-calendar-day" style="color: #ff9f43; font-size:0.9rem; width:20px;"></i>
                Active Login Days
            </span>
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="color:#fff; font-weight:700;">${loginDaysCurrent}/${data.loginDays.target}</span>
                <span style="color:${loginDaysMet ? '#00b894':'#ff4757'}; font-size: 1.1rem;">
                    <i class="fa-solid ${loginDaysMet ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                </span>
            </div>
        </div>

        <!-- 🖼️ Image Posts -->
        <div class="verification-checklist-item" style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); animation: fadeIn 0.3s ease-out; animation-delay: 0.05s;">
            <span style="display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-images" style="color: #00d2ff; font-size:0.9rem; width:20px;"></i>
                Image Posts Published
            </span>
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="color:#fff; font-weight:700;">${postsCurrent}/${data.posts.target}</span>
                <span style="color:${postsMet ? '#00b894':'#ff4757'}; font-size: 1.1rem;">
                    <i class="fa-solid ${postsMet ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                </span>
            </div>
        </div>

        <!-- 🎬 Video Reels -->
        <div class="verification-checklist-item" style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); animation: fadeIn 0.3s ease-out; animation-delay: 0.1s;">
            <span style="display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-clapperboard" style="color: #ff006e; font-size:0.9rem; width:20px;"></i>
                Video Reels Uploaded
            </span>
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="color:#fff; font-weight:700;">${reelsCurrent}/${data.reels.target}</span>
                <span style="color:${reelsMet ? '#00b894':'#ff4757'}; font-size: 1.1rem;">
                    <i class="fa-solid ${reelsMet ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                </span>
            </div>
        </div>

        <!-- ❤️ Total Likes -->
        <div class="verification-checklist-item" style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); animation: fadeIn 0.3s ease-out; animation-delay: 0.15s;">
            <span style="display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-heart" style="color: #ff4757; font-size:0.9rem; width:20px;"></i>
                Total Likes Received
            </span>
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="color:#fff; font-weight:700;">${likesCurrent}/${data.likes.target}</span>
                <span style="color:${likesMet ? '#00b894':'#ff4757'}; font-size: 1.1rem;">
                    <i class="fa-solid ${likesMet ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                </span>
            </div>
        </div>

        <!-- 👁️ Total Views -->
        <div class="verification-checklist-item" style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); animation: fadeIn 0.3s ease-out; animation-delay: 0.2s;">
            <span style="display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-eye" style="color: #00b894; font-size:0.9rem; width:20px;"></i>
                Total Views Received
            </span>
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="color:#fff; font-weight:700;">${viewsCurrent}/${data.views.target}</span>
                <span style="color:${viewsMet ? '#00b894':'#ff4757'}; font-size: 1.1rem;">
                    <i class="fa-solid ${viewsMet ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                </span>
            </div>
        </div>

        <!-- 👥 Total Followers -->
        <div class="verification-checklist-item" style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0; animation: fadeIn 0.3s ease-out; animation-delay: 0.25s;">
            <span style="display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-users" style="color: #a855f7; font-size:0.9rem; width:20px;"></i>
                Total Followers
            </span>
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="color:#fff; font-weight:700;">${followersCurrent}/${followersTarget}</span>
                <span style="color:${followersMet ? '#00b894':'#ff4757'}; font-size: 1.1rem;">
                    <i class="fa-solid ${followersMet ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                </span>
            </div>
        </div>
    `;
}

/**
 * 5. प्रोफाइल प्रोग्रेस कार्ड अपडेशन (फ्लिकर-फ्री)
 */
window.updateProfileVerificationUI = async (targetUid, isVerified) => {
    const progressCard = document.getElementById('verified-progress-card');
    const checklistEl = document.getElementById('verification-checklist');
    if (!progressCard || !checklistEl) return;

    if (window.currentUser && targetUid === window.currentUser.uid) {
        progressCard.style.display = "block";
        progressCard.classList.remove('hidden');

        if (checklistEl.innerHTML.trim() === "" || checklistEl.querySelector('.fa-spinner')) {
            checklistEl.innerHTML = `
                <div style="text-align:center; padding:15px; color:#aaa; min-height: 180px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="fa-solid fa-spinner fa-spin" style="color: #0095f6;"></i>
                    <span>Compiling stats...</span>
                </div>
            `;
        }

        try {
            const data = await checkVerificationEligibility(targetUid, window.db);
            if (data) {
                checklistEl.innerHTML = buildChecklistHTML(data, isVerified);
            }
        } catch (e) {
            if (checklistEl.innerHTML.trim() === "" || checklistEl.querySelector('.fa-spinner')) {
                checklistEl.innerHTML = '<div style="text-align:center; color:#ff4757; font-size:0.8rem; padding: 10px;">Failed to gather stats.</div>';
            }
        }
    } else {
        progressCard.style.display = "none";
        progressCard.classList.add('hidden');
    }
};

/**
 * 6. Verification Hub खोलना
 */
window.openVerificationHub = async () => {
    const hubModal = document.getElementById('verification-hub-modal');
    const placeholder = document.getElementById('hub-verified-card-placeholder');
    if (!hubModal || !placeholder) return;

    window.toggleModal('settings-modal', false);

    hubModal.classList.remove('hidden');
    requestAnimationFrame(() => {
        hubModal.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
        hubModal.style.transform = 'translate3d(0, 0, 0)';
    });
    
    if (navigator.vibrate) navigator.vibrate(15);

    if (placeholder.innerHTML.trim() === "" || placeholder.querySelector('.fa-spinner')) {
        placeholder.innerHTML = `
            <div style="text-align:center; padding:40px; min-height: 300px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;">
                <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; color:#0095f6;"></i>
                <p style="margin: 0; color:#64748b; font-size:0.9rem;">Compiling Verification Progress...</p>
            </div>
        `;
    }

    const userId = window.currentUser ? window.currentUser.uid : null;
    if (!userId) return;

    if (window.unsubscribeHubUser) window.unsubscribeHubUser();
    
    window.unsubscribeHubUser = onSnapshot(doc(window.db, "users", userId), async (docSnap) => {
        if (!docSnap.exists() || hubModal.classList.contains('hidden')) return;

        const userData = docSnap.data();
        const data = await checkVerificationEligibility(userId, window.db);
        
        const isVerified = userData.isVerified === true || (data && data.isVerified === true);
        const isAdminVerified = userData.verifiedByAdmin === true || userData.isDkVerified === true || userData.verifiedBy === 'admin';
        const isTrackerActivated = isVerified || userData.trackerActivated === true || localStorage.getItem(`DLC_tracker_activated_${userId}`) === 'true';

        if (userData.trackerActivated === true) {
            localStorage.setItem(`DLC_tracker_activated_${userId}`, 'true');
        }

        if (data) {
            // क्रियाशीलता बटन स्थिति जनरेटर
            let actionButtonHTML = "";
            if (!isAdminVerified) {
                if (isTrackerActivated) {
                    if (isVerified) {
                        actionButtonHTML = `
                            <button id="btn-reveal-achievements" disabled style="
                                width: 100%;
                                padding: 15px;
                                background: rgba(0, 149, 246, 0.08);
                                color: #00b894;
                                border: 1px solid rgba(0, 149, 246, 0.15);
                                border-radius: 18px;
                                font-weight: 800;
                                font-size: 0.92rem;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                gap: 10px;
                                margin-bottom: 20px;
                                box-sizing: border-box;
                                cursor: default;
                                pointer-events: none;
                            ">
                                ${getVerifiedBadgeHTML(true, 18)} Activated
                            </button>
                        `;
                    } else {
                        actionButtonHTML = `
                            <button id="btn-reveal-achievements" disabled style="
                                width: 100%;
                                padding: 15px;
                                background: rgba(255, 159, 28, 0.08);
                                color: #ff9f1c;
                                border: 1px solid rgba(255, 159, 28, 0.15);
                                border-radius: 18px;
                                font-weight: 800;
                                font-size: 0.92rem;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                gap: 10px;
                                margin-bottom: 20px;
                                box-sizing: border-box;
                                cursor: default;
                                pointer-events: none;
                            ">
                                ${getVerifiedBadgeHTML(true, 18)} Verification Progress Activated
                            </button>
                        `;
                    }
                } else {
                    actionButtonHTML = `
                        <button id="btn-reveal-achievements" onclick="window.revealAchievementsCard()" style="
                            width: 100%;
                            padding: 15px;
                            background: linear-gradient(135deg, #0095f6, #8338ec);
                            color: #ffffff;
                            border: none;
                            border-radius: 18px;
                            font-weight: 800;
                            font-size: 0.92rem;
                            cursor: pointer;
                            box-shadow: 0 6px 20px rgba(0, 149, 246, 0.25);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 10px;
                            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                            margin-bottom: 20px;
                            box-sizing: border-box;
                        " onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform='scale(1)'">
                            ${getVerifiedBadgeHTML(true, 18)} Check Achievements Board
                        </button>
                    `;
                }
            }

            // अचीवमेंट बोर्ड यूआई कंडीशनल जनरेटर (CSS Classes के साथ एकीकृत)
            let achievementsCardBoardHTML = "";
            if (!isAdminVerified) {
                achievementsCardBoardHTML = `
                    <!-- 🏆 ACHIEVEMENTS CARD BOARD -->
                    <div id="achievements-card-board" style="
                        width: 100%;
                        max-height: ${isTrackerActivated ? '1000px' : '0px'};
                        opacity: ${isTrackerActivated ? '1' : '0'};
                        overflow: hidden;
                        transition: max-height 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.5s ease-out;
                        box-sizing: border-box;
                    ">
                        <div style="
                            width: 100%; 
                            background: linear-gradient(145deg, #10002b, #151525); 
                            border-radius: 24px; 
                            padding: 24px; 
                            border: 2px solid transparent; 
                            background-image: linear-gradient(#10002b, #151525), linear-gradient(135deg, #0095f6, #8338ec, #ff006e); 
                            background-origin: border-box; 
                            background-clip: padding-box, border-box; 
                            box-shadow: 0 20px 40px rgba(0,0,0,0.35), 0 0 20px rgba(0, 149, 246, 0.2);
                            color: #ffffff;
                            box-sizing: border-box;
                            text-align: left;
                        ">
                            <div style="text-align: center; margin-bottom: 22px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 15px;">
                                <div style="width: 52px; height: 52px; background: rgba(0, 149, 246, 0.12); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; box-shadow: 0 0 15px rgba(0, 149, 246, 0.3); border: 1px solid rgba(0, 149, 246, 0.3);">
                                    <i class="fa-solid fa-award" style="color: #0095f6; font-size: 1.6rem;"></i>
                                </div>
                                <h2 style="margin: 0; font-size: 1.25rem; font-weight: 800; color: #fff;">Badge Achievements</h2>
                                <span style="font-size: 0.72rem; color: #0095f6; text-transform: uppercase; letter-spacing: 2px; font-weight: 800; display: block; margin-top: 4px;">Verified Creator Hub</span>
                            </div>

                            <div id="checklist-embed-container" class="${isVerified ? 'milestone-verified-active' : ''}" style="display: flex; flex-direction: column; gap: 14px; font-size: 0.88rem; color: #cbd5e1;">
                                ${isVerified ? `
                                    <div style="text-align: center; padding: 15px 0 20px; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 15px;">
                                        <div style="position: relative; display: inline-block;">
                                            ${getVerifiedBadgeHTML(true, 38)}
                                        </div>
                                        <div style="font-weight: 900; color: #fff; font-size: 1.15rem; margin-top: 8px;">
                                            Rose Gold Verified!
                                        </div>
                                        <p style="font-size: 0.78rem; color: #cbd5e1; margin-top: 4px; line-height: 1.3;">
                                            Your Rose Gold Verified Tick is active.
                                        </p>
                                    </div>
                                    ${buildChecklistHTML(data, true)} 
                                ` : buildChecklistHTML(data, false)}
                            </div>
                        </div>
                    </div>
                `;
            } else {
                // एडमिन वेरिफिकेशन स्थिति (इसके लोड होने पर CSS क्लास `admin-verified-active` सभी चेकलिस्ट एलिमेंट्स को हाइड रखेगी)
                achievementsCardBoardHTML = `
                    <div style="
                        width: 100%;
                        background: linear-gradient(135deg, rgba(255, 159, 28, 0.12), rgba(255, 84, 0, 0.12));
                        border-radius: 24px;
                        padding: 24px;
                        border: 1px solid rgba(255, 159, 28, 0.25);
                        box-shadow: 0 10px 30px rgba(255, 84, 0, 0.15);
                        text-align: center;
                        animation: fadeIn 0.4s ease-out;
                        box-sizing: border-box;
                    ">
                        <div style="position: relative; display: inline-block; margin-bottom: 10px;">
                            ${getVerifiedBadgeHTML(true, 44)}
                        </div>
                        <h3 style="margin: 0; color: #ffffff; font-weight: 900; font-size: 1.25rem;">DK Rose Gold Verified!</h3>
                        <p style="color: #cbd5e1; font-size: 0.85rem; line-height: 1.4; margin: 8px 0 0 0; font-weight: 500;">
                            Your DK Rose Gold Verified Tick is active.
                        </p>
                    </div>
                    
                    <!-- छिपे हुए सुरक्षित चेकलिस्ट कंटेनर पर क्लास लागू करना -->
                    <div id="checklist-embed-container" class="admin-verified-active" style="display:none;">
                         ${buildChecklistHTML(data, false)}
                    </div>
                `;
            }

            placeholder.innerHTML = `
                <!-- 🎖️ HOW TO ACTIVATE INFO CARD -->
                <div style="
                    width: 100%;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 20px;
                    padding: 18px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    box-shadow: 0 8px 25px rgba(0,0,0,0.15);
                    margin-bottom: 20px;
                    text-align: left;
                    box-sizing: border-box;
                    animation: fadeIn 0.4s ease-out;
                ">
                    <h4 style="margin: 0 0 12px 0; color: #ffffff; font-weight: 800; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-circle-question" style="color: #FF9F1C;"></i> 
                        How to Activate Verification?
                    </h4>
                    <p style="color: #cbd5e1; font-size: 0.82rem; line-height: 1.5; margin: 0 0 14px 0;">
                        To activate the Rose Gold Verified Creator Badge on DK Love Chats, you must achieve the following milestones:
                    </p>
                    <ul style="margin: 0; padding: 0; list-style-type: none; color: #94a3b8; font-size: 0.8rem; line-height: 1.6; display: flex; flex-direction: column; gap: 8px;">
                        <li style="display: flex; align-items: center; gap: 10px;">
                            <i class="fa-solid fa-calendar-day" style="color: #ff9f43; font-size:0.9rem; width:15px; text-align: center;"></i>
                            <span><b style="color: #fff;">15 Active Login Days:</b> Maintain a history of at least 15 active login days.</span>
                        </li>
                        <li style="display: flex; align-items: center; gap: 10px;">
                            <i class="fa-solid fa-images" style="color: #00d2ff; font-size:0.9rem; width:15px; text-align: center;"></i>
                            <span><b style="color: #fff;">25 Image Posts:</b> Publish a minimum of 25 standard photo posts.</span>
                        </li>
                        <li style="display: flex; align-items: center; gap: 10px;">
                            <i class="fa-solid fa-clapperboard" style="color: #ff006e; font-size:0.9rem; width:15px; text-align: center;"></i>
                            <span><b style="color: #fff;">50 Video Reels:</b> Upload a minimum of 50 video reels.</span>
                        </li>
                        <li style="display: flex; align-items: center; gap: 10px;">
                            <i class="fa-solid fa-heart" style="color: #ff4757; font-size:0.9rem; width:15px; text-align: center;"></i>
                            <span><b style="color: #fff;">100 Total Likes:</b> Receive at least 100 likes across all your published content.</span>
                        </li>
                        <li style="display: flex; align-items: center; gap: 10px;">
                            <i class="fa-solid fa-eye" style="color: #00b894; font-size:0.9rem; width:15px; text-align: center;"></i>
                            <span><b style="color: #fff;">5,000 Total Views:</b> Accumulate a minimum of 5,000 combined views on your reels and posts.</span>
                        </li>
                        <li style="display: flex; align-items: center; gap: 10px;">
                            <i class="fa-solid fa-users" style="color: #a855f7; font-size:0.9rem; width:15px; text-align: center;"></i>
                            <span><b style="color: #fff;">1,000 Total Followers:</b> Have a minimum of 1,000 followers on your profile.</span>
                        </li>
                    </ul>
                </div>

                <!-- 🔘 ACTIVE ICON ACTION BUTTON -->
                ${actionButtonHTML}

                <!-- 🏆 CONDITIONAL ACHIEVEMENTS CONTAINER -->
                ${achievementsCardBoardHTML}
            `;
        }
    });
};

/**
 * 7. सक्रिय बटन पर क्लिक एक्शन
 */
window.revealAchievementsCard = async () => {
    const board = document.getElementById('achievements-card-board');
    const btn = document.getElementById('btn-reveal-achievements');
    if (!board || !btn) return;

    const userId = window.currentUser ? window.currentUser.uid : null;
    if (userId) {
        localStorage.setItem(`DLC_tracker_activated_${userId}`, 'true');
        try {
            await updateDoc(doc(window.db, "users", userId), {
                trackerActivated: true
            });
            console.log("[Verification Engine] Tracker activation synced to database.");
        } catch (dbErr) {
            console.warn("[Verification Engine] Database sync failed, using local persistence fallback:", dbErr.message);
        }
    }

    if (board) {
        board.style.maxHeight = '1000px'; 
        board.style.opacity = '1';
    }

    if (navigator.vibrate) navigator.vibrate(35);

    let isFullyVerified = false;
    if (userId && window.db) {
        const data = await checkVerificationEligibility(userId, window.db);
        if (data && data.isVerified) {
            isFullyVerified = true;
        }
    }

    if (isFullyVerified) {
        btn.innerHTML = `${window.getVerifiedBadgeHTML(true, 18)} Activated`;
        btn.style.color = '#00b894';
        btn.style.border = '1px solid rgba(0, 149, 246, 0.15)';
    } else {
        btn.innerHTML = `${window.getVerifiedBadgeHTML(true, 18)} Verification Progress Activated`;
        btn.style.color = '#ff9f1c';
        btn.style.border = '1px solid rgba(255, 159, 28, 0.15)';
    }
    
    btn.disabled = true;
    btn.onclick = null;
    
    btn.style.cursor = 'default';
    btn.style.pointerEvents = 'none';
    btn.style.background = 'rgba(0, 149, 246, 0.08)';
    btn.style.boxShadow = 'none';
    btn.style.transform = 'none';
};

/**
 * 8. Verification Hub बंद करना (Visual Refresh)
 */
window.closeVerificationHub = () => {
    const hubModal = document.getElementById('verification-hub-modal');
    if (!hubModal) return;

    if (window.unsubscribeHubUser) {
        window.unsubscribeHubUser();
        window.unsubscribeHubUser = null;
    }

    if (typeof window.toggleModal === 'function') {
        window.toggleModal('settings-modal', true);
    }

    hubModal.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
    hubModal.style.transform = 'translate3d(0, 100%, 0)';

    setTimeout(() => {
        hubModal.classList.add('hidden');
        
        if (window.currentUser) {
            const userId = window.currentUser.uid;
            
            getDoc(doc(window.db, "users", userId)).then((docSnap) => {
                if (docSnap.exists()) {
                    const freshData = docSnap.data();
                    const isVerified = freshData.isVerified === true;
                    
                    const usernameEl = document.getElementById('profile-username');
                    if (usernameEl) {
                        const badgeHtml = isVerified ? window.getVerifiedBadgeHTML(true, 18) : "";
                        usernameEl.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 4px;">@${freshData.username || "user"}${badgeHtml}</span>`;
                    }
                    
                    const dpBadgeEl = document.getElementById('profile-dp-badge');
                    if (dpBadgeEl) {
                        dpBadgeEl.classList.add('hidden');
                        dpBadgeEl.style.display = 'none';
                    }
                    
                    if (typeof window.updateProfileVerificationUI === 'function') {
                        window.updateProfileVerificationUI(userId, isVerified);
                    }
                }
            }).catch(e => console.warn("Background UI visual refresh bypassed on exit:", e.message));
        }
    }, 250);
};
