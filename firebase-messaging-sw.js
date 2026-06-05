// firebase-messaging-sw.js (SMART STACKING & PERSISTENT BACKGROUND SYSTEM)
importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyANdglj3LTDuwsOfXqyiGKSR4Vfez7oqDI",
    authDomain: "my-chat-e4ea8.firebaseapp.com",
    projectId: "my-chat-e4ea8",
    storageBucket: "my-chat-e4ea8.firebasestorage.app",
    messagingSenderId: "212293939926",
    appId: "1:212293939926:web:fa102692a367aac5fd0f77",
    measurementId: "G-C323ZJY5J6"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// 🌟 1. सर्विस वर्कर लाइफसाइकिल मैनेजमेंट (बैकग्राउंड एक्टिव रखने के लिए)
self.addEventListener('install', (event) => {
    // नए सर्विस वर्कर को तुरंत एक्टिवेट करने के लिए वेटिंग स्टेट को छोड़ें
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // एक्टिवेट होते ही सभी क्लाइंट्स (PWA विंडोज़) पर तुरंत नियंत्रण प्राप्त करें
    event.waitUntil(self.clients.claim());
});

// 🌟 2. बैकग्राउंड मैसेज आने पर नोटिफिकेशन ट्रिगर करना
messaging.onBackgroundMessage((payload) => {
    console.log('Background message received: ', payload);

    const notificationTitle = payload.notification ? payload.notification.title : 'New Message';
    const data = payload.data || {};
    
    // प्रत्येक संदेश या नोटिफिकेशन के लिए सर्वर से आई विशिष्ट आईडी का उपयोग करें
    const uniqueTag = data.messageId || data.notifId || Date.now().toString();
    const senderPhoto = data.senderPhoto || 'https://deepak1455.github.io/DK-love-chats-/logo.png';
    const clickAction = data.click_action || '/';

    const notificationOptions = {
        body: payload.notification ? payload.notification.body : 'You have received a new message.',
        icon: senderPhoto,
        badge: 'https://deepak1455.github.io/DK-love-chats-/logo.png',
        
        // 🌟 स्मार्ट नो-ओवरराइट टैग (सभी संदेश अलग-अलग कार्ड में स्टैक होंगे)
        tag: uniqueTag,
        
        // एक ही टैग होने पर भी डिवाइस को अलर्ट (कंपन/ध्वनि) भेजने के लिए
        renotify: true,
        
        // वाइब्रेशन पैटर्न सेटिंग्स
        vibrate: [100, 50, 100],
        
        data: {
            click_action: clickAction
        }
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// 🌟 3. स्मार्ट क्लिक रूटिंग (URL पैरामीटर सुधार के साथ)
self.addEventListener('notificationclick', (event) => {
    event.notification.close(); // नोटिफिकेशन विंडो बंद करें
    
    const targetUrl = event.notification.data ? event.notification.data.click_action : '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // PWA का कोई टैब खुला है या नहीं, यह जांचने के लिए यूआरएल की तुलना करें
            // पुराना लॉजिक सटीक मिलान (Exact Match) खोजता था, जिससे क्वेरी पैरामीटर (?openChat=...) होने पर नया टैब खुल जाता था।
            // नया लॉजिक: यदि ऐप का कोई भी टैब खुला है, तो उसी पर फोकस करें और उसे नेविगेट करें।
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                
                // जांचें कि क्या यह हमारे ऐप का डोमेन है
                if (client.url.includes('deepak1455.github.io') && 'focus' in client && 'navigate' in client) {
                    client.focus();
                    return client.navigate(targetUrl); // खुले हुए टैब को सीधे नए रूट पर भेजें
                }
            }
            
            // अगर ऐप बंद था, तो उसे नई विंडो में खोलें
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

// PWA आवश्यकताओं और सिंकिंग को सुचारू रखने के लिए खाली फेच इवेंट
self.addEventListener('fetch', (event) => {
    // बैकग्राउंड सिंक और नेटवर्क कनेक्टिविटी बनाए रखने के लिए खाली इवेंट हैंडलर
});
