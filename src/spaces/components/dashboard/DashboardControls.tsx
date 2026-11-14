// DashboardControls.tsx — the dashboard's single control row (Phase 7a, §2).
//
// Two controls, both global: they scope EVERY card at once. Before this phase
// each card carried its own period / member scoping, so two cards could quietly
// be showing different windows. That is the inconsistency this removes.
//
// Neither selection is persisted. A stored range goes stale the moment the
// calendar moves on, and a stale dashboard is worse than none — so both reset
// to their defaults on every visit.

import { useState } from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import {
  RANGE_PRESETS,
  rangePresetLabel,
  resolveRange,
  type DateRange,
  type RangePresetId,
} from '@/shared/utils/dateRange'
import { ALL_MEMBERS, type ScopeMode } from '@/spaces/utils/dashboardScope'
import type { SpaceMember } from '@/spaces/types'
import { useLocale, useT } from '@/i18n'

interface DashboardControlsProps {
  range: DateRange
  onRangeChange: (range: DateRange) => void
  /** ALL_MEMBERS or a travelMemberId — never 'you'. This component resolves
   *  the "You" row to the current user's member id before calling back, so the
   *  scoping pipeline never has to know who is logged in. */
  mode: ScopeMode
  onModeChange: (mode: ScopeMode) => void
  members: SpaceMember[]
  /** The current user's travelMemberId, or '' when they hold no member slot
   *  (they can still read the space). Backs the pinned "You" row. */
  currentMemberId: string
  /** In a one-member space every selection is identical, so the picker is
   *  hidden entirely rather than shown with a single option. */
  isSolo: boolean
}

/** A small pill button — the same shape used across the dashboard. */
function Pill({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  )
}

export function DashboardControls({
  range,
  onRangeChange,
  mode,
  onModeChange,
  members,
  currentMemberId,
  isSolo,
}: DashboardControlsProps) {
  // translation hook — re-renders when the language changes
  const t = useT()
  // Intl locale tag ('en-US', 'fr-FR'…) for the short dates on the Custom pill.
  const locale = useLocale()

  // Raw "YYYY-MM-DD" strings from the two native date inputs, held separately
  // from `range` so the user can edit both ends before pressing Apply.
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [customOpen, setCustomOpen] = useState(false)

  // The member picker is a bottom sheet: a space can have many members, and a
  // segmented control would not survive 375px past three of them.
  const [memberSheetOpen, setMemberSheetOpen] = useState(false)

  const selectedMember = members.find((m) => m.travelMemberId === mode) ?? null
  const isYou = selectedMember !== null && selectedMember.travelMemberId === currentMemberId

  // Button label: "All" / "You" / the member's name.
  const modeLabel = selectedMember === null
    ? t.dashboard.controls.allPill
    : isYou
      ? t.dashboard.controls.youPill
      : selectedMember.displayName

  /** The other members, in the space's own member order. The current user is
   *  excluded because they are already pinned as "You". */
  const otherMembers = members.filter((m) => m.travelMemberId !== currentMemberId)

  function select(next: ScopeMode) {
    onModeChange(next)
    setMemberSheetOpen(false)
  }

  function selectPreset(preset: RangePresetId) {
    onRangeChange(resolveRange(preset))
    setCustomOpen(false)
  }

  function applyCustom() {
    if (!customFrom || !customTo) return
    // <input type="date"> yields ISO "YYYY-MM-DD". new Date() on that string
    // parses it as UTC midnight, which can land on the previous day in negative
    // offsets — so the parts are split and fed to the local-time constructor.
    onRangeChange(resolveRange('custom', { from: parseIsoDate(customFrom), to: parseIsoDate(customTo) }))
    setCustomOpen(false)
  }

  // Label for the Custom pill: shows the chosen window once one is active.
  const customLabel =
    range.preset === 'custom' && range.from && range.to
      ? `${shortDate(range.from, locale)}–${shortDate(range.to, locale)}`
      : t.dashboard.range.custom

  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        {/* Date range — relative presets, never stored absolute dates */}
        <div className="flex flex-wrap gap-1.5">
          {RANGE_PRESETS.map((preset) => (
            <Pill
              key={preset.id}
              label={rangePresetLabel(preset.id, t.dashboard)}
              active={range.preset === preset.id}
              onClick={() => selectPreset(preset.id)}
            />
          ))}
          <Pill
            label={customLabel}
            active={range.preset === 'custom' || customOpen}
            onClick={() => setCustomOpen((prev) => !prev)}
          />
        </div>

        {/* Member scope picker — hidden entirely in a one-member space */}
        {!isSolo && (
          <button
            type="button"
            aria-label={t.dashboard.controls.whoseSpending}
            onClick={() => setMemberSheetOpen(true)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              selectedMember !== null
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="max-w-[6rem] truncate">{modeLabel}</span>
          </button>
        )}
      </div>

      {/* Custom range panel */}
      {customOpen && (
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t pt-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t.dashboard.controls.from}
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded border px-2 py-1 text-xs text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t.dashboard.controls.to}
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded border px-2 py-1 text-xs text-foreground"
            />
          </label>
          <button
            type="button"
            disabled={!customFrom || !customTo}
            onClick={applyCustom}
            className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            {t.dashboard.controls.apply}
          </button>
        </div>
      )}

      {/* Member picker bottom sheet: All and You pinned, then the rest of the
          space in its own member order. Unclaimed members are listed too —
          they hold splits like anyone else. */}
      {!isSolo && (
        <Drawer open={memberSheetOpen} onOpenChange={setMemberSheetOpen} direction="bottom">
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{t.dashboard.controls.showSpendingFor}</DrawerTitle>
            </DrawerHeader>

            <div className="flex max-h-[60vh] flex-col overflow-y-auto px-4 pb-6">
              <MemberRow
                label={t.dashboard.controls.allMembers}
                emoji="👤"
                selected={mode === ALL_MEMBERS}
                onSelect={() => select(ALL_MEMBERS)}
              />

              {/* "You" resolves to a member id here — the pipeline never sees
                  the string 'you'. Absent when the user holds no member slot. */}
              {currentMemberId !== '' && (
                <MemberRow
                  label={t.dashboard.controls.you}
                  emoji="🙋"
                  selected={mode === currentMemberId}
                  onSelect={() => select(currentMemberId)}
                />
              )}

              {otherMembers.map((member) => (
                <MemberRow
                  key={member.travelMemberId}
                  label={member.displayName}
                  emoji={member.userId === null ? '👻' : '🧑'}
                  hint={member.userId === null ? t.dashboard.controls.unclaimed : undefined}
                  selected={mode === member.travelMemberId}
                  onSelect={() => select(member.travelMemberId)}
                />
              ))}
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  )
}

/** One row in the member picker sheet. */
function MemberRow({
  label,
  emoji,
  hint,
  selected,
  onSelect,
}: {
  label: string
  emoji: string
  hint?: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      // Accessible name is the plain label — the emoji is decoration.
      aria-label={label}
      aria-pressed={selected}
      className="flex items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-muted/50"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm">
        {emoji}
      </span>
      <span className="flex-1 truncate text-sm text-foreground">
        {label}
        {hint && <span className="ml-1 text-xs text-muted-foreground">({hint})</span>}
      </span>
      {selected && <span className="text-primary">✓</span>}
    </button>
  )
}

/** Parse an ISO "YYYY-MM-DD" string into a LOCAL midnight Date. */
function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "Mar 12" / "12 mars" — `locale` is the app's (useLocale()), not the browser's. */
function shortDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}
