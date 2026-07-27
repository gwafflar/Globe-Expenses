// CreateSpaceModal.tsx — modal dialog for creating a new space.
// Focuses on UI and uses the spaceService for Firestore writes.

import { useState, type FormEvent, type MouseEvent } from 'react'
import { createSpace } from '@/spaces/services/spaceService'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ALL_CURRENCIES } from '@/shared/data/pickerData'

interface CreateSpaceModalProps {
  isOpen: boolean
  onClose: () => void
  uid: string
  displayName: string
  // The user's preferred currency — pre-fills the main currency picker.
  defaultMainCurrency: string
  // Called with the new space's Firestore doc ID after successful creation.
  onCreated?: (spaceId: string) => void
}

export function CreateSpaceModal({
  isOpen,
  onClose,
  uid,
  displayName,
  defaultMainCurrency,
  onCreated,
}: CreateSpaceModalProps) {
  const [name, setName] = useState<string>('')
  const [emoji, setEmoji] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  // Main currency for the space — locked after creation (editable in v2).
  const [mainCurrency, setMainCurrency] = useState<string>(defaultMainCurrency)
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
      const newSpaceId = await createSpace({
        uid,
        displayName,
        name,
        emoji,
        description,
        mainCurrency,
      })

      onClose()

      // Navigate to the newly created space page
      if (onCreated) onCreated(newSpaceId)

      // Reset fields after closing so the next open starts clean.
      setName('')
      setEmoji('')
      setDescription('')
      setMainCurrency(defaultMainCurrency)
    } catch (error) {
      // Log the raw error to the console so we can see the underlying
      // Firebase / network error details during development.
      // eslint-disable-next-line no-console
      console.error('Error creating space:', error)
      setErrorMessage('Unable to create space. Please try again.')
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
          <CardTitle>New space</CardTitle>
          <CardDescription>
            Create a new trip to track shared expenses with your companions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="space-name">Name</Label>
              <Input
                id="space-name"
                type="text"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="space-emoji">Emoji (optional)</Label>
              <Input
                id="space-emoji"
                type="text"
                maxLength={2}
                value={emoji}
                onChange={(event) => setEmoji(event.target.value)}
              />
            </div>

            {/* Main currency — the reference currency for all exchange rate conversions.
                Locked after creation (editable + batch recompute is v2). */}
            <div className="space-y-2">
              <Label htmlFor="space-currency">Main currency</Label>
              <select
                id="space-currency"
                value={mainCurrency}
                onChange={(e) => setMainCurrency(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {ALL_CURRENCIES.map(([code, symbol, name]) => (
                  <option key={code} value={code}>{code} ({symbol}) — {name}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                All amounts will be converted to this currency. ⚠️ This choice is definitive and{" "}
                <span className="text-red-500">
                  cannot be changed after creation.
                </span>{" "}
                Might be editable in a future v2.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="space-description">Description (optional)</Label>
              <textarea
                id="space-description"
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
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
                {isSubmitting ? 'Creating…' : 'Create space'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

