// ProtectedRoute.tsx — guards routes that require authentication.
// It reads the global auth state from Zustand and decides what to render
// based on whether Firebase has finished checking the session and whether
// a user is currently logged in.

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { NotificationClickHandler } from '@/notifications/components/NotificationClickHandler'
import { PushPromptBanner } from '@/notifications/components/PushPromptBanner'

export function ProtectedRoute() {
  const { currentUser, isAuthReady } = useAuthStore()
  // `location` gives us the full current URL path + search string.
  // We pass it as ?redirect= so LoginPage can send the user back here after sign-in.
  const location = useLocation()

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

  // Once auth is ready and there is no user, redirect to login.
  // We encode the current path so the login page can navigate back here after sign-in.
  // e.g. /invite/abc123 → /login?redirect=%2Finvite%2Fabc123
  if (!currentUser) {
    // location.search is kept too: a notification can deep-link to
    // /spaces/abc?tx=123, and the ?tx= part must survive the sign-in detour.
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/welcome?redirect=${redirect}`} replace />
  }

  // If we reach this point, auth is ready *and* we have a user.
  // <Outlet /> is a React Router v6 placeholder which renders any child
  // route element nested under this ProtectedRoute in the <Routes> tree.
  // This lets us wrap multiple protected pages with a single guard.
  // Push notifications (docs/NOTIFICATIONS_SPEC.md):
  //  - NotificationClickHandler renders nothing; it navigates when a
  //    notification is tapped while the app is open.
  //  - PushPromptBanner is the one "Get notified?" banner, shown above any
  //    page when some part of the app asks for it.
  return (
    <>
      <NotificationClickHandler />
      <PushPromptBanner />
      <Outlet />
    </>
  )
}

