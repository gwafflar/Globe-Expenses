// main.tsx — entry point. Mounts the React app into the HTML page.
// BrowserRouter enables URL-based navigation throughout the app.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './services/firebase' // initialize Firebase at app startup
import './index.css'
import { auth } from './services/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { useAuthStore } from './shared/useAuthStore'
import App from './App'


// onAuthStateChanged fires once on startup (with the existing session or null)
// and again whenever the user logs in or out.
// We use it to keep our Zustand store in sync with Firebase's auth state.
const { setCurrentUser, setAuthReady } = useAuthStore.getState()


onAuthStateChanged(auth, (user) => {
  setCurrentUser(user)  // user is a Firebase User object, or null if logged out
  setAuthReady(true)    // Firebase has now checked the session — app can render
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* BrowserRouter provides routing context to the entire app */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)