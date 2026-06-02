// server.js
const admin = require('firebase-admin');
const express = require('express'); // 🌟 नया: सर्वर लाइव रखने के लिए एक्सप्रेस

const app = express();
const PORT = process.env.PORT || 3000;

// डाउनलोड की गई serviceAccountKey.json फ़ाइल को इम्पोर्ट करें
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

// 🌟 नया: रेंडर या क्लाउड पर पोर्ट बाइंडिंग क्रैश से बचाने के लिए छोटा सर्वर
app.get('/', (req, res) => {
  res.send('DK Love Chats - Notification Server is Running Active!');
});

app.listen(PORT, () => {
  console.log(`Notification Server listening on port ${PORT}`);
});

console.log("DK Love Chats - Firestore Listener Active...");

// सभी चैट रूम्स के मैसेजेस पर रीयल-टाइम नज़र रखें
db.collectionGroup('messages').onSnapshot(async (snapshot) => {
  snapshot.docChanges().forEach(async (change) => {
    if (change.type === 'added') {
      const messageData = change.data();
      
      if (messageData && !messageData.notificationSent) {
        const messageId = change.doc.id;
        const parentDocPath = change.doc.ref.path;

        const senderId = messageData.senderId;
        const receiverId = messageData.receiverId;
        const messageText = messageData.text || "Sent an attachment";

        if (senderId === receiverId) return;

        try {
          const [senderSnap, receiverSnap] = await Promise.all([
            db.collection('users').doc(senderId).get(),
            db.collection('users').doc(receiverId).get()
          ]);

          if (!receiverSnap.exists) return;
          const receiverData = receiverSnap.data();
          const fcmToken = receiverData.fcmToken;

          if (fcmToken) {
            let senderName = "Someone";
            let senderPhoto = "https://i.pravatar.cc/150";

            if (senderSnap.exists) {
              const senderData = senderSnap.data();
              senderName = senderData.name || "Someone";
              senderPhoto = senderData.avatarBase64 || senderData.photoURL || senderPhoto;
            }

            const payload = {
              notification: {
                title: senderName,
                body: messageText
              },
              data: {
                senderId: senderId,
                senderPhoto: senderPhoto,
                // 🌟 आपका असली लाइव यूआरएल यहाँ सेट कर दिया गया है
                click_action: `https://deepak1455.github.io/DK-love-chats-/?openChat=${senderId}`
              },
              token: fcmToken
            };

            const response = await messaging.send(payload);
            console.log(`Notification sent to ${receiverData.name}:`, response);
          }

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
