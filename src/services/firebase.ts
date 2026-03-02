// firebase.ts — initializes the Firebase app and exports service instances.
// All other files import { db, auth } from this file instead of initializing Firebase themselves.

import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

// Vite exposes env variables prefixed with VITE_ via import.meta.env
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

// Initialize the Firebase app (must happen before any other Firebase call)
const app = initializeApp(firebaseConfig)

// Auth instance — used for login, registration, session management
export const auth = getAuth(app)

// Firestore instance — offline persistence configured at init time (Firestore v9+ API)
// persistentLocalCache: caches Firestore data in IndexedDB for offline reads
// persistentMultipleTabManager: allows multiple browser tabs to share the same cache
export const db = initializeFirestore(app, {
  cache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
})