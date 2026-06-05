// firebase-messaging-sw.js (SMART STACKING & NO-OVERWRITE UPDATE)
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

messaging.onBackgroundMessage((payload) => {
    console.log('Background message received: ', payload);

    const notificationTitle = payload.notification ? payload.notification.title : 'New Message';
    const notificationOptions = {
        body: payload.notification ? payload.notification.body : 'You have received a new message.',
        icon: payload.data && payload.data.senderPhoto ? payload.data.senderPhoto : 'https://deepak1455.github.io/DK-love-chats-/logo.png',
        badge: 'https://deepak1455.github.io/DK-love-chats-/logo.png',
        
        // 🌟 स्मार्ट नो-ओवरराइट फिक्स: हर मैसेज को अलग नोटिफिकेशन कार्ड के रूप में दिखाने के लिए यूनिक टैग सेट करें
        tag: payload.data && payload.data.messageId ? payload.data.messageId : Date.now().toString(),
        
        data: {
            click_action: payload.data && payload.data.click_action ? payload.data.click_action : '/'
        }
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification.data.click_action;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url === targetUrl && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

self.addEventListener('fetch', (event) => {
    // खाली फेच इवेंट PWA आवश्यकताओं को पूरा करने के लिए
});
