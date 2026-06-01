// ==========================================
// --- GLOBAL SEARCH & HISTORY LOGIC ---
// ==========================================

// 1. लोकल स्टोरेज से पुरानी सर्च हिस्ट्री निकालना (अगर है तो)
let searchHistory = JSON.parse(localStorage.getItem('loveChats_searchHistory') || "[]");

// 2. पोस्ट्स को कैश (Cache) में स्टोर करने के लिए ऐरे
let globalPostCache = []; 

// --- सर्च हिस्ट्री में डेटा सेव करना ---
window.saveToSearchHistory = (uid, name, username, avatar) => {
    // अगर यूजर पहले से हिस्ट्री में है, तो उसे हटाकर टॉप पर लाएंगे
    searchHistory = searchHistory.filter(u => u.uid !== uid);
    searchHistory.unshift({ uid, name, username, avatar });
    
    // मैक्सिमम 15 सर्च हिस्ट्री ही रखेंगे
    if(searchHistory.length > 15) searchHistory.pop();
    
    // लोकल स्टोरेज में सेव करना
    localStorage.setItem('loveChats_searchHistory', JSON.stringify(searchHistory));
};

// --- हिस्ट्री से किसी एक यूजर को डिलीट करना ---
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

// --- सर्च हिस्ट्री को स्क्रीन (UI) पर दिखाना ---
window.renderSearchHistory = () => {
    const container = document.getElementById('global-search-results');
    
    if (searchHistory.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:50px; color:#aaa; animation: fadeIn 0.5s;"><i class="fa-solid fa-clock-rotate-left" style="font-size:3.5rem; margin-bottom:15px; opacity:0.3;"></i><br><span style="font-weight: 600; font-size: 1.1rem;">No Recent Searches</span></div>`;
        return;
    }

    let html = `<div class="search-section-title">Recent Searches <span class="clear-history-btn" onclick="clearAllHistory()">Clear All</span></div>`;
    
    searchHistory.forEach(u => {
        const safeName = u.name ? u.name.replace(/'/g, "\\'") : "User";
        html += `
        <div class="chat-item fade-in" style="display: flex; align-items: center; padding: 10px 15px; cursor: pointer; background: rgba(255,255,255,0.02); border-radius: 12px; margin-bottom: 8px;" 
             onclick="closeGlobalSearch(); if(typeof viewUserProfile === 'function'){ viewUserProfile('${u.uid}'); switchTab('profile'); }">
            <img src="${u.avatar}" style="width:45px;height:45px;border-radius:50%;object-fit:cover; border: 1px solid rgba(255,255,255,0.1);">
            <div style="margin-left: 12px; flex:1;">
                <div style="font-weight:700; font-size: 0.95rem; color: white;">${u.name}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">@${u.username || 'user'}</div>
            </div>
            <i class="fa-solid fa-xmark history-delete-btn" onclick="deleteHistoryItem('${u.uid}', event)"></i>
        </div>`;
    });
    container.innerHTML = html;
};

// --- सर्च मोडल (पॉपअप) ओपन करना ---
window.openGlobalSearch = async () => {
    const modal = document.getElementById('global-search-modal');
    modal.classList.remove('hidden'); 
    setTimeout(() => { modal.style.transform = 'translateY(0)'; }, 10);
    
    document.getElementById('global-search-input').value = "";
    if (typeof window.renderSearchHistory === 'function') window.renderSearchHistory();
    setTimeout(() => document.getElementById('global-search-input').focus(), 300);

    // अगर पोस्ट कैश खाली है, तो डेटाबेस से 100 रीसेंट पोस्ट्स मंगाकर कैश में रखना (ताकि सर्च फ़ास्ट हो)
    if(globalPostCache.length === 0) {
        try {
            // नोट: db, query, collection, orderBy, limit, getDocs मेन फाइल से window पर एक्सपोज होने चाहिए
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

// --- मेन सर्च लॉजिक (जब यूजर टाइप करता है) ---
window.handleGlobalSearch = () => {
    let queryText = document.getElementById('global-search-input').value.toLowerCase().trim();
    const resultsContainer = document.getElementById('global-search-results');
    
    // अगर यूजर '@' लगाकर सर्च कर रहा है, तो उसे हटा दें
    if (queryText.startsWith('@')) queryText = queryText.substring(1);
    
    // अगर इनपुट खाली है तो वापस सर्च हिस्ट्री दिखाएं
    if (!queryText) { window.renderSearchHistory(); return; }

    let html = "";
    
    // 1. यूजर्स को सर्च करना (allCachedUsers मेन फाइल से आता है)
    const filteredUsers = typeof window.allCachedUsers !== 'undefined' 
        ? window.allCachedUsers.filter(u => (u.name && u.name.toLowerCase().includes(queryText)) || (u.username && u.username.toLowerCase().includes(queryText))) 
        : [];

    if (filteredUsers.length > 0) {
        html += `<div class="search-section-title">People & Accounts</div>`;
        filteredUsers.forEach(u => { 
            const avatar = u.avatarBase64 || u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}`;
            const safeName = u.name ? u.name.replace(/'/g, "\\'") : "User";
            const safeUsername = u.username ? u.username : "user";
            
            html += `
            <div class="chat-item fade-in" style="display: flex; align-items: center; padding: 12px 15px; background: rgba(255,255,255,0.03); border-radius: 18px; margin-bottom: 10px; border: 1px solid rgba(255,255,255,0.08);" 
                 onclick="saveToSearchHistory('${u.uid}', '${safeName}', '${safeUsername}', '${avatar}'); closeGlobalSearch(); if(typeof viewUserProfile === 'function'){ viewUserProfile('${u.uid}'); switchTab('profile'); }">
                <img src="${avatar}" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border: 2px solid var(--primary);">
                <div style="margin-left: 15px; flex:1;">
                    <div style="font-weight:700; font-size: 1rem; color: white;">${u.name}</div>
                    <div style="font-size: 0.8rem; color: #aaa;">@${safeUsername}</div>
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
            // अगर वीडियो है तो Cloudinary URL का एक्सटेंशन .jpg में बदलकर थंबनेल निकालना
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

    // अगर कुछ नहीं मिला
    if (filteredUsers.length === 0 && filteredPosts.length === 0) {
        html = `<div style="text-align:center; padding:60px 20px; color:#666;">No results found for "${queryText}"</div>`;
    }
    
    // रिजल्ट्स को स्क्रीन पर दिखा देना
    resultsContainer.innerHTML = html;
};