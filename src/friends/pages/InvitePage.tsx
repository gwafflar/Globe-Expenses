// InvitePage.tsx — shown when a user opens a shareable invite link.
//
// URL: /invite/:inviteId
// The inviteId is an opaque random token — knowing it is the authorization
// to view (and accept) this invite (capability-based security).
//
// Flow:
//   1. Load the invite document from Firestore.
//   2. Validate it (exists, not revoked, not expired, not already used by this user).
//   3. Show invite info + Accept button.
//   4. On accept: batch write (friendship + invite update) → navigate to /travels.

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { getInvite, acceptFriendRequest, acceptTravelInvite } from '@/friends/services/friendService'
import type { Invite } from '@/friends/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ChevronLeft } from 'lucide-react'

// ---------------------------------------------------------------------------
// Avatar helper (same hash-based color as the rest of the app)
// ---------------------------------------------------------------------------

function avatarHue(uid: string): number {
  let hash = 0
  for (const ch of uid) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff
  return Math.abs(hash) % 360
}

function InviteAvatar({ uid, name }: { uid: string; name: string }) {
  const hue = avatarHue(uid)
  return (
    <div
      className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white shadow"
      style={{ backgroundColor: `hsl(${hue}, 55%, 50%)` }}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type PageState =
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'revoked' }
  | { status: 'expired' }
  | { status: 'alreadyUsed' }
  | { status: 'error'; invite: Invite }
  | { status: 'ready'; invite: Invite }
  | { status: 'accepting'; invite: Invite }
  | { status: 'accepted'; invite: Invite }

export function InvitePage() {
  // React Router gives us the :inviteId segment from the URL
  const { inviteId } = useParams<{ inviteId: string }>()
  const navigate = useNavigate()
  const { currentUser, userProfile } = useAuthStore()

  const [pageState, setPageState] = useState<PageState>({ status: 'loading' })

  // ---------------------------------------------------------------------------
  // Load and validate the invite on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!inviteId) {
      setPageState({ status: 'notFound' })
      return
    }

    // getInvite() performs a single Firestore read.
    // The ProtectedRoute guarantees auth before we get here,
    // so currentUser is always non-null at this point.
    getInvite(inviteId).then(invite => {
      if (!invite) {
        setPageState({ status: 'notFound' })
        return
      }

      if (invite.status === 'revoked') {
        setPageState({ status: 'revoked' })
        return
      }

      // Check expiry: compare expiresAt (Firestore Timestamp) to current time
      if (invite.expiresAt.toMillis() < Date.now()) {
        setPageState({ status: 'expired' })
        return
      }

      // Already accepted by this user
      if (currentUser && invite.usedBy.includes(currentUser.uid)) {
        setPageState({ status: 'alreadyUsed' })
        return
      }

      // Can't accept your own invite
      if (currentUser && invite.fromUid === currentUser.uid) {
        setPageState({ status: 'alreadyUsed' })
        return
      }

      setPageState({ status: 'ready', invite })
    })
  }, [inviteId, currentUser]) // re-run if auth state changes while on this page

  // ---------------------------------------------------------------------------
  // Accept handler
  // ---------------------------------------------------------------------------

  async function handleAccept() {
    if (pageState.status !== 'ready' || !userProfile) return

    setPageState({ status: 'accepting', invite: pageState.invite })

    try {
      const { invite } = pageState
      if (invite.type === 'travel_member') {
        await acceptTravelInvite(invite, userProfile)
      } else {
        await acceptFriendRequest(invite, userProfile)
      }
      setPageState({ status: 'accepted', invite })
    } catch (err) {
      // Log the real error for debugging — surface a generic message to the user.
      console.error('[InvitePage] handleAccept failed:', err)
      setPageState({ status: 'error', invite: pageState.invite })
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderContent() {
    switch (pageState.status) {
      case 'loading':
        return (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )

      case 'notFound':
        return <ErrorCard title="Invite not found" description="This invite link is invalid or has been deleted." />

      case 'revoked':
        return <ErrorCard title="Link no longer valid" description="The person who shared this link has revoked it." />

      case 'expired':
        return <ErrorCard title="Link expired" description="This invite link has expired. Ask the sender to share a new one." />

      case 'alreadyUsed':
        return (
          <Card className="text-center">
            <CardHeader>
              <CardTitle>Already connected</CardTitle>
              <CardDescription>You're already friends with this person.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate('/travels')}>Go to my travels</Button>
            </CardContent>
          </Card>
        )

      case 'error': {
        const isTravelInvite = pageState.invite.type === 'travel_member'
        return (
          <Card className="text-center">
            <CardHeader>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>
                {isTravelInvite
                  ? 'Unable to join this travel. Please try again or ask the sender to share a new link.'
                  : 'Unable to accept this invitation. Please try again.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {/* Let the user retry without reloading the page */}
              <Button className="w-full" onClick={() => setPageState({ status: 'ready', invite: pageState.invite })}>
                Try again
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate('/travels')}>
                Go to my travels
              </Button>
            </CardContent>
          </Card>
        )
      }

      case 'ready':
      case 'accepting': {
        const { invite } = pageState
        const isAccepting = pageState.status === 'accepting'
        return (
          <Card className="text-center">
            <CardHeader className="gap-4">
              <InviteAvatar uid={invite.fromUid} name={invite.fromDisplayName} />
              <div>
                <CardTitle>{invite.fromDisplayName}</CardTitle>
                {invite.fromNametag && (
                  <p className="text-sm text-muted-foreground mt-1">@{invite.fromNametag}</p>
                )}
              </div>
              <CardDescription className="text-base">
                {invite.type === 'friend'
                  ? `${invite.fromDisplayName} wants to add you as a friend on GlobeExpenses.`
                  : `${invite.fromDisplayName} is inviting you to join "${invite.travelName}" on GlobeExpenses.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button
                className="w-full"
                onClick={handleAccept}
                disabled={isAccepting}
              >
                {isAccepting ? 'Accepting…' : 'Accept invitation'}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate('/travels')}>
                Decline
              </Button>
            </CardContent>
          </Card>
        )
      }

      case 'accepted': {
        const { invite } = pageState
        const isTravelInvite = invite.type === 'travel_member'
        return (
          <Card className="text-center">
            <CardHeader className="gap-4">
              <InviteAvatar uid={invite.fromUid} name={invite.fromDisplayName} />
              <CardTitle>
                {isTravelInvite ? `You've joined ${invite.travelName}!` : "You're now friends!"}
              </CardTitle>
              <CardDescription>
                {isTravelInvite
                  ? `You are now a member of "${invite.travelName}" and connected with ${invite.fromDisplayName}.`
                  : `You and ${invite.fromDisplayName} are now connected. You can invite each other to shared travels.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                onClick={() =>
                  navigate(isTravelInvite && invite.travelId
                    ? `/travels/${invite.travelId}`
                    : '/travels')
                }
              >
                {isTravelInvite ? `Open ${invite.travelName}` : 'Go to my travels'}
              </Button>
            </CardContent>
          </Card>
        )
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center border-b px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/travels')}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          All travels
        </button>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
        {renderContent()}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared error card
// ---------------------------------------------------------------------------

function ErrorCard({ title, description }: { title: string; description: string }) {
  const navigate = useNavigate()
  return (
    <Card className="text-center">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={() => navigate('/travels')}>Go to my travels</Button>
      </CardContent>
    </Card>
  )
}
