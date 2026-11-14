// ProfilePage.tsx — user profile management.
//
// Sections:
//   - Avatar (initials-based, color derived from UID) + name + nametag
//   - Identity: edit display name and @nametag
//   - Security: email (read-only), send password reset email
//   - Preferences: favorite main space currency (editable), theme (v2 placeholder)
//   - Friends: placeholder (v2)
//   - Feedback: embedded FeedbackForm (includes collapsible contact developer card)
//   - Sign out (red, with confirmation dialog)

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProfile } from 'firebase/auth'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '@/services/firebase'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { updateUserProfile, isNametagAvailable, claimNametag } from '@/auth/services/userService'
import {
  searchByNametag,
  sendFriendRequest,
  acceptFriendRequest,
  acceptSpaceInvite,
  declineFriendRequest,
  fetchFriends,
} from '@/friends/services/friendService'
import { usePendingInvites } from '@/friends/hooks/usePendingInvites'
import type { Friend, SearchUser } from '@/friends/types'
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
import { ChevronLeft, LogOut, UserPlus, Check, X, Search, Share2 } from 'lucide-react'
import { createShareableInvite } from '@/friends/services/friendService'
import { InstallPromptBanner } from '@/shared/components/InstallPromptBanner'
import { ALL_CURRENCIES } from '@/shared/data/pickerData'
import { FeedbackForm } from '@/feedback/components/FeedbackForm'
import { DeviceNotificationToggle } from '@/notifications/components/DeviceNotificationToggle'

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
// MiniAvatar — small colored circle with initials, used in friend lists
// ---------------------------------------------------------------------------

// Same hash-based color as the main avatar, scaled down to 32px.
function MiniAvatar({ uid, name }: { uid: string; name: string }) {
  const hue = avatarHue(uid)
  const initial = (name || '?').charAt(0).toUpperCase()
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ backgroundColor: `hsl(${hue}, 55%, 50%)` }}
    >
      {initial}
    </div>
  )
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

  // Preferences: main currency
  const [mainCurrency, setMainCurrency] = useState(userProfile?.mainCurrency ?? 'EUR')
  const [mainCurrencySaving, setMainCurrencySaving] = useState(false)
  const [mainCurrencyMsg, setMainCurrencyMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Password reset
  const [resetState, setResetState] = useState<'idle' | 'sent' | 'error'>('idle')

  // Sign-out confirmation dialog
  const [signOutOpen, setSignOutOpen] = useState(false)


  // ── Friends state ──────────────────────────────────────────────────────────
  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchUser[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  // Track UIDs we've just sent a request to (for immediate button feedback)
  const [sentTo, setSentTo] = useState<Set<string>>(new Set())

  // Incoming friend requests via real-time snapshot listener
  const { invites: pendingInvites } = usePendingInvites(currentUser?.uid)

  // Friends list (fetched once, refreshed after accept)
  const [friends, setFriends] = useState<Friend[]>([])

  // Ref to cancel in-flight debounce timer on new keystroke
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Share invite link state
  const [shareLoading, setShareLoading] = useState(false)
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState(false)

  // Guard: should not reach this page without being authenticated
  if (!currentUser || !userProfile) return null

  const hue = avatarHue(currentUser.uid)
  const initials = (displayName || currentUser.email || '?').charAt(0).toUpperCase()

  // -------------------------------------------------------------------------
  // Save identity (display name + nametag)
  // -------------------------------------------------------------------------

  async function handleSaveIdentity() {
    // TypeScript doesn't narrow currentUser/userProfile through async closures;
    // re-check here so the rest of the function body has non-null types.
    if (!currentUser || !userProfile) return
    setIdentitySaving(true)
    setIdentityMsg(null)
    try {
      const trimmedName = displayName.trim()
      const trimmedTag = nametag.trim().toLowerCase()
      const nametagChanged = trimmedTag !== (userProfile.nametag ?? '').replace(/^@/, '')

      // --- Nametag availability pre-check -----------------------------------
      // Only run when the handle has actually changed. The check is not
      // atomic (there's a brief window between check and write), but the
      // batch write will also fail if another user claims it in that window —
      // we catch that error below as well.
      if (nametagChanged && trimmedTag !== '') {
        const available = await isNametagAvailable(trimmedTag)
        if (!available) {
          setIdentityMsg({ ok: false, text: '@' + trimmedTag + ' is already taken.' })
          return
        }
      }

      // --- Firebase Auth displayName ----------------------------------------
      await updateProfile(currentUser, { displayName: trimmedName })

      // --- Nametag: atomic sentinel + user doc update -----------------------
      if (nametagChanged && trimmedTag !== '') {
        // claimNametag() runs a batch: delete old sentinel, create new sentinel,
        // update users/{uid}.nametag — all three succeed or all fail.
        await claimNametag(
          currentUser.uid,
          userProfile.nametag?.replace(/^@/, ''),
          trimmedTag,
        )
      } else if (!nametagChanged) {
        // Nametag unchanged — only update other fields
        await updateUserProfile(currentUser.uid, { displayName: trimmedName })
      }
      // (if trimmedTag is empty and changed: we leave nametag as-is for now)

      // --- Zustand cache update ---------------------------------------------
      // Keeps TransactionForm and other consumers in sync without re-fetch.
      setUserProfile({ ...userProfile, displayName: trimmedName, nametag: trimmedTag || userProfile.nametag || '' })

      setIdentityMsg({ ok: true, text: 'Saved.' })
    } catch (err: unknown) {
      // FirestoreError with code 'permission-denied' means the nametag was
      // claimed between our availability check and the batch write (race condition).
      const code = (err as { code?: string })?.code
      if (code === 'permission-denied') {
        setIdentityMsg({ ok: false, text: '@' + nametag + ' was just taken. Try another handle.' })
      } else {
        setIdentityMsg({ ok: false, text: 'Failed to save. Please try again.' })
      }
    } finally {
      setIdentitySaving(false)
    }
  }

  // -------------------------------------------------------------------------
  // Save main currency (favorite default for new spaces)
  // -------------------------------------------------------------------------

  async function handleSaveMainCurrency() {
    if (!currentUser) return
    setMainCurrencySaving(true)
    setMainCurrencyMsg(null)
    try {
      await updateUserProfile(currentUser.uid, { mainCurrency })
      // Update Zustand cache so new spaces created with this user default to the new currency
      setUserProfile({ ...userProfile!, mainCurrency })
      setMainCurrencyMsg({ ok: true, text: 'Saved.' })
    } catch {
      setMainCurrencyMsg({ ok: false, text: 'Failed to save. Please try again.' })
    } finally {
      setMainCurrencySaving(false)
    }
  }

  // -------------------------------------------------------------------------
  // Password reset
  // -------------------------------------------------------------------------

  async function handlePasswordReset() {
    if (!currentUser) return
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
    navigate('/welcome', { replace: true })
  }

  // -------------------------------------------------------------------------
  // Friends — load list on mount
  // -------------------------------------------------------------------------

  // useEffect runs after the component renders. Here we load the friend list once.
  // We also reload it whenever the user accepts a request (friendsKey changes).
  const [friendsKey, setFriendsKey] = useState(0)
  useEffect(() => {
    fetchFriends(currentUser.uid).then(setFriends)
  }, [currentUser.uid, friendsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Friends — nametag search (debounced 300ms)
  // -------------------------------------------------------------------------

  // useEffect watches searchQuery. Each time it changes, we cancel the previous
  // timer and start a new 300ms countdown before firing the Firestore query.
  // This prevents a query on every keystroke.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)

    if (searchQuery.trim() === '') {
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    setSearchLoading(true)
    searchTimer.current = setTimeout(async () => {
      const results = await searchByNametag(searchQuery.trim(), currentUser.uid)
      setSearchResults(results)
      setSearchLoading(false)
    }, 300)

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [searchQuery, currentUser.uid]) // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Friends — send request
  // -------------------------------------------------------------------------

  async function handleSendRequest(toUid: string) {
    if (!userProfile) return
    setSentTo(prev => new Set(prev).add(toUid))
    await sendFriendRequest(userProfile, toUid)
  }

  // -------------------------------------------------------------------------
  // Friends — accept / decline
  // -------------------------------------------------------------------------

  async function handleAccept(inviteId: string) {
    if (!userProfile) return
    const invite = pendingInvites.find(i => i.inviteId === inviteId)
    if (!invite) return
    // Dispatch to the correct acceptance function based on invite type.
    // travel_member invites must call acceptSpaceInvite() to write the space membership —
    // acceptFriendRequest() would only create friendship entries and never add the user to the space.
    if (invite.type === 'travel_member') {
      await acceptSpaceInvite(invite, userProfile)
    } else {
      await acceptFriendRequest(invite, userProfile)
    }
    // Trigger friends list reload (relevant for both types — space join also creates friendship)
    setFriendsKey(k => k + 1)
  }

  async function handleDecline(inviteId: string) {
    await declineFriendRequest(inviteId)
    // The snapshot listener will remove this invite from pendingInvites automatically
  }

  // -------------------------------------------------------------------------
  // Friends — share invite link
  // -------------------------------------------------------------------------

  async function handleShareInvite() {
    if (!userProfile) return
    setShareLoading(true)
    try {
      const inviteId = await createShareableInvite(userProfile, 'friend')
      // Build the absolute URL using the current origin (works on localhost and production)
      const url = `${window.location.origin}/invite/${inviteId}`
      setGeneratedInviteUrl(url)

      // Copy to clipboard automatically
      try {
        await navigator.clipboard.writeText(url)
        setCopyFeedback(true)
        setTimeout(() => setCopyFeedback(false), 2500)
      } catch {
        // clipboard may be unavailable; user can copy manually from the displayed URL
      }
    } catch {
      // invite creation failed — ignore silently
    } finally {
      setShareLoading(false)
    }
  }

  async function handleCopyInviteUrl() {
    if (!generatedInviteUrl) return
    await navigator.clipboard.writeText(generatedInviteUrl)
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 2500)
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
          onClick={() => navigate('/spaces')}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          All spaces
        </button>
        {/* Centered title */}
        <h1 className="absolute left-1/2 -translate-x-1/2 text-base font-semibold">Profile</h1>
      </header>

      {/* Install PWA banner — shown on mobile browsers only, hidden once installed */}
      <InstallPromptBanner />

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
              Used to find and add friends. Must be unique.
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
          {/* Favorite main space currency — used as default when creating new spaces */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="mainCurrency">Favorite main space currency</Label>
            <p className="text-xs text-muted-foreground">
              Used as the default when you create a new space. Can be overridden per space.
            </p>
            <select
              id="mainCurrency"
              value={mainCurrency}
              onChange={(e) => setMainCurrency(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {ALL_CURRENCIES.map(([code, symbol, name]) => (
                <option key={code} value={code}>{code} ({symbol}) — {name}</option>
              ))}
            </select>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={handleSaveMainCurrency}
                disabled={mainCurrencySaving || mainCurrency === userProfile.mainCurrency}
              >
                {mainCurrencySaving ? 'Saving…' : 'Save'}
              </Button>
              {mainCurrencyMsg && (
                <p className={`text-xs ${mainCurrencyMsg.ok ? 'text-green-600' : 'text-destructive'}`}>
                  {mainCurrencyMsg.text}
                </p>
              )}
            </div>
          </div>

          {/* Push notifications — master switch for THIS device. Per-space
              muting lives in each space's Parameters tab (NOTIFICATIONS_SPEC §9). */}
          <DeviceNotificationToggle uid={currentUser.uid} />

          {/* Theme toggle — v2 */}
          <div className="flex items-center justify-between opacity-50">
            <div>
              <p className="text-sm font-medium">Dark mode</p>
              <p className="text-xs text-muted-foreground">Theme preference</p>
            </div>
            <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">v2</span>
          </div>
        </Section>

        {/* ── Friends ─────────────────────────────────────────────── */}
        <Section title="Friends">

          {/* Share invite link */}
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              className="self-start flex items-center gap-2"
              onClick={handleShareInvite}
              disabled={shareLoading}
            >
              <Share2 className="h-4 w-4" />
              {shareLoading ? 'Creating link…' : 'Generate invite link'}
            </Button>

            {/* Show the URL once generated — user can copy it manually too */}
            {generatedInviteUrl && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                  <span className="flex-1 min-w-0 truncate text-xs text-muted-foreground font-mono">
                    {generatedInviteUrl}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyInviteUrl}
                    className="shrink-0 text-xs text-primary hover:underline"
                  >
                    {copyFeedback ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Anyone who opens this link can add you as a friend.
                </p>
              </div>
            )}
          </div>

          {/* Search by nametag */}
          <div className="flex flex-col gap-2">
            <Label>Find by @username</Label>
            {/* Input with a search icon prefix, same pattern as the nametag field */}
            <div className="flex items-center rounded-md border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value.replace(/^@/, '').toLowerCase())}
                placeholder="username"
                className="flex-1 bg-transparent py-2 pl-2 text-sm focus:outline-none"
              />
            </div>

            {/* Search results */}
            {searchLoading && (
              <p className="text-xs text-muted-foreground">Searching…</p>
            )}
            {!searchLoading && searchResults.length > 0 && (
              <ul className="flex flex-col gap-1">
                {searchResults.map(user => {
                  const alreadyFriend = friends.some(f => f.uid === user.uid)
                  const alreadySent = sentTo.has(user.uid)
                  return (
                    <li key={user.uid} className="flex items-center gap-2 rounded-md border px-3 py-2">
                      {/* Mini avatar — same color-from-uid approach */}
                      <MiniAvatar uid={user.uid} name={user.displayName} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user.displayName}</p>
                        <p className="text-xs text-muted-foreground">@{user.nametag}</p>
                      </div>
                      {alreadyFriend ? (
                        <span className="text-xs text-muted-foreground">Friends</span>
                      ) : alreadySent ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <Check className="h-3 w-3" /> Sent
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSendRequest(user.uid)}
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <UserPlus className="h-3 w-3" />
                          Add
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {!searchLoading && searchQuery.length > 0 && searchResults.length === 0 && (
              <p className="text-xs text-muted-foreground">No users found for @{searchQuery}</p>
            )}
          </div>

          {/* Incoming space invitations — type='travel_member' */}
          {pendingInvites.filter(i => i.type === 'travel_member').length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Space invitations ({pendingInvites.filter(i => i.type === 'travel_member').length})
              </p>
              <ul className="flex flex-col gap-2">
                {pendingInvites.filter(i => i.type === 'travel_member').map(invite => (
                  <li key={invite.inviteId} className="flex items-center gap-2 rounded-md border px-3 py-2">
                    <MiniAvatar uid={invite.fromUid} name={invite.fromDisplayName} />
                    <div className="flex-1 min-w-0">
                      {/* Show the space name prominently, sender as secondary info */}
                      <p className="text-sm font-medium truncate">{invite.travelName ?? 'Unknown space'}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        from {invite.fromDisplayName}{invite.fromNametag ? ` (@${invite.fromNametag})` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAccept(invite.inviteId)}
                      className="flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
                    >
                      <Check className="h-3 w-3" />
                      Join
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecline(invite.inviteId)}
                      className="flex items-center gap-1 rounded-full border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                    >
                      <X className="h-3 w-3" />
                      Decline
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Incoming friend requests — type='friend' */}
          {pendingInvites.filter(i => i.type === 'friend').length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Friend requests ({pendingInvites.filter(i => i.type === 'friend').length})
              </p>
              <ul className="flex flex-col gap-2">
                {pendingInvites.filter(i => i.type === 'friend').map(invite => (
                  <li key={invite.inviteId} className="flex items-center gap-2 rounded-md border px-3 py-2">
                    <MiniAvatar uid={invite.fromUid} name={invite.fromDisplayName} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{invite.fromDisplayName}</p>
                      {invite.fromNametag && (
                        <p className="text-xs text-muted-foreground">@{invite.fromNametag}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAccept(invite.inviteId)}
                      className="flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
                    >
                      <Check className="h-3 w-3" />
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecline(invite.inviteId)}
                      className="flex items-center gap-1 rounded-full border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                    >
                      <X className="h-3 w-3" />
                      Decline
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Friends list */}
          <div className="flex flex-col gap-2">
            {friends.length > 0 ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Your friends ({friends.length})
                </p>
                <ul className="flex flex-col gap-1">
                  {friends.map(friend => (
                    <li key={friend.uid} className="flex items-center gap-2 rounded-md border px-3 py-2">
                      <MiniAvatar uid={friend.uid} name={friend.displayName} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{friend.displayName}</p>
                        {friend.nametag && (
                          <p className="text-xs text-muted-foreground">@{friend.nametag}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No friends yet. Search by @username above to add someone.
              </p>
            )}
          </div>
        </Section>

        {/* Feedback — embedded form for quick beta feedback */}
        <Section title="Feedback">
          <FeedbackForm source="ProfilePage" />
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
