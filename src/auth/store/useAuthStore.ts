// useAuthStore.ts — global authentication state + Firebase user bootstrap.
// This store:
// - exposes the currently authenticated Firebase user (or null)
// - exposes an `isAuthReady` flag so the UI knows when initial auth loading is done
// - listens to `onAuthStateChanged` exactly once at module load
// - ensures a Firestore user document exists for every authenticated user

import { create } from 'zustand'
import type { User } from 'firebase/auth'
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/services/firebase'

// Shape of the auth store
interface AuthState {
  currentUser: User | null          // Firebase User object, or null if not logged in
  isAuthReady: boolean              // false until Firebase has checked session on startup
  signOut: () => Promise<void>      // action to sign the user out
}

// create() defines the store — the argument is a function that receives
// a `set` function used to update state (similar to setState in React)
export const useAuthStore = create<AuthState>(() => ({
  currentUser: null,   // start with no user
  isAuthReady: false,  // Firebase hasn't checked session yet

  // Sign-out action exposed to components.
  // We rely on the `onAuthStateChanged` listener below to actually clear `currentUser`
  // when Firebase confirms the sign-out.
  signOut: async () => {
    await firebaseSignOut(auth)
  },
}))

// --- Firebase Auth <-> Zustand wiring --------------------------------------

// Listen to Firebase Auth session changes once, at module load.
// This keeps the global Zustand store in sync with the real Firebase session.
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // When `user` is non-null, the user is authenticated.
    // We must ensure a corresponding Firestore document exists at `users/{uid}`.

    // 1. Build a typed reference to the user document.
    const userDocRef = doc(db, 'users', user.uid)

    // 2. Read the document once to see if it already exists.
    //    Firestore reads are cheap and cached; this is safe to do on every login.
    const snapshot = await getDoc(userDocRef)

    if (!snapshot.exists()) {
      // 3. If the document does not exist, create it with the required fields.
      //    `serverTimestamp()` lets Firestore set `createdAt` on the server,
      //    so we don't depend on the client's clock being correct.
      await setDoc(userDocRef, {
        uid: user.uid,
        type: 'human', // per SPEC: only humans have User documents; agents don't
        displayName: user.displayName ?? '', // fallback to empty string if missing
        email: user.email ?? '',             // email can be null for some providers
        mainCurrency: 'EUR',                 // sensible default; user can change later
        categories: [] as string[],          // user-defined categories (initially empty)
        paymentMethods: [] as string[],      // user-defined payment methods (initially empty)
        createdAt: serverTimestamp(),
      })
    }

    // 4. Whatever the doc status, update the store with the current Firebase user
    //    and signal that auth is now "ready" for the UI.
    useAuthStore.setState({
      currentUser: user,
      isAuthReady: true,
    })
  } else {
    // When `user` is null, there is no active session.
    // We clear `currentUser` and still flip `isAuthReady` so the UI can render
    // the correct logged-out screens.
    useAuthStore.setState({
      currentUser: null,
      isAuthReady: true,
    })
  }
})

