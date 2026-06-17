// DK-love-Verified.js - Consolidated Smart Verification & Achievements Engine
import { 
    doc, 
    updateDoc, 
    getDoc, 
    getDocs, 
    query, 
    collection, 
    where, 
    arrayUnion 
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

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
            loginDays: { current: loginDaysCount, target: 15, met: loginDaysCount >= 1 },
            posts: { current: imagePostCount, target: 25, met: imagePostCount >= 1 },
            reels: { current: videoReelCount, target: 50, met: videoReelCount >= 1 },
            likes: { current: totalLikes, target: 250, met: totalLikes >= 1 },
            views: { current: totalViews, target: 1000, met: totalViews >= 1 }
        };

        const isFullyEligible = eligible.loginDays.met && 
                                eligible.posts.met && 
                                eligible.reels.met && 
                                eligible.likes.met && 
                                eligible.views.met;

        if (isFullyEligible && !userData.isVerified) {
            await updateDoc(userRef, { isVerified: true });
            if (typeof window.showCustomAlert === 'function') {
                window.showCustomAlert("Unlocked 🎉", "Congratulations! Your account is now verified.", "success");
            }
        } else if (!isFullyEligible && userData.isVerified) {
            await updateDoc(userRef, { isVerified: false });
        }

        return { 
            ...eligible, 
            isVerified: userData.isVerified || isFullyEligible 
        };

    } catch (e) {
        console.error("[Verification Engine] Error analyzing verification metrics:", e.message);
        return null;
    }
}

/**
 * 3. प्रीमियम रोज़ गोल्ड वेरिफिकेशन बैच रेंडरर (SVG) - आकार और छाया सुधार के साथ
 */
export function getVerifiedBadgeHTML(isVerified, size = 32) {
    if (!isVerified) return "";
    return `
    <svg width="${size}" height="${size}" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-left: 6px; display: inline-block; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.4));" title="Verified Creator Profile">
      <defs>
        <!-- Rose Gold Gradient -->
        <linearGradient id="premiumGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFE5B4"/>
          <stop offset="50%" stop-color="#FF9F1C"/>
          <stop offset="100%" stop-color="#FF5400"/>
        </linearGradient>

        <!-- Glow Effect -->
        <filter id="premiumGlow">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <!-- Badge Shape -->
      <path
        d="M64 10L79 22L98 20L96 39L110 54L96 69L98 88L79 86L64 100L49 86L30 88L32 69L18 54L32 39L30 20L49 22Z"
        fill="url(#premiumGradient)"
        filter="url(#premiumGlow)"
      />

      <!-- Highlight -->
      <circle
        cx="64"
        cy="54"
        r="30"
        fill="#FFFFFF"
        opacity="0.12"
      />

      <!-- White Tick -->
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

// ग्लोबल स्कोप में उपलब्ध कराएं ताकि अन्य स्क्रिप्ट फ़ाइलें इसे कॉल कर सकें
window.getVerifiedBadgeHTML = getVerifiedBadgeHTML;

/**
 * 4. यूआई चेकलिस्ट लेआउट जनरेटर
 */
function buildChecklistHTML(data) {
    return `
        <!-- 📅 Active Login Days -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); animation: fadeIn 0.3s ease-out;">
            <span style="display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-calendar-day" style="color: #ff9f43; font-size:0.9rem; width:20px;"></i>
                Active Login Days
            </span>
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="color:#fff; font-weight:700;">${data.loginDays.current}/${data.loginDays.target}</span>
                <span style="color:${data.loginDays.met ? '#00b894':'#ff4757'}; font-size: 1.1rem;">
                    <i class="fa-solid ${data.loginDays.met ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                </span>
            </div>
        </div>

        <!-- 🖼️ Image Posts -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); animation: fadeIn 0.3s ease-out; animation-delay: 0.05s;">
            <span style="display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-images" style="color: #00d2ff; font-size:0.9rem; width:20px;"></i>
                Image Posts Published
            </span>
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="color:#fff; font-weight:700;">${data.posts.current}/${data.posts.target}</span>
                <span style="color:${data.posts.met ? '#00b894':'#ff4757'}; font-size: 1.1rem;">
                    <i class="fa-solid ${data.posts.met ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                </span>
            </div>
        </div>

        <!-- 🎬 Video Reels -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); animation: fadeIn 0.3s ease-out; animation-delay: 0.1s;">
            <span style="display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-clapperboard" style="color: #ff006e; font-size:0.9rem; width:20px;"></i>
                Video Reels Uploaded
            </span>
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="color:#fff; font-weight:700;">${data.reels.current}/${data.reels.target}</span>
                <span style="color:${data.reels.met ? '#00b894':'#ff4757'}; font-size: 1.1rem;">
                    <i class="fa-solid ${data.reels.met ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                </span>
            </div>
        </div>

        <!-- ❤️ Total Likes -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); animation: fadeIn 0.3s ease-out; animation-delay: 0.15s;">
            <span style="display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-heart" style="color: #ff4757; font-size:0.9rem; width:20px;"></i>
                Total Likes Received
            </span>
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="color:#fff; font-weight:700;">${data.likes.current}/${data.likes.target}</span>
                <span style="color:${data.likes.met ? '#00b894':'#ff4757'}; font-size: 1.1rem;">
                    <i class="fa-solid ${data.likes.met ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                </span>
            </div>
        </div>

        <!-- 👁️ Total Views -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0; animation: fadeIn 0.3s ease-out; animation-delay: 0.2s;">
            <span style="display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-eye" style="color: #00b894; font-size:0.9rem; width:20px;"></i>
                Total Views Received
            </span>
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="color:#fff; font-weight:700;">${data.views.current}/${data.views.target}</span>
                <span style="color:${data.views.met ? '#00b894':'#ff4757'}; font-size: 1.1rem;">
                    <i class="fa-solid ${data.views.met ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                </span>
            </div>
        </div>
    `;
}

/**
 * 5. प्रोफाइल के अंदर दिखने वाले प्रोग्रेस कार्ड का यूआई अपडेशन
 */
window.updateProfileVerificationUI = async (targetUid, isVerified) => {
    const progressCard = document.getElementById('verified-progress-card');
    const checklistEl = document.getElementById('verification-checklist');
    if (!progressCard || !checklistEl) return;

    if (window.currentUser && targetUid === window.currentUser.uid) {
        progressCard.style.display = "block";
        progressCard.classList.remove('hidden');

        if (isVerified) {
            checklistEl.innerHTML = `
                <div style="text-align: center; padding: 12px 0; animation: fadeIn 0.4s ease-out;">
                    <div style="position: relative; display: inline-block; margin-bottom: 8px;">
                        ${getVerifiedBadgeHTML(true, 38)}
                    </div>
                    <div style="font-weight: 800; color: #fff; font-size: 0.95rem; letter-spacing: 0.2px;">Verified Creator</div>
                    <div style="font-size: 0.75rem; color: #888; margin-top: 4px; line-height: 1.3;">Your verified badge is fully active and visible to everyone.</div>
                </div>
            `;
        } else {
            checklistEl.innerHTML = `
                <div style="text-align:center; padding:15px; color:#aaa;">
                    <i class="fa-solid fa-spinner fa-spin" style="color: #0095f6;"></i>
                    <span style="margin-left: 8px;">Compiling stats...</span>
                </div>
            `;
            
            try {
                const data = await checkVerificationEligibility(targetUid, window.db);
                if (data) {
                    checklistEl.innerHTML = buildChecklistHTML(data);
                }
            } catch (e) {
                checklistEl.innerHTML = '<div style="text-align:center; color:#ff4757; font-size:0.8rem; padding: 10px;">Failed to gather stats.</div>';
            }
        }
    } else {
        progressCard.style.display = "none";
        progressCard.classList.add('hidden');
    }
};

/**
 * 6. Verification Hub खोलने का लॉजिक (सेटिंग्स स्क्रीन से ट्रिगर होता है)
 */
window.openVerificationHub = async () => {
    const hubModal = document.getElementById('verification-hub-modal');
    const placeholder = document.getElementById('hub-verified-card-placeholder');
    if (!hubModal || !placeholder) return;

    window.toggleModal('settings-modal', false);

    hubModal.classList.remove('hidden');
    requestAnimationFrame(() => {
        hubModal.style.transform = 'translate3d(0, 0, 0)';
    });
    
    if (navigator.vibrate) navigator.vibrate(15);

    placeholder.innerHTML = `
        <div style="text-align:center; padding:30px;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; color:#0095f6;"></i>
            <p style="margin-top:10px; color:#64748b; font-size:0.9rem;">Compiling Verification Progress...</p>
        </div>
    `;

    try {
        const userId = window.currentUser ? window.currentUser.uid : null;
        if (!userId) return;

        const uDoc = await window.getDoc(window.doc(window.db, "users", userId));
        if (!uDoc.exists()) return;
        const userData = uDoc.data();

        const isTrackerActivated = userData.trackerActivated === true || localStorage.getItem(`DLC_tracker_activated_${userId}`) === 'true';

        if (userData.trackerActivated === true) {
            localStorage.setItem(`DLC_tracker_activated_${userId}`, 'true');
        }

        const data = await checkVerificationEligibility(userId, window.db);

        if (data) {
            placeholder.innerHTML = `
                <!-- 🎖️ HOW TO ACTIVATE INFO CARD -->
                <div style="
                    width: 100%;
                    background: #f8fafc;
                    border-radius: 20px;
                    padding: 18px;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 8px 25px rgba(0,0,0,0.03);
                    margin-bottom: 20px;
                    text-align: left;
                    box-sizing: border-box;
                    animation: fadeIn 0.4s ease-out;
                ">
                    <h4 style="margin: 0 0 12px 0; color: #1e293b; font-weight: 800; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-circle-question" style="color: #FF9F1C;"></i> 
                        Verification कैसे एक्टिव होगा?
                    </h4>
                    <p style="color: #64748b; font-size: 0.82rem; line-height: 1.5; margin: 0 0 14px 0;">
                        DK Love Chats पर ब्लूटूथ वेरिफिकेशन बैच एक्टिव करने के लिए आपके पास नीचे दिए गए लक्ष्यों की उपलब्धि होना आवश्यक है:
                    </p>
                    <ul style="margin: 0; padding: 0; list-style-type: none; color: #475569; font-size: 0.8rem; line-height: 1.6; display: flex; flex-direction: column; gap: 8px;">
                        <li style="display: flex; align-items: center; gap: 10px;">
                            <i class="fa-solid fa-calendar-day" style="color: #ff9f43; font-size:0.9rem; width:15px; text-align: center;"></i>
                            <span><b>15 एक्टिव दिन:</b> कुल 15 दिन अलग-अलग लॉगिन इतिहास होना।</span>
                        </li>
                        <li style="display: flex; align-items: center; gap: 10px;">
                            <i class="fa-solid fa-images" style="color: #00d2ff; font-size:0.9rem; width:15px; text-align: center;"></i>
                            <span><b>25 इमेज पोस्ट्स:</b> न्यूनतम 25 साधारण फोटो पोस्ट अपलोड होना।</span>
                        </li>
                        <li style="display: flex; align-items: center; gap: 10px;">
                            <i class="fa-solid fa-clapperboard" style="color: #ff006e; font-size:0.9rem; width:15px; text-align: center;"></i>
                            <span><b>50 video रील्स:</b> न्यूनतम 50 वीडियो रील्स अपलोड होना।</span>
                        </li>
                        <li style="display: flex; align-items: center; gap: 10px;">
                            <i class="fa-solid fa-heart" style="color: #ff4757; font-size:0.9rem; width:15px; text-align: center;"></i>
                            <span><b>250 total लाइक्स:</b> आपके समस्त पोस्टों पर कुल प्राप्त लाइक्स की संख्या।</span>
                        </li>
                        <li style="display: flex; align-items: center; gap: 10px;">
                            <i class="fa-solid fa-eye" style="color: #00b894; font-size:0.9rem; width:15px; text-align: center;"></i>
                            <span><b>1000 total व्यूज:</b> आपकी रील्स/पोस्ट्स पर कुल प्राप्त संचयी व्यूज।</span>
                        </li>
                    </ul>
                </div>

                <!-- 🔘 ACTIVE ICON ACTION BUTTON -->
                ${isTrackerActivated ? `
                    <button id="btn-reveal-achievements" disabled style="
                        width: 100%;
                        padding: 15px;
                        background: rgba(0, 149, 246, 0.08);
                        color: #94a3b8;
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
                        <i class="fa-solid fa-circle-check" style="color: #00b894;"></i> Verification Progress Activated
                    </button>
                ` : `
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
                        <i class="fa-solid fa-fingerprint"></i> Check Achievements Board
                    </button>
                `}

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

                        <div id="checklist-embed-container" style="display: flex; flex-direction: column; gap: 14px; font-size: 0.88rem; color: #cbd5e1;">
                            ${data.isVerified ? `
                                <div style="text-align: center; padding: 20px 0;">
                                    <div style="position: relative; display: inline-block; margin-bottom: 12px;">
                                        ${getVerifiedBadgeHTML(true, 38)}
                                    </div>
                                    <div style="font-weight: 900; color: #fff; font-size: 1.15rem; margin-top: 10px;">Account Verified!</div>
                                    <p style="font-size: 0.8rem; color: #aaa; margin-top: 4px; line-height: 1.4;">Your profile name now officially holds the verified checkmark across the application.</p>
                                </div>
                            ` : buildChecklistHTML(data)}
                        </div>
                    </div>
                </div>
            `;
        }
    } catch (e) {
        placeholder.innerHTML = `
            <div style="text-align:center; padding:20px; color:#ff4757;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size:2rem;"></i>
                <p style="margin-top:10px;">Failed to compile achievements.</p>
            </div>
        `;
    }
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

    board.style.maxHeight = '1000px'; 
    board.style.opacity = '1';

    if (navigator.vibrate) navigator.vibrate(35);

    btn.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #00b894;"></i> Verification Progress Activated`;
    btn.disabled = true;
    btn.onclick = null;
    
    btn.style.cursor = 'default';
    btn.style.pointerEvents = 'none';
    btn.style.background = 'rgba(0, 149, 246, 0.08)';
    btn.style.color = '#94a3b8';
    btn.style.border = '1px solid rgba(0, 149, 246, 0.15)';
    btn.style.boxShadow = 'none';
    btn.style.transform = 'none';
};

/**
 * 8. Verification Hub बंद करने का लॉजिक
 */
window.closeVerificationHub = () => {
    const hubModal = document.getElementById('verification-hub-modal');
    if (!hubModal) return;

    hubModal.style.transform = 'translate3d(0, 100%, 0)';
    setTimeout(() => {
        hubModal.classList.add('hidden');
        window.toggleModal('settings-modal', true);
    }, 350);
};
