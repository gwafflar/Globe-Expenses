// App.tsx — root component. Defines all top-level routes.
// Each route maps a URL path to a page component.
import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/auth/components/ProtectedRoute'
import { LoginPage } from '@/auth/pages/LoginPage'
import { RegisterPage } from '@/auth/pages/RegisterPage'
import { TravelsPage } from '@/travels/pages/TravelsPage'
import { TravelDetailPage } from '@/travels/pages/TravelDetailPage'

function NotFoundPage() { return <div>404 — Not found</div> }

export default function App() {
  return (
    <Routes>
      {/* Default route: redirect root to /travels */}
      <Route path="/" element={<Navigate to="/travels" replace />} />

      {/* Public routes: login & register are always accessible */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected routes: anything nested here requires authentication */}
      <Route element={<ProtectedRoute />}>
        {/* /travels and nested travel detail are behind the auth guard */}
        <Route path="/travels" element={<TravelsPage />} />
        <Route path="/travels/:travelId" element={<TravelDetailPage />} />
      </Route>

      {/* Catch-all: any unknown URL shows 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}