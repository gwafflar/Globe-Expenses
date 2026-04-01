// WelcomePage.tsx — landing page for unauthenticated users.
// Presents the app value proposition and clear paths to sign in, register, or use Google OAuth.

import { useState, useEffect } from 'react'
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
import { GoogleLogo } from '@/auth/components/GoogleLogo'
import { GooglePwaHint, markPwaGoogleAttempted, isPwaGoogleAttempted, clearPwaGoogleAttempted } from '@/auth/components/GooglePwaHint'
import { WifiOff, Users, Wallet, Plane, BarChart3, Github } from 'lucide-react'
import { BetaBanner } from '@/feedback/components/BetaBanner'
import { FeedbackForm } from '@/feedback/components/FeedbackForm'

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

  // Shown on PWA after clicking Google button or returning from a failed redirect.
  // Initialised from sessionStorage so it survives the signInWithRedirect round-trip.
  const [showPwaHint, setShowPwaHint] = useState(() => isPwaGoogleAttempted())

  // Handle Google redirect result for installed PWA mode.
  useEffect(() => {
    if (!isInstalledPWA()) return
    getRedirectResult(auth).then((result) => {
      if (result?.user) {
        clearPwaGoogleAttempted()
        navigate(redirectTo, { replace: true })
      }
    }).catch(() => { /* errors handled on login page */ })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider()
      if (isInstalledPWA()) {
        // Persist flag in sessionStorage so the hint survives the redirect round-trip.
        markPwaGoogleAttempted()
        setShowPwaHint(true)
        await signInWithRedirect(auth, provider)
        return
      }
      await signInWithPopup(auth, provider)
      // Don't navigate — useEffect watching currentUser handles it.
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
      {/* Beta feedback banner — always visible at the very top */}
      <BetaBanner />

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
            <GoogleLogo />
            Continue with Google
          </Button>

          <GooglePwaHint visible={showPwaHint} />

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

      {/* Feedback section — embedded form for maximum visibility on the welcome page */}
      <div className="border-t px-6 py-8">
        <div className="mx-auto max-w-lg">
          <h2 className="mb-3 text-center text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Feedback
          </h2>
          <FeedbackForm source="WelcomePage" />
        </div>
      </div>
    </div>
  )
}
