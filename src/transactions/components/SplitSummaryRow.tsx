/**
 * SplitSummaryRow.tsx
 *
 * Collapsed one-line summary of a split — tap to open the SplitEditor drawer.
 *
 * Display logic:
 *   Payer display (always shows names regardless of mode):
 *     1 payer  = current user           → "You"
 *     1 payer  = someone else           → their name
 *     2+ payers, includes current user  → "You + N others"
 *     2+ payers, excludes current user  → "N people"
 *
 *   Beneficiary display (uses mode):
 *     Same name logic as above, suffixed by mode hint:
 *     equal  → "You + 1 other · Equal"
 *     custom → "You + 1 other · Custom"
 *
 * Shows a red dot when !isValid.
 */

import type { SpaceMember } from '@/spaces/types'
import type { Split } from '@/transactions/types'
import { useT, type Messages } from '@/i18n'

interface SplitSummaryRowProps {
  label: string
  splits: Split[]
  members: SpaceMember[]
  mode: 'equal' | 'custom'
  /** Append the mode hint ("· Equal" / "· Custom") when there are 2+ people.
   *  Set on the beneficiaries "Split" row. (This used to be inferred from the
   *  label starting with "split", which stops working once labels are translated.) */
  showMode?: boolean
  isValid: boolean
  /** The current user's travelMemberId (NOT their Firebase Auth UID). Used to show "You". */
  currentUserTravelMemberId: string
  onClick: () => void
}

export function SplitSummaryRow({
  label,
  splits,
  members,
  mode,
  showMode = false,
  isValid,
  currentUserTravelMemberId,
  onClick,
}: SplitSummaryRowProps) {
  // translation hook — re-renders when the language changes
  const t = useT()
  const summary = buildSummary(t, splits, members, mode, currentUserTravelMemberId, showMode)

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50 active:bg-muted"
    >
      <div className="flex items-center gap-2 min-w-0">
        {!isValid && (
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-destructive"
            aria-label={t.transactions.split.incomplete}
          />
        )}
        <span className="text-sm font-medium text-muted-foreground w-24 shrink-0">
          {label}
        </span>
        <span className="truncate text-sm font-semibold text-foreground">{summary}</span>
      </div>

      {/* Chevron */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="ml-2 shrink-0 text-muted-foreground"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** `t` is the translated message bundle, passed in from the component. */
function buildSummary(
  t: Messages,
  splits: Split[],
  members: SpaceMember[],
  mode: 'equal' | 'custom',
  currentUserTravelMemberId: string,
  showMode: boolean,
): string {
  const ts = t.transactions.split
  if (splits.length === 0) return ts.notSet

  // Compare split travelMemberIds against the current user's travelMemberId
  const includesMe = splits.some((s) => s.travelMemberId === currentUserTravelMemberId)
  const othersCount = splits.length - (includesMe ? 1 : 0)

  // Name part
  let namePart: string
  if (splits.length === 1) {
    namePart = includesMe
      ? ts.you
      : (members.find((m) => m.travelMemberId === splits[0].travelMemberId)?.displayName ?? splits[0].travelMemberId)
  } else if (includesMe) {
    namePart = ts.youPlusOthers(othersCount)
  } else {
    namePart = ts.people(splits.length)
  }


  if (showMode && splits.length > 1) {
    return ts.withMode({ names: namePart, mode: ts.modes[mode] })
  }

  return namePart
}
