// RegisterPage.tsx — account creation screen (display name + email + password).
// Uses Firebase Auth for registration and relies on the global auth store's
// onAuthStateChanged listener to create the Firestore user document.

import { useState, useEffect, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth'
import type { FirebaseError } from 'firebase/app'
import { auth } from '@/services/firebase'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { GoogleLogo } from '@/auth/components/GoogleLogo'
import { GooglePwaHint, markPwaGoogleAttempted, isPwaGoogleAttempted, clearPwaGoogleAttempted } from '@/auth/components/GooglePwaHint'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Map Firebase auth error codes to user-friendly messages for registration.
function mapRegisterError(error: FirebaseError): string {
  switch (error.code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.'
    case 'auth/weak-password':
      return 'Your password is too weak. Please choose a stronger one.'
    case 'auth/invalid-email':
      return 'The email address is not valid.'
    default:
      return 'Unable to create your account. Please check your details and try again.'
  }
}

// Returns true when the app is running as an installed PWA (standalone window).
// signInWithPopup doesn't work reliably in standalone mode — use redirect instead.
function isInstalledPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function RegisterPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = new URLSearchParams(location.search).get('redirect') || '/travels'

  // Watch global auth state — once the Zustand store has the user (after
  // onAuthStateChanged fires and loads the profile), navigate to the app.
  const { currentUser, isAuthReady } = useAuthStore()
  useEffect(() => {
    if (isAuthReady && currentUser) {
      navigate(redirectTo, { replace: true })
    }
  }, [currentUser, isAuthReady, navigate, redirectTo])

  // Handle Google redirect result for installed PWA mode.
  useEffect(() => {
    if (!isInstalledPWA()) return
    setIsLoading(true)
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          clearPwaGoogleAttempted()
        } else {
          setIsLoading(false)
        }
        // If result.user exists, the useEffect above will handle navigation.
      })
      .catch(() => {
        setErrorMessage('Unable to sign in with Google. Please try again.')
        setIsLoading(false)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [displayName, setDisplayName] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [showPassword, setShowPassword] = useState(false) // toggles password visibility
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Shown on PWA after clicking Google button or returning from a failed redirect.
  // Initialised from sessionStorage so it survives the signInWithRedirect round-trip.
  const [showPwaHint, setShowPwaHint] = useState(() => isPwaGoogleAttempted())
  // Per-field validation errors, shown inline below each input
  const [fieldErrors, setFieldErrors] = useState<{ displayName?: string; email?: string; password?: string }>({})

  // Client-side validation before hitting Firebase
  function validate(): boolean {
    const errors: typeof fieldErrors = {}
    if (!displayName.trim()) errors.displayName = 'Please enter a display name.'
    if (!email.trim()) errors.email = 'Please enter your email address.'
    else if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email.trim())) errors.email = 'This email address doesn\u2019t look valid.'
    if (!password) errors.password = 'Please enter a password.'
    else if (password.length < 6) errors.password = 'Password must be at least 6 characters.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    if (!validate()) return
    setIsLoading(true)

    try {
      // 1. Create the Firebase Auth user with email/password.
      const credentials = await createUserWithEmailAndPassword(auth, email, password)

      // 2. Update the user profile to set the display name.
      //    This stores displayName on the Firebase Auth user object, so that
      //    subsequent calls to `user.displayName` (including in onAuthStateChanged)
      //    can use it.
      if (credentials.user) {
        await updateProfile(credentials.user, { displayName })
      }

      // IMPORTANT: we do NOT create the Firestore `users/{uid}` document here.
      // The global auth store (useAuthStore) already listens to onAuthStateChanged
      // and creates / updates that document when it detects a logged-in user.
      // Duplicating that logic here would cause two concurrent writes.

      // Don't navigate here — the useEffect watching currentUser handles it
      // once the Zustand store is fully populated (avoids a brief bounce
      // through /welcome when ProtectedRoute hasn't seen the user yet).
    } catch (error) {
      // Show invalid-email as a field-level error rather than a generic banner
      if (error && typeof error === 'object' && 'code' in error && (error as FirebaseError).code === 'auth/invalid-email') {
        setFieldErrors((prev) => ({ ...prev, email: 'This email address doesn\u2019t look valid.' }))
      } else {
        const message =
          (error && typeof error === 'object' && 'code' in error
            ? mapRegisterError(error as FirebaseError)
            : 'Unable to create your account. Please try again.')
        setErrorMessage(message)
      }
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setErrorMessage(null)
    setIsLoading(true)

    try {
      const provider = new GoogleAuthProvider()
      if (isInstalledPWA()) {
        // Persist flag in sessionStorage so the hint survives the redirect round-trip.
        markPwaGoogleAttempted()
        setShowPwaHint(true)
        // In standalone PWA mode, signInWithPopup is blocked by some browsers.
        // Use redirect flow instead.
        await signInWithRedirect(auth, provider)
        return
      }
      await signInWithPopup(auth, provider)
      // Don't navigate — useEffect watching currentUser handles it.
    } catch (error) {
      const message =
        (error && typeof error === 'object' && 'code' in error
          ? mapRegisterError(error as FirebaseError)
          : 'Unable to sign in with Google. Please try again.')
      setErrorMessage(message)
      setIsLoading(false)
    }
  }

  return (
    // Same centered Card layout as the Login page for consistency.
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            Start tracking your travel expenses with GlobeExpenses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(event) => { setDisplayName(event.target.value); setFieldErrors((e) => ({ ...e, displayName: undefined })) }}
                className={fieldErrors.displayName ? 'border-destructive' : ''}
              />
              {fieldErrors.displayName
                ? <p className="text-xs text-destructive">{fieldErrors.displayName}</p>
                : <p className="text-xs text-muted-foreground">How do you want your name to appear on the app? Can be changed later.</p>
              }
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="text"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => { setEmail(event.target.value); setFieldErrors((e) => ({ ...e, email: undefined })) }}
                className={fieldErrors.email ? 'border-destructive' : ''}
              />
              {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); setFieldErrors((e) => ({ ...e, password: undefined })) }}
                  className={`pr-10 ${fieldErrors.password ? 'border-destructive' : ''}`}
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
              {fieldErrors.password
                ? <p className="text-xs text-destructive">{fieldErrors.password}</p>
                : <p className="text-xs text-muted-foreground">{'Please use a password that you will remember. Password reset is not yet implemented. If you forget your password, you basically lose your account \u00AF\\_(\u30C4)_/\u00AF'}</p>
              }
            </div>

            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Creating account…' : 'Create account'}
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
            className="w-full bg-background gap-2"
            disabled={isLoading}
            onClick={handleGoogleSignIn}
          >
            <GoogleLogo />
            Continue with Google
          </Button>

          <GooglePwaHint visible={showPwaHint} />

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              to={redirectTo !== '/travels' ? `/login?redirect=${encodeURIComponent(redirectTo)}` : '/login'}
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>

          <p className="text-center text-sm">
            <Link to="/welcome" className="text-muted-foreground hover:text-foreground hover:underline">
              &larr; Back to Welcome
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

