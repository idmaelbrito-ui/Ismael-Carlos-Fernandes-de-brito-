importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// These values will be replaced or we can try to fetch them
// For simplicity in this environment, we'll hardcode the ones from the config
// or the user can update them.
firebase.initializeApp({
  projectId: "studio-7907457050-dc422",
  appId: "1:409156899422:web:6a2abe4c17768701bedacf",
  apiKey: "AIzaSyDeA1dwWgVferxvifBt6OmMdyjIqWC4xu0",
  messagingSenderId: "409156899422",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.ico'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
