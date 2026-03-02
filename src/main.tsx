// main.tsx — entry point. Mounts the React app into the HTML page.
// BrowserRouter enables URL-based navigation throughout the app.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './services/firebase' // initialize Firebase at app startup
import './index.css'
import App from './App'

// Auth state is now managed entirely inside the Zustand auth store
// (see src/auth/store/useAuthStore.ts). We just render the app here.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* BrowserRouter provides routing context to the entire app */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)