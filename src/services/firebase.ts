// firebase.ts — initializes the Firebase app and exports service instances.
// All other files import { db, auth } from this file instead of initializing Firebase themselves.

import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { resolveAuthDomain } from './authDomain'
// import { getStorage } from 'firebase/storage'  // uncomment when Firebase Storage is configured

// Vite exposes env variables prefixed with VITE_ via import.meta.env
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  // Same domain as the page when served from Firebase Hosting, so Google
  // sign-in by redirect works in the installed PWA — see authDomain.ts.
  authDomain:        resolveAuthDomain(
    window.location.hostname,
    import.meta.env.VITE_FIREBASE_PROJECT_ID,
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  ),
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

// Initialize the Firebase app (must happen before any other Firebase call).
// Exported for Firebase Cloud Messaging, which is created lazily in
// src/notifications/services/pushService.ts (it does not exist in every browser).
export const app = initializeApp(firebaseConfig)

// Auth instance — used for login, registration, session management
export const auth = getAuth(app)

// Firebase Storage — uncomment when Storage is configured
// export const storage = getStorage(app)

// Firestore instance — offline persistence configured at init time (Firestore v9+ API)
// persistentLocalCache: caches Firestore data in IndexedDB for offline reads
// persistentMultipleTabManager: allows multiple browser tabs to share the same cache
export const db = initializeFirestore(app, {
  // Firestore v12+ uses `localCache` for offline persistence configuration.
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
})