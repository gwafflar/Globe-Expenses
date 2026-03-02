// useAuthStore.ts — global auth state.
// Holds the currently authenticated user (or null if logged out).
// Any component can read currentUser or call setCurrentUser from here.

import { create } from 'zustand'
import type { User } from 'firebase/auth'

// Shape of the auth store
interface AuthState {
  currentUser: User | null       // Firebase User object, or null if not logged in
  isAuthReady: boolean           // false until Firebase has checked session on startup
  setCurrentUser: (user: User | null) => void
  setAuthReady: (ready: boolean) => void
}

// create() defines the store — the argument is a function that receives
// a `set` function used to update state (similar to setState in React)
export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,   // start with no user
  isAuthReady: false,  // Firebase hasn't checked session yet

  // Actions — call these to update the store
  setCurrentUser: (user) => set({ currentUser: user }),
  setAuthReady:   (ready) => set({ isAuthReady: ready }),
}))