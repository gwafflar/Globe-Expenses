// WelcomePage.tsx — landing page for unauthenticated users.
// Presents the app value proposition and clear paths to sign in, register, or use Google OAuth.

import { useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth'
import { auth } from '@/services/firebase'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { WifiOff, Users, Wallet, Plane, BarChart3, Github } from 'lucide-react'

// Returns true when the app is running as an installed PWA (standalone window).
function isInstalledPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function WelcomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = new URLSearchParams(location.search).get('redirect') || '/travels'

  // If user is already authenticated, skip welcome and go straight to the app.
  const { currentUser, isAuthReady } = useAuthStore()
  useEffect(() => {
    if (isAuthReady && currentUser) {
      navigate(redirectTo, { replace: true })
    }
  }, [currentUser, isAuthReady, navigate, redirectTo])

  // Handle Google redirect result for installed PWA mode.
  useEffect(() => {
    if (!isInstalledPWA()) return
    getRedirectResult(auth).then((result) => {
      if (result?.user) navigate(redirectTo, { replace: true })
    }).catch(() => { /* errors handled on login page */ })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider()
      if (isInstalledPWA()) {
        await signInWithRedirect(auth, provider)
        return
      }
      await signInWithPopup(auth, provider)
      navigate(redirectTo, { replace: true })
    } catch {
      // If Google sign-in fails here, user can still use Login page for detailed error handling.
    }
  }

  // Build redirect query string to forward to login/register pages
  const redirectQuery = redirectTo !== '/travels'
    ? `?redirect=${encodeURIComponent(redirectTo)}`
    : ''

  // Feature highlights shown below the hero
  const features = [
    { icon: Plane, title: 'Multi-currency travels', description: 'Track expenses in any currency with automatic conversion' },
    { icon: Users, title: 'Split with friends', description: 'Share costs and settle balances effortlessly' },
    { icon: Wallet, title: 'Cash tracker', description: 'Monitor withdrawals and wallet balances on the go' },
    { icon: WifiOff, title: 'Works offline', description: 'Use it anywhere in the world, even without network. Transactions sync with your friends when back online.' },
    { icon: BarChart3, title: 'In-depth statistics', description: 'Monitor your spendings and track exactly where your money goes' },
    { icon: Github, title: 'Open-source & free', description: 'Free to use  & Public code.', link: 'https://github.com/g10m/globe-expenses' },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Hero section */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8 pt-16">
        {/* App icon / branding */}
        <img
          src="/images/icon-512.png"
          alt="GlobeExpenses"
          className="mb-6 h-24 w-24 rounded-2xl"
        />

        <h1 className="mb-2 text-center text-3xl font-bold tracking-tight">
          GlobeExpenses
        </h1>
        <p className="mb-10 max-w-xs text-center text-muted-foreground">
          The simplest way to track and split travel expenses with friends.
        </p>

        {/* Action buttons — tall touch targets for mobile */}
        <div className="flex w-full max-w-sm flex-col gap-3">
          <Link to={`/login${redirectQuery}`} className={cn(buttonVariants(), 'w-full h-12 text-base')}>
            Sign in
          </Link>

          <Link to={`/register${redirectQuery}`} className={cn(buttonVariants({ variant: 'outline' }), 'w-full h-12 text-base bg-muted/50')}>
            Create an account
          </Link>

          <Button
            variant="outline"
            size="default"
            className="w-full h-12 text-base gap-2"
            onClick={handleGoogleSignIn}
          >
            {/* Google "G" logo — inline SVG to avoid an external dependency */}
            {/* Thanks Claude, I didn't even know that we could use an svg instead of an image*/}
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </Button>

        </div>
      </div>

      {/* Feature highlights */}
      <div className="border-t bg-muted/30 px-6 py-8">
        <div className="mx-auto grid max-w-lg grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
          {features.map(({ icon: Icon, title, description, link }) => (
            <div key={title} className="flex flex-col items-center text-center">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {description}
                {link && (
                  <>
                    {' '}
                    <a href={link} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      View on GitHub
                    </a>
                  </>
                )}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
