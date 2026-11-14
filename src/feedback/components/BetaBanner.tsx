// BetaBanner.tsx — persistent beta feedback banner shown on all pages.
//
// Shown in the current UI language. Clicking it opens a Dialog containing the FeedbackForm.
// Designed to be placed at the top of the app layout, below the header.

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FeedbackForm } from '@/feedback/components/FeedbackForm'
import { MessageSquarePlus } from 'lucide-react'
import { useT } from '@/i18n'

export function BetaBanner() {
  // translation hook — re-renders when the language changes
  const t = useT()
  // Controls the feedback dialog visibility
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Banner — tapping anywhere opens the feedback dialog */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 bg-amber-100 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
      >
        <MessageSquarePlus className="h-3.5 w-3.5 shrink-0" />
        {/* One language only (used to show EN · FR side by side) */}
        <span>{t.social.feedback.betaBanner()}</span>
      </button>

      {/* Feedback dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.social.feedback.dialogTitle}</DialogTitle>
          </DialogHeader>
          <FeedbackForm source="BetaBanner" onSuccess={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}
