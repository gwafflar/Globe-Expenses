// TravelsPage.tsx — lists all travels for the current user.
// This component focuses on layout and rendering and delegates Firestore
// logic to the `useTravels` hook.

import { useMemo, useState } from 'react'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { useTravels } from '@/travels/hooks/useTravels'
import type { Travel } from '@/travels/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CreateTravelModal } from '@/travels/components/CreateTravelModal'

// Simple date formatting helper — converts a Firestore Timestamp to a
// human-readable string like "12 Mar 2026".
function formatDate(date: Travel['startDate']): string {
  if (!date) return ''
  const jsDate = date.toDate()
  return jsDate.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function TravelsPage() {
  const { currentUser, signOut } = useAuthStore()
  const userId = currentUser?.uid

  // Local UI state controlling whether the "Create travel" modal is open.
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false)

  // Subscribe to the current user's travels via the custom hook.
  const { travels, isLoading } = useTravels(userId)

  // Precompute a presentation-friendly version of each travel card.
  const travelCards = useMemo(
    () =>
      travels.map((travel) => {
        const emoji = travel.emoji || '🌍'
        const start = formatDate(travel.startDate)
        const end = formatDate(travel.endDate)

        let dateLabel = ''
        if (start && end) {
          dateLabel = `${start} – ${end}`
        } else if (start) {
          dateLabel = start
        }

        return { ...travel, emoji, dateLabel }
      }),
    [travels],
  )

  const handleOpenCreateTravel = () => {
    setIsCreateModalOpen(true)
  }

  const handleSignOutClick = async () => {
    await signOut()
  }

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
          <Button
            type="button"
            className="text-xs"
            variant="outline"
            onClick={handleSignOutClick}
          >
            Sign out
          </Button>
          <Button type="button" onClick={handleOpenCreateTravel}>
            New travel
          </Button>
        </div>
      </header>

      <main className="flex-1 px-4 py-4">
        {isLoading ? (
          // Loading state while the Firestore subscription is fetching data.
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading your travels…</p>
          </div>
        ) : travelCards.length === 0 ? (
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
          // List of travel cards.
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {travelCards.map((travel) => (
              <Card key={travel.travelId} className="hover:bg-accent/30 transition-colors">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-xl">
                    <span>{travel.emoji}</span>
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-base">{travel.name}</CardTitle>
                    {travel.dateLabel && (
                      <CardDescription>{travel.dateLabel}</CardDescription>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {travel.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {travel.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
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

