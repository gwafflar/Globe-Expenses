// src/spaces/pages/SpaceCreatePage.tsx
//
// Full-screen space creation flow: preset picker → essentials (with a
// collapsed "Customize fields" accordion) → an optional post-creation screen
// for the `group` preset. Follows the full-screen-overlay precedent set by
// TransactionForm (Session 016) rather than a Drawer/Dialog, because the
// expandable FieldsEditor accordion is too much content for either.
// See docs/SPACE_REFACTOR_SPEC.md §7.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy, ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { createSpace } from '@/spaces/services/spaceService'
import { createShareableInvite } from '@/friends/services/friendService'
import { requestPushPrompt } from '@/notifications/store/usePushPromptStore'
import { PresetPicker } from '@/spaces/components/PresetPicker'
import { CollapsibleCard } from '@/spaces/components/CollapsibleCard'
import { FieldsEditor } from '@/spaces/components/FieldsEditor'
import { EmojiInput, CurrencyPicker } from '@/spaces/components/tabs/ParametersTab'
import { SmartCurrencySelect } from '@/shared/components/CurrencySelect'
import { PRESETS, configFromPreset } from '@/spaces/presets'
import type { PresetId, SpaceConfig } from '@/spaces/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Step = 'preset' | 'essentials' | 'created'

export function SpaceCreatePage() {
  const navigate = useNavigate()
  const { currentUser, userProfile } = useAuthStore()

  const [step, setStep] = useState<Step>('preset')
  const [presetId, setPresetId] = useState<PresetId>('travel')

  // Essentials fields — preserved across a "back → pick a different preset" round trip.
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [emojiEdited, setEmojiEdited] = useState(false)
  const [mainCurrency, setMainCurrency] = useState(userProfile?.mainCurrency ?? 'EUR')
  const [config, setConfig] = useState<SpaceConfig>(() => configFromPreset('travel'))

  // travel-only extras
  const [extraCurrencies, setExtraCurrencies] = useState<string[]>([])
  const [datesEnabled, setDatesEnabled] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Post-creation (group preset) state
  const [createdSpaceId, setCreatedSpaceId] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState(false)

  function handleBack() {
    if (step === 'essentials') setStep('preset')
    else if (step === 'preset') navigate('/spaces')
  }

  // Picking a preset (including re-picking after going back) always resets
  // the config to the new preset's template — that is the point of picking
  // it. name and mainCurrency survive; emoji resets only if untouched.
  function handlePickPreset(id: PresetId) {
    setPresetId(id)
    setConfig(configFromPreset(id))
    if (!emojiEdited) setEmoji(PRESETS[id].emoji)
    setStep('essentials')
  }

  // createSpace() is fire-and-forget (see spaceService.ts): it returns the
  // new doc's id synchronously, having generated it client-side via doc().
  // Not awaiting it is what lets this work offline — the write queues locally
  // and replays when connectivity returns, but the id (and navigation) don't
  // wait on that. No loading state needed since there's nothing to wait for.
  function handleCreate() {
    if (!currentUser || !name.trim()) return

    const currencies = presetId === 'travel'
      ? Array.from(new Set([mainCurrency, ...extraCurrencies]))
      : [mainCurrency]

    const spaceId = createSpace({
      uid: currentUser.uid,
      displayName: currentUser.displayName?.trim() || currentUser.email || 'Unknown',
      name: name.trim(),
      emoji: emoji || undefined,
      mainCurrency,
      currencies,
      startDate: presetId === 'travel' && datesEnabled && startDate ? startDate : undefined,
      endDate: presetId === 'travel' && datesEnabled && endDate ? endDate : undefined,
      presetId,
      config,
    })

    if (presetId === 'group') {
      setCreatedSpaceId(spaceId)
      setStep('created')
    } else {
      navigate(`/spaces/${spaceId}`)
    }
  }

  // createShareableInvite() is likewise fire-and-forget — the inviteId (and
  // therefore the URL) is available synchronously, so this never blocks on
  // the network. Only the clipboard write is genuinely async, and its
  // failure is harmless: the URL is still shown as text below.
  async function handleCopyInviteLink() {
    if (!userProfile || !createdSpaceId) return
    const inviteId = createShareableInvite(userProfile, 'travel_member', createdSpaceId, name.trim())
    const url = `${window.location.origin}/invite/${inviteId}`
    setInviteUrl(url)
    // Notifications banner, moment (d): shown only because the user chose to
    // invite people while creating the space (NOTIFICATIONS_SPEC §9.4).
    requestPushPrompt('d')
    try {
      await navigator.clipboard.writeText(url)
      setCopyFeedback(true)
    } catch {
      // Clipboard write can silently fail outside a user gesture on some mobile
      // browsers — the URL is still shown as text below, so nothing is lost.
    }
  }

  if (step === 'created' && createdSpaceId) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background px-6 py-10 text-center">
        <div className="text-5xl">{emoji || '👥'}</div>
        <div>
          <h1 className="text-lg font-bold">{name.trim()} is ready</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Invite people now, or open the space and do it later.
          </p>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-2">
          <Button type="button" onClick={handleCopyInviteLink} className="gap-2">
            {copyFeedback ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copyFeedback ? 'Link copied' : 'Copy invite link'}
          </Button>
          {inviteUrl && (
            <p className="break-all rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              {inviteUrl}
            </p>
          )}
          <Button type="button" variant="outline" onClick={() => navigate(`/spaces/${createdSpaceId}`)} className="gap-1.5">
            Open space
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Sticky top bar */}
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back"
          className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          ←
        </button>
        <h2 className="text-sm font-semibold">New space</h2>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {step === 'preset' && <PresetPicker onPick={handlePickPreset} />}

        {step === 'essentials' && (
          <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-5">
            <h1 className="text-xl font-bold">
              {PRESETS[presetId].emoji} {PRESETS[presetId].titleKey}
            </h1>

            {/* Name + emoji */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
              <div className="flex gap-2">
                <EmojiInput
                  value={emoji}
                  onChange={(v) => { setEmoji(v); setEmojiEdited(true) }}
                  ariaLabel="Space emoji"
                />
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={PRESETS[presetId].namePlaceholder}
                  className="min-w-0 flex-1"
                />
              </div>
            </div>

            {/* Main currency — searchable, full ALL_CURRENCIES list. Irreversible after creation. */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Main currency</label>
              <SmartCurrencySelect
                value={mainCurrency}
                onChange={setMainCurrency}
                spaceId=""
                orderedCurrencies={[]}
                onCurrencyAdded={() => {}}
              />
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-500">
                Everything is converted to this. It can&apos;t be changed afterwards.
              </p>
            </div>

            {/* Travel-only extras */}
            {presetId === 'travel' && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Other currencies <span className="text-muted-foreground/70">— optional</span>
                  </label>
                  <CurrencyPicker
                    selected={[mainCurrency, ...extraCurrencies]}
                    onChange={(codes) => setExtraCurrencies(codes.filter((c) => c !== mainCurrency))}
                    lockedCurrency={mainCurrency}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={datesEnabled}
                    onChange={(e) => setDatesEnabled(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Set trip dates <span className="text-muted-foreground">— optional</span>
                </label>
                {datesEnabled && (
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border bg-background px-2 py-1.5 text-sm"
                      style={{ colorScheme: 'light dark' }}
                    />
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border bg-background px-2 py-1.5 text-sm"
                      style={{ colorScheme: 'light dark' }}
                    />
                  </div>
                )}
              </>
            )}

            {/* Customize fields — mounts the exact FieldsEditor built in Phase 3.
                Nothing is written until Create; onConfigChange is plain local state. */}
            <CollapsibleCard
              title="Customize fields"
              summary="Set up now, or leave it and change it later"
              defaultOpen={presetId === 'custom'}
            >
              <FieldsEditor
                config={config}
                onConfigChange={setConfig}
                presetOrigin={presetId}
                showPresetSection={false}
              />
            </CollapsibleCard>

            <Button
              type="button"
              disabled={!name.trim()}
              onClick={handleCreate}
              className="mt-2 w-full py-6 text-sm font-semibold"
            >
              Create space
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
