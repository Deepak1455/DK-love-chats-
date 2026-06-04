// server.js (ULTRA-SMART, FAST & BULLETPROOF LOGO UPDATE)
const admin = require('firebase-admin');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// डाउनलोड की गई serviceAccountKey.json फ़ाइल को इम्पोर्ट करें
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

// रेंडर पर पोर्ट बाइंडिंग टाइमआउट से बचाने के लिए छोटा सर्वर
app.get('/', (req, res) => {
  res.send('DK Love Chats - Ultra Smart Notification Server is Running Active!');
});

app.listen(PORT, () => {
  console.log(`Notification Server listening on port ${PORT}`);
});

console.log("DK Love Chats - All Smart Listeners Active...");

// ==========================================
// --- 📞 LISTENER 1: स्मार्ट चैट मैसेजेस सुनना ---
// ==========================================
db.collectionGroup('messages').onSnapshot(async (snapshot) => {
  snapshot.docChanges().forEach(async (change) => {
    try {
      if (change.type === 'added') {
        const messageData = change.doc.data();
        
        if (messageData && !messageData.notificationSent) {
          const parentDocPath = change.doc.ref.path;
          const senderId = messageData.senderId;
          const receiverId = messageData.receiverId;
          
          // 🛡️ सुरक्षा जांच: यदि आईडी खाली है तो स्किप करें (क्रैश से बचें)
          if (!senderId || !receiverId || typeof senderId !== 'string' || typeof receiverId !== 'string') {
            return;
          }

          let messageText = messageData.text;

          // 🧠 स्मार्ट डिटेक्टर: पहचानें कि मैसेज का प्रकार क्या है
          if (messageData.isSharedPost || messageData.sharedPostId) {
            messageText = messageData.repliedStoryType === 'video' || messageData.isReel === true
              ? "Shared a reel with you 🎬" 
              : "Shared a post with you 📸";
          } else if (!messageText && messageData.audioUrl) {
            messageText = "Sent a voice message 🎤";
          } else if (!messageText && messageData.mediaUrl) {
            messageText = "Sent a photo/video 🖼️";
          } else if (!messageText) {
            messageText = "Sent an attachment 📎";
          }

          if (senderId === receiverId) return;

          // सेंडर और रिसीवर की प्रोफाइल जानकारी प्राप्त करें (Parallel Fetch)
          const [senderSnap, receiverSnap] = await Promise.all([
            db.collection('users').doc(senderId).get(),
            db.collection('users').doc(receiverId).get()
          ]);

          if (!receiverSnap.exists) return;
          const receiverData = receiverSnap.data();
          const fcmToken = receiverData.fcmToken;

          if (fcmToken) {
            let senderName = "Someone";
            // 🌟 आपका नया 3D लोगो डिफ़ॉल्ट रूप से सेट किया गया है
            let senderPhoto = "https://deepak1455.github.io/DK-love-chats-/logo.png";

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
                click_action: `https://deepak1455.github.io/DK-love-chats-/?openChat=${senderId}`
              },
              token: fcmToken
            };

            const response = await messaging.send(payload);
            console.log(`Message notification sent to ${receiverData.name}:`, response);
          }

          // दोबारा नोटिफिकेशन न जाए, इसलिए डेटाबेस में अपडेट करें
          await db.doc(parentDocPath).update({ notificationSent: true });
        }
      }
    } catch (innerError) {
      console.error("Error processing single message change:", innerError.message);
    }
  });
}, (error) => {
  console.error("Firestore Message Listener Error:", error);
});


// ==========================================================
// --- 🔔 LISTENER 2: अन्य गतिविधियां सुनना (Like, Comment, Follow, Story) ---
// ==========================================================
db.collectionGroup('notifications').onSnapshot(async (snapshot) => {
  snapshot.docChanges().forEach(async (change) => {
    try {
      if (change.type === 'added') {
        const notifData = change.doc.data();
        
        if (notifData && !notifData.pushSent) {
          const parentDocPath = change.doc.ref.path;
          const receiverId = notifData.receiverId || notifData.userId;
          const senderName = notifData.senderName || "Someone";
          
          // 🛡️ सुरक्षा जांच: यदि रिसीवर आईडी खाली है तो स्किप करें (क्रैश से बचें)
          if (!receiverId || typeof receiverId !== 'string') {
            return;
          }

          let notifText = String(notifData.text || "performed an action");

          // 🧠 स्मार्ट गतिविधि अनुवादक (कस्टमाइज़ेशन)
          if (notifText.toLowerCase().includes("liked your comment")) {
            notifText = "liked your comment ❤️";
          } else if (notifText.toLowerCase().includes("liked your post") || notifText.toLowerCase().includes("liked your reel")) {
            notifText = "liked your post ❤️";
          } else if (notifText.toLowerCase().includes("liked your story")) {
            // 🌟 नया: स्टोरी लाइक डिटेक्टर
            notifText = "liked your story ❤️";
          } else if (notifText.toLowerCase().includes("replied to your story") || notifText.toLowerCase().includes("replied to story")) {
            // 🌟 नया: स्टोरी रिप्लाई डिटेक्टर
            notifText = "replied to your story 💬";
          } else if (notifText.toLowerCase().includes("started following you")) {
            notifText = "started following you 👤";
          } else if (notifText.toLowerCase().includes("commented on your")) {
            notifText = "commented on your post 💬";
          }

          if (notifData.senderId === receiverId) return;

          const receiverSnap = await db.collection('users').doc(receiverId).get();
          if (!receiverSnap.exists) return;

          const receiverData = receiverSnap.data();
          const fcmToken = receiverData.fcmToken;

          if (fcmToken) {
            const payload = {
              notification: {
                title: senderName,
                body: notifText
              },
              data: {
                senderPhoto: "https://deepak1455.github.io/DK-love-chats-/logo.png",
                click_action: `https://deepak1455.github.io/DK-love-chats-/`
              },
              token: fcmToken
            };

            const response = await messaging.send(payload);
            console.log(`Interaction notification sent to ${receiverData.name}:`, response);
          }

          await db.doc(parentDocPath).update({ pushSent: true });
        }
      }
    } catch (innerError) {
      console.error("Error processing single notification change:", innerError.message);
    }
  });
}, (error) => {
  console.error("Firestore Notification Listener Error:", error);
});
