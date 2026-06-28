// ==========================================
// --- GLOBAL SEARCH, FILTER TABS & TAGS SYSTEM ---
// ==========================================

// 1. लोकल स्टोरेज से पुरानी सर्च हिस्ट्री निकालना
let searchHistory = JSON.parse(localStorage.getItem('loveChats_searchHistory') || "[]");

// पोस्ट्स को कैश में स्टोर करने के लिए ऐरे
let globalPostCache = []; 

// एक्टिव सर्च टैब स्टेट (डिफ़ॉल्ट: 'foryou')
window.activeSearchTab = 'foryou';

// ट्रेंडिंग हैशटैग्स की लिस्ट (सर्च स्क्रीन स्क्रोलर के लिए)
const TRENDING_HASHTAGS = [
    "DKLoveChats", "Love", "Trending", "ReelsVideo", "Explore", 
    "ForYou", "Vibe", "Happy", "ChatSystem", "Friends", "SecureChat"
];

// --- वेरिफिकेशन स्टेटस यूटिलिटी ---
const checkVerificationStatus = (userObj) => {
    if (!userObj) return false;
    return userObj.isVerified === true || 
           userObj.verified === true || 
           userObj.verificationStatus === 'verified' || 
           userObj.verificationType === 'gold' || 
           userObj.verificationType === 'premium';
};

// --- प्रीमियम Rose Gold Verified Tick SVG ---
const getVerifiedTickHTML = (isVerified) => {
    if (!isVerified) return "";
    return `
    <svg class="premium-verified-badge" width="13" height="13" viewBox="0 0 128 128" style="vertical-align: middle; display: inline-block; margin-left: 5px; flex-shrink: 0; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.15));">
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

// --- हैशटैग्स को नीले रंग में बदलने और क्लिकेबल बनाने का फ़ंक्शन ---
window.highlightHashtags = (text) => {
    if (!text) return "";
    return text.replace(/#([\p{L}\p{N}_]+)/gu, (match, tag) => {
        return `<span style="color: #0095f6 !important; font-weight: 700; cursor: pointer;" onclick="event.stopPropagation(); window.searchHashtag('${tag}')">${match}</span>`;
    });
};

// --- चिप्स, टैब या टेक्स्ट पर टैप करने पर हैशटैग सर्च ट्रिगर करना ---
window.searchHashtag = (tag) => {
    const input = document.getElementById('global-search-input');
    if (input) {
        input.value = `#${tag}`;
        if (navigator.vibrate) navigator.vibrate(15);
        // टैग सर्च होने पर स्वतः 'Tags' या 'For You' व्यू सिंक करें
        window.activeSearchTab = 'foryou';
        window.updateSearchTabsUI();
        window.handleGlobalSearch();
    }
};

// --- हैशटैग स्क्रोलर चिप्स को रेंडर करने का फ़ंक्शन ---
window.renderSearchHashtagChips = () => {
    const container = document.getElementById('search-hashtag-chips-container');
    if (!container) return;
    
    const inputVal = document.getElementById('global-search-input').value.toLowerCase().trim();

    container.innerHTML = TRENDING_HASHTAGS.map(tag => {
        const isActive = inputVal === `#${tag.toLowerCase()}`;
        return `
        <div onclick="window.searchHashtag('${tag}')" style="
            display: inline-block;
            background: ${isActive ? 'rgba(0, 149, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)'};
            color: #0095f6 !important;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 700;
            cursor: pointer;
            border: 1.5px solid ${isActive ? '#0095f6' : 'rgba(255, 255, 255, 0.08)'};
            transition: all 0.2s ease;
            user-select: none;
            flex-shrink: 0;
        " onmousedown="this.style.transform='scale(0.95)'" onmouseup="this.style.transform='scale(1)'">
            #${tag}
        </div>`;
    }).join('');
};

// --- एक्टिव सर्च टैब स्विच करने का फ़ंक्शन ---
window.switchSearchTab = (tabName) => {
    if (navigator.vibrate) navigator.vibrate(10);
    window.activeSearchTab = tabName;
    window.updateSearchTabsUI();
    window.handleGlobalSearch();
};

// --- टैब्स के एक्टिव स्टेट स्टाइल को सिंक करने का फ़ंक्शन ---
window.updateSearchTabsUI = () => {
    document.querySelectorAll('.search-tab').forEach(tab => {
        if (tab.dataset.tab === window.activeSearchTab) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
};

// --- फ़ायरस्टोर कैश से मेल खाने वाले हैशटैग्स और उनके पोस्ट काउंट्स निकालने का फ़ंक्शन ---
function getMatchingTagsAndCounts(queryText) {
    const tagMap = new Map();
    globalPostCache.forEach(p => {
        if (p.hashtags) {
            p.hashtags.forEach(tag => {
                const lowerTag = tag.toLowerCase();
                if (lowerTag.includes(queryText)) {
                    tagMap.set(lowerTag, (tagMap.get(lowerTag) || 0) + 1);
                }
            });
        }
        // कैप्शन बैकअप पार्सिंग
        if (p.caption) {
            const regex = /#([\p{L}\p{N}_]+)/gu;
            const matches = p.caption.matchAll(regex);
            for (const match of matches) {
                const lowerTag = match[1].toLowerCase();
                if (lowerTag.includes(queryText)) {
                    tagMap.set(lowerTag, (tagMap.get(lowerTag) || 0) + 1);
                }
            }
        }
    });
    return Array.from(tagMap.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count);
}

// --- सर्च हिस्ट्री में सेव करना ---
window.saveToSearchHistory = (uid, name, username, avatar, isVerified = false) => {
    searchHistory = searchHistory.filter(u => u.uid !== uid);
    searchHistory.unshift({ uid, name, username, avatar, isVerified });
    if(searchHistory.length > 15) searchHistory.pop();
    localStorage.setItem('loveChats_searchHistory', JSON.stringify(searchHistory));
};

// --- हिस्ट्री से आइटम डिलीट करना ---
window.deleteHistoryItem = (uid, event) => {
    event.stopPropagation();
    searchHistory = searchHistory.filter(u => u.uid !== uid);
    localStorage.setItem('loveChats_searchHistory', JSON.stringify(searchHistory));
    window.renderSearchHistory();
};

// --- सर्च हिस्ट्री क्लियर करना ---
window.clearAllHistory = () => { 
    searchHistory = []; 
    localStorage.setItem('loveChats_searchHistory', "[]"); 
    window.renderSearchHistory(); 
};

// --- रीसेंट सर्च हिस्ट्री रेंडर करना ---
window.renderSearchHistory = () => {
    const container = document.getElementById('global-search-results');
    
    // इनपुट खाली होने पर टैब बार छिपाएं और स्क्रोलर चिप्स दिखाएं
    const tabsContainer = document.getElementById('search-tabs-container');
    const chipsContainer = document.getElementById('search-hashtag-chips-container');
    
    if (tabsContainer) tabsContainer.style.display = 'none';
    if (chipsContainer) chipsContainer.style.display = 'flex';

    window.renderSearchHashtagChips();

    if (searchHistory.length === 0) {
        container.innerHTML = `
        <div style="text-align:center; padding:50px; color:#aaa; animation: fadeIn 0.5s;">
            <i class="fa-solid fa-clock-rotate-left" style="font-size:3.5rem; margin-bottom:15px; opacity:0.3;"></i>
            <br>
            <span style="font-weight: 600; font-size: 1.1rem;">No Recent Searches</span>
        </div>`;
        return;
    }

    let html = `<div class="search-section-title">Recent Searches <span class="clear-history-btn" onclick="clearAllHistory()">Clear All</span></div>`;
    
    searchHistory.forEach(u => {
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
            <i class="fa-solid fa-xmark history-delete-btn" style="color: #ef4444 !important; padding: 8px !important; cursor: pointer !important; background: transparent !important;" onclick="deleteHistoryItem('${u.uid}', event)"></i>
        </div>`;
    });
    container.innerHTML = html;
};

// ==========================================
// --- सर्च मोडल ओपन एवं प्रीमियम स्टाइल इंजेक्शन ---
// ==========================================
window.openGlobalSearch = async () => {
    const modal = document.getElementById('global-search-modal');
    modal.classList.remove('hidden'); 
    setTimeout(() => { modal.style.transform = 'translateY(0)'; }, 10);
    
    document.getElementById('global-search-input').value = "";
    window.activeSearchTab = 'foryou'; // डिफ़ॉल्ट रीसेट करें

    // 🌟 डायनामिक प्रीमियम ग्रिड, टैब्स एवं टैग्स स्टाइल शीट
    let searchStyleTag = document.getElementById('search-premium-dynamic-styles');
    if (!searchStyleTag) {
        searchStyleTag = document.createElement('style');
        searchStyleTag.id = 'search-premium-dynamic-styles';
        searchStyleTag.innerHTML = `
            #global-search-input::placeholder {
                color: rgba(148, 163, 184, 0.6) !important;
                font-weight: 500 !important;
            }
            #search-hashtag-chips-container::-webkit-scrollbar, 
            #search-tabs-container::-webkit-scrollbar {
                display: none;
            }
            .search-tab {
                color: #94a3b8;
                font-size: 0.92rem;
                font-weight: 800;
                padding: 10px 14px;
                cursor: pointer;
                position: relative;
                transition: all 0.2s ease;
                user-select: none;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .search-tab.active {
                color: #0095f6 !important;
            }
            .search-tab.active::after {
                content: "";
                position: absolute;
                bottom: 0;
                left: 14px;
                right: 14px;
                height: 3px;
                background: #0095f6;
                border-radius: 10px;
                animation: slideInLine 0.2s ease-out;
            }
            @keyframes slideInLine {
                from { transform: scaleX(0); }
                to { transform: scaleX(1); }
            }
            .search-results-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 4px;
                margin-top: 10px;
                padding-bottom: 20px;
            }
            .search-grid-item {
                aspect-ratio: 1 / 1;
                position: relative;
                overflow: hidden;
                background: #12121a;
                border-radius: 6px;
                cursor: pointer;
            }
            .search-grid-item img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                transition: transform 0.25s ease;
            }
            .search-grid-item:active img {
                transform: scale(0.96);
            }
            .search-grid-badge {
                position: absolute;
                top: 6px;
                right: 6px;
                background: rgba(0, 0, 0, 0.65);
                color: #ffffff;
                border-radius: 50%;
                width: 22px;
                height: 22px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.7rem;
                z-index: 2;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            /* इंस्टाग्राम स्टाइल हैशटैग रो */
            .instagram-tag-row {
                display: flex;
                align-items: center;
                gap: 15px;
                padding: 14px 16px;
                background: #ffffff;
                border: 1px solid #e4e4e7;
                border-radius: 20px;
                margin-bottom: 10px;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.04);
                transition: transform 0.15s ease;
            }
            .instagram-tag-row:active {
                transform: scale(0.98);
            }
            .tag-icon-circle {
                width: 44px;
                height: 44px;
                border-radius: 50%;
                border: 1.5px solid #e2e8f0;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.15rem;
                color: #1e293b;
                background: #f8fafc;
            }
        `;
        document.head.appendChild(searchStyleTag);
    }

    // 🌟 स्क्रोलर चिप्स कंटेनर का निर्माण
    let chipsContainer = document.getElementById('search-hashtag-chips-container');
    if (!chipsContainer) {
        chipsContainer = document.createElement('div');
        chipsContainer.id = 'search-hashtag-chips-container';
        chipsContainer.style.cssText = "display: flex; gap: 8px; overflow-x: auto; white-space: nowrap; padding: 12px 15px; background: rgba(16, 0, 43, 0.95); border-bottom: 1.5px solid rgba(255, 255, 255, 0.05); scrollbar-width: none; -webkit-overflow-scrolling: touch; flex-shrink: 0; transition: all 0.3s ease;";
        
        if (modal) {
            const header = modal.firstElementChild;
            modal.insertBefore(chipsContainer, header.nextSibling);
        }
    }

    // 🌟 इंस्टाग्राम फ़िल्टर टैब कंटेनर का निर्माण (छिपा हुआ अवस्था में)
    let tabsContainer = document.getElementById('search-tabs-container');
    if (!tabsContainer) {
        tabsContainer = document.createElement('div');
        tabsContainer.id = 'search-tabs-container';
        tabsContainer.style.cssText = "display: none; gap: 15px; overflow-x: auto; white-space: nowrap; padding: 5px 15px; background: rgba(16, 0, 43, 0.95); border-bottom: 1.5px solid rgba(255, 255, 255, 0.05); scrollbar-width: none; -webkit-overflow-scrolling: touch; flex-shrink: 0;";
        tabsContainer.innerHTML = `
            <div class="search-tab active" data-tab="foryou" onclick="window.switchSearchTab('foryou')">For You</div>
            <div class="search-tab" data-tab="accounts" onclick="window.switchSearchTab('accounts')">Accounts</div>
            <div class="search-tab" data-tab="tags" onclick="window.switchSearchTab('tags')">Tags</div>
        `;
        if (modal) {
            // इसे स्क्रोलर चिप्स के ठीक नीचे रखें
            modal.insertBefore(tabsContainer, chipsContainer.nextSibling);
        }
    }

    // सर्च बार मैट डीप स्पेस ब्लैक थीम
    const searchInputWrapper = document.getElementById('global-search-input')?.parentElement;
    const searchInput = document.getElementById('global-search-input');
    const searchIcon = searchInputWrapper?.querySelector('.fa-magnifying-glass');

    if (searchInputWrapper && searchInput) {
        searchInputWrapper.style.cssText = "position: relative; flex: 1; background: #12121a !important; border: 1.5px solid rgba(255, 255, 255, 0.1) !important; border-radius: 20px !important; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.25) !important; transition: all 0.3s ease !important;";
        searchInput.style.cssText = "width: 100%; padding: 12px 15px 12px 42px; border-radius: 20px; border: none !important; background: transparent !important; color: #f8fafc !important; outline: none; font-size: 0.95rem; font-weight: 500;";

        if (searchIcon) {
            searchIcon.style.cssText = "position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: #8338ec !important; font-size: 0.95rem; filter: drop-shadow(0 0 6px rgba(131, 56, 236, 0.4));";
        }
    }
    
    if (typeof window.renderSearchHistory === 'function') window.renderSearchHistory();
    setTimeout(() => document.getElementById('global-search-input').focus(), 300);

    // फ़ायरस्टोर से रीयल-टाइम पोस्ट कैश लोड करना
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

window.closeGlobalSearch = () => {
    const modal = document.getElementById('global-search-modal');
    modal.style.transform = 'translateY(100%)'; 
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
};

// ==========================================
// --- 4. REALTIME SEARCH & FILTER ROUTER ---
// ==========================================
window.handleGlobalSearch = async () => {
    let rawQuery = document.getElementById('global-search-input').value.trim();
    const resultsContainer = document.getElementById('global-search-results');
    
    const tabsContainer = document.getElementById('search-tabs-container');
    const chipsContainer = document.getElementById('search-hashtag-chips-container');

    if (!rawQuery) { 
        window.renderSearchHistory(); 
        return; 
    }

    // एक्टिव सर्च होने पर: चिप्स स्क्रोलर को छिपाएं और फ़िल्टर टैब बार दिखाएं
    if (tabsContainer) tabsContainer.style.display = 'flex';
    if (chipsContainer) chipsContainer.style.display = 'none';

    let queryText = rawQuery.toLowerCase();
    const isHashtagSearch = queryText.startsWith('#');
    let searchTag = isHashtagSearch ? queryText.substring(1) : queryText;

    if (queryText.startsWith('@')) {
        queryText = queryText.substring(1);
        searchTag = queryText;
    }

    let html = "";

    // ----------------- [TAB 1: FOR YOU - POSTS & REELS] -----------------
    if (window.activeSearchTab === 'foryou') {
        const filteredPosts = globalPostCache.filter(p => {
            if (isHashtagSearch) {
                const hasTagInArray = p.hashtags && p.hashtags.some(tag => tag.toLowerCase() === searchTag);
                const hasTagInCaption = p.caption && p.caption.toLowerCase().includes(`#${searchTag}`);
                return hasTagInArray || hasTagInCaption;
            } else {
                return p.caption && p.caption.toLowerCase().includes(queryText);
            }
        });

        if (filteredPosts.length > 0) {
            html += `<div class="search-results-grid">`;
            filteredPosts.forEach(p => {
                let thumbUrl = p.mediaUrl || p.imageUrl;
                if (p.mediaType === 'video' && thumbUrl.includes('cloudinary.com')) {
                    thumbUrl = thumbUrl.replace(/\.[^/.]+$/, ".jpg");
                }
                const isReel = p.mediaType === 'video';
                const badgeIcon = isReel ? `<div class="search-grid-badge"><i class="fa-solid fa-clapperboard"></i></div>` : "";
                
                html += `
                <div class="search-grid-item fade-in" onclick="closeGlobalSearch(); if(typeof goToPost === 'function') goToPost('${p.id}', '${p.mediaType}')">
                    ${badgeIcon}
                    <img src="${thumbUrl}" onerror="this.src='https://placehold.co/150x150/1e1e2d/64748b?text=Media'">
                </div>`;
            });
            html += `</div>`;
        } else {
            html = `<div style="text-align:center; padding:50px; color:#64748b;">No matching posts or reels found.</div>`;
        }
    }

    // ----------------- [TAB 2: ACCOUNTS - USERS ONLY] -----------------
    else if (window.activeSearchTab === 'accounts') {
        let filteredUsers = typeof window.allCachedUsers !== 'undefined' 
            ? window.allCachedUsers.filter(u => 
                (u.name && u.name.toLowerCase().includes(queryText)) || 
                (u.username && u.username.toLowerCase().includes(queryText)) ||
                (u.uid && u.uid.toLowerCase() === queryText) ||
                (u.uid && u.uid.toLowerCase().includes(queryText))
              ) 
            : [];

        // स्मार्ट यूआईडी फ़ॉलबैक
        const isPotentialUid = /^[a-zA-Z0-9_-]{20,35}$/.test(rawQuery);
        if (filteredUsers.length === 0 && isPotentialUid && window.db) {
            resultsContainer.innerHTML = `
                <div id="uid-search-loader" style="text-align:center; padding:40px; color:#cbd5e1; animation: fadeIn 0.3s;">
                    <i class="fa-solid fa-circle-notch fa-spin" style="font-size:1.8rem; color:var(--primary); margin-bottom:10px;"></i>
                    <div style="font-size:0.85rem; font-weight:600; color:#94a3b8;">Searching secure database...</div>
                </div>`;
            try {
                const userDocSnap = await window.getDoc(window.doc(window.db, "users", rawQuery));
                if (userDocSnap.exists()) {
                    const targetUser = userDocSnap.data();
                    if (window.allCachedUsers && !window.allCachedUsers.some(u => u.uid === targetUser.uid)) {
                        window.allCachedUsers.push(targetUser);
                    }
                    filteredUsers = [targetUser];
                }
            } catch (dbError) {
                console.warn("Direct Firestore UID fetch failed:", dbError.message);
            }
        }

        if (filteredUsers.length > 0) {
            filteredUsers.forEach(u => { 
                const avatar = u.avatarBase64 || u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}`;
                const safeName = u.name ? u.name.replace(/'/g, "\\'") : "User";
                const safeUsername = u.username ? u.username : "user";
                
                const isVerified = checkVerificationStatus(u);
                const verifiedTick = getVerifiedTickHTML(isVerified);

                const isUidMatch = (u.uid && u.uid.toLowerCase() === queryText);
                const badgeHTML = isUidMatch ? `<span style="background: rgba(131, 56, 236, 0.1); color: #8338ec; font-size: 0.65rem; padding: 2px 8px; border-radius: 10px; font-weight: 800; text-transform: uppercase; margin-left: 8px; border: 1px solid rgba(131, 56, 236, 0.2);">ID Match</span>` : "";
                
                html += `
                <div class="search-user-row fade-in" style="display: flex !important; align-items: center !important; padding: 14px 16px !important; background: #ffffff !important; border: 1px solid #e4e4e7 !important; border-radius: 20px !important; margin-bottom: 12px !important; cursor: pointer !important; box-shadow: 0 4px 15px rgba(0,0,0,0.08) !important;" 
                     onclick="saveToSearchHistory('${u.uid}', '${safeName}', '${safeUsername}', '${avatar}', ${isVerified}); closeGlobalSearch(); if(typeof window.switchTab === 'function'){ window.switchTab('profile'); } if(typeof window.viewUserProfile === 'function'){ window.viewUserProfile('${u.uid}'); }">
                    <img src="${avatar}" style="width:48px !important; height:48px !important; border-radius:50% !important; object-fit:cover !important; border: 2px solid rgba(0,0,0,0.05) !important;">
                    <div style="margin-left: 15px; flex:1; min-width: 0;">
                        <div style="font-weight:700; font-size: 1rem; color: #09090b !important; display: flex; align-items: center; gap: 4px;">
                            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">${u.name}</span>
                            ${verifiedTick}
                            ${badgeHTML}
                        </div>
                        <div style="display: flex; align-items: center; gap: 4px; font-size: 0.8rem; color: #4f46e5 !important; font-weight: 600; margin-top: 2px;">
                            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px;">@${safeUsername}</span>
                        </div>
                    </div>
                </div>`;
            });
        } else {
            html = `<div style="text-align:center; padding:50px; color:#64748b;">No matching accounts found.</div>`;
        }
    }

    // ----------------- [TAB 3: TAGS - HASHTAGS WITH POST COUNTS] -----------------
    else if (window.activeSearchTab === 'tags') {
        const matchingTags = getMatchingTagsAndCounts(searchTag);

        if (matchingTags.length > 0) {
            matchingTags.forEach(tagObj => {
                html += `
                <div class="instagram-tag-row fade-in" onclick="window.searchHashtag('${tagObj.tag}')">
                    <div class="tag-icon-circle">
                        <i class="fa-solid fa-hashtag" style="color: #0095f6;"></i>
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight: 800; font-size: 1rem; color: #1e293b;">#${tagObj.tag}</div>
                        <div style="font-size: 0.8rem; color: #64748b; font-weight: 600; margin-top: 2px;">${tagObj.count} ${tagObj.count === 1 ? 'post' : 'posts'}</div>
                    </div>
                    <i class="fa-solid fa-chevron-right" style="color: #cbd5e1; font-size: 0.9rem;"></i>
                </div>`;
            });
        } else {
            html = `<div style="text-align:center; padding:50px; color:#64748b;">No matching tags found.</div>`;
        }
    }

    resultsContainer.innerHTML = html;
};
