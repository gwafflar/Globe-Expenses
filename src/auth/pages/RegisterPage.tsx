// RegisterPage.tsx — account creation screen (display name + email + password).
// Uses Firebase Auth for registration and relies on the global auth store's
// onAuthStateChanged listener to create the Firestore user document.

import { useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import type { FirebaseError } from 'firebase/app'
import { auth } from '@/services/firebase'
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

export function RegisterPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = new URLSearchParams(location.search).get('redirect') || '/travels'

  const [displayName, setDisplayName] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [showPassword, setShowPassword] = useState(false) // toggles password visibility
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
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

      navigate(redirectTo, { replace: true })
    } catch (error) {
      const message =
        (error && typeof error === 'object' && 'code' in error
          ? mapRegisterError(error as FirebaseError)
          : 'Unable to create your account. Please try again.')

      setErrorMessage(message)
    } finally {
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
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                type="text"
                autoComplete="name"
                required
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
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
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
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
              {isLoading ? 'Creating account…' : 'Create account'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              to={redirectTo !== '/travels' ? `/login?redirect=${encodeURIComponent(redirectTo)}` : '/login'}
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

