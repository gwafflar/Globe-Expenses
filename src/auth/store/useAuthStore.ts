// useAuthStore.ts — global authentication state + Firebase user bootstrap.
// This store:
// - exposes the currently authenticated Firebase user (or null)
// - exposes the Firestore user profile (or null) — loaded once at sign-in
// - exposes an `isAuthReady` flag so the UI knows when initial auth loading is done
// - listens to `onAuthStateChanged` exactly once at module load
// - ensures a Firestore user document exists for every authenticated user
//
// Why store userProfile here instead of fetching it in each component?
// The profile (mainCurrency, categories, paymentMethods) is needed by the
// transaction form and potentially many other components. Fetching it once at
// sign-in and storing it globally means:
//   1. No repeated network calls per component mount
//   2. The profile is available offline after the first load (Firestore caches it)
//   3. Components can read it synchronously from the store — no loading states needed

import { create } from 'zustand'
import type { User } from 'firebase/auth'
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/services/firebase'
import type { UserProfile } from '@/auth/services/userService'

// Shape of the auth store
interface AuthState {
  currentUser: User | null          // Firebase User object, or null if not logged in
  userProfile: UserProfile | null   // Firestore user profile, or null if not loaded yet
  isAuthReady: boolean              // false until Firebase has checked session on startup
  signOut: () => Promise<void>      // action to sign the user out
}

export const useAuthStore = create<AuthState>(() => ({
  currentUser: null,
  userProfile: null,
  isAuthReady: false,

  // Sign-out action exposed to components.
  // We rely on the `onAuthStateChanged` listener below to actually clear state
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

    const userDocRef = doc(db, 'users', user.uid)
    const snapshot = await getDoc(userDocRef)

    // `profile` will hold the final Firestore document data.
    // We declare it here so both branches (exists / doesn't exist) can assign to it.
    let profile: UserProfile

    if (!snapshot.exists()) {
      // Document doesn't exist yet — create it with default values.
      // This handles first sign-in for both email/password and Google OAuth.
      await setDoc(userDocRef, {
        uid: user.uid,
        type: 'human',
        displayName: user.displayName ?? '',
        email: user.email ?? '',
        mainCurrency: 'EUR',
        categories: [] as string[],
        paymentMethods: [] as string[],
        createdAt: serverTimestamp(),
      })

      // Re-fetch after creation to get the full document including server-set fields.
      // We can't use the setDoc data directly because serverTimestamp() is a sentinel
      // value that only resolves to a real Timestamp on the server side.
      const fresh = await getDoc(userDocRef)
      profile = fresh.data() as UserProfile
    } else {
      // Document already exists — use it directly.
      profile = snapshot.data() as UserProfile
    }

    // Update the store with both the Firebase user and the Firestore profile.
    // Components can now read userProfile synchronously without any extra fetches.
    useAuthStore.setState({
      currentUser: user,
      userProfile: profile,
      isAuthReady: true,
    })
  } else {
    // No active session — clear everything.
    useAuthStore.setState({
      currentUser: null,
      userProfile: null,
      isAuthReady: true,
    })
  }
})