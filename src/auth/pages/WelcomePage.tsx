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
import { WifiOff, Users, Wallet, Plane, BarChart3, Github, ChevronDown, ChevronUp, Smartphone } from 'lucide-react'
import { BetaBanner } from '@/feedback/components/BetaBanner'
import { FeedbackForm } from '@/feedback/components/FeedbackForm'
import { useT } from '@/i18n'

// Returns true when the app is running as an installed PWA (standalone window).
function isInstalledPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function WelcomePage() {
  // translation hook — re-renders when the language changes
  const t = useT()
  const w = t.auth.welcome // shorthand: this page reads mostly from auth.welcome
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = new URLSearchParams(location.search).get('redirect') || '/spaces'

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

  // Toggle PWA installation tutorial collapse state
  const [showPwaTutorial, setShowPwaTutorial] = useState(false)

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
  const redirectQuery = redirectTo !== '/spaces'
    ? `?redirect=${encodeURIComponent(redirectTo)}`
    : ''

  // Feature highlights shown below the hero.
  // Built inside the component (not at module level) so the labels follow the
  // current language. `id` is a stable React key that does not change with it.
  const f = w.features
  const features = [
    { id: 'currency', icon: Plane, title: f.multiCurrencyTitle, description: f.multiCurrencyDesc },
    { id: 'split', icon: Users, title: f.splitTitle, description: f.splitDesc },
    { id: 'cash', icon: Wallet, title: f.cashTitle, description: f.cashDesc },
    { id: 'offline', icon: WifiOff, title: f.offlineTitle, description: f.offlineDesc },
    { id: 'stats', icon: BarChart3, title: f.statsTitle, description: f.statsDesc },
    { id: 'oss', icon: Github, title: f.openSourceTitle, description: f.openSourceDesc, link: 'https://github.com/g10m/globe-expenses' },
  ]

  const tut = w.tutorial

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Beta feedback banner — always visible at the very top */}
      <BetaBanner />

      {/* Hero section */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8 pt-16">
        {/* App icon / branding */}
        <img
          src="/images/icon-512.png"
          alt={w.appIconAlt}
          className="mb-6 h-24 w-24 rounded-2xl"
        />

        <h1 className="mb-2 text-center text-3xl font-bold tracking-tight">
          GlobeExpenses
        </h1>
        <p className="mb-10 max-w-xs text-center text-muted-foreground">
          {w.tagline}
        </p>

        {/* Getting started steps */}
        <div className="mb-10 w-full max-w-sm space-y-4">
          <p className="text-center text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {w.stepsTitle}
          </p>

          {/* Step cards */}
          <div className="space-y-3">
            {/* Step 1 */}
            <div className="flex items-center gap-4 rounded-xl bg-gradient-to-r from-blue-50 to-blue-50/50 p-4 border border-blue-200/30">
              <span className="text-2xl">👤</span>
              <div>
                <p className="text-xs font-semibold text-blue-600">{w.step(1)}</p>
                <p className="text-sm font-medium text-foreground">{w.step1}</p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-center gap-4 rounded-xl bg-gradient-to-r from-purple-50 to-purple-50/50 p-4 border border-purple-200/30">
              <span className="text-2xl">🚀</span>
              <div>
                <p className="text-xs font-semibold text-purple-600">{w.step(2)}</p>
                <p className="text-sm font-medium text-foreground">{w.step2}</p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-center gap-4 rounded-xl bg-gradient-to-r from-green-50 to-green-50/50 p-4 border border-green-200/30">
              <span className="text-2xl">💸</span>
              <div>
                <p className="text-xs font-semibold text-green-600">{w.step(3)}</p>
                <p className="text-sm font-medium text-foreground">{w.step3}</p>
              </div>
            </div>

            {/* Step 4 - Optional */}
            <div className="flex items-center gap-4 rounded-xl bg-gradient-to-r from-amber-50 to-amber-50/50 p-4 border border-amber-200/30">
              <span className="text-2xl">👥</span>
              <div className="flex-1">
                <p className="text-xs font-semibold text-amber-600">{w.stepOptional(4)}</p>
                <p className="text-sm font-medium text-foreground">{w.step4}</p>
              </div>
            </div>

            {/* Step 5 outcomes - side by side */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-50/50 p-3 border border-emerald-200/30 text-center">
                <span className="text-xl">📊</span>
                <p className="mt-1 text-xs font-semibold text-emerald-700">{w.outcomeTrack}</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-cyan-50 to-cyan-50/50 p-3 border border-cyan-200/30 text-center">
                <span className="text-xl">💰</span>
                <p className="mt-1 text-xs font-semibold text-cyan-700">{w.outcomeDebt}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Separator — discrete divider */}
        <div className="mb-8 h-px w-24 bg-gradient-to-r from-transparent via-muted-foreground/20 to-transparent"></div>

        {/* Action buttons — tall touch targets for mobile */}
        <div className="flex w-full max-w-sm flex-col gap-3">
          <Link to={`/login${redirectQuery}`} className={cn(buttonVariants(), 'w-full h-12 text-base')}>
            {w.signIn}
          </Link>

          <Link to={`/register${redirectQuery}`} className={cn(buttonVariants({ variant: 'outline' }), 'w-full h-12 text-base bg-muted/50')}>
            {w.createAccount}
          </Link>

          <Button
            variant="outline"
            size="default"
            className="w-full h-12 text-base gap-2"
            onClick={handleGoogleSignIn}
          >
            <GoogleLogo />
            {t.auth.continueWithGoogle}
          </Button>

          <GooglePwaHint visible={showPwaHint} />

        </div>

        {/* Separator — discrete divider */}
        <div className="my-10 h-px w-24 bg-gradient-to-r from-transparent via-muted-foreground/20 to-transparent"></div>

        {/* PWA Installation section */}
        <div className="w-full max-w-sm rounded-lg border border-blue-200/30 bg-gradient-to-br from-blue-50 to-blue-50/50 p-6">
          <div className="flex items-start gap-3">
            <Smartphone className="mt-1 h-5 w-5 flex-shrink-0 text-blue-600" />
            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-1">{w.installTitle}</h3>
              <p className="text-xs text-muted-foreground mb-4">
                {w.installSubtitle}
              </p>

              <div className="space-y-2 text-xs mb-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{w.androidLabel}</span>
                  <span className="text-muted-foreground">{w.androidShort}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{w.iosLabel}</span>
                  <span className="text-muted-foreground">{w.iosShort}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{w.desktopLabel}</span>
                  <span className="text-muted-foreground">{w.desktopShort}</span>
                </div>
              </div>

              {/* Collapsible tutorial */}
              <button
                onClick={() => setShowPwaTutorial(!showPwaTutorial)}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                {w.knowMore}
                {showPwaTutorial ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {/* Tutorial content — the lines with bold parts are message
                  functions returning JSX (see messages/en/auth.tsx). */}
              {showPwaTutorial && (
                <div className="mt-4 space-y-4 border-t border-blue-200/50 pt-4 text-xs leading-relaxed text-muted-foreground">
                  <div>
                    <p className="font-semibold text-foreground mb-2">{tut.androidTitle}</p>
                    <ol className="list-decimal list-inside space-y-1 ml-1">
                      <li>{tut.android1}</li>
                      <li>{tut.android2()}</li>
                      <li>{tut.android3()}</li>
                      <li>{tut.android4()}</li>
                    </ol>
                  </div>

                  <div>
                    <p className="font-semibold text-foreground mb-2">{tut.iosTitle}</p>
                    <p className="mb-1 text-xs italic">{tut.iosRecommended}</p>
                    <ol className="list-decimal list-inside space-y-1 ml-1">
                      <li>{tut.ios1}</li>
                      <li>{tut.ios2()}</li>
                      <li>{tut.ios3()}</li>
                      <li>{tut.ios4()}</li>
                    </ol>
                  </div>

                  <div>
                    <p className="font-semibold text-foreground mb-2">{tut.desktopTitle}</p>
                    <ol className="list-decimal list-inside space-y-1 ml-1">
                      <li>{tut.desktop1}</li>
                      <li>{tut.desktop2}</li>
                      <li>{tut.desktop3()}</li>
                      <li>{tut.desktop4()}</li>
                    </ol>
                    <p className="mt-2">{tut.desktopAlt()}</p>
                  </div>

                  <div>
                    <p className="font-semibold text-foreground mb-2">{tut.updatingTitle}</p>
                    <p>{tut.updating}</p>
                  </div>

                  <div>
                    <p className="font-semibold text-foreground mb-2">{tut.removingTitle}</p>
                    <ul className="list-disc list-inside space-y-1 ml-1">
                      <li>{tut.removeAndroid}</li>
                      <li>{tut.removeIos}</li>
                      <li>{tut.removeDesktop}</li>
                    </ul>
                  </div>

                  <p className="mt-2 pt-2 border-t border-blue-200/50 italic">{tut.issues}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Feature highlights */}
      <div className="border-t bg-muted/30 px-6 py-8">
        <div className="mx-auto grid max-w-lg grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
          {features.map(({ id, icon: Icon, title, description, link }) => (
            <div key={id} className="flex flex-col items-center text-center">
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
                      {f.viewOnGithub}
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
            {w.feedbackTitle}
          </h2>
          <FeedbackForm source="WelcomePage" />
        </div>
      </div>
    </div>
  )
}
