// SpacesPage.tsx — lists all spaces for the current user.
// Active spaces are shown first, followed by a collapsible "Archived" section.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { isIos, isStandalone } from '@/notifications/services/pushService'
import { requestPushPrompt } from '@/notifications/store/usePushPromptStore'
import { usePendingInvites } from '@/friends/hooks/usePendingInvites'

// Simple hash-based hue — same function as ProfilePage, kept local to avoid
// a shared utility file for now. Same UID always gives the same colour.
function avatarHue(uid: string): number {
  let hash = 0
  for (const ch of uid) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff
  return Math.abs(hash) % 360
}
import { useSpaces } from '@/spaces/hooks/useSpaces'
import type { Space } from '@/spaces/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Archive } from 'lucide-react'

// Reusable space card grid — renders a list of spaces as clickable cards.
function SpaceCardGrid({
  spaces,
  onSpaceClick,
  dimmed,
}: {
  spaces: Space[]
  onSpaceClick: (spaceId: string) => void
  dimmed?: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {spaces.map((space) => {
        const emoji = space.emoji || '🌍'
        return (
          <button
            key={space.spaceId}
            type="button"
            onClick={() => onSpaceClick(space.spaceId)}
            className={`text-left cursor-pointer group ${dimmed ? 'opacity-60' : ''}`}
            style={{ perspective: '800px' }}
          >
            <Card
              className="h-full transition-all duration-200 ease-out
                group-hover:shadow-xl
                group-hover:-translate-y-1
                group-hover:scale-[1.03]
                group-hover:[transform:translateY(-4px)_scale(1.03)_rotateX(2deg)]"
            >
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-xl">
                  <span>{emoji}</span>
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-base">{space.name}</CardTitle>
                </div>
              </CardHeader>
              {space.description && (
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {space.description}
                  </p>
                </CardContent>
              )}
            </Card>
          </button>
        )
      })}
    </div>
  )
}

export function SpacesPage() {
  const { currentUser, userProfile } = useAuthStore()
  const userId = currentUser?.uid

  // React Router helper that lets us imperatively change the current URL
  // in response to a click (e.g. when a space card is clicked).
  const navigate = useNavigate()

  // Whether the archived section is expanded
  const [showArchived, setShowArchived] = useState<boolean>(false)

  // Subscribe to the current user's spaces via the custom hook.
  const { activeSpaces, archivedSpaces, isLoading, error } = useSpaces(userId)

  // Notifications banner, moment (e2): first launch of the INSTALLED app on
  // iOS, when the user already shares a space. In a Safari tab they could not
  // enable push at all, so this is their first real chance (NOTIFICATIONS_SPEC §9.4).
  // useEffect re-runs when the list loads; the banner store itself guarantees
  // the banner appears at most once per device.
  const sharesASpace = activeSpaces.some((s) => s.memberUids.length > 1)
  useEffect(() => {
    if (sharesASpace && isIos() && isStandalone()) requestPushPrompt('e2')
  }, [sharesASpace])

  const handleOpenCreateSpace = () => {
    navigate('/spaces/new')
  }

  // When the user clicks a space card, we navigate to `/spaces/:spaceId`,
  // which is wired in App.tsx to render the SpaceDetailPage.
  const handleSpaceClick = (spaceId: string) => {
    navigate(`/spaces/${spaceId}`)
  }

  const hue = currentUser ? avatarHue(currentUser.uid) : 0
  const initials = (userProfile?.displayName || currentUser?.email || '?').charAt(0).toUpperCase()
  // Badge count for the avatar button — driven by a real-time snapshot on invites
  const { count: pendingCount } = usePendingInvites(currentUser?.uid)

  const hasNoSpaces = activeSpaces.length === 0 && archivedSpaces.length === 0

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar with title and actions */}
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">Your spaces</h1>
          <p className="text-sm text-muted-foreground">
            Select a trip to view and manage its expenses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleOpenCreateSpace}>
            New space
          </Button>
          {/* Profile avatar button — navigates to /profile.
              The red badge shows the count of pending friend requests. */}
          <button
            type="button"
            onClick={() => navigate('/profile')}
            title="Profile"
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm transition hover:opacity-90"
            style={{ backgroundColor: `hsl(${hue}, 55%, 50%)` }}
          >
            {initials}
            {pendingCount > 0 && (
              // Badge: absolute-positioned red dot in the top-right corner
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-4">
        {isLoading ? (
          // Loading state while the Firestore subscription is fetching data.
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading your spaces...</p>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-base font-medium">Unable to load your spaces.</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {error}
            </p>
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        ) : hasNoSpaces ? (
          // Empty state when the user has no spaces yet.
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="text-base font-medium">No spaces yet.</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Create your first trip to start tracking shared expenses with your space companions.
            </p>
            <Button type="button" onClick={handleOpenCreateSpace}>
              🚀 Create your first trip
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active spaces */}
            {activeSpaces.length > 0 ? (
              <SpaceCardGrid spaces={activeSpaces} onSpaceClick={handleSpaceClick} />
            ) : (
              <p className="text-sm text-muted-foreground">
                All your spaces are archived.
              </p>
            )}

            {/* Archived spaces — directory-style card that expands to show archived spaces */}
            {archivedSpaces.length > 0 && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setShowArchived(!showArchived)}
                  className="text-left cursor-pointer group"
                  style={{ perspective: '800px' }}
                >
                  <Card className="h-full opacity-70 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:shadow-lg">
                    <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Archive className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <CardTitle className="text-base">Archived ({archivedSpaces.length})</CardTitle>
                      </div>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {showArchived ? '▲' : '▼'}
                      </span>
                    </CardHeader>
                  </Card>
                </button>
              </div>
            )}
            {showArchived && archivedSpaces.length > 0 && (
              <SpaceCardGrid
                spaces={archivedSpaces}
                onSpaceClick={handleSpaceClick}
                dimmed
              />
            )}
          </div>
        )}
      </main>
    </div>
  )
}
