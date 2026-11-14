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
//   4. On accept:
//      - friend invite → batch write (friendship + invite update) → navigate to /spaces
//      - travel_member invite → acceptSpaceInvite() which returns SpaceInviteResult
//        • if unclaimedSlots.length > 0 → show identity pick screen
//        • else → show accepted screen

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useAuthStore } from '@/auth/store/useAuthStore'
import {
  getInvite,
  acceptFriendRequest,
  acceptSpaceInvite,
} from '@/friends/services/friendService'
import { claimSpaceMember, addUnclaimedMember } from '@/spaces/services/spaceService'
import { normaliseMember, type SpaceMember } from '@/spaces/types'
import type { Invite } from '@/friends/types'
import { requestPushPrompt } from '@/notifications/store/usePushPromptStore'
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
// Page state union
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
  // After joining: show identity pick when there are unclaimed slots
  | { status: 'identityPick'; invite: Invite; spaceId: string; unclaimedSlots: SpaceMember[]; allMembers: SpaceMember[] }
  // While claiming a slot (brief loading state before redirect)
  | { status: 'claiming'; invite: Invite; spaceId: string }
  | { status: 'accepted'; invite: Invite; spaceId?: string }

export function InvitePage() {
  // React Router gives us the :inviteId segment from the URL
  const { inviteId } = useParams<{ inviteId: string }>()
  const navigate = useNavigate()
  const { currentUser, userProfile } = useAuthStore()

  const [pageState, setPageState] = useState<PageState>({ status: 'loading' })
  // "Create new member" inline input on the identity pick screen
  const [newSlotName, setNewSlotName] = useState('')
  const [creatingSlot, setCreatingSlot] = useState(false)

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
        // Batch write: user joins space, invite is marked used.
        // The pre-read of the space is intentionally deferred to AFTER the batch
        // because the user is not in memberUids until the batch commits.
        const result = await acceptSpaceInvite(invite, userProfile)

        // Already a member — no new slot was created, so there's nothing to
        // claim. Skip straight to the accepted screen.
        if (result.alreadyMember) {
          setPageState({ status: 'accepted', invite, spaceId: result.spaceId })
          return
        }

        // User is now in memberUids — safe to read the space document.
        const spaceSnap = await getDoc(doc(db, 'travels', result.spaceId))
        const members: SpaceMember[] = (spaceSnap.data()?.members ?? []).map(
          (raw: Record<string, unknown>) => normaliseMember(raw),
        )
        // Exclude the slot we just created — candidates are those still unclaimed.
        const unclaimedSlots = members.filter((m) => m.userId === null)

        // Notifications banner, moment (b): the user just joined a space that
        // has at least one other real person in it, so there will be something
        // to be notified about. Shown at most once (NOTIFICATIONS_SPEC §9.4).
        if (members.some((m) => m.userId !== null && m.userId !== userProfile.uid)) {
          requestPushPrompt('b')
        }

        if (unclaimedSlots.length > 0) {
          setPageState({
            status: 'identityPick',
            invite,
            spaceId: result.spaceId,
            unclaimedSlots,
            allMembers: members,
          })
        } else {
          setPageState({ status: 'accepted', invite, spaceId: result.spaceId })
        }
      } else {
        await acceptFriendRequest(invite, userProfile)
        setPageState({ status: 'accepted', invite })
      }
    } catch (err) {
      // Log the real error for debugging — surface a generic message to the user.
      console.error('[InvitePage] handleAccept failed:', err)
      setPageState({ status: 'error', invite: pageState.invite })
    }
  }

  // ---------------------------------------------------------------------------
  // Identity pick: claim an existing unclaimed slot
  // ---------------------------------------------------------------------------

  async function handleClaimSlot(spaceId: string, travelMemberId: string, invite: Invite, allMembers: SpaceMember[]) {
    if (!currentUser) return
    setPageState({ status: 'claiming', invite, spaceId })
    try {
      // claimSpaceMember handles transfer semantics (nulls any previously claimed slot)
      await claimSpaceMember(spaceId, travelMemberId, currentUser.uid, allMembers)
    } catch (err) {
      console.error('[InvitePage] claimSpaceMember failed:', err)
      // Non-fatal: user still joined the space, just proceed
    }
    setPageState({ status: 'accepted', invite, spaceId })
  }

  function handleSkipClaim(spaceId: string, invite: Invite) {
    setPageState({ status: 'accepted', invite, spaceId })
  }

  // Creates a new unclaimed member slot with the given name, then immediately claims it.
  // Used when the user says "I'm someone new" on the identity pick screen.
  async function handleCreateAndClaim(spaceId: string, invite: Invite, allMembers: SpaceMember[]) {
    const trimmed = newSlotName.trim()
    if (!trimmed || !currentUser) return
    setCreatingSlot(true)
    try {
      const newMember = await addUnclaimedMember(spaceId, trimmed, allMembers)
      await claimSpaceMember(spaceId, newMember.travelMemberId, currentUser.uid, [...allMembers, newMember])
    } catch (err) {
      console.error('[InvitePage] handleCreateAndClaim failed:', err)
      // Non-fatal: user is still in the space, just proceed without a slot
    }
    setCreatingSlot(false)
    setPageState({ status: 'accepted', invite, spaceId })
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
              <Button onClick={() => navigate('/spaces')}>Go to my spaces</Button>
            </CardContent>
          </Card>
        )

      case 'error': {
        const isSpaceInvite = pageState.invite.type === 'travel_member'
        return (
          <Card className="text-center">
            <CardHeader>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>
                {isSpaceInvite
                  ? 'Unable to join this space. Please try again or ask the sender to share a new link.'
                  : 'Unable to accept this invitation. Please try again.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {/* Let the user retry without reloading the page */}
              <Button className="w-full" onClick={() => setPageState({ status: 'ready', invite: pageState.invite })}>
                Try again
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate('/spaces')}>
                Go to my spaces
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
              <Button variant="outline" className="w-full" onClick={() => navigate('/spaces')}>
                Decline
              </Button>
            </CardContent>
          </Card>
        )
      }

      case 'identityPick': {
        // Show after joining the space: allow the user to claim an existing unclaimed slot
        const { invite, spaceId, unclaimedSlots, allMembers } = pageState
        return (
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <h2 className="text-lg font-semibold">Who are you in this trip?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Some members were added before you joined. If one of them is you, select it — your
                account will be linked to that member's expenses.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {unclaimedSlots.map((member) => (
                <button
                  key={member.travelMemberId}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-input bg-background px-4 py-3 text-left transition-colors hover:bg-accent active:bg-accent/70"
                  onClick={() => handleClaimSlot(spaceId, member.travelMemberId, invite, allMembers)}
                >
                  <div className="flex items-center gap-3">
                    {/* Grey avatar for unclaimed member */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                      {(member.displayName || '?').charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium">{member.displayName}</span>
                  </div>
                  <span className="text-xs text-primary font-medium">Claim — this is me</span>
                </button>
              ))}

              {/* Create new member + auto-claim */}
              <div className="mt-1 flex flex-col gap-2 rounded-lg border border-dashed border-input px-4 py-3">
                <p className="text-sm text-muted-foreground">I'm someone new — add me with a name:</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSlotName}
                    onChange={(e) => setNewSlotName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !creatingSlot) handleCreateAndClaim(spaceId, invite, allMembers)
                    }}
                    placeholder="Your name…"
                    disabled={creatingSlot}
                    className="min-w-0 flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleCreateAndClaim(spaceId, invite, allMembers)}
                    disabled={!newSlotName.trim() || creatingSlot}
                  >
                    {creatingSlot ? '…' : 'Join'}
                  </Button>
                </div>
              </div>

              {/* Skip entirely — user can claim later from Parameters tab */}
              <button
                type="button"
                className="text-center w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => handleSkipClaim(spaceId, invite)}
              >
                Skip for now
              </button>
            </div>
          </div>
        )
      }

      case 'claiming': {
        return (
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Linking your account…</p>
          </div>
        )
      }

      case 'accepted': {
        const { invite, spaceId } = pageState
        const isSpaceInvite = invite.type === 'travel_member'
        return (
          <Card className="text-center">
            <CardHeader className="gap-4">
              <InviteAvatar uid={invite.fromUid} name={invite.fromDisplayName} />
              <CardTitle>
                {isSpaceInvite ? `You've joined ${invite.travelName}!` : "You're now friends!"}
              </CardTitle>
              <CardDescription>
                {isSpaceInvite
                  ? `You are now a member of "${invite.travelName}" and connected with ${invite.fromDisplayName}.`
                  : `You and ${invite.fromDisplayName} are now connected. You can invite each other to shared spaces.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                onClick={() =>
                  navigate(isSpaceInvite && spaceId
                    ? `/spaces/${spaceId}`
                    : '/spaces')
                }
              >
                {isSpaceInvite ? `Open ${invite.travelName}` : 'Go to my spaces'}
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
          onClick={() => navigate('/spaces')}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          All spaces
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
        <Button variant="outline" onClick={() => navigate('/spaces')}>Go to my spaces</Button>
      </CardContent>
    </Card>
  )
}
