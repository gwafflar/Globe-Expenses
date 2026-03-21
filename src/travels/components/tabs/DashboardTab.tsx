// DashboardTab.tsx — read-only analytics view for a travel.
//
// All statistics are computed client-side from the `transactions` array that
// is already loaded in memory by TravelDetailPage. No Firestore queries here.
//
// Layout (top to bottom):
//   1. Controls bar — period filter pills + member picker button
//   2. Hero card — total spend, avg/day, focus-member stat, tx count
//   3. Spending over time — day-by-day bar chart (always group totals)
//   4. Recent days — per-day category breakdown, configurable look-back
//   5. By category — category totals list
//   6. Per person — per-member consumed/paid (hidden when isSolo)
//   7. Currencies — grouped by currency with converted totals

import { useState, useMemo } from 'react'
import type { Travel, TravelMember } from '@/travels/types'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import { CollapsibleCard } from '@/travels/components/CollapsibleCard'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import {
  type PeriodFilter,
  normalizeTransactionSplits,
  filterTransactions,
  getTripDurationDays,
  computeMemberStats,
  categoryColor,
  CATEGORY_PALETTE,
  formatAmount,
  formatDayLabel,
  parseTxDate,
  dateRangeLabel,
  numberOfDaysInRange,
} from './dashboardHelpers'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DashboardTabProps {
  travel: Travel
  transactions: TransactionWithStatus[]
  currentUserUid: string
  isSolo: boolean
  onEditTransaction: (txId: string) => void
}

// ---------------------------------------------------------------------------
// Small reusable sub-components (local to this file)
// ---------------------------------------------------------------------------

/**
 * MemberAvatar — a small circle showing a member's initial, coloured by their
 * index in the travel.members array using CATEGORY_PALETTE.
 */
function MemberAvatar({
  name,
  index,
  size = 'sm',
}: {
  name: string
  index: number
  size?: 'sm' | 'md'
}) {
  // Pick a palette colour based on the member's position in the list
  const bg = CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  const sizeClass = size === 'md' ? 'h-8 w-8 text-sm' : 'h-6 w-6 text-xs'

  return (
    <span
      className={`${sizeClass} inline-flex items-center justify-center rounded-full font-semibold text-white`}
      style={{ backgroundColor: bg }}
    >
      {initial}
    </span>
  )
}

// ---------------------------------------------------------------------------
// DashboardTab
// ---------------------------------------------------------------------------

export function DashboardTab({
  travel,
  transactions,
  currentUserUid,
  isSolo,
  onEditTransaction,
}: DashboardTabProps) {
  // The main currency for this travel — first in the currencies array.
  const mainCurrency = travel.currencies[0] ?? 'EUR'

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  // period tracks the active time filter. 'all' by default — shows all transactions.
  const [period, setPeriod] = useState<PeriodFilter>({ type: 'all' })

  // customFrom / customTo hold the raw date strings from the custom range inputs,
  // separate from period so the user can edit them before pressing Apply.
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo  ] = useState('')

  // customPanelOpen controls the inline date-range panel visibility.
  const [customPanelOpen, setCustomPanelOpen] = useState(false)

  // selectedTravelMemberId: null = "all members" aggregate view.
  // When set, stat cards filter to that member's consumed amounts.
  // We store the travelMemberId (nanoid) not the Firebase Auth UID, because
  // that is what Split[] uses for attribution.
  const [selectedTravelMemberId, setSelectedTravelMemberId] = useState<string | null>(null)

  // memberSheetOpen controls the bottom-sheet member picker.
  const [memberSheetOpen, setMemberSheetOpen] = useState(false)

  // recentDays is the look-back window for Card ④ "Recent days".
  // Default 3 days — independent from the global period filter above.
  const [recentDays, setRecentDays] = useState(3)

  // recentCustomPanelOpen controls the slider panel inside Card ④.
  const [recentCustomPanelOpen, setRecentCustomPanelOpen] = useState(false)

  // sliderValue is the live value of the range slider (before Apply is pressed).
  const [sliderValue, setSliderValue] = useState(3)

  // hiddenCategories — categories excluded from the "Recent days" chart so that
  // outlier transactions don't squash the scale for all other bars.
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set())

  // hiddenTxIds — individual transaction IDs excluded from the chart.
  // Lets the user hide a single outlier without hiding the entire category.
  const [hiddenTxIds, setHiddenTxIds] = useState<Set<string>>(new Set())

  // tappedSegmentKey — tracks which segment was tapped: category name + date string.
  // null = info panel closed. We derive transaction details from this.
  const [tappedSegmentKey, setTappedSegmentKey] = useState<{
    categoryName: string
    dateStr: string
  } | null>(null)

  // ---------------------------------------------------------------------------
  // Resolve current user's travelMemberId (the stable key in Split[])
  // ---------------------------------------------------------------------------

  // The prop gives us a Firebase Auth UID. We need the corresponding
  // travelMemberId so we can filter Split[] which uses travelMemberId.
  const currentMember = travel.members.find((m) => m.userId === currentUserUid)
  const currentTravelMemberId = currentMember?.travelMemberId ?? ''

  // focusTravelMemberId: the member whose stats are highlighted in the hero card.
  // Defaults to the current user when nothing is explicitly selected.
  const focusTravelMemberId = selectedTravelMemberId ?? currentTravelMemberId

  // focusMember: full TravelMember record for the focus member
  const focusMember = travel.members.find(
    (m) => m.travelMemberId === focusTravelMemberId,
  )

  // ---------------------------------------------------------------------------
  // Derived data (useMemo — avoids recomputing on every render)
  // ---------------------------------------------------------------------------

  // normalizedTxs — transactions with split IDs remapped from the legacy 'uid'
  // field to 'travelMemberId'.  Transactions created before the Session 009
  // TravelMember refactor stored splits as { uid, amount }; post-refactor splits
  // use { travelMemberId, amount }.  Without this step, computeMemberStats would
  // see split.travelMemberId === undefined for every old split and return paid=0
  // even for members who did pay.  The normalisation is O(n) and only allocates
  // new objects when a split actually needs remapping.
  const normalizedTxs = useMemo(
    () => normalizeTransactionSplits(transactions, travel.members),
    [transactions, travel.members],
  )

  // filteredTxs — the normalised transaction list restricted to the active period.
  // Recomputed whenever the period selection or the raw transactions change.
  const filteredTxs = useMemo(
    () => filterTransactions(normalizedTxs, period),
    [normalizedTxs, period],
  )

  // totalSpent — sum of all filtered transactions in main currency.
  const totalSpent = useMemo(
    () => filteredTxs.reduce((sum, tx) => sum + tx.totalAmountMain, 0),
    [filteredTxs],
  )

  // focusStats — how much the focus member consumed and paid within the filter.
  const focusStats = useMemo(
    () => computeMemberStats(filteredTxs, focusTravelMemberId),
    [filteredTxs, focusTravelMemberId],
  )

  // tripDurationDays — total trip length in days. Used to cap the slider max
  // and as the "n" for the 'all' period average.
  const tripDurationDays = useMemo(
    () => getTripDurationDays(travel, normalizedTxs),
    [travel, normalizedTxs],
  )

  // nDaysInRange — how many calendar days the active filter spans.
  const nDaysInRange = useMemo(
    () => numberOfDaysInRange(period, tripDurationDays),
    [period, tripDurationDays],
  )

  // avgPerDay — average daily spend across the active period.
  const avgPerDay = useMemo(
    () => (nDaysInRange > 0 ? totalSpent / nDaysInRange : 0),
    [totalSpent, nDaysInRange],
  )

  // perDayTotals — Map<DD-MM-YYYY, totalAmountMain> for the spending-over-time
  // bar chart. Always uses group totals (not filtered by member) so the time
  // context stays intact regardless of member selection.
  const perDayTotals = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of filteredTxs) {
      map.set(tx.date, (map.get(tx.date) ?? 0) + tx.totalAmountMain)
    }
    return map
  }, [filteredTxs])

  // perCategoryTotals — sorted array of { name, total, color } for Card ⑤.
  // When selectedTravelMemberId is set, uses that member's consumed share per
  // category; otherwise uses the full tx.totalAmountMain.
  const perCategoryTotals = useMemo(() => {
    const map = new Map<string, number>()

    for (const tx of filteredTxs) {
      const key = tx.category?.trim() || '' // empty string = "Uncategorized"

      if (selectedTravelMemberId) {
        // Sum only the selected member's beneficiary share for this transaction
        for (const split of tx.beneficiaries) {
          if (split.travelMemberId === selectedTravelMemberId) {
            map.set(key, (map.get(key) ?? 0) + split.amount * tx.exchangeRate)
          }
        }
      } else {
        map.set(key, (map.get(key) ?? 0) + tx.totalAmountMain)
      }
    }

    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total, color: categoryColor(name || 'Uncategorized') }))
      .sort((a, b) => {
        // "Uncategorized" always goes last
        if (a.name === '' && b.name !== '') return 1
        if (b.name === '' && a.name !== '') return -1
        return b.total - a.total
      })
  }, [filteredTxs, selectedTravelMemberId])

  // perMemberStats — sorted array of { member, consumed, paid } for Card ⑥.
  // Current user always first, then descending by consumed.
  const perMemberStats = useMemo(() => {
    const stats = travel.members.map((member, idx) => ({
      member,
      memberIndex: idx,
      ...computeMemberStats(filteredTxs, member.travelMemberId),
    }))

    return stats.sort((a, b) => {
      // Current user's member card floats to the top
      const aIsCurrent = a.member.userId === currentUserUid
      const bIsCurrent = b.member.userId === currentUserUid
      if (aIsCurrent && !bIsCurrent) return -1
      if (bIsCurrent && !aIsCurrent) return 1
      return b.consumed - a.consumed
    })
  }, [filteredTxs, travel.members, currentUserUid])

  // labelForPeriod — active period button label, used in the hero subtitle.
  const rangeLabelStr = useMemo(
    () => dateRangeLabel(period, filteredTxs, tripDurationDays),
    [period, filteredTxs, tripDurationDays],
  )

  // ---------------------------------------------------------------------------
  // Member picker helpers
  // ---------------------------------------------------------------------------

  /** The currently selected member's display info for the picker button. */
  const selectedMember: TravelMember | null =
    selectedTravelMemberId
      ? (travel.members.find((m) => m.travelMemberId === selectedTravelMemberId) ?? null)
      : null

  const selectedMemberIndex = selectedMember
    ? travel.members.indexOf(selectedMember)
    : -1

  // ---------------------------------------------------------------------------
  // Spending-over-time bar chart data
  // ---------------------------------------------------------------------------

  const sortedDays = useMemo(() => {
    // Sort by date ascending for the bar chart (oldest left, newest right)
    return Array.from(perDayTotals.entries()).sort((a, b) => {
      const da = parseTxDate(a[0]).getTime()
      const db = parseTxDate(b[0]).getTime()
      return da - db
    })
  }, [perDayTotals])

  const maxDayTotal = useMemo(
    () => Math.max(...sortedDays.map(([, v]) => v), 1),
    [sortedDays],
  )

  // ---------------------------------------------------------------------------
  // Recent days card data
  // ---------------------------------------------------------------------------

  // Generate the last `recentDays` calendar dates as DD-MM-YYYY strings,
  // counting back from today. We always use today as day 0 so that the user
  // sees "Today" even when there are no transactions yet today.
  const recentDateStrings = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Array.from({ length: recentDays }, (_, i) => {
      const d = new Date(today.getTime() - i * 86_400_000)
      const day   = String(d.getDate()).padStart(2, '0')
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const year  = d.getFullYear()
      return `${day}-${month}-${year}`
    }).reverse() // oldest first so bars read left-to-right
  }, [recentDays])

  // For each recent date, compute per-category amounts (or full totals if no
  // member is selected).
  const recentDaysData = useMemo(() => {
    return recentDateStrings.map((dateStr) => {
      const dayTxs = normalizedTxs.filter((tx) => tx.date === dateStr && !hiddenTxIds.has(tx.txId))

      if (dayTxs.length === 0) {
        return { dateStr, total: 0, categories: [] as { name: string; amount: number; color: string }[] }
      }

      const catMap = new Map<string, number>()
      let total = 0

      for (const tx of dayTxs) {
        const key = tx.category?.trim() || ''

        if (selectedTravelMemberId) {
          for (const split of tx.beneficiaries) {
            if (split.travelMemberId === selectedTravelMemberId) {
              const amt = split.amount * tx.exchangeRate
              catMap.set(key, (catMap.get(key) ?? 0) + amt)
              total += amt
            }
          }
        } else {
          catMap.set(key, (catMap.get(key) ?? 0) + tx.totalAmountMain)
          total += tx.totalAmountMain
        }
      }

      const categories = Array.from(catMap.entries())
        .map(([name, amount]) => ({ name, amount, color: categoryColor(name || 'Uncategorized') }))
        .sort((a, b) => b.amount - a.amount)

      return { dateStr, total, categories }
    })
  }, [recentDateStrings, normalizedTxs, selectedTravelMemberId, hiddenTxIds])

  // Filtered recent days data — excludes hidden categories so the scale adjusts.
  // Each day gets a new total and filtered categories array.
  const filteredRecentDaysData = useMemo(() => {
    if (hiddenCategories.size === 0) return recentDaysData
    return recentDaysData.map((day) => {
      const cats = day.categories.filter((c) => !hiddenCategories.has(c.name))
      const total = cats.reduce((sum, c) => sum + c.amount, 0)
      return { ...day, total, categories: cats }
    })
  }, [recentDaysData, hiddenCategories])

  // Max total across recent days — used to scale the bar widths.
  // Recomputed from filtered data so hiding an outlier rescales the chart.
  const recentMaxTotal = useMemo(
    () => Math.max(...filteredRecentDaysData.map((d) => d.total), 1),
    [filteredRecentDaysData],
  )

  // Transactions for the tapped segment's category on the tapped day.
  // Used to render the detail list inside the info panel.
  const tappedSegmentTxs = useMemo(() => {
    if (!tappedSegmentKey) return []
    return normalizedTxs.filter(
      (tx) =>
        tx.date === tappedSegmentKey.dateStr &&
        (tx.category?.trim() || '') === tappedSegmentKey.categoryName,
    )
  }, [tappedSegmentKey, normalizedTxs])

  // Total for the tapped segment (category on that day, including hidden txs).
  const tappedSegmentTotal = useMemo(
    () => tappedSegmentTxs.reduce((sum, tx) => sum + tx.totalAmountMain, 0),
    [tappedSegmentTxs],
  )

  // Color for the tapped category
  const tappedSegmentColor = tappedSegmentKey
    ? categoryColor(tappedSegmentKey.categoryName || 'Uncategorized')
    : '#999'

  // Label for the recent-days card summary line
  const recentDaySummary =
    recentDays === 1 ? 'today' : `last ${recentDays} days`

  // Is the current recentDays value a preset or custom?
  const PRESET_RECENT = [1, 3, 7, 15]
  const isCustomRecent = !PRESET_RECENT.includes(recentDays)

  // ---------------------------------------------------------------------------
  // Currencies card data
  // ---------------------------------------------------------------------------

  const currenciesData = useMemo(() => {
    const map = new Map<string, number>()

    for (const tx of filteredTxs) {
      const key = tx.currency

      if (selectedTravelMemberId) {
        for (const split of tx.beneficiaries) {
          if (split.travelMemberId === selectedTravelMemberId) {
            map.set(key, (map.get(key) ?? 0) + split.amount * tx.exchangeRate)
          }
        }
      } else {
        map.set(key, (map.get(key) ?? 0) + tx.totalAmountMain)
      }
    }

    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [filteredTxs, selectedTravelMemberId])

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  /** Period pill button */
  function PeriodPill({
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

  // ---------------------------------------------------------------------------
  // Derived label for Custom period pill
  // ---------------------------------------------------------------------------
  let customPillLabel = 'Custom'
  if (period.type === 'custom') {
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    customPillLabel = `${fmt(period.from)}–${fmt(period.to)}`
  }

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  return (
    // Root layout: vertical stack, no horizontal padding (each card adds its own)
    <div className="flex flex-col gap-3 pb-6">

      {/* ================================================================ */}
      {/* Controls bar — period filter + member picker                      */}
      {/* ================================================================ */}
      <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">

        {/* Row 1: Period pills + member picker button on the same line */}
        <div className="flex items-center justify-between gap-2">

          {/* Period pills — scroll horizontally on narrow screens */}
          <div className="flex flex-wrap gap-1.5">
            <PeriodPill
              label="All"
              active={period.type === 'all'}
              onClick={() => { setPeriod({ type: 'all' }); setCustomPanelOpen(false) }}
            />
            <PeriodPill
              label="Today"
              active={period.type === 'today'}
              onClick={() => { setPeriod({ type: 'today' }); setCustomPanelOpen(false) }}
            />
            <PeriodPill
              label="7d"
              active={period.type === 'days' && period.n === 7}
              onClick={() => { setPeriod({ type: 'days', n: 7 }); setCustomPanelOpen(false) }}
            />
            <PeriodPill
              label="30d"
              active={period.type === 'days' && period.n === 30}
              onClick={() => { setPeriod({ type: 'days', n: 30 }); setCustomPanelOpen(false) }}
            />
            <PeriodPill
              label={customPillLabel}
              active={period.type === 'custom' || customPanelOpen}
              onClick={() => setCustomPanelOpen((prev) => !prev)}
            />
          </div>

          {/* Member picker button — hidden for solo travels */}
          {!isSolo && (
            <button
              type="button"
              onClick={() => setMemberSheetOpen(true)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedTravelMemberId
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {selectedMember ? (
                <>
                  <MemberAvatar name={selectedMember.displayName} index={selectedMemberIndex} />
                  <span className="max-w-[6rem] truncate">{selectedMember.displayName}</span>
                </>
              ) : (
                <span>👤 All</span>
              )}
            </button>
          )}
        </div>

        {/* Custom date-range panel — shown only when customPanelOpen */}
        {customPanelOpen && (
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t pt-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              From
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded border px-2 py-1 text-xs text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              To
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
              onClick={() => {
                if (customFrom && customTo) {
                  setPeriod({
                    type: 'custom',
                    from: new Date(customFrom),
                    to:   new Date(customTo),
                  })
                  setCustomPanelOpen(false)
                }
              }}
              className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* Card ① — Hero (not collapsible)                                  */}
      {/* ================================================================ */}
      <div className="rounded-xl border bg-card px-4 py-4 shadow-sm">

        {/* Total spend — large centered number */}
        <div className="mb-1 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Total spent
        </div>
        <div className="mb-1 text-center text-3xl font-bold text-foreground">
          {formatAmount(totalSpent, mainCurrency)}
        </div>

        {/* Subtitle: transaction count + date range */}
        <div className="mb-4 text-center text-xs text-muted-foreground">
          {filteredTxs.length} transaction{filteredTxs.length !== 1 ? 's' : ''}
          {rangeLabelStr ? ` · ${rangeLabelStr}` : ''}
        </div>

        {/* Three stat boxes */}
        <div className={`grid gap-2 ${isSolo ? 'grid-cols-2' : 'grid-cols-3'}`}>

          {/* Avg/day */}
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center">
            <div className="text-xs text-muted-foreground">Avg/day</div>
            <div className="mt-0.5 text-sm font-semibold">
              {formatAmount(avgPerDay, mainCurrency)}
            </div>
          </div>

          {/* Focus member stat — hidden when isSolo */}
          {!isSolo && (
            <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-center">
              <div className="truncate text-xs text-primary">
                {focusMember?.displayName ?? 'You'}
                {focusTravelMemberId === currentTravelMemberId ? ' (you)' : ''}
              </div>
              <div className="mt-0.5 text-sm font-semibold text-foreground">
                {formatAmount(focusStats.consumed, mainCurrency)}
              </div>
              <div className="text-xs text-muted-foreground">
                paid: {formatAmount(focusStats.paid, mainCurrency)}
              </div>
            </div>
          )}

          {/* Transaction count */}
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center">
            <div className="text-xs text-muted-foreground">Transactions</div>
            <div className="mt-0.5 text-sm font-semibold">{filteredTxs.length}</div>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* Card ② — Spending over time                                       */}
      {/* ================================================================ */}
      <CollapsibleCard
        title="Spending over time"
        summary={formatAmount(totalSpent, mainCurrency)}
      >
        {sortedDays.length < 2 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Not enough data
          </p>
        ) : (
          <>
            {/* Bar chart container — fixed height, flex row */}
            <div className="relative h-20">
              <div className="flex h-full items-end gap-0.5">
                {sortedDays.map(([dateStr, total]) => {
                  const heightPct = (total / maxDayTotal) * 100
                  return (
                    <div
                      key={dateStr}
                      className="flex-1"
                      style={{ height: '100%', display: 'flex', alignItems: 'flex-end' }}
                    >
                      <div
                        // title provides a simple hover tooltip (no library needed)
                        title={`${formatDayLabel(dateStr)}: ${formatAmount(total, mainCurrency)}`}
                        className="w-full rounded-t bg-primary/70"
                        style={{ height: `${heightPct}%`, minHeight: 2 }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* X-axis labels: first, middle, last */}
            {(() => {
              const first  = sortedDays[0][0]
              const last   = sortedDays[sortedDays.length - 1][0]
              const midIdx = Math.floor(sortedDays.length / 2)
              const mid    = sortedDays[midIdx][0]
              return (
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>{formatDayLabel(first)}</span>
                  <span>{formatDayLabel(mid)}</span>
                  <span>{formatDayLabel(last)}</span>
                </div>
              )
            })()}
          </>
        )}
      </CollapsibleCard>

      {/* ================================================================ */}
      {/* Card ③ — Recent days by category                                 */}
      {/* ================================================================ */}
      <CollapsibleCard
        title="Recent days"
        summary={recentDaySummary}
      >
        {/* Day preset pills */}
        <div className="mb-3 flex items-center gap-1.5">
          {PRESET_RECENT.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => { setRecentDays(n); setRecentCustomPanelOpen(false) }}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                recentDays === n && !isCustomRecent
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {n}
            </button>
          ))}
          {/* Custom button: shows "…" when a preset is active, "Nd" when custom */}
          <button
            type="button"
            onClick={() => {
              setSliderValue(recentDays)
              setRecentCustomPanelOpen((prev) => !prev)
            }}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              isCustomRecent
                ? 'border-amber-300 bg-amber-100 text-amber-700'
                : 'border-border bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {isCustomRecent ? `${recentDays}d` : '…'}
          </button>
        </div>

        {/* Custom slider panel */}
        {recentCustomPanelOpen && (
          <div className="mb-3 flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
            <span className="shrink-0 text-xs text-muted-foreground">Custom</span>
            <input
              type="range"
              min={1}
              max={tripDurationDays}
              step={1}
              value={sliderValue}
              onChange={(e) => setSliderValue(Number(e.target.value))}
              className="flex-1"
            />
            <span className="shrink-0 text-xs text-muted-foreground">
              {sliderValue} day{sliderValue !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={() => { setRecentDays(sliderValue); setRecentCustomPanelOpen(false) }}
              className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground"
            >
              Apply
            </button>
          </div>
        )}

        {/* Day rows */}
        <div className="flex flex-col gap-2">
          {filteredRecentDaysData.map(({ dateStr, total, categories }) => (
            <div key={dateStr} className="flex items-center gap-2">
              {/* Date label — fixed width left column */}
              <span className="w-12 shrink-0 text-xs text-muted-foreground">
                {formatDayLabel(dateStr)}
              </span>

              {/* Stacked horizontal bar — one line per day, segments proportional to category amounts */}
              <div className="flex flex-1 items-center">
                {categories.length === 0 ? (
                  // No transactions this day — gray placeholder bar
                  <div className="flex items-center gap-2">
                    <div
                      style={{ width: 20, height: 14, borderRadius: 3, backgroundColor: '#d1d5db' }}
                    />
                    <span className="text-xs text-muted-foreground">No expenses</span>
                  </div>
                ) : (
                  // Overall bar width scales to recentMaxTotal (days with less spend = shorter bar).
                  // Each segment inside is proportional to its category amount within the day.
                  <div
                    className="flex overflow-hidden rounded"
                    style={{ width: `${(total / recentMaxTotal) * 100}%`, minWidth: 4, height: 14 }}
                  >
                    {categories.map((cat, i) => {
                      // Segment width as a fraction of the day total
                      const pct = total > 0 ? (cat.amount / total) * 100 : 0
                      return (
                        <div
                          key={cat.name}
                          title={`${cat.name || 'Uncategorized'}: ${formatAmount(cat.amount, mainCurrency)}`}
                          className="cursor-pointer transition-opacity hover:opacity-80"
                          onClick={() =>
                            // Toggle: tap same segment again to dismiss info panel
                            setTappedSegmentKey((prev) =>
                              prev?.categoryName === cat.name && prev?.dateStr === dateStr
                                ? null
                                : { categoryName: cat.name, dateStr },
                            )
                          }
                          style={{
                            width: `${pct}%`,
                            minWidth: 3,
                            backgroundColor: cat.color,
                            // First segment gets left radius, last gets right radius
                            borderTopLeftRadius: i === 0 ? 3 : 0,
                            borderBottomLeftRadius: i === 0 ? 3 : 0,
                            borderTopRightRadius: i === categories.length - 1 ? 3 : 0,
                            borderBottomRightRadius: i === categories.length - 1 ? 3 : 0,
                          }}
                        />
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Day total — right column */}
              <span className="w-16 shrink-0 text-right text-xs font-semibold text-foreground">
                {total > 0 ? formatAmount(total, mainCurrency) : '—'}
              </span>
            </div>
          ))}
        </div>

        {/* Tapped segment info panel — category header + day's transactions */}
        {tappedSegmentKey && (
          <div className="mt-2 rounded-lg border bg-muted/30 px-3 py-2">
            {/* Category header row: color dot, name, date, total, hide-all button */}
            <div className="flex items-center gap-2">
              <span
                className="inline-block shrink-0 rounded-full"
                style={{ width: 8, height: 8, backgroundColor: tappedSegmentColor }}
              />
              <span className="text-xs font-medium text-foreground">
                {tappedSegmentKey.categoryName || 'Uncategorized'}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDayLabel(tappedSegmentKey.dateStr)} · {formatAmount(tappedSegmentTotal, mainCurrency)}
              </span>
              <button
                type="button"
                className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                title="Hide entire category from the chart"
                onClick={() => {
                  setHiddenCategories((prev) => new Set(prev).add(tappedSegmentKey.categoryName))
                  setTappedSegmentKey(null)
                }}
              >
                👁️‍🗨️ Hide all
              </button>
            </div>

            {/* Individual transactions for this category on this day */}
            <div className="mt-1.5 flex flex-col gap-1 border-t pt-1.5">
              {tappedSegmentTxs.map((tx) => {
                const isHidden = hiddenTxIds.has(tx.txId)
                return (
                  <div
                    key={tx.txId}
                    className={`flex items-center gap-2 text-xs ${isHidden ? 'opacity-40' : ''}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-foreground">{tx.name}</span>
                    {/* Amount in transaction currency (if different from main) */}
                    {tx.currency !== mainCurrency && (
                      <span className="shrink-0 text-muted-foreground">
                        {formatAmount(tx.totalAmount, tx.currency)}
                      </span>
                    )}
                    {/* Amount in main currency */}
                    <span className="shrink-0 font-medium text-foreground">
                      {formatAmount(tx.totalAmountMain, mainCurrency)}
                    </span>
                    {/* Edit this transaction — opens the TransactionForm drawer */}
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      title="Edit this transaction"
                      onClick={() => onEditTransaction(tx.txId)}
                    >
                      ✏️
                    </button>
                    {/* Hide / show toggle for this transaction */}
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      title={isHidden ? 'Show this transaction' : 'Hide this transaction'}
                      onClick={() => {
                        setHiddenTxIds((prev) => {
                          const next = new Set(prev)
                          if (isHidden) next.delete(tx.txId)
                          else next.add(tx.txId)
                          return next
                        })
                      }}
                    >
                      {isHidden ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Hidden items — pills to re-show (categories + individual transactions) */}
        {(hiddenCategories.size > 0 || hiddenTxIds.size > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Hidden:</span>
            {/* Hidden category pills */}
            {Array.from(hiddenCategories).map((name) => (
              <button
                key={`cat-${name}`}
                type="button"
                onClick={() => {
                  setHiddenCategories((prev) => {
                    const next = new Set(prev)
                    next.delete(name)
                    return next
                  })
                }}
                className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <span
                  className="inline-block rounded-full"
                  style={{ width: 6, height: 6, backgroundColor: categoryColor(name || 'Uncategorized') }}
                />
                {name || 'Uncategorized'}
                <span className="text-[10px]">👁️</span>
              </button>
            ))}
            {/* Hidden individual transaction pills */}
            {Array.from(hiddenTxIds).map((txId) => {
              const tx = normalizedTxs.find((t) => t.txId === txId)
              if (!tx) return null
              return (
                <button
                  key={`tx-${txId}`}
                  type="button"
                  onClick={() => {
                    setHiddenTxIds((prev) => {
                      const next = new Set(prev)
                      next.delete(txId)
                      return next
                    })
                  }}
                  className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className="max-w-[8rem] truncate">{tx.name}</span>
                  <span className="text-[10px]">👁️</span>
                </button>
              )
            })}
          </div>
        )}
      </CollapsibleCard>

      {/* ================================================================ */}
      {/* Card ④ — By category                                             */}
      {/* ================================================================ */}
      {(() => {
        const grandTotal = perCategoryTotals.reduce((s, c) => s + c.total, 0)
        const top = perCategoryTotals[0]
        const topName = top?.name || 'Uncategorized'
        const topPct  = grandTotal > 0 ? Math.round((top?.total ?? 0) / grandTotal * 100) : 0
        const summary = top ? `${topName} · ${topPct}%` : 'No data'

        return (
          <CollapsibleCard title="By category" summary={summary}>
            {perCategoryTotals.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No data</p>
            ) : (
              <div className="flex flex-col gap-2">
                {perCategoryTotals.map(({ name, total, color }) => {
                  const pct = grandTotal > 0 ? Math.round(total / grandTotal * 100) : 0
                  return (
                    <div key={name || '__uncategorized__'} className="flex items-center gap-2">
                      {/* Coloured dot */}
                      <span
                        className="inline-block shrink-0 rounded-full"
                        style={{ width: 8, height: 8, backgroundColor: color }}
                      />
                      {/* Category name */}
                      <span className="flex-1 text-sm text-foreground">
                        {name || 'Uncategorized'}
                      </span>
                      {/* Amount */}
                      <span className="text-sm font-medium text-foreground">
                        {formatAmount(total, mainCurrency)}
                      </span>
                      {/* Percentage */}
                      <span className="w-10 text-right text-xs text-muted-foreground">
                        {pct}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CollapsibleCard>
        )
      })()}

      {/* ================================================================ */}
      {/* Card ⑤ — Per person (hidden when isSolo)                         */}
      {/* ================================================================ */}
      {!isSolo && (() => {
        const maxConsumed = Math.max(...perMemberStats.map((s) => s.consumed), 1)
        const focusName   = focusMember?.displayName ?? 'You'

        return (
          <CollapsibleCard
            title="Per person"
            summary={`${focusName}: ${formatAmount(focusStats.consumed, mainCurrency)}`}
          >
            <div className="flex flex-col gap-3">
              {perMemberStats.map(({ member, memberIndex, consumed, paid }) => {
                const isCurrentUser = member.userId === currentUserUid
                const isHighlighted = member.travelMemberId === selectedTravelMemberId
                const barWidth      = (consumed / maxConsumed) * 100

                return (
                  <div
                    key={member.travelMemberId}
                    className={`flex items-center gap-3 ${
                      isHighlighted ? 'border-l-2 border-amber-400 pl-2' : ''
                    }`}
                  >
                    {/* Avatar */}
                    <MemberAvatar name={member.displayName} index={memberIndex} size="md" />

                    {/* Name + bar */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 text-xs font-medium text-foreground">
                        {member.displayName}
                        {isCurrentUser ? (
                          <span className="ml-1 text-muted-foreground">(you)</span>
                        ) : null}
                      </div>
                      {/* Bar track */}
                      <div className="h-1 w-full rounded bg-muted">
                        <div
                          className="h-1 rounded"
                          style={{
                            width: `${barWidth}%`,
                            backgroundColor:
                              CATEGORY_PALETTE[memberIndex % CATEGORY_PALETTE.length],
                          }}
                        />
                      </div>
                    </div>

                    {/* Amounts */}
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold text-foreground">
                        {formatAmount(consumed, mainCurrency)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        paid {formatAmount(paid, mainCurrency)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CollapsibleCard>
        )
      })()}

      {/* ================================================================ */}
      {/* Card ⑥ — Currencies                                              */}
      {/* ================================================================ */}
      <CollapsibleCard
        title="Currencies"
        summary={currenciesData.map(([code]) => code).join(' · ') || 'None'}
      >
        {currenciesData.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No data</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {currenciesData.map(([code, convertedTotal]) => (
                <div
                  key={code}
                  className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-foreground"
                >
                  <span className="font-semibold">{code}</span>
                  {'  '}
                  {formatAmount(convertedTotal, mainCurrency)}
                  {code !== mainCurrency && (
                    <span className="ml-1 text-muted-foreground">≈</span>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Amounts converted at rate stored per transaction
            </p>
          </>
        )}
      </CollapsibleCard>

      {/* ================================================================ */}
      {/* Member picker bottom sheet                                        */}
      {/* ================================================================ */}
      {/* Uses vaul Drawer (direction=bottom) since Sheet is not installed. */}
      {!isSolo && (
        <Drawer
          open={memberSheetOpen}
          onOpenChange={setMemberSheetOpen}
          direction="bottom"
        >
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>View stats for</DrawerTitle>
            </DrawerHeader>

            <div className="flex flex-col px-4 pb-6">
              {/* "All members" row */}
              <button
                type="button"
                onClick={() => { setSelectedTravelMemberId(null); setMemberSheetOpen(false) }}
                className="flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-muted/50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border text-sm">
                  👤
                </span>
                <span className="flex-1 text-sm font-medium text-foreground">All members</span>
                {selectedTravelMemberId === null && (
                  <span className="text-primary">✓</span>
                )}
              </button>

              {/* One row per member */}
              {travel.members.map((member, idx) => {
                const isActive    = member.travelMemberId === selectedTravelMemberId
                const isCurrentUser = member.userId === currentUserUid

                return (
                  <button
                    key={member.travelMemberId}
                    type="button"
                    onClick={() => {
                      setSelectedTravelMemberId(member.travelMemberId)
                      setMemberSheetOpen(false)
                    }}
                    className="flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-muted/50"
                  >
                    <MemberAvatar name={member.displayName} index={idx} size="md" />
                    <span className="flex-1 text-sm text-foreground">
                      {member.displayName}
                      {isCurrentUser && (
                        <span className="ml-1 text-muted-foreground text-xs">(you)</span>
                      )}
                    </span>
                    {isActive && <span className="text-primary">✓</span>}
                  </button>
                )
              })}
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  )
}
