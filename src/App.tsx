// App.tsx — root component. Defines all top-level routes.
// Each route maps a URL path to a page component.
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { ProtectedRoute } from '@/auth/components/ProtectedRoute'
import { LoginPage } from '@/auth/pages/LoginPage'
import { RegisterPage } from '@/auth/pages/RegisterPage'
import { WelcomePage } from '@/auth/pages/WelcomePage'
import { SpacesPage } from '@/spaces/pages/SpacesPage'
import { SpaceCreatePage } from '@/spaces/pages/SpaceCreatePage'
import { SpaceDetailPage } from '@/spaces/pages/SpaceDetailPage'
import { ProfilePage } from '@/auth/pages/ProfilePage'
import { InvitePage } from '@/friends/pages/InvitePage'
import { useT } from '@/i18n'

function NotFoundPage() {
  const t = useT() // translation hook — re-renders on language change
  return <div>{t.common.notFound}</div>
}

// Legacy route redirect — remove once no old bookmarks remain (target: end of 2026).
// The invite flow is unaffected: /invite/:inviteId resolves the space internally.
function LegacySpaceRedirect() {
  const { spaceId } = useParams()
  return <Navigate to={`/spaces/${spaceId}`} replace />
}

export default function App() {
  return (
    <Routes>
      {/* Default route: redirect root to /spaces */}
      <Route path="/" element={<Navigate to="/spaces" replace />} />

      {/* Public routes: welcome, login & register are always accessible */}
      <Route path="/welcome" element={<WelcomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected routes: anything nested here requires authentication */}
      <Route element={<ProtectedRoute />}>
        {/* /spaces and nested space detail are behind the auth guard */}
        <Route path="/spaces" element={<SpacesPage />} />
        <Route path="/spaces/new" element={<SpaceCreatePage />} />
        <Route path="/spaces/:spaceId" element={<SpaceDetailPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/invite/:inviteId" element={<InvitePage />} />

        {/* Legacy route redirects — old bookmarks / PWA shortcuts still work */}
        <Route path="/travels" element={<Navigate to="/spaces" replace />} />
        <Route path="/travels/:spaceId" element={<LegacySpaceRedirect />} />
      </Route>

      {/* Catch-all: any unknown URL shows 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
