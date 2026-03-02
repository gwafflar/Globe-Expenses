// ProtectedRoute.tsx — guards routes that require authentication.
// It reads the global auth state from Zustand and decides what to render
// based on whether Firebase has finished checking the session and whether
// a user is currently logged in.

import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/auth/store/useAuthStore'

export function ProtectedRoute() {
  // Read the current auth state from the store.
  const { currentUser, isAuthReady } = useAuthStore()

  // While Firebase is still restoring the session from disk, we *don't*
  // know yet if the user is logged in. We show a centered spinner instead
  // of redirecting, to avoid a "flash" of the login screen for logged-in users.
  if (!isAuthReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        {/* Simple Tailwind-based spinner — no external library needed */}
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  // Once auth is ready and there is no user, we redirect to the login page.
  if (!currentUser) {
    return <Navigate to="/login" replace />
  }

  // If we reach this point, auth is ready *and* we have a user.
  // <Outlet /> is a React Router v6 placeholder which renders any child
  // route element nested under this ProtectedRoute in the <Routes> tree.
  // This lets us wrap multiple protected pages with a single guard.
  return <Outlet />
}

