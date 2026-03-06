// LoginPage.tsx — email/password + Google login screen.
// Uses Firebase Auth for authentication and React Router for navigation.

import { useState, useEffect, type FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth'
import type { FirebaseError } from 'firebase/app'
import { auth } from '@/services/firebase'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff } from 'lucide-react'

// Returns true when the app is running as an installed PWA (standalone window).
// signInWithPopup doesn't work reliably in standalone mode — use redirect instead.
function isInstalledPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

// Map Firebase auth error codes to user-friendly messages.
function mapAuthError(error: FirebaseError): string {
  switch (error.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'The password you entered is incorrect.'
    case 'auth/user-not-found':
      return 'No account was found with this email address.'
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again in a few minutes.'
    default:
      // Fallback for unexpected errors — keep it generic but helpful.
      return 'Unable to sign in. Please check your details and try again.'
  }
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  // Read the ?redirect= param set by ProtectedRoute when an unauthenticated user
  // opens a protected URL (e.g. /invite/abc123). After sign-in we send them there.
  const redirectTo = new URLSearchParams(location.search).get('redirect') || '/travels'

  // Watch global auth state. When Firebase fires onAuthStateChanged with a user
  // (from redirect, Custom Tab, or any other flow), navigate away from login.
  // This is the reliable fix for Android PWA where the Custom Tab completes the
  // Google OAuth but the promise from signInWithRedirect never resolves in the
  // same page lifecycle.
  const { currentUser, isAuthReady } = useAuthStore()
  useEffect(() => {
    if (isAuthReady && currentUser) {
      navigate(redirectTo, { replace: true })
    }
  }, [currentUser, isAuthReady, navigate, redirectTo])

  const [email, setEmail] = useState<string>('')          // controlled email field
  const [password, setPassword] = useState<string>('')    // controlled password field
  const [showPassword, setShowPassword] = useState(false) // toggles password visibility
  const [isLoading, setIsLoading] = useState<boolean>(false) // tracks whether a sign-in request is in progress
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // When running as an installed PWA, Google sign-in uses a redirect flow.
  // On mount we check if we're returning from a Google redirect and, if so,
  // process the result and navigate to the app.
  useEffect(() => {
    if (!isInstalledPWA()) return
    setIsLoading(true)
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          // User successfully signed in via redirect — navigate to the app.
          navigate(redirectTo, { replace: true })
        }
      })
      .catch((error) => {
        // A redirect error is surfaced here (e.g. popup blocked, cancelled).
        const message =
          error && typeof error === 'object' && 'code' in error
            ? mapAuthError(error as FirebaseError)
            : 'Unable to sign in with Google. Please try again.'
        setErrorMessage(message)
      })
      .finally(() => setIsLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleEmailPasswordSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault() // prevent the browser from performing a full page reload
    setErrorMessage(null)
    setIsLoading(true)

    try {
      // Firebase Auth call for email/password login.
      await signInWithEmailAndPassword(auth, email, password)
      navigate(redirectTo, { replace: true })
    } catch (error) {
      // Narrow unknown error to FirebaseError when possible.
      const message =
        (error && typeof error === 'object' && 'code' in error
          ? mapAuthError(error as FirebaseError)
          : 'Unable to sign in. Please try again.')

      setErrorMessage(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setErrorMessage(null)
    setIsLoading(true)

    try {
      const provider = new GoogleAuthProvider()
      if (isInstalledPWA()) {
        // In standalone PWA mode, signInWithPopup is blocked by some browsers.
        // Use redirect flow instead: page navigates away and comes back;
        // getRedirectResult() on the next mount picks up the credential.
        await signInWithRedirect(auth, provider)
        // Execution stops here — the page will redirect to Google.
        return
      }
      // Normal browser: popup works fine.
      await signInWithPopup(auth, provider)
      navigate(redirectTo, { replace: true })
    } catch (error) {
      const message =
        (error && typeof error === 'object' && 'code' in error
          ? mapAuthError(error as FirebaseError)
          : 'Unable to sign in with Google. Please try again.')

      setErrorMessage(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    // Full-height flex container that centers the card on the page.
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>
            Sign in to continue tracking your travel expenses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleEmailPasswordSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              {/* Wrapper gives the eye toggle button a consistent position inside the field */}
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {/* Button label reflects loading state so users know something is happening */}
              {isLoading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="flex items-center justify-center">
            <span className="h-px w-16 bg-border" />
            <span className="px-3 text-xs text-muted-foreground">or</span>
            <span className="h-px w-16 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full bg-background"
            disabled={isLoading}
            onClick={handleGoogleSignIn}
          >
            Sign in with Google
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            {/* Link component changes the URL without triggering a full page reload */}
            <Link
              to={redirectTo !== '/travels' ? `/register?redirect=${encodeURIComponent(redirectTo)}` : '/register'}
              className="font-medium text-primary hover:underline"
            >
              Register
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

