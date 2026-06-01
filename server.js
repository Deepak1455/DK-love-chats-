// server.js
const admin = require('firebase-admin');

// 1. डाउनलोड की गई serviceAccountKey.json फ़ाइल को इम्पोर्ट करें
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

console.log("DK Love Chats - Notification Server Started...");

// 2. सभी चैट रूम्स के मैसेजेस पर रीयल-टाइम नज़र रखें
// (यह Firestore Collection Group query का उपयोग करता है ताकि सभी 'messages' सब-कलेक्शन्स को एक साथ सुना जा सके)
db.collectionGroup('messages').onSnapshot(async (snapshot) => {
  snapshot.docChanges().forEach(async (change) => {
    // केवल नए जोड़े गए (added) मैसेजेस पर एक्शन लें
    if (change.type === 'added') {
      const messageData = change.data();
      
      // यदि मैसेज अभी-अभी भेजा गया है और उसे प्रोसेस नहीं किया गया है
      if (messageData && !messageData.notificationSent) {
        const messageId = change.doc.id;
        const parentDocPath = change.doc.ref.path; // e.g., chats/room_id/messages/msg_id

        const senderId = messageData.senderId;
        const receiverId = messageData.receiverId;
        const messageText = messageData.text || "Sent an attachment";

        // खुद को भेजे गए मैसेजेस पर नोटिफिकेशन न भेजें
        if (senderId === receiverId) return;

        try {
          // सेंडर और रिसीवर दोनों की जानकारी निकालें
          const [senderSnap, receiverSnap] = await Promise.all([
            db.collection('users').doc(senderId).get(),
            db.collection('users').doc(receiverId).get()
          ]);

          if (!receiverSnap.exists) return;
          const receiverData = receiverSnap.data();
          const fcmToken = receiverData.fcmToken;

          // यदि रिसीवर के पास एक्टिव टोकन (fcmToken) है, तभी नोटिफिकेशन भेजें
          if (fcmToken) {
            let senderName = "Someone";
            let senderPhoto = "https://i.pravatar.cc/150";

            if (senderSnap.exists) {
              const senderData = senderSnap.data();
              senderName = senderData.name || "Someone";
              senderPhoto = senderData.avatarBase64 || senderData.photoURL || senderPhoto;
            }

            // पेलोड तैयार करें
            const payload = {
              notification: {
                title: senderName,
                body: messageText
              },
              data: {
                senderId: senderId,
                senderPhoto: senderPhoto,
                click_action: `https://my-chat-e4ea8.firebaseapp.com/?openChat=${senderId}` // ऐप खोलने का यूआरएल
              },
              token: fcmToken
            };

            // FCM के ज़रिए नोटिफिकेशन भेजें
            const response = await messaging.send(payload);
            console.log(`Notification sent to ${receiverData.name}:`, response);
          }

          // दोबारा नोटिफिकेशन भेजने से बचने के लिए इस मैसेज को 'processed' मार्क कर दें
          await db.doc(parentDocPath).update({ notificationSent: true });

        } catch (error) {
          console.error("Error processing notification:", error);
        }
      }
    }
  });
}, (error) => {
  console.error("Firestore Listener Error:", error);
});