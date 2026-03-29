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
import {
  countsAsSpending,
  computeWalletBalances,
  isWithdrawal,
  type WalletBalance,
} from '@/transactions/utils/walletHelpers'
import { ReconciliationDialog } from '@/transactions/components/ReconciliationDialog'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DashboardTabProps {
  travel: Travel
  transactions: TransactionWithStatus[]
  currentUserUid: string
  isSolo: boolean
  onEditTransaction: (txId: string) => void
  onAddWithdrawal?: () => void
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
  onAddWithdrawal,
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

  // tappedDayKey — which day bar was tapped in Card ② (Spending over time).
  // null = panel closed. Stores the DD-MM-YYYY date string.
  const [tappedDayKey, setTappedDayKey] = useState<string | null>(null)

  // hiddenSpendingTxIds — transaction IDs hidden from the spending-over-time chart.
  // Independent from hiddenTxIds (which is for Card ③ Recent days).
  const [hiddenSpendingTxIds, setHiddenSpendingTxIds] = useState<Set<string>>(new Set())

  // hiddenSpendingCategories — entire category names hidden from the
  // spending-over-time chart. All transactions of a hidden category are excluded.
  const [hiddenSpendingCategories, setHiddenSpendingCategories] = useState<Set<string>>(new Set())

  // tappedCategoryKey — which category was tapped in Card ④ (By category).
  // null = panel closed. Stores the category name (empty string = Uncategorized).
  const [tappedCategoryKey, setTappedCategoryKey] = useState<string | null>(null)

  // hiddenCategoryTxIds — transaction IDs hidden from the by-category chart.
  // Independent from the other hidden sets.
  const [hiddenCategoryTxIds, setHiddenCategoryTxIds] = useState<Set<string>>(new Set())

  // hiddenCategoryNames — entire category names hidden from the by-category chart.
  const [hiddenCategoryNames, setHiddenCategoryNames] = useState<Set<string>>(new Set())

  // reconcileBalance — the wallet balance being reconciled (null = dialog closed).
  const [reconcileBalance, setReconcileBalance] = useState<WalletBalance | null>(null)

  // selectedWalletKey — which wallet carousel card is tapped for drill-down.
  // Format: "paymentMethodId|currency" or null (no selection = show all top-ups).
  const [selectedWalletKey, setSelectedWalletKey] = useState<string | null>(null)

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

  // spendingTxs — only transactions that count toward spending analytics.
  // Excludes withdrawals and balance-only adjustments so they don't inflate
  // totals, category breakdowns, or per-member stats.
  const spendingTxs = useMemo(
    () => normalizedTxs.filter(countsAsSpending),
    [normalizedTxs],
  )

  // filteredTxs — the spending-only list restricted to the active period.
  // Recomputed whenever the period selection or the raw transactions change.
  const filteredTxs = useMemo(
    () => filterTransactions(spendingTxs, period),
    [spendingTxs, period],
  )

  // walletBalances — per (paymentMethod, currency) remaining balance for the
  // current user. Computed from ALL normalised transactions (not period-filtered)
  // because wallet balance is cumulative across the entire travel.
  const pmLabelMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const pm of travel.paymentMethods ?? []) {
      m.set(pm.id, pm.emoji ? `${pm.emoji} ${pm.label}` : pm.label)
    }
    return m
  }, [travel.paymentMethods])

  const walletBalances = useMemo(
    () => computeWalletBalances(normalizedTxs, currentTravelMemberId, pmLabelMap),
    [normalizedTxs, currentTravelMemberId, pmLabelMap],
  )

  // withdrawalTxs — all withdrawal transactions where the current user paid,
  // sorted by date descending. Used by the wallet card's top-up list.
  const withdrawalTxs = useMemo(() => {
    return normalizedTxs
      .filter(tx => isWithdrawal(tx) && tx.paidBy.some(s => s.travelMemberId === currentTravelMemberId))
      .sort((a, b) => parseTxDate(b.date).getTime() - parseTxDate(a.date).getTime())
  }, [normalizedTxs, currentTravelMemberId])

  // selectedWalletDetail — drill-down data for the tapped wallet card.
  // Computes filtered withdrawals, summary stats, and "since last top-up" data.
  const selectedWalletDetail = useMemo(() => {
    if (!selectedWalletKey) return null
    const [pm, currency] = selectedWalletKey.split('|')
    const wb = walletBalances.find(w => w.paymentMethod === pm && w.currency === currency)
    if (!wb) return null

    // Withdrawals for this specific wallet, already sorted desc
    const walletWithdrawals = withdrawalTxs.filter(
      tx => tx.paymentMethod === pm && tx.currency === currency,
    )

    const lastTopup = walletWithdrawals[0] // most recent (sorted desc)
    if (!lastTopup) {
      return { wb, walletWithdrawals, lastTopup: null, lastTopupNetAmount: 0, spentSinceLastTopup: 0, balanceAfterLastTopup: wb.remaining }
    }

    const lastTopupDate = parseTxDate(lastTopup.date)
    const lastTopupNetAmount = (lastTopup.paidBy.find(s => s.travelMemberId === currentTravelMemberId)?.amount ?? 0) - (lastTopup.fees ?? 0)

    // Sum expenses paid by this member with this PM+currency on or after last top-up date
    let spentSinceLastTopup = 0
    for (const tx of normalizedTxs) {
      if (tx.paymentMethod !== pm || tx.currency !== currency) continue
      if (!countsAsSpending(tx)) continue
      const paid = tx.paidBy.find(s => s.travelMemberId === currentTravelMemberId)?.amount ?? 0
      if (paid === 0) continue
      if (parseTxDate(tx.date).getTime() >= lastTopupDate.getTime()) {
        spentSinceLastTopup += paid
      }
    }
    spentSinceLastTopup = Math.round(spentSinceLastTopup * 100) / 100

    return {
      wb,
      walletWithdrawals,
      lastTopup,
      lastTopupNetAmount: Math.round(lastTopupNetAmount * 100) / 100,
      spentSinceLastTopup,
      // Balance right after the last top-up ≈ current remaining + everything spent since
      balanceAfterLastTopup: Math.round((wb.remaining + spentSinceLastTopup) * 100) / 100,
    }
  }, [selectedWalletKey, walletBalances, withdrawalTxs, normalizedTxs, currentTravelMemberId])

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
  // Excludes transactions hidden via the spending-over-time card's hide feature
  // (both individual txIds and entire categories).
  const perDayTotals = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of filteredTxs) {
      if (hiddenSpendingTxIds.has(tx.txId)) continue
      if (hiddenSpendingCategories.has(tx.category?.trim() || '')) continue
      map.set(tx.date, (map.get(tx.date) ?? 0) + tx.totalAmountMain)
    }
    return map
  }, [filteredTxs, hiddenSpendingTxIds, hiddenSpendingCategories])

  // perCategoryTotals — sorted array of { name, total, color } for Card ⑤.
  // When selectedTravelMemberId is set, uses that member's consumed share per
  // category; otherwise uses the full tx.totalAmountMain.
  // Excludes transactions hidden via the by-category card's hide feature.
  const perCategoryTotals = useMemo(() => {
    const map = new Map<string, number>()

    for (const tx of filteredTxs) {
      if (hiddenCategoryTxIds.has(tx.txId)) continue
      const key = tx.category?.trim() || '' // empty string = "Uncategorized"
      if (hiddenCategoryNames.has(key)) continue

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
  }, [filteredTxs, selectedTravelMemberId, hiddenCategoryTxIds, hiddenCategoryNames])

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

  // yAxisTicks — "nice" round values for the horizontal grid lines on Card ②.
  // Dynamically picks a step size so we get 2–5 lines that are easy to read
  // (e.g. 50, 100, 200, 500, 1000…).  The algorithm:
  //   1. Divide maxDayTotal by a target of ~4 ticks to get a raw step.
  //   2. Round that step up to the nearest "nice" number (1, 2, 5 × 10^n).
  //   3. Generate ticks from step up to maxDayTotal.
  const yAxisTicks = useMemo(() => {
    if (maxDayTotal <= 0) return []
    const TARGET_TICKS = 4
    const rawStep = maxDayTotal / TARGET_TICKS

    // Find the order of magnitude, then snap to 1/2/5 within it
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
    const residual = rawStep / magnitude
    let niceStep: number
    if (residual <= 1.5) niceStep = 1 * magnitude
    else if (residual <= 3.5) niceStep = 2 * magnitude
    else if (residual <= 7.5) niceStep = 5 * magnitude
    else niceStep = 10 * magnitude

    const ticks: number[] = []
    for (let v = niceStep; v <= maxDayTotal; v += niceStep) {
      ticks.push(v)
    }
    return ticks
  }, [maxDayTotal])

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
      const dayTxs = spendingTxs.filter((tx) => tx.date === dateStr && !hiddenTxIds.has(tx.txId))

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
  }, [recentDateStrings, spendingTxs, selectedTravelMemberId, hiddenTxIds])

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

  // recentXTicks — "nice" round values for the vertical grid lines on Card ③.
  // Same 1/2/5 algorithm as yAxisTicks but applied to horizontal bars.
  const recentXTicks = useMemo(() => {
    if (recentMaxTotal <= 0) return []
    const TARGET_TICKS = 4
    const rawStep = recentMaxTotal / TARGET_TICKS
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
    const residual = rawStep / magnitude
    let niceStep: number
    if (residual <= 1.5) niceStep = 1 * magnitude
    else if (residual <= 3.5) niceStep = 2 * magnitude
    else if (residual <= 7.5) niceStep = 5 * magnitude
    else niceStep = 10 * magnitude

    const ticks: number[] = []
    for (let v = niceStep; v <= recentMaxTotal; v += niceStep) {
      ticks.push(v)
    }
    return ticks
  }, [recentMaxTotal])

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

  // ---------------------------------------------------------------------------
  // Tapped day (Card ②) — transactions for the tapped day bar
  // ---------------------------------------------------------------------------

  // All transactions matching the tapped day (unfiltered — we show hidden ones
  // with reduced opacity, same pattern as Card ③).
  const tappedDayTxs = useMemo(() => {
    if (!tappedDayKey) return []
    return filteredTxs.filter((tx) => tx.date === tappedDayKey)
  }, [tappedDayKey, filteredTxs])

  // Total for the tapped day (including hidden txs, for the header display).
  const tappedDayTotal = useMemo(
    () => tappedDayTxs.reduce((sum, tx) => sum + tx.totalAmountMain, 0),
    [tappedDayTxs],
  )

  // tappedDayByCategory — transactions for the tapped day, grouped by category.
  // Each group has { categoryName, color, txs, total }. Sorted by total descending.
  const tappedDayByCategory = useMemo(() => {
    if (!tappedDayKey) return []
    const map = new Map<string, typeof tappedDayTxs>()
    for (const tx of tappedDayTxs) {
      const key = tx.category?.trim() || ''
      const arr = map.get(key) ?? []
      arr.push(tx)
      map.set(key, arr)
    }
    return Array.from(map.entries())
      .map(([name, txs]) => ({
        categoryName: name,
        color: categoryColor(name || 'Uncategorized'),
        txs,
        total: txs.reduce((sum, tx) => sum + tx.totalAmountMain, 0),
      }))
      .sort((a, b) => b.total - a.total)
  }, [tappedDayKey, tappedDayTxs])

  // ---------------------------------------------------------------------------
  // Tapped category (Card ④) — transactions for the tapped category
  // ---------------------------------------------------------------------------

  // All transactions matching the tapped category in the filtered period.
  const tappedCategoryTxs = useMemo(() => {
    if (tappedCategoryKey === null) return []
    return filteredTxs.filter(
      (tx) => (tx.category?.trim() || '') === tappedCategoryKey,
    )
  }, [tappedCategoryKey, filteredTxs])

  // Total for the tapped category (including hidden txs).
  const tappedCategoryTotal = useMemo(
    () => tappedCategoryTxs.reduce((sum, tx) => sum + tx.totalAmountMain, 0),
    [tappedCategoryTxs],
  )

  // Color for the tapped category in Card ④
  const tappedCategoryColor =
    tappedCategoryKey !== null
      ? categoryColor(tappedCategoryKey || 'Uncategorized')
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
            {/* Bar chart with Y-axis labels and dashed grid lines */}
            <div className="flex h-20">
              {/* Y-axis labels — narrow fixed-width column on the left */}
              <div className="relative mr-1.5 flex w-7 shrink-0 flex-col justify-between">
                {yAxisTicks.map((tick) => (
                  <span
                    key={tick}
                    className="absolute right-0 text-[10px] leading-none text-muted-foreground"
                    // Position from bottom: tick/max * 100%, nudged up by half line-height
                    style={{ bottom: `calc(${(tick / maxDayTotal) * 100}% - 5px)` }}
                  >
                    {tick >= 1000 ? `${Math.round(tick / 1000)}k` : Math.round(tick)}
                  </span>
                ))}
              </div>

              {/* Chart area — bars + horizontal grid lines */}
              <div className="relative flex-1">
                {/* Dashed horizontal grid lines (behind the bars via z-0) */}
                {yAxisTicks.map((tick) => (
                  <div
                    key={tick}
                    className="pointer-events-none absolute left-0 right-0 z-0 border-t border-dashed border-muted-foreground/20"
                    style={{ bottom: `${(tick / maxDayTotal) * 100}%` }}
                  />
                ))}

                {/* Bars — z-10 so they render above the grid lines */}
                <div className="relative z-10 flex h-full items-end gap-0.5">
                  {sortedDays.map(([dateStr, total]) => {
                    const heightPct = (total / maxDayTotal) * 100
                    const isTapped = tappedDayKey === dateStr
                    return (
                      <div
                        key={dateStr}
                        className="flex-1 cursor-pointer"
                        style={{ height: '100%', display: 'flex', alignItems: 'flex-end' }}
                        onClick={() =>
                          setTappedDayKey((prev) => (prev === dateStr ? null : dateStr))
                        }
                      >
                        <div
                          title={`${formatDayLabel(dateStr)}: ${formatAmount(total, mainCurrency)}`}
                          className={`w-full rounded-t transition-opacity ${
                            isTapped ? 'bg-primary' : 'bg-primary/70'
                          } ${tappedDayKey && !isTapped ? 'opacity-40' : ''}`}
                          style={{ height: `${heightPct}%`, minHeight: 2 }}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* X-axis labels: first, middle, last — offset to match chart area */}
            {(() => {
              const first  = sortedDays[0][0]
              const last   = sortedDays[sortedDays.length - 1][0]
              const midIdx = Math.floor(sortedDays.length / 2)
              const mid    = sortedDays[midIdx][0]
              return (
                <div className="ml-[1.875rem] mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>{formatDayLabel(first)}</span>
                  <span>{formatDayLabel(mid)}</span>
                  <span>{formatDayLabel(last)}</span>
                </div>
              )
            })()}

            {/* Tapped day info panel — transactions grouped by category */}
            {tappedDayKey && (
              <div className="mt-2 rounded-lg border bg-muted/30 px-3 py-2">
                {/* Day header row: date label + total */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {formatDayLabel(tappedDayKey)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatAmount(tappedDayTotal, mainCurrency)}
                    {' · '}{tappedDayTxs.length} tx{tappedDayTxs.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Category groups */}
                <div className="mt-1.5 flex flex-col gap-2 border-t pt-1.5">
                  {tappedDayByCategory.map((group) => {
                    // Check if entire category is hidden
                    const isCatHidden = hiddenSpendingCategories.has(group.categoryName)
                    return (
                      <div key={group.categoryName || '__uncategorized__'}>
                        {/* Category sub-header: dot, name, total, "Hide all" button */}
                        <div className={`flex items-center gap-2 ${isCatHidden ? 'opacity-40' : ''}`}>
                          <span
                            className="inline-block shrink-0 rounded-full"
                            style={{ width: 8, height: 8, backgroundColor: group.color }}
                          />
                          <span className="flex-1 text-xs font-medium text-foreground">
                            {group.categoryName || 'Uncategorized'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatAmount(group.total, mainCurrency)}
                          </span>
                          {/* Hide / show entire category */}
                          <button
                            type="button"
                            className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            title={isCatHidden ? 'Show this category' : 'Hide entire category from chart'}
                            onClick={() => {
                              setHiddenSpendingCategories((prev) => {
                                const next = new Set(prev)
                                if (isCatHidden) next.delete(group.categoryName)
                                else next.add(group.categoryName)
                                return next
                              })
                            }}
                          >
                            {isCatHidden ? '👁️ Show' : '👁️‍🗨️ Hide all'}
                          </button>
                        </div>

                        {/* Individual transactions in this category */}
                        <div className="ml-4 mt-1 flex flex-col gap-1">
                          {group.txs.map((tx) => {
                            const isHidden = hiddenSpendingTxIds.has(tx.txId) || isCatHidden
                            return (
                              <div
                                key={tx.txId}
                                className={`flex items-center gap-2 text-xs ${isHidden ? 'opacity-40' : ''}`}
                              >
                                <span className="min-w-0 flex-1 truncate text-foreground">{tx.name}</span>
                                {tx.currency !== mainCurrency && (
                                  <span className="shrink-0 text-muted-foreground">
                                    {formatAmount(tx.totalAmount, tx.currency)}
                                  </span>
                                )}
                                <span className="shrink-0 font-medium text-foreground">
                                  {formatAmount(tx.totalAmountMain, mainCurrency)}
                                </span>
                                {/* Edit button */}
                                <button
                                  type="button"
                                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                                  title="Edit this transaction"
                                  onClick={() => onEditTransaction(tx.txId)}
                                >
                                  ✏️
                                </button>
                                {/* Hide / show toggle for individual tx (disabled when category is hidden) */}
                                {!isCatHidden && (
                                  <button
                                    type="button"
                                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                                    title={hiddenSpendingTxIds.has(tx.txId) ? 'Show this transaction' : 'Hide this transaction'}
                                    onClick={() => {
                                      setHiddenSpendingTxIds((prev) => {
                                        const next = new Set(prev)
                                        if (prev.has(tx.txId)) next.delete(tx.txId)
                                        else next.add(tx.txId)
                                        return next
                                      })
                                    }}
                                  >
                                    {hiddenSpendingTxIds.has(tx.txId) ? '👁️' : '👁️‍🗨️'}
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Hidden items pills — click to re-show (categories + individual txs) */}
            {(hiddenSpendingCategories.size > 0 || hiddenSpendingTxIds.size > 0) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Hidden:</span>
                {/* Hidden category pills */}
                {Array.from(hiddenSpendingCategories).map((name) => (
                  <button
                    key={`spending-cat-${name}`}
                    type="button"
                    onClick={() => {
                      setHiddenSpendingCategories((prev) => {
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
                {Array.from(hiddenSpendingTxIds).map((txId) => {
                  const tx = filteredTxs.find((t) => t.txId === txId)
                  if (!tx) return null
                  return (
                    <button
                      key={`spending-tx-${txId}`}
                      type="button"
                      onClick={() => {
                        setHiddenSpendingTxIds((prev) => {
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

        {/* Day rows with vertical grid lines */}
        <div className="flex flex-col gap-2">
          {filteredRecentDaysData.map(({ dateStr, total, categories }) => (
            <div key={dateStr} className="flex items-center gap-2">
              {/* Date label — fixed width left column */}
              <span className="w-12 shrink-0 text-xs text-muted-foreground">
                {formatDayLabel(dateStr)}
              </span>

              {/* Bar area — relative container so vertical grid lines can be overlaid */}
              <div className="relative flex flex-1 items-center" style={{ minHeight: 14 }}>
                {/* Vertical dashed grid lines (behind bars via z-0) */}
                {recentXTicks.map((tick) => (
                  <div
                    key={tick}
                    className="pointer-events-none absolute top-0 bottom-0 z-0 border-l border-dashed border-muted-foreground/40"
                    style={{ left: `${(tick / recentMaxTotal) * 100}%` }}
                  />
                ))}

                {categories.length === 0 ? (
                  // No transactions this day — gray placeholder bar
                  <div className="relative z-10 flex items-center gap-2">
                    <div
                      style={{ width: 20, height: 14, borderRadius: 3, backgroundColor: '#d1d5db' }}
                    />
                    <span className="text-xs text-muted-foreground">No expenses</span>
                  </div>
                ) : (
                  // Overall bar width scales to recentMaxTotal (days with less spend = shorter bar).
                  // Each segment inside is proportional to its category amount within the day.
                  <div
                    className="relative z-10 flex overflow-hidden rounded"
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

          {/* X-axis tick labels — aligned with the bar area (skip date + total columns) */}
          {recentXTicks.length > 0 && (
            <div className="flex items-center gap-2">
              {/* Spacer matching date label width */}
              <span className="w-12 shrink-0" />
              {/* Tick labels positioned relative to bar area */}
              <div className="relative flex-1" style={{ height: 14 }}>
                {recentXTicks.map((tick) => (
                  <span
                    key={tick}
                    className="absolute text-[10px] leading-none text-muted-foreground"
                    // Center the label on the tick line
                    style={{
                      left: `${(tick / recentMaxTotal) * 100}%`,
                      transform: 'translateX(-50%)',
                    }}
                  >
                    {tick >= 1000 ? `${Math.round(tick / 1000)}k` : Math.round(tick)}
                  </span>
                ))}
              </div>
              {/* Spacer matching total column width */}
              <span className="w-16 shrink-0" />
            </div>
          )}
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
              <>
                <div className="flex flex-col gap-2">
                  {perCategoryTotals.map(({ name, total, color }) => {
                    const pct = grandTotal > 0 ? Math.round(total / grandTotal * 100) : 0
                    // Highlight the tapped category row
                    const isTapped = tappedCategoryKey === name
                    return (
                      <div
                        key={name || '__uncategorized__'}
                        // Clicking a category row toggles the transaction detail panel
                        className={`flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 transition-colors ${
                          isTapped ? 'bg-muted/60' : 'hover:bg-muted/30'
                        }`}
                        onClick={() =>
                          setTappedCategoryKey((prev) => (prev === name ? null : name))
                        }
                      >
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

                {/* Tapped category info panel — transaction list for the selected category */}
                {tappedCategoryKey !== null && (
                  <div className="mt-2 rounded-lg border bg-muted/30 px-3 py-2">
                    {/* Category header row: color dot, name, total, "Hide all" button */}
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block shrink-0 rounded-full"
                        style={{ width: 8, height: 8, backgroundColor: tappedCategoryColor }}
                      />
                      <span className="text-xs font-medium text-foreground">
                        {tappedCategoryKey || 'Uncategorized'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatAmount(tappedCategoryTotal, mainCurrency)}
                        {' · '}{tappedCategoryTxs.length} tx{tappedCategoryTxs.length !== 1 ? 's' : ''}
                      </span>
                      {/* "Hide all" — hides the entire category from the chart */}
                      <button
                        type="button"
                        className="ml-auto shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        title="Hide entire category from the chart"
                        onClick={(e) => {
                          e.stopPropagation()
                          setHiddenCategoryNames((prev) => new Set(prev).add(tappedCategoryKey))
                          setTappedCategoryKey(null)
                        }}
                      >
                        👁️‍🗨️ Hide all
                      </button>
                    </div>

                    {/* Individual transactions for this category */}
                    <div className="mt-1.5 flex flex-col gap-1 border-t pt-1.5">
                      {tappedCategoryTxs.map((tx) => {
                        const isHidden = hiddenCategoryTxIds.has(tx.txId)
                        return (
                          <div
                            key={tx.txId}
                            className={`flex items-center gap-2 text-xs ${isHidden ? 'opacity-40' : ''}`}
                          >
                            {/* Date label */}
                            <span className="shrink-0 text-muted-foreground">
                              {formatDayLabel(tx.date)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-foreground">{tx.name}</span>
                            {/* Amount in tx currency if different from main */}
                            {tx.currency !== mainCurrency && (
                              <span className="shrink-0 text-muted-foreground">
                                {formatAmount(tx.totalAmount, tx.currency)}
                              </span>
                            )}
                            {/* Amount in main currency */}
                            <span className="shrink-0 font-medium text-foreground">
                              {formatAmount(tx.totalAmountMain, mainCurrency)}
                            </span>
                            {/* Edit button */}
                            <button
                              type="button"
                              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                              title="Edit this transaction"
                              onClick={(e) => { e.stopPropagation(); onEditTransaction(tx.txId) }}
                            >
                              ✏️
                            </button>
                            {/* Hide / show toggle */}
                            <button
                              type="button"
                              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                              title={isHidden ? 'Show this transaction' : 'Hide this transaction'}
                              onClick={(e) => {
                                e.stopPropagation()
                                setHiddenCategoryTxIds((prev) => {
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

                {/* Hidden items pills — click to re-show (categories + individual txs) */}
                {(hiddenCategoryNames.size > 0 || hiddenCategoryTxIds.size > 0) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Hidden:</span>
                    {/* Hidden category name pills */}
                    {Array.from(hiddenCategoryNames).map((name) => (
                      <button
                        key={`catname-${name}`}
                        type="button"
                        onClick={() => {
                          setHiddenCategoryNames((prev) => {
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
                    {Array.from(hiddenCategoryTxIds).map((txId) => {
                      const tx = filteredTxs.find((t) => t.txId === txId)
                      if (!tx) return null
                      return (
                        <button
                          key={`cat-tx-${txId}`}
                          type="button"
                          onClick={() => {
                            setHiddenCategoryTxIds((prev) => {
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
              </>
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
      {/* Card — Wallet balances (always shown; empty state if no wallets) */}
      {/* ================================================================ */}
      <CollapsibleCard
        title="Wallet balances"
      >
        {walletBalances.length > 0 ? (
          <div className="flex flex-col gap-3">

            {/* (a) Horizontal carousel of wallet sub-cards */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
              {walletBalances.map((wb) => {
                const key = `${wb.paymentMethod}|${wb.currency}`
                const isSelected = selectedWalletKey === key
                // paymentMethodLabel is the stored string (e.g. "💳 Cash" or "Cash").
                // Extract leading emoji if present; otherwise fall back to 💸.
                const labelStr = wb.paymentMethodLabel
                const firstCp = labelStr.codePointAt(0) ?? 0
                const hasEmoji = firstCp > 0xff // non-Latin code point = emoji prefix
                const emoji = hasEmoji ? labelStr.split(' ')[0] : '💸'
                const label = hasEmoji ? labelStr.slice(labelStr.indexOf(' ') + 1) : labelStr
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedWalletKey(isSelected ? null : key)}
                    className={`
                      flex min-w-[120px] shrink-0 flex-col rounded-xl border px-3 py-2 text-left transition-all
                      ${isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border bg-muted/30 hover:bg-muted/50'}
                    `}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg leading-none">{emoji}</span>
                      <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
                    </div>
                    <span className={`mt-1 text-base font-bold ${
                      wb.remaining > 0 ? 'text-green-600 dark:text-green-400'
                        : wb.remaining < 0 ? 'text-red-600 dark:text-red-400'
                        : 'text-foreground'
                    }`}>
                      {formatAmount(wb.remaining, wb.currency)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{wb.currency} remaining</span>
                  </button>
                )
              })}
            </div>

            {/* (c) Drill-down detail when a wallet card is selected */}
            {selectedWalletDetail && (
              <div className="rounded-lg border bg-muted/20 px-3 py-2.5 space-y-2">
                {/* Summary stats */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">Total deposited: </span>
                    <span className="font-medium">{formatAmount(selectedWalletDetail.wb.deposited, selectedWalletDetail.wb.currency)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total spent: </span>
                    <span className="font-medium">{formatAmount(selectedWalletDetail.wb.spent, selectedWalletDetail.wb.currency)}</span>
                  </div>
                  {selectedWalletDetail.wb.adjustments !== 0 && (
                    <div>
                      <span className="text-muted-foreground">Adjustments: </span>
                      <span className="font-medium">
                        {selectedWalletDetail.wb.adjustments > 0 ? '+' : ''}{formatAmount(selectedWalletDetail.wb.adjustments, selectedWalletDetail.wb.currency)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Since last top-up section */}
                {selectedWalletDetail.lastTopup && (
                  <div className="border-t pt-2 space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Since last top-up</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div>
                        <span className="text-muted-foreground">Date: </span>
                        <span className="font-medium">{formatDayLabel(selectedWalletDetail.lastTopup.date)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Amount: </span>
                        <span className="font-medium">{formatAmount(selectedWalletDetail.lastTopupNetAmount, selectedWalletDetail.wb.currency)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Balance after: </span>
                        <span className="font-medium">{formatAmount(selectedWalletDetail.balanceAfterLastTopup, selectedWalletDetail.wb.currency)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Spent since: </span>
                        <span className="font-medium">{formatAmount(selectedWalletDetail.spentSinceLastTopup, selectedWalletDetail.wb.currency)}</span>
                      </div>
                    </div>
                    <div className="pt-1 text-xs">
                      <span className="text-muted-foreground">Est. remaining: </span>
                      <span className={`font-semibold ${
                        selectedWalletDetail.wb.remaining > 0 ? 'text-green-600 dark:text-green-400'
                          : selectedWalletDetail.wb.remaining < 0 ? 'text-red-600 dark:text-red-400'
                          : ''
                      }`}>
                        {formatAmount(selectedWalletDetail.wb.remaining, selectedWalletDetail.wb.currency)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pt-1.5">
                      <span className="text-[11px] text-muted-foreground">Not the amount you have?</span>
                      <button
                        type="button"
                        onClick={() => setReconcileBalance(selectedWalletDetail.wb)}
                        className="rounded-md border border-primary/30 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/5"
                      >
                        Reconcile with current amount
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* (b)/(d) Top-up list — all withdrawals or filtered by selected wallet */}
            {(() => {
              const displayedWithdrawals = selectedWalletDetail
                ? selectedWalletDetail.walletWithdrawals
                : withdrawalTxs

              if (displayedWithdrawals.length === 0) {
                return (
                  <p className="py-1 text-center text-xs text-muted-foreground">
                    No top-ups recorded yet.
                  </p>
                )
              }

              return (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    {selectedWalletDetail ? 'Top-ups' : 'All top-ups'}
                  </div>
                  <div className="max-h-[200px] space-y-1 overflow-y-auto">
                    {displayedWithdrawals.map(tx => {
                      // tx.paymentMethod is the stored string (e.g. "💳 Cash")
                      const pmStr = tx.paymentMethod ?? ''
                      const pmCp = pmStr.codePointAt(0) ?? 0
                      const emoji = pmCp > 0xff ? pmStr.split(' ')[0] : '🏧'
                      const paid = tx.paidBy.find(s => s.travelMemberId === currentTravelMemberId)?.amount ?? 0
                      return (
                        <div
                          key={tx.txId}
                          className="flex items-center justify-between rounded-md bg-muted/30 px-2 py-1.5 text-xs"
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span>{emoji}</span>
                            <span className="text-muted-foreground">{formatDayLabel(tx.date)}</span>
                            <span className="truncate font-medium">{tx.name}</span>
                          </div>
                          <div className="ml-2 shrink-0 text-right">
                            <span className="font-medium text-green-600 dark:text-green-400">
                              +{formatAmount(paid, tx.currency)}
                            </span>
                            {tx.fees != null && tx.fees > 0 && (
                              <div className="text-[10px] text-muted-foreground">
                                fees: {formatAmount(tx.fees, tx.currency)}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

          </div>
        ) : (
          <p className="py-2 text-center text-sm text-muted-foreground">
            Record a withdrawal to start tracking a payment method balance.
          </p>
        )}
        {/* (e) Record withdrawal button */}
        {onAddWithdrawal && (
          <button
            type="button"
            onClick={onAddWithdrawal}
            className="mt-2 w-full rounded-lg border border-dashed border-primary/30 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
          >
            + Record withdrawal
          </button>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Only your wallet balances are shown. Withdrawal data is stored alongside shared transactions.
        </p>
      </CollapsibleCard>

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
      {/* Reconciliation dialog                                             */}
      {/* ================================================================ */}
      {reconcileBalance && (
        <ReconciliationDialog
          open={!!reconcileBalance}
          onOpenChange={(open) => { if (!open) setReconcileBalance(null) }}
          travelId={travel.travelId}
          balance={reconcileBalance}
          currentTravelMemberId={currentTravelMemberId}
          onSuccess={() => setReconcileBalance(null)}
        />
      )}

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
