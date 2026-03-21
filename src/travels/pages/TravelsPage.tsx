// TravelsPage.tsx — lists all travels for the current user.
// Active travels are shown first, followed by a collapsible "Archived" section.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { usePendingInvites } from '@/friends/hooks/usePendingInvites'

// Simple hash-based hue — same function as ProfilePage, kept local to avoid
// a shared utility file for now. Same UID always gives the same colour.
function avatarHue(uid: string): number {
  let hash = 0
  for (const ch of uid) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff
  return Math.abs(hash) % 360
}
import { useTravels } from '@/travels/hooks/useTravels'
import type { Travel } from '@/travels/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Archive } from 'lucide-react'
import { CreateTravelModal } from '@/travels/components/CreateTravelModal'

// Reusable travel card grid — renders a list of travels as clickable cards.
function TravelCardGrid({
  travels,
  onTravelClick,
  dimmed,
}: {
  travels: Travel[]
  onTravelClick: (travelId: string) => void
  dimmed?: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {travels.map((travel) => {
        const emoji = travel.emoji || '🌍'
        return (
          <button
            key={travel.travelId}
            type="button"
            onClick={() => onTravelClick(travel.travelId)}
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
                  <CardTitle className="text-base">{travel.name}</CardTitle>
                </div>
              </CardHeader>
              {travel.description && (
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {travel.description}
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

export function TravelsPage() {
  const { currentUser, userProfile } = useAuthStore()
  const userId = currentUser?.uid

  // React Router helper that lets us imperatively change the current URL
  // in response to a click (e.g. when a travel card is clicked).
  const navigate = useNavigate()

  // Local UI state controlling whether the "Create travel" modal is open.
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false)

  // Whether the archived section is expanded
  const [showArchived, setShowArchived] = useState<boolean>(false)

  // Subscribe to the current user's travels via the custom hook.
  const { activeTravels, archivedTravels, isLoading, error } = useTravels(userId)

  const handleOpenCreateTravel = () => {
    setIsCreateModalOpen(true)
  }

  // When the user clicks a travel card, we navigate to `/travels/:travelId`,
  // which is wired in App.tsx to render the TravelDetailPage.
  const handleTravelClick = (travelId: string) => {
    navigate(`/travels/${travelId}`)
  }

  const hue = currentUser ? avatarHue(currentUser.uid) : 0
  const initials = (userProfile?.displayName || currentUser?.email || '?').charAt(0).toUpperCase()
  // Badge count for the avatar button — driven by a real-time snapshot on invites
  const { count: pendingCount } = usePendingInvites(currentUser?.uid)

  const hasNoTravels = activeTravels.length === 0 && archivedTravels.length === 0

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar with title and actions */}
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">Your travels</h1>
          <p className="text-sm text-muted-foreground">
            Select a trip to view and manage its expenses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleOpenCreateTravel}>
            New travel
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
            <p className="text-sm text-muted-foreground">Loading your travels...</p>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-base font-medium">Unable to load your travels.</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {error}
            </p>
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        ) : hasNoTravels ? (
          // Empty state when the user has no travels yet.
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="text-base font-medium">No travels yet.</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Create your first trip to start tracking shared expenses with your travel companions.
            </p>
            <Button type="button" onClick={handleOpenCreateTravel}>
              Create your first trip
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active travels */}
            {activeTravels.length > 0 ? (
              <TravelCardGrid travels={activeTravels} onTravelClick={handleTravelClick} />
            ) : (
              <p className="text-sm text-muted-foreground">
                All your travels are archived.
              </p>
            )}

            {/* Archived travels — directory-style card that expands to show archived travels */}
            {archivedTravels.length > 0 && (
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
                        <CardTitle className="text-base">Archived ({archivedTravels.length})</CardTitle>
                      </div>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {showArchived ? '▲' : '▼'}
                      </span>
                    </CardHeader>
                  </Card>
                </button>
              </div>
            )}
            {showArchived && archivedTravels.length > 0 && (
              <TravelCardGrid
                travels={archivedTravels}
                onTravelClick={handleTravelClick}
                dimmed
              />
            )}
          </div>
        )}
      </main>

      {/* Create Travel modal, rendered at the end so it can overlay the page.
          We pass the current user's uid and a displayName fallback.
       */}
      {userId && (
        <CreateTravelModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          uid={userId}
          onCreated={(travelId) => navigate(`/travels/${travelId}`)}
          displayName={
            currentUser?.displayName && currentUser.displayName.trim() !== ''
              ? currentUser.displayName
              : currentUser?.email ?? 'Unknown'
          }
        />
      )}
    </div>
  )
}
