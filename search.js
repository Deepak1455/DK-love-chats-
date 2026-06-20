// ==========================================
// --- GLOBAL SEARCH & HISTORY LOGIC ---
// ==========================================

// 1. लोकल स्टोरेज से पुरानी सर्च हिस्ट्री निकालना (अगर है तो)
let searchHistory = JSON.parse(localStorage.getItem('loveChats_searchHistory') || "[]");

// 2. पोस्ट्स को कैश (Cache) में स्टोर करने के लिए ऐरे
let globalPostCache = []; 

// --- वेरिफिकेशन स्टेटस जांचने के लिए यूटिलिटी फ़ंक्शन ---
const checkVerificationStatus = (userObj) => {
    if (!userObj) return false;
    return userObj.isVerified === true || 
           userObj.verified === true || 
           userObj.verificationStatus === 'verified' || 
           userObj.verificationType === 'gold' || 
           userObj.verificationType === 'premium';
};

// --- प्रीमियम Rose Gold Verified Tick SVG जेनरेटर ---
const getVerifiedTickHTML = (isVerified) => {
    if (!isVerified) return "";
    return `
    <svg class="premium-verified-badge" width="13" height="13" viewBox="0 0 128 128" style="vertical-align: middle; display: inline-block; margin-left: 5px; flex-shrink: 0; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.15)); will-change: transform;">
        <defs>
            <linearGradient id="roseGoldSearchSeal" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fae3e0"/>
                <stop offset="40%" stop-color="#f3a193"/>
                <stop offset="100%" stop-color="#b76e79"/>
            </linearGradient>
        </defs>
        <path d="M64 10L79 22L98 20L96 39L110 54L96 69L98 88L79 86L64 100L49 86L30 88L32 69L18 54L32 39L30 20L49 22Z" fill="url(#roseGoldSearchSeal)"/>
        <path d="M47 55L59 67L82 44" fill="none" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
};

// --- सर्च हिस्ट्री में डेटा सेव करना ---
window.saveToSearchHistory = (uid, name, username, avatar, isVerified = false) => {
    searchHistory = searchHistory.filter(u => u.uid !== uid);
    searchHistory.unshift({ uid, name, username, avatar, isVerified });
    
    if(searchHistory.length > 15) searchHistory.pop();
    
    localStorage.setItem('loveChats_searchHistory', JSON.stringify(searchHistory));
};

// --- हिस्ट्री से किसी एक USER को डिलीट करना ---
window.deleteHistoryItem = (uid, event) => {
    event.stopPropagation(); // क्लिक इवेंट को फैलने से रोकना
    searchHistory = searchHistory.filter(u => u.uid !== uid);
    localStorage.setItem('loveChats_searchHistory', JSON.stringify(searchHistory));
    window.renderSearchHistory(); // UI अपडेट करना
};

// --- पूरी हिस्ट्री एक साथ क्लियर करना ---
window.clearAllHistory = () => { 
    searchHistory = []; 
    localStorage.setItem('loveChats_searchHistory', "[]"); 
    window.renderSearchHistory(); 
};

// --- सर्च हिस्ट्री को स्क्रीन पर सुंदर कार्ड लेआउट में दिखाना (पारदर्शी X आइकॉन के साथ) ---
window.renderSearchHistory = () => {
    const container = document.getElementById('global-search-results');
    
    if (searchHistory.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:50px; color:#aaa; animation: fadeIn 0.5s;"><i class="fa-solid fa-clock-rotate-left" style="font-size:3.5rem; margin-bottom:15px; opacity:0.3;"></i><br><span style="font-weight: 600; font-size: 1.1rem;">No Recent Searches</span></div>`;
        return;
    }

    let html = `<div class="search-section-title">Recent Searches <span class="clear-history-btn" onclick="clearAllHistory()">Clear All</span></div>`;
    
    searchHistory.forEach(u => {
        const safeName = u.name ? u.name.replace(/'/g, "\\'") : "User";
        
        const cachedUser = typeof window.allCachedUsers !== 'undefined' ? window.allCachedUsers.find(item => item.uid === u.uid) : null;
        const isVerified = cachedUser ? checkVerificationStatus(cachedUser) : (u.isVerified || false);
        const verifiedTick = getVerifiedTickHTML(isVerified);

        html += `
        <div class="search-user-row fade-in" style="display: flex !important; align-items: center !important; padding: 14px 16px !important; cursor: pointer !important; background: #ffffff !important; border: 1px solid #e4e4e7 !important; border-radius: 20px !important; margin-bottom: 12px !important; box-shadow: 0 4px 15px rgba(0,0,0,0.08) !important;" 
             onclick="closeGlobalSearch(); if(typeof window.switchTab === 'function'){ window.switchTab('profile'); } if(typeof window.viewUserProfile === 'function'){ window.viewUserProfile('${u.uid}'); }">
            <img src="${u.avatar}" style="width:45px !important; height:45px !important; border-radius:50% !important; object-fit:cover !important; border: 2px solid rgba(0,0,0,0.05) !important;">
            <div style="margin-left: 12px; flex:1;">
                <div style="font-weight:700; font-size: 0.95rem; color: #09090b !important;">${u.name}</div>
                <div style="display: flex; align-items: center; gap: 4px; font-size: 0.75rem; color: #4f46e5 !important; font-weight: 600; margin-top: 2px;">
                    <span>@${u.username || 'user'}</span>
                    ${verifiedTick}
                </div>
            </div>
            <!-- X आइकॉन का बैकग्राउंड हटाकर पूरी तरह से ट्रांसपेरेंट कर दिया गया है -->
            <i class="fa-solid fa-xmark history-delete-btn" style="color: #ef4444 !important; padding: 8px !important; cursor: pointer !important; background: transparent !important; border-radius: 0% !important; border: none !important; box-shadow: none !important;" onclick="deleteHistoryItem('${u.uid}', event)"></i>
        </div>`;
    });
    container.innerHTML = html;
};

// --- सर्च मोडल (पॉपअप) ओपन करना और इनपुट बैकग्राउंड को डीप स्पेस ब्लैक करना ---
window.openGlobalSearch = async () => {
    const modal = document.getElementById('global-search-modal');
    modal.classList.remove('hidden'); 
    setTimeout(() => { modal.style.transform = 'translateY(0)'; }, 10);
    
    document.getElementById('global-search-input').value = "";

    // प्लेसहोल्डर के लिए एडवांस सीएसएस स्टाइल टैग इंजेक्ट करना
    let searchStyleTag = document.getElementById('search-placeholder-style');
    if (!searchStyleTag) {
        searchStyleTag = document.createElement('style');
        searchStyleTag.id = 'search-placeholder-style';
        searchStyleTag.innerHTML = `
            #global-search-input::placeholder {
                color: rgba(148, 163, 184, 0.6) !important;
                font-weight: 500 !important;
                letter-spacing: 0.3px !important;
            }
            #global-search-input:focus::placeholder {
                color: rgba(131, 56, 236, 0.5) !important;
            }
        `;
        document.head.appendChild(searchStyleTag);
    }

    // 🌟 सर्च बार के अंदर का रंग सॉलिड मैट डीप स्पेस ब्लैक (#12121a) किया गया है
    const searchInputWrapper = document.getElementById('global-search-input')?.parentElement;
    const searchInput = document.getElementById('global-search-input');
    const searchIcon = searchInputWrapper?.querySelector('.fa-magnifying-glass');

    if (searchInputWrapper && searchInput) {
        searchInputWrapper.style.cssText = "position: relative; flex: 1; background: #12121a !important; border: 1.5px solid rgba(255, 255, 255, 0.1) !important; border-radius: 20px !important; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.25) !important; transition: all 0.3s ease !important;";
        searchInput.style.cssText = "width: 100%; padding: 12px 15px 12px 42px; border-radius: 20px; border: none !important; background: transparent !important; color: #f8fafc !important; outline: none; font-size: 0.95rem; font-weight: 500;";

        if (searchIcon) {
            searchIcon.style.cssText = "position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: #8338ec !important; font-size: 0.95rem; filter: drop-shadow(0 0 6px rgba(131, 56, 236, 0.4)); transition: all 0.3s ease;";
        }

        // इंटरएक्टिव फोकस स्टेट एनीमेशन बाइंडिंग
        searchInput.onfocus = () => {
            searchInputWrapper.style.setProperty('border', '1.5px solid rgba(255, 0, 110, 0.45)', 'important');
            searchInputWrapper.style.setProperty('box-shadow', '0 8px 30px rgba(255, 0, 110, 0.25), inset 0 2px 5px rgba(255, 255, 255, 0.05)', 'important');
            searchInputWrapper.style.setProperty('transform', 'scale(1.015)', 'important');
            if (searchIcon) {
                searchIcon.style.setProperty('color', '#ff006e', 'important');
                searchIcon.style.setProperty('filter', 'drop-shadow(0 0 8px rgba(255, 0, 110, 0.6))', 'important');
            }
        };

        searchInput.onblur = () => {
            searchInputWrapper.style.setProperty('border', '1.5px solid rgba(255, 255, 255, 0.1)', 'important');
            searchInputWrapper.style.setProperty('box-shadow', '0 4px 15px rgba(0, 0, 0, 0.25)', 'important');
            searchInputWrapper.style.setProperty('transform', 'scale(1)', 'important');
            if (searchIcon) {
                searchIcon.style.setProperty('color', '#8338ec', 'important');
                searchIcon.style.setProperty('filter', 'drop-shadow(0 0 6px rgba(131, 56, 236, 0.4))', 'important');
            }
        };
    }
    
    if (typeof window.renderSearchHistory === 'function') window.renderSearchHistory();
    setTimeout(() => document.getElementById('global-search-input').focus(), 300);

    if(globalPostCache.length === 0) {
        try {
            const q = window.query(window.collection(window.db, "posts"), window.orderBy("timestamp", "desc"), window.limit(100));
            const snap = await window.getDocs(q); 
            globalPostCache = [];
            snap.forEach(doc => { globalPostCache.push({ id: doc.id, ...doc.data() }); });
        } catch(e) {
            console.error("Error loading posts for search cache", e);
        }
    }
};

// --- सर्च मोडल क्लोज करना ---
window.closeGlobalSearch = () => {
    const modal = document.getElementById('global-search-modal');
    modal.style.transform = 'translateY(100%)'; 
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
};

// --- मेन सर्च लॉजिक (सर्च बार और एडवांस्ड कलर स्कीम्स के साथ) ---
window.handleGlobalSearch = () => {
    let queryText = document.getElementById('global-search-input').value.toLowerCase().trim();
    const resultsContainer = document.getElementById('global-search-results');
    
    if (queryText.startsWith('@')) queryText = queryText.substring(1);
    
    if (!queryText) { window.renderSearchHistory(); return; }

    let html = "";
    
    const filteredUsers = typeof window.allCachedUsers !== 'undefined' 
        ? window.allCachedUsers.filter(u => (u.name && u.name.toLowerCase().includes(queryText)) || (u.username && u.username.toLowerCase().includes(queryText))) 
        : [];

    if (filteredUsers.length > 0) {
        html += `<div class="search-section-title">People & Accounts</div>`;
        filteredUsers.forEach(u => { 
            const avatar = u.avatarBase64 || u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}`;
            const safeName = u.name ? u.name.replace(/'/g, "\\'") : "User";
            const safeUsername = u.username ? u.username : "user";
            
            const isVerified = checkVerificationStatus(u);
            const verifiedTick = getVerifiedTickHTML(isVerified);
            
            html += `
            <div class="search-user-row fade-in" style="display: flex !important; align-items: center !important; padding: 14px 16px !important; background: #ffffff !important; border: 1px solid #e4e4e7 !important; border-radius: 20px !important; margin-bottom: 12px !important; cursor: pointer !important; box-shadow: 0 4px 15px rgba(0,0,0,0.08) !important;" 
                 onclick="saveToSearchHistory('${u.uid}', '${safeName}', '${safeUsername}', '${avatar}', ${isVerified}); closeGlobalSearch(); if(typeof window.switchTab === 'function'){ window.switchTab('profile'); } if(typeof window.viewUserProfile === 'function'){ window.viewUserProfile('${u.uid}'); }">
                <img src="${avatar}" style="width:48px !important; height:48px !important; border-radius:50% !important; object-fit:cover !important; border: 2px solid rgba(0,0,0,0.05) !important;">
                <div style="margin-left: 15px; flex:1;">
                    <div style="font-weight:700; font-size: 1rem; color: #09090b !important;">${u.name}</div>
                    <div style="display: flex; align-items: center; gap: 4px; font-size: 0.8rem; color: #4f46e5 !important; font-weight: 600; margin-top: 2px;">
                        <span>@${safeUsername}</span>
                        ${verifiedTick}
                    </div>
                </div>
            </div>`;
        });
    }

    // 2. पोस्ट्स (Caption) को सर्च करना (कैश में से)
    const filteredPosts = globalPostCache.filter(p => p.caption && p.caption.toLowerCase().includes(queryText));

    if (filteredPosts.length > 0) {
        html += `<div class="search-section-title" style="margin-top:20px;">Explore Posts</div>`;
        filteredPosts.slice(0, 6).forEach(p => {
            let thumbUrl = p.mediaUrl || p.imageUrl;
            if (p.mediaType === 'video' && thumbUrl.includes('cloudinary.com')) thumbUrl = thumbUrl.replace(/\.[^/.]+$/, ".jpg");
            
            html += `
            <div class="search-post-item" onclick="closeGlobalSearch(); if(typeof goToPost === 'function') goToPost('${p.id}', '${p.mediaType}')">
                <img src="${thumbUrl}" class="search-post-thumb">
                <div class="search-post-info">
                    <div class="search-post-caption">${p.caption}</div>
                    <div class="search-post-type">View ${p.mediaType === 'video' ? 'Reel' : 'Post'}</div>
                </div>
            </div>`;
        });
    }

    if (filteredUsers.length === 0 && filteredPosts.length === 0) {
        html = `<div style="text-align:center; padding:60px 20px; color:#666;">No results found for "${queryText}"</div>`;
    }
    
    resultsContainer.innerHTML = html;
};
