// ProfilePage.tsx — user profile management.
//
// Sections:
//   - Avatar (initials-based, color derived from UID) + name + nametag
//   - Identity: edit display name and @nametag
//   - Security: email (read-only), send password reset email
//   - Preferences: main currency (placeholder), theme (v2 placeholder)
//   - Friends: placeholder (v2)
//   - Contact developer: expandable card with mail / Discord / Telegram
//   - Sign out (red, with confirmation dialog)

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProfile } from 'firebase/auth'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '@/services/firebase'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { updateUserProfile } from '@/auth/services/userService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ChevronLeft, LogOut, Mail } from 'lucide-react'

// ---------------------------------------------------------------------------
// Avatar color
// ---------------------------------------------------------------------------

// Derives a consistent hue (0-359) from the user's UID using a simple hash.
// Same UID always produces the same color — no randomness on re-render.
function avatarHue(uid: string): number {
  let hash = 0
  for (const ch of uid) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff
  return Math.abs(hash) % 360
}

// ---------------------------------------------------------------------------
// Section card wrapper — reduces repetition for each settings section
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ProfilePage() {
  const navigate = useNavigate()
  const { currentUser, userProfile, signOut, setUserProfile } = useAuthStore()

  // Identity fields — initialized from the cached Zustand profile
  const [displayName, setDisplayName] = useState(userProfile?.displayName ?? '')
  // Strip any leading '@' so the input shows just the handle
  const [nametag, setNametag] = useState((userProfile?.nametag ?? '').replace(/^@/, ''))
  const [identitySaving, setIdentitySaving] = useState(false)
  const [identityMsg, setIdentityMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Password reset
  const [resetState, setResetState] = useState<'idle' | 'sent' | 'error'>('idle')

  // Sign-out confirmation dialog
  const [signOutOpen, setSignOutOpen] = useState(false)

  // Contact card toggle
  const [contactOpen, setContactOpen] = useState(false)

  // Guard: should not reach this page without being authenticated
  if (!currentUser || !userProfile) return null

  const hue = avatarHue(currentUser.uid)
  const initials = (displayName || currentUser.email || '?').charAt(0).toUpperCase()

  // -------------------------------------------------------------------------
  // Save identity (display name + nametag)
  // -------------------------------------------------------------------------

  async function handleSaveIdentity() {
    setIdentitySaving(true)
    setIdentityMsg(null)
    try {
      const trimmedName = displayName.trim()
      const trimmedTag = nametag.trim().toLowerCase()

      // 1. Update Firebase Auth displayName (used by currentUser.displayName)
      await updateProfile(currentUser, { displayName: trimmedName })

      // 2. Persist to Firestore users/{uid}
      await updateUserProfile(currentUser.uid, {
        displayName: trimmedName,
        nametag: trimmedTag,
      })

      // 3. Update the Zustand cache so TransactionForm and travel creation
      //    see the new displayName immediately without a re-fetch.
      setUserProfile({ ...userProfile, displayName: trimmedName, nametag: trimmedTag })

      setIdentityMsg({ ok: true, text: 'Saved.' })
    } catch {
      setIdentityMsg({ ok: false, text: 'Failed to save. Please try again.' })
    } finally {
      setIdentitySaving(false)
    }
  }

  // -------------------------------------------------------------------------
  // Password reset
  // -------------------------------------------------------------------------

  async function handlePasswordReset() {
    setResetState('idle')
    try {
      await sendPasswordResetEmail(auth, currentUser.email!)
      setResetState('sent')
    } catch {
      setResetState('error')
    }
  }

  // -------------------------------------------------------------------------
  // Sign out
  // -------------------------------------------------------------------------

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex min-h-screen flex-col bg-background">

      {/* Header */}
      <header className="flex items-center border-b px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/travels')}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          All travels
        </button>
        {/* Centered title */}
        <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-semibold">Profile</h1>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 flex flex-col gap-5">

        {/* Avatar + name summary */}
        <div className="flex flex-col items-center gap-2 pt-2 pb-2">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold text-white shadow-md"
            style={{ backgroundColor: `hsl(${hue}, 55%, 50%)` }}
          >
            {initials}
          </div>
          <p className="text-lg font-semibold leading-tight">
            {userProfile.displayName || 'No name set'}
          </p>
          {userProfile.nametag && (
            <p className="text-sm text-muted-foreground">@{userProfile.nametag}</p>
          )}
        </div>

        {/* Identity */}
        <Section title="Identity">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nametag">Username</Label>
            {/* Prefix @ is shown as a static label, the input holds the handle only */}
            <div className="flex items-center rounded-md border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
              <span className="shrink-0 text-sm text-muted-foreground">@</span>
              <input
                id="nametag"
                type="text"
                value={nametag}
                onChange={(e) => setNametag(e.target.value.replace(/^@/, '').toLowerCase())}
                placeholder="yourhandle"
                className="flex-1 bg-transparent py-2 pl-1 text-sm focus:outline-none"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Will be used for friend management in a future version.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" onClick={handleSaveIdentity} disabled={identitySaving}>
              {identitySaving ? 'Saving…' : 'Save'}
            </Button>
            {identityMsg && (
              <p className={`text-xs ${identityMsg.ok ? 'text-green-600' : 'text-destructive'}`}>
                {identityMsg.text}
              </p>
            )}
          </div>
        </Section>

        {/* Security */}
        <Section title="Security">
          <div className="flex flex-col gap-1">
            <Label>Email</Label>
            <p className="text-sm text-muted-foreground">{currentUser.email}</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Password</Label>
            <Button type="button" variant="outline" className="self-start" onClick={handlePasswordReset}>
              Send password reset email
            </Button>
            {resetState === 'sent' && (
              <p className="text-xs text-green-600">
                Reset email sent to {currentUser.email}. Check your inbox.
              </p>
            )}
            {resetState === 'error' && (
              <p className="text-xs text-destructive">
                Failed to send reset email. Please try again.
              </p>
            )}
          </div>
        </Section>

        {/* Preferences */}
        <Section title="Preferences">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Main currency</p>
              <p className="text-xs text-muted-foreground">{userProfile.mainCurrency}</p>
            </div>
            {/* Placeholder — editable currency picker coming in a future session */}
            <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
              coming soon
            </span>
          </div>

          {/* Theme toggle — v2 */}
          <div className="flex items-center justify-between opacity-50">
            <div>
              <p className="text-sm font-medium">Dark mode</p>
              <p className="text-xs text-muted-foreground">Theme preference</p>
            </div>
            <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">v2</span>
          </div>
        </Section>

        {/* Friends — v2 placeholder */}
        <Section title="Friends">
          <p className="text-sm text-muted-foreground">
            Friend management is coming in a future version. Your @username will be used to add
            friends and invite them to shared travels.
          </p>
        </Section>

        {/* Contact developer */}
        <Section title="Contact developer">
          {!contactOpen ? (
            <Button type="button" variant="outline" className="self-start" onClick={() => setContactOpen(true)}>
              Show contact info
            </Button>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <p className="font-medium">Developer Name <span className="text-muted-foreground font-normal">(placeholder)</span></p>

              <a
                href="mailto:dev@example.com"
                className="flex items-center gap-2 text-primary hover:underline"
              >
                {/* Mail icon from lucide-react */}
                <Mail className="h-4 w-4 shrink-0" />
                dev@example.com
              </a>

              <a
                href="https://discord.com/users/placeholder"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-primary hover:underline"
              >
                {/* Discord logo — not in lucide, using official SVG path */}
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.001.028.016.053.036.073a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                Discord: @placeholder
              </a>

              <a
                href="https://t.me/placeholder"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-primary hover:underline"
              >
                {/* Telegram logo SVG */}
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
                Telegram: @placeholder
              </a>
            </div>
          )}
        </Section>

        {/* Sign out */}
        <div className="pb-8">
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            onClick={() => setSignOutOpen(true)}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>

      </main>

      {/* Sign-out confirmation dialog */}
      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be signed out of GlobeExpenses on this device. All locally cached data will
              be cleared.
              <br /><br />
              <strong>Note:</strong> there is currently no way to reset your password from within
              the app. If you lose access to your account, please contact the developer directly.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSignOut}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
