/**
 * SplitEditor.tsx
 *
 * Controlled component for editing how a transaction amount is split among
 * space members. Used for both "Paid by" and "Split between" fields inside
 * a shadcn Drawer (bottom sheet).
 *
 * --- Equal / Custom mode state machine ---
 *
 * EQUAL mode (default):
 *   - Amounts are DERIVED from totalAmount ÷ selectedIds.length, to 3 decimal
 *     places internally. The UI displays 2dp; the validity check rounds at 2dp
 *     so tiny floating-point drift (e.g. 33.333 × 3 = 99.999 → rounds to 100)
 *     never causes a false "invalid" state.
 *   - User can remove members (recalculates equally among remaining).
 *   - User can add back previously removed members via an "Add member" list,
 *     shown in BOTH modes for any member not currently selected.
 *   - At least one member must remain (remove button hidden when only 1 left).
 *
 * CUSTOM mode:
 *   - Each member has an independently editable numeric input.
 *   - A "Remaining" counter shows (totalAmount − sum), coloured red when non-zero.
 *   - When totalAmount changes externally: amounts are FROZEN and a warning banner
 *     is shown. The warning clears as soon as the user edits any input.
 *   - User can add/remove members freely.
 *   - Absorb chip: per-row button showing the remaining delta. Always visible;
 *     greyed and disabled when already balanced. Tapping absorbs the full
 *     remaining delta into that member's amount.
 *
 * TRANSITIONS:
 *   Equal → Custom : custom inputs pre-populated from current equal amounts (3dp).
 *   Custom → Equal : resets to a fresh equal split (no confirm needed per spec).
 *
 * ROUNDING MODEL:
 *   Amounts stored at 3dp (round(x, 3)). UI displays 2dp (toFixed(2)).
 *   Validity: Math.abs(round(sum, 2) - round(total, 2)) < 0.01
 *   Example: 100 / 3 = 33.333 each. round(33.333 × 3, 2) = round(99.999, 2) = 100 ✓
 *   No "last member absorbs remainder" hack needed.
 *
 * Parent receives mode changes via onModeChange so SplitSummaryRow stays in sync.
 */

import { useEffect, useRef, useState } from 'react'
import type { SpaceMember } from '@/spaces/types'
import type { Split } from '@/transactions/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round(x: number, dp: number): number {
  const f = Math.pow(10, dp)
  return Math.round(x * f) / f
}

/**
 * Equal split to 3dp — no remainder redistribution.
 * Validity check at 2dp absorbs the tiny drift.
 */
function splitEqually(total: number, ids: string[]): Split[] {
  if (ids.length === 0) return []
  const amount = round(total / ids.length, 3)
  // ids are travelMemberIds — store them as the stable key in Split
  return ids.map((travelMemberId) => ({ travelMemberId, amount }))
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SplitEditorProps {
  members: SpaceMember[]
  totalAmount: number
  value: Split[]
  onChange: (splits: Split[]) => void
  /** Controlled mode — lifted to parent so it persists across drawer open/close */
  mode: 'equal' | 'custom'
  onModeChange: (mode: 'equal' | 'custom') => void
  label: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SplitEditor({
  members,
  totalAmount,
  value,
  onChange,
  mode,
  onModeChange,
  label,
}: SplitEditorProps) {
  // mode is controlled by the parent — no local useState needed.
  // This means the selected tab (Equal/Custom) persists across drawer open/close.

  // selectedIds holds the travelMemberIds of currently selected members.
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    value.length > 0
      ? value.map((s) => s.travelMemberId)
      : members.map((m) => m.travelMemberId),
  )

  // customInputs: keyed by travelMemberId — stores the raw string the user typed
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({})
  const [totalChangedWarning, setTotalChangedWarning] = useState(false)
  const prevTotalRef = useRef(totalAmount)

  // Equal mode: recompute on totalAmount or selectedIds change
  useEffect(() => {
    if (mode !== 'equal') return
    onChange(splitEqually(totalAmount, selectedIds))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, totalAmount, selectedIds])

  // Custom mode: detect external totalAmount change → freeze + warn
  useEffect(() => {
    if (mode !== 'custom') return
    if (prevTotalRef.current !== totalAmount) {
      setTotalChangedWarning(true)
      prevTotalRef.current = totalAmount
    }
  }, [mode, totalAmount])

  useEffect(() => {
    if (mode === 'equal') prevTotalRef.current = totalAmount
  }, [mode, totalAmount])

  // -------------------------------------------------------------------------
  // Mode toggle
  // -------------------------------------------------------------------------

  function handleSwitchToCustom() {
    // Pre-populate custom inputs from the current equal amounts
    const inputs: Record<string, string> = {}
    value.forEach((s) => { inputs[s.travelMemberId] = s.amount.toFixed(2) })
    setCustomInputs(inputs)
    prevTotalRef.current = totalAmount
    setTotalChangedWarning(false)
    onModeChange('custom')
  }

  function handleSwitchToEqual() {
    setTotalChangedWarning(false)
    onModeChange('equal')
  }

  // -------------------------------------------------------------------------
  // Member add / remove
  // -------------------------------------------------------------------------

  function handleRemoveMember(id: string) {
    if (selectedIds.length <= 1) return
    const next = selectedIds.filter((u) => u !== id)
    setSelectedIds(next)
    if (mode === 'custom') {
      const nextInputs = { ...customInputs }
      delete nextInputs[id]
      setCustomInputs(nextInputs)
      emitCustom(nextInputs, next)
    }
  }

  function handleAddMember(id: string) {
    if (selectedIds.includes(id)) return
    const next = [...selectedIds, id]
    setSelectedIds(next)
    if (mode === 'custom') {
      const nextInputs = { ...customInputs, [id]: '0.00' }
      setCustomInputs(nextInputs)
      emitCustom(nextInputs, next)
    }
    // equal mode: useEffect recomputes automatically
  }

  // -------------------------------------------------------------------------
  // Custom amount editing
  // -------------------------------------------------------------------------

  function handleCustomChange(id: string, raw: string) {
    // Round to 2dp on every keystroke so stored amounts are always 2dp in custom mode.
    // We still store the raw string in customInputs so the input field stays responsive
    // while typing (e.g. "3." doesn't snap to "3.00" mid-entry). The rounding happens
    // in emitCustom when we convert to numbers for the Split[].
    const nextInputs = { ...customInputs, [id]: raw }
    setCustomInputs(nextInputs)
    emitCustom(nextInputs, selectedIds)
    setTotalChangedWarning(false)
  }

  function emitCustom(inputs: Record<string, string>, ids: string[]) {
    // Custom mode amounts are rounded to 2dp (user enters money amounts, not sub-cent)
    onChange(ids.map((travelMemberId) => ({
      travelMemberId,
      amount: round(parseFloat(inputs[travelMemberId] ?? '0') || 0, 2),
    })))
  }

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------

  const currentSum = value.reduce((acc, s) => acc + s.amount, 0)
  const remaining = round(totalAmount - currentSum, 3)
  const isValid = Math.abs(round(currentSum, 2) - round(totalAmount, 2)) < 0.01
  // Members not currently selected (available to add back)
  const unselectedMembers = members.filter((m) => !selectedIds.includes(m.travelMemberId))

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4 px-4 pb-2 pt-2">

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {!isValid && (
          <span className="text-xs font-medium text-destructive">
            {remaining > 0
              ? `${round(remaining, 2).toFixed(2)} unassigned`
              : `${round(Math.abs(remaining), 2).toFixed(2)} over total`}
          </span>
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {(['equal', 'custom'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={m === 'equal' ? handleSwitchToEqual : handleSwitchToCustom}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium capitalize transition-colors ${
              mode === m
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Warning banner */}
      {totalChangedWarning && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Total changed. Please review and adjust amounts manually.
        </div>
      )}

      {/* Member rows — keyed and identified by travelMemberId */}
      <div className="flex flex-col gap-2">
        {selectedIds.map((id) => {
          // Resolve display name from members array via travelMemberId
          const member = members.find((m) => m.travelMemberId === id)
          const displayName = member?.displayName ?? id
          const amount = value.find((s) => s.travelMemberId === id)?.amount ?? 0

          return (
            <div
              key={id}
              className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2.5"
            >
              {/* Avatar + name */}
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <span className="truncate text-sm font-medium">{displayName}</span>
              </div>

              {/* Right: amount + absorb chip (custom only) + remove */}
              <div className="flex shrink-0 items-center gap-1.5">
                {mode === 'equal' ? (
                  <span className="tabular-nums text-sm font-semibold">
                    {amount.toFixed(2)}
                  </span>
                ) : (
                  <>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={customInputs[id] ?? amount.toFixed(2)}
                      onChange={(e) => handleCustomChange(id, e.target.value)}
                      className="w-20 rounded-md border bg-background px-2 py-1 text-right tabular-nums text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {/* Absorb chip: always visible, greyed when balanced */}
                    <button
                      type="button"
                      disabled={isValid}
                      onClick={() => {
                        const newAmount = round(amount + remaining, 2)
                        const nextInputs = { ...customInputs, [id]: newAmount.toFixed(2) }
                        setCustomInputs(nextInputs)
                        emitCustom(nextInputs, selectedIds)
                        setTotalChangedWarning(false)
                      }}
                      aria-label={`Absorb ${round(remaining, 2).toFixed(2)} into ${displayName}`}
                      className={`rounded-md px-1.5 py-1 text-xs font-semibold tabular-nums transition-colors ${
                        isValid
                          ? 'cursor-default text-muted-foreground/40'
                          : remaining > 0
                          ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-400 dark:hover:bg-blue-900'
                          : 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900'
                      }`}
                    >
                      {isValid ? '+0.00' : `${remaining > 0 ? '+' : ''}${round(remaining, 2).toFixed(2)}`}
                    </button>
                  </>
                )}

                {selectedIds.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(id)}
                    aria-label={`Remove ${displayName}`}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add member — shown in BOTH modes */}
      {unselectedMembers.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">Add member</p>
          {unselectedMembers.map((m) => (
            <button
              key={m.travelMemberId}
              type="button"
              onClick={() => handleAddMember(m.travelMemberId)}
              className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <span>+</span>
              {m.displayName}
            </button>
          ))}
        </div>
      )}

      {/* Custom mode: remaining counter */}
      {mode === 'custom' && (
        <div
          className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium ${
            isValid
              ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          <span>Remaining</span>
          <span className="tabular-nums">
            {remaining > 0 ? '+' : ''}
            {round(remaining, 2).toFixed(2)}
          </span>
        </div>
      )}

    </div>
  )
}
