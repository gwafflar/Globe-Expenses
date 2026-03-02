// CreateTravelModal.tsx — modal dialog for creating a new travel.
// Focuses on UI and uses the travelService for Firestore writes.

import { useState, type FormEvent, type MouseEvent } from 'react'
import { createTravel } from '@/travels/services/travelService'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface CreateTravelModalProps {
  isOpen: boolean
  onClose: () => void
  uid: string
  displayName: string
}

export function CreateTravelModal({
  isOpen,
  onClose,
  uid,
  displayName,
}: CreateTravelModalProps) {
  const [name, setName] = useState<string>('')
  const [emoji, setEmoji] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!isOpen) {
    return null
  }

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    // Close the modal when clicking on the backdrop, but ignore clicks that
    // originate inside the dialog itself.
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    try {
      await createTravel({
        uid,
        displayName,
        name,
        emoji,
        description,
        startDate,
        endDate,
      })

      // We do NOT manually refresh the travels list here.
      // The `useTravels` hook uses Firestore's onSnapshot listener, which will
      // automatically emit the new travel once this write succeeds.

      onClose()

      // Reset fields after closing so the next open starts clean.
      setName('')
      setEmoji('')
      setDescription('')
      setStartDate('')
      setEndDate('')
    } catch (error) {
      // Log the raw error to the console so we can see the underlying
      // Firebase / network error details during development.
      // eslint-disable-next-line no-console
      console.error('Error creating travel:', error)
      setErrorMessage('Unable to create travel. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    // Backdrop overlay covering the whole viewport.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={handleBackdropClick}
    >
      {/* Centered card acting as the modal dialog */}
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>New travel</CardTitle>
          <CardDescription>
            Create a new trip to track shared expenses with your companions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="travel-name">Name</Label>
              <Input
                id="travel-name"
                type="text"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="travel-emoji">Emoji (optional)</Label>
              <Input
                id="travel-emoji"
                type="text"
                maxLength={2}
                value={emoji}
                onChange={(event) => setEmoji(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="travel-description">Description (optional)</Label>
              <textarea
                id="travel-description"
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="travel-start">Start date (optional)</Label>
                <Input
                  id="travel-start"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="travel-end">End date (optional)</Label>
                <Input
                  id="travel-end"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </div>
            </div>

            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating…' : 'Create travel'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

