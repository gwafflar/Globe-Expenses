// LoginPage.tsx — email/password + Google login screen.
// Uses Firebase Auth for authentication and React Router for navigation.

import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth'
import type { FirebaseError } from 'firebase/app'
import { auth } from '@/services/firebase'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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

  const [email, setEmail] = useState<string>('')          // controlled email field
  const [password, setPassword] = useState<string>('')    // controlled password field
  const [isLoading, setIsLoading] = useState<boolean>(false) // tracks whether a sign-in request is in progress
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
      // Opens a popup window where the user can complete Google sign-in.
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
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
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

