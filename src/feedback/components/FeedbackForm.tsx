// FeedbackForm.tsx — reusable feedback form with text input, optional image, and send animation.
//
// Used in three places: ProfilePage, ParametersTab, WelcomePage.
// Also rendered inside a Dialog triggered by the BetaBanner on all pages.
//
// Props:
//   source — identifies where the form is rendered (for analytics in Firestore)

import { useState } from 'react'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { submitFeedback } from '@/feedback/services/feedbackService'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, CheckCircle2, Loader2, ChevronDown } from 'lucide-react'
import { useT } from '@/i18n'

interface FeedbackFormProps {
  source: string
  /** Called after successful submission (e.g. to close a dialog) */
  onSuccess?: () => void
}

export function FeedbackForm({ source, onSuccess }: FeedbackFormProps) {
  // translation hook — re-renders when the language changes
  const t = useT()
  const f = t.social.feedback // shorthand
  const { currentUser, userProfile } = useAuthStore()

  const [text, setText] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  // Toggle for the collapsible "Contact developer" card
  const [contactOpen, setContactOpen] = useState(false)

  // Image state — disabled until Firebase Storage is configured
  // const [image, setImage] = useState<File | null>(null)
  // const [imagePreview, setImagePreview] = useState<string | null>(null)
  // const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Submit ───────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!text.trim()) return

    setStatus('sending')
    setErrorMsg('')

    try {
      await submitFeedback(
        currentUser?.uid ?? null,
        userProfile?.displayName ?? currentUser?.displayName ?? null,
        { text: text.trim(), source },
      )
      setStatus('sent')
      setText('')
      // Auto-reset after 3 seconds so the form is usable again
      setTimeout(() => {
        setStatus('idle')
        onSuccess?.()
      }, 3000)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : f.sendFailed)
    }
  }

  // ── Success state ────────────────────────────────────────────────────
  if (status === 'sent') {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center animate-in fade-in zoom-in-95 duration-300">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
        {/* One language only (this used to show the English and French text together) */}
        <p className="font-medium text-green-700 dark:text-green-400">
          {f.thanks}
        </p>
      </div>
    )
  }

  // ── Form ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      {/* Label — current language only */}
      <p className="text-sm text-muted-foreground">
        {f.intro}
      </p>

      {/* Text area */}
      <Textarea
        placeholder={f.placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="resize-none"
        disabled={status === 'sending'}
      />

      {/* Image preview — disabled until Firebase Storage is configured
      {imagePreview && (
        <div className="relative inline-block w-fit">
          <img
            src={imagePreview}
            alt="Attached"
            className="h-24 rounded-md border object-cover"
          />
          <button
            type="button"
            onClick={removeImage}
            className="absolute -right-2 -top-2 rounded-full bg-destructive p-0.5 text-white shadow-sm"
            aria-label="Remove image"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )} */}

      {/* Error message */}
      {errorMsg && (
        <p className="text-xs text-destructive">{errorMsg}</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {/* Image upload — disabled until Firebase Storage is configured
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={status === 'sending' || !!image}
        >
          <ImagePlus className="mr-1.5 h-4 w-4" />
          Add image
        </Button>
        */}

        {/* Send button */}
        <Button
          size="sm"
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || status === 'sending'}
          className="ml-auto"
        >
          {status === 'sending' ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              {f.sending}
            </>
          ) : (
            <>
              <Send className="mr-1.5 h-4 w-4" />
              {f.send}
            </>
          )}
        </Button>
      </div>

      {/* Collapsible "Contact developer" card — collapsed by default */}
      <div className="rounded-lg border bg-muted/30">
        <button
          type="button"
          onClick={() => setContactOpen(!contactOpen)}
          className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
        >
          {f.contactDeveloper}
          <ChevronDown className={`h-4 w-4 transition-transform ${contactOpen ? 'rotate-180' : ''}`} />
        </button>

        {contactOpen && (
          <div className="flex flex-col gap-2.5 border-t px-3 py-3 text-sm">
            <p className="font-medium">Guillaume Wafflard</p>

            <a
              href="https://discord.com/users/g10m"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-primary hover:underline"
            >
              {/* Discord logo SVG */}
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.001.028.016.053.036.073a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              Discord: @g10m
            </a>

            <a
              href="https://github.com/gwafflar/globe-expenses"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-primary hover:underline"
            >
              {/* GitHub logo SVG */}
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              GitHub: globe-expenses 
            </a>
            {/* The author link is passed into the sentence (word order differs per language) */}
            <p>
              {f.madeBy({
                author: (
                  <a href="https://github.com/gwafflar" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">@gwafflar</a>
                ),
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
