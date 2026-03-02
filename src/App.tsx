// App.tsx — root component. Defines all top-level routes.
// Each route maps a URL path to a page component.
import { Routes, Route, Navigate } from 'react-router-dom'

// Placeholder page components — we'll replace these with real pages soon
function LoginPage()      { return <div>Login</div> }
function TravelsPage()    { return <div>Travels</div> }
function NotFoundPage()   { return <div>404 — Not found</div> }

export default function App() {
  return (
    <Routes>
      {/* Default route: redirect root to /travels for now */}
      <Route path="/" element={<Navigate to="/travels" replace />} />
      <Route path="/login"   element={<LoginPage />} />
      <Route path="/travels" element={<TravelsPage />} />
      {/* Catch-all: any unknown URL shows 404 */}
      <Route path="*"        element={<NotFoundPage />} />
    </Routes>
  )
}