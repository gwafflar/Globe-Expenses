// DashboardTab.tsx — read-only analytics view for a space.
//
// All statistics are computed client-side from the `transactions` array that is
// already loaded in memory by SpaceDetailPage. No Firestore queries here.
//
// ── Space refactor Phase 7a ────────────────────────────────────────────────
// Every card now reads ONE scoped list (see spaces/utils/dashboardScope.ts):
//
//   transactions → scope (global date range, spending only)
//                → attribute (all members, or one member's share)
//                → ScopedTransaction[] → per card: group → sort → top-N
//
// Before this phase each card applied its own period and member scoping, so two
// cards could silently show different windows. The controls at the top are now
// the only place scoping happens.
//
// Layout (top to bottom):
//   1. Controls bar — date range + member scope
//   2. Hero card — total spend, avg/day, your share, tx count
//   3. Spending over time — day-by-day bar chart
//   4. Day by day — per-day category breakdown
//   5. Breakdown cards — generic, user-configurable (§4)
//   6. Per person — per-member consumed/paid (hidden when isSolo)
//   7. Wallet balances — gated on features.wallets
//   8. Currencies — gated on features.multiCurrency

import { useMemo, useState } from 'react'
import type { DashboardCardDef, Space } from '@/spaces/types'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import { getSpaceConfig } from '@/spaces/config'
import { updateSpaceDashboardCards } from '@/spaces/services/spaceService'
import { CollapsibleCard } from '@/spaces/components/CollapsibleCard'
import {
  normalizeTransactionSplits,
  getTripDurationDays,
  computeMemberStats,
  categoryColor,
  CATEGORY_PALETTE,
  formatAmount,
  formatDayLabel,
  parseTxDate,
} from './dashboardHelpers'
import {
  countsAsSpending,
  computeWalletBalances,
  isWithdrawal,
  isAdjustment,
  type WalletBalance,
} from '@/transactions/utils/walletHelpers'
import { ReconciliationDialog } from '@/transactions/components/ReconciliationDialog'
import { DashboardControls } from '@/spaces/components/dashboard/DashboardControls'
import { BreakdownCard } from '@/spaces/components/dashboard/BreakdownCard'
import { PivotCard } from '@/spaces/components/dashboard/PivotCard'
import { CardBuilder } from '@/spaces/components/dashboard/CardBuilder'
import {
  breakdownDimensions,
  resolveDashboardCards,
  usedCardKeys,
  visibleDashboardCards,
} from '@/spaces/utils/dashboardCards'
import {
  ALL_MEMBERS,
  defaultRangePreset,
  scopeTransactions,
  scopedTotal,
  type ScopeMode,
  type ScopedTransaction,
} from '@/spaces/utils/dashboardScope'
import {
  rangeDayCount,
  rangeLabel,
  resolveRange,
  type DateRange,
} from '@/shared/utils/dateRange'
import type { FilterRequest, FilterSelection } from '@/transactions/utils/filterDimensions'
import { useT } from '@/i18n'

/** Colour-hash key for transactions with no category. Deliberately NOT
 *  translated: it only feeds categoryColor(), and a translated key would give
 *  the bucket a different colour in each language. The DISPLAYED text is
 *  t.dashboard.tab.uncategorized. */
const UNCATEGORIZED_COLOR_KEY = 'Uncategorized'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DashboardTabProps {
  space: Space
  transactions: TransactionWithStatus[]
  currentUserUid: string
  isSolo: boolean
  mainCurrency: string
  onEditTransaction: (txId: string) => void
  onAddWithdrawal?: () => void
  /** Keeps SpaceDetailPage's local Space in sync after a card edit is written. */
  onSpaceChange?: (updated: Partial<Space>) => void
  /** Tapping a breakdown row opens the Transactions tab with filters applied. */
  onDrillDown?: (request: Omit<FilterRequest, 'nonce'>) => void
}

/** How many day rows the "Day by day" card shows before the "show all" link. */
const DAY_ROWS_LIMIT = 15

// ---------------------------------------------------------------------------
// Small reusable sub-components (local to this file)
// ---------------------------------------------------------------------------

/**
 * MemberAvatar — a small circle showing a member's initial, coloured by their
 * index in the space.members array using CATEGORY_PALETTE.
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

/** A tiny square icon button used for the card edit affordances. */
function CardActionButton({
  label,
  glyph,
  onClick,
  disabled,
}: {
  label: string
  glyph: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded p-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
    >
      {glyph}
    </button>
  )
}

// ---------------------------------------------------------------------------
// DashboardTab
// ---------------------------------------------------------------------------

export function DashboardTab({
  space,
  transactions,
  currentUserUid,
  isSolo,
  mainCurrency,
  onEditTransaction,
  onAddWithdrawal,
  onSpaceChange,
  onDrillDown,
}: DashboardTabProps) {
  // translation hook — re-renders when the language changes
  const t = useT()
  // Shorthand for this tab's own messages.
  const tt = t.dashboard.tab

  // Resolved once and passed down. Legacy spaces (no space.config) resolve to
  // full travel-mode defaults, so every gate below is `true` and the dashboard
  // shows what it always showed.
  const config = useMemo(() => getSpaceConfig(space), [space])

  // ---------------------------------------------------------------------------
  // Global controls (§2) — deliberately NOT persisted
  // ---------------------------------------------------------------------------

  // A stored range goes stale the moment the calendar moves on, so the range
  // resets to the space's default on every visit. The default is derived from
  // config (trip-shaped → all time, budget-shaped → this month), never from
  // presetOrigin — SPEC §8 invariant 4.
  const [range, setRange] = useState<DateRange>(() => resolveRange(defaultRangePreset(config)))

  // ALL_MEMBERS by default; the picker itself is hidden in a one-member space,
  // where every selection produces identical numbers.
  const [mode, setMode] = useState<ScopeMode>(ALL_MEMBERS)

  // ---------------------------------------------------------------------------
  // Other UI state
  // ---------------------------------------------------------------------------

  // hiddenTxIds / hiddenCategories — exclusions for the "Day by day" chart, so a
  // single outlier doesn't squash the scale for every other bar.
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set())
  const [hiddenTxIds, setHiddenTxIds] = useState<Set<string>>(new Set())

  // tappedSegmentKey — which (category, day) segment is expanded. null = closed.
  const [tappedSegmentKey, setTappedSegmentKey] = useState<{
    categoryName: string
    dateStr: string
  } | null>(null)

  // tappedDayKey — which day bar is expanded in "Spending over time".
  const [tappedDayKey, setTappedDayKey] = useState<string | null>(null)

  // Exclusions for the "Spending over time" chart (independent of the above).
  const [hiddenSpendingTxIds, setHiddenSpendingTxIds] = useState<Set<string>>(new Set())
  const [hiddenSpendingCategories, setHiddenSpendingCategories] = useState<Set<string>>(new Set())

  // Whether the "Day by day" card is showing every day or just the first page.
  const [showAllDays, setShowAllDays] = useState(false)

  // reconcileBalance — the wallet balance being reconciled (null = dialog closed).
  const [reconcileBalance, setReconcileBalance] = useState<WalletBalance | null>(null)

  // selectedWalletKey — "paymentMethodId|currency", or null for "show all".
  const [selectedWalletKey, setSelectedWalletKey] = useState<string | null>(null)

  // Card management (§6): the builder dialog, and whether the per-card
  // edit/reorder/delete affordances are revealed.
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<DashboardCardDef | undefined>(undefined)
  // Bumped on each open so CardBuilder remounts with fresh draft state.
  const [builderKey, setBuilderKey] = useState(0)
  const [cardsEditMode, setCardsEditMode] = useState(false)

  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  // The prop gives us a Firebase Auth UID. Split[] is keyed by travelMemberId,
  // so resolve the current user's member slot once.
  const currentMember = space.members.find((m) => m.userId === currentUserUid)
  const currentTravelMemberId = currentMember?.travelMemberId ?? ''

  // A selected member can disappear underneath us — another member removing
  // them, or an edit arriving over the onSnapshot listener. Fall back to
  // ALL_MEMBERS rather than silently showing zeroes for a member who is gone.
  // Adjust-state-during-render (identity-guarded, converges in one extra pass),
  // same pattern as the filter hook's reconciliation.
  const selectedMemberExists =
    mode === ALL_MEMBERS || space.members.some((m) => m.travelMemberId === mode)
  if (!selectedMemberExists) setMode(ALL_MEMBERS)
  const effectiveMode: ScopeMode = selectedMemberExists ? mode : ALL_MEMBERS

  // The member whose share is being shown, or null for ALL_MEMBERS. Drives the
  // hero heading only — the pipeline needs nothing but the id.
  const scopedMember =
    effectiveMode === ALL_MEMBERS
      ? null
      : (space.members.find((m) => m.travelMemberId === effectiveMode) ?? null)

  // ---------------------------------------------------------------------------
  // The scoped pipeline (§1)
  // ---------------------------------------------------------------------------

  // normalizedTxs — splits remapped from the legacy 'uid' field to
  // 'travelMemberId'. Pre-Session-009 transactions stored { uid, amount }.
  // Without this, every per-member computation would see undefined ids.
  const normalizedTxs = useMemo(
    () => normalizeTransactionSplits(transactions, space.members),
    [transactions, space.members],
  )

  // THE one resolution step. Every card below reads this and nothing else.
  const scoped = useMemo(
    () => scopeTransactions(normalizedTxs, { range, mode: effectiveMode, mainCurrency }),
    [normalizedTxs, range, effectiveMode, mainCurrency],
  )

  // The underlying documents, for the cards that need more than an amount
  // (per-member stats, transaction lists, edit links).
  const scopedTxs = useMemo(() => scoped.map((s) => s.transaction), [scoped])

  const totalSpent = useMemo(() => scopedTotal(scoped), [scoped])

  // tripDurationDays — the span of the data, used as the divisor for "avg/day"
  // when the range is unbounded (an "all time" range has no intrinsic length).
  const tripDurationDays = useMemo(
    () => getTripDurationDays(space, normalizedTxs),
    [space, normalizedTxs],
  )
  const nDaysInRange = rangeDayCount(range, tripDurationDays)
  const avgPerDay = nDaysInRange > 0 ? totalSpent / nDaysInRange : 0

  // Your consumed/paid within the range. Independent of the member selection:
  // this box always answers "what about me", which is what it did before.
  const focusStats = useMemo(
    () => computeMemberStats(scopedTxs, currentTravelMemberId),
    [scopedTxs, currentTravelMemberId],
  )

  // ---------------------------------------------------------------------------
  // Card gating (§3)
  // ---------------------------------------------------------------------------

  const showCategory = config.builtInFields.category
  const showWallets = config.features.wallets
  const showCurrencies = config.features.multiCurrency

  // Dimensions a breakdown card may be built on, and the cards themselves.
  const dimensions = useMemo(() => breakdownDimensions(space, config), [space, config])
  const storedCards = useMemo(() => resolveDashboardCards(config), [config])
  // A card whose dimension is disabled is HIDDEN, not deleted — it comes back
  // intact when the field is re-enabled.
  const visibleCards = useMemo(
    () => visibleDashboardCards(storedCards, dimensions),
    [storedCards, dimensions],
  )

  // ---------------------------------------------------------------------------
  // Card persistence (§6)
  // ---------------------------------------------------------------------------

  /** Write the card list to Firestore (fire-and-forget) and mirror it into the
   *  local Space so the dashboard updates without waiting for the round-trip.
   *  The FIRST edit materialises the array — until then the space has no
   *  `dashboardCards` key and resolves to the legacy default set. */
  function persistCards(next: DashboardCardDef[]) {
    updateSpaceDashboardCards(space.spaceId, next)
    onSpaceChange?.({ config: { ...config, dashboardCards: next } })
  }

  function handleSaveCard(card: DashboardCardDef) {
    const exists = storedCards.some((c) => c.id === card.id)
    persistCards(exists ? storedCards.map((c) => (c.id === card.id ? card : c)) : [...storedCards, card])
  }

  /** Deletion needs no confirmation — a card holds no data. */
  function handleDeleteCard(cardId: string) {
    persistCards(storedCards.filter((c) => c.id !== cardId))
  }

  /** Move a card one position up (-1) or down (+1) in the stored order.
   *  Reordering operates on the STORED list, not the visible one, so a hidden
   *  card keeps its place relative to its neighbours. */
  function handleMoveCard(cardId: string, delta: -1 | 1) {
    const idx = storedCards.findIndex((c) => c.id === cardId)
    const target = idx + delta
    if (idx < 0 || target < 0 || target >= storedCards.length) return
    const next = [...storedCards]
    const [moved] = next.splice(idx, 1)
    next.splice(target, 0, moved)
    persistCards(next)
  }

  function openBuilder(card?: DashboardCardDef) {
    setEditingCard(card)
    setBuilderKey((k) => k + 1)
    setBuilderOpen(true)
  }

  /** Tapping a breakdown row → Transactions tab, filtered.
   *
   *  The date range travels with it: without it the drilled list would not sum
   *  to the number the user tapped.
   *
   *  ⚠️ The member selection deliberately does NOT travel with it, even when a
   *  member is selected. This asymmetry is intentional, not an omission: the
   *  transactions list has its own Paid-by / For filters, and a row tapped
   *  under "Marie" should show every transaction behind that number — Marie's
   *  share of a group dinner is not a transaction of its own, so pre-filtering
   *  to her would hide the very rows the figure came from.
   *
   *  Phase 7b: `selections` carries ONE entry for a 1D row, TWO for a pivot
   *  cell (primary AND secondary). They are ANDed by the filter hook. */
  function handleRowDrillDown(selections: FilterSelection[]) {
    // `spendingOnly` mirrors what scopeTransactions() already applied to build
    // the number that was tapped: withdrawals, transfers and balance-only
    // adjustments are not spending and were never in the card. Without it the
    // drilled list showed rows the card had excluded — and every one of them
    // landed under "No <dimension>", since a withdrawal carries no category.
    onDrillDown?.({ selections, range, spendingOnly: true })
  }

  // ---------------------------------------------------------------------------
  // Wallet data (NOT range-scoped — a wallet balance is cumulative)
  // ---------------------------------------------------------------------------

  const pmLabelMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const pm of space.paymentMethods ?? []) {
      m.set(pm.id, pm.emoji ? `${pm.emoji} ${pm.label}` : pm.label)
    }
    return m
  }, [space.paymentMethods])

  const walletBalances = useMemo(
    () => computeWalletBalances(normalizedTxs, currentTravelMemberId, pmLabelMap),
    [normalizedTxs, currentTravelMemberId, pmLabelMap],
  )

  const walletEventTxs = useMemo(() => {
    return normalizedTxs
      .filter(tx => (isWithdrawal(tx) || isAdjustment(tx)) && tx.paidBy.some(s => s.travelMemberId === currentTravelMemberId))
      .sort((a, b) => parseTxDate(b.date).getTime() - parseTxDate(a.date).getTime())
  }, [normalizedTxs, currentTravelMemberId])

  const selectedWalletDetail = useMemo(() => {
    if (!selectedWalletKey) return null
    const [pm, currency] = selectedWalletKey.split('|')
    const wb = walletBalances.find(w => w.paymentMethod === pm && w.currency === currency)
    if (!wb) return null

    const walletEvents = walletEventTxs.filter(
      tx => tx.paymentMethod === pm && tx.currency === currency,
    )

    const lastTopup = walletEvents.find(tx => isWithdrawal(tx))
    if (!lastTopup) {
      return { wb, walletEvents, lastTopup: null, lastTopupNetAmount: 0, spentSinceLastTopup: 0, balanceAfterLastTopup: wb.remaining }
    }

    const lastTopupDate = parseTxDate(lastTopup.date)
    const lastTopupNetAmount = (lastTopup.paidBy.find(s => s.travelMemberId === currentTravelMemberId)?.amount ?? 0) - (lastTopup.fees ?? 0)

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
      walletEvents,
      lastTopup,
      lastTopupNetAmount: Math.round(lastTopupNetAmount * 100) / 100,
      spentSinceLastTopup,
      balanceAfterLastTopup: Math.round((wb.remaining + spentSinceLastTopup) * 100) / 100,
    }
  }, [selectedWalletKey, walletBalances, walletEventTxs, normalizedTxs, currentTravelMemberId])

  const walletSpendingGaps = useMemo(() => {
    const gaps = new Map<number, { fromDate: string; toDate: string; amount: number }>()
    if (!selectedWalletDetail) return gaps

    const [pm, currency] = selectedWalletKey!.split('|')
    const events = selectedWalletDetail.walletEvents

    const walletSpendingTxs = normalizedTxs.filter(tx => {
      if (tx.paymentMethod !== pm || tx.currency !== currency) return false
      if (!countsAsSpending(tx)) return false
      return (tx.paidBy.find(s => s.travelMemberId === currentTravelMemberId)?.amount ?? 0) > 0
    })

    for (let i = 0; i < events.length - 1; i++) {
      const newerDate = parseTxDate(events[i].date)
      const olderDate = parseTxDate(events[i + 1].date)

      let total = 0
      for (const tx of walletSpendingTxs) {
        const txDate = parseTxDate(tx.date)
        if (txDate.getTime() > olderDate.getTime() && txDate.getTime() < newerDate.getTime()) {
          total += tx.paidBy.find(s => s.travelMemberId === currentTravelMemberId)?.amount ?? 0
        }
      }

      gaps.set(i, {
        fromDate: events[i + 1].date,
        toDate: events[i].date,
        amount: Math.round(total * 100) / 100,
      })
    }

    return gaps
  }, [selectedWalletDetail, selectedWalletKey, normalizedTxs, currentTravelMemberId])

  // ---------------------------------------------------------------------------
  // Spending over time (Card ②)
  // ---------------------------------------------------------------------------

  /** The category bucket a transaction belongs to, or '' when the space does
   *  not track categories. Gating here is what stops a category-less space
   *  degrading into a single "Uncategorized" bucket. */
  function categoryKey(tx: { category?: string }): string {
    return showCategory ? (tx.category?.trim() || '') : ''
  }

  const perDayTotals = useMemo(() => {
    const map = new Map<string, number>()
    for (const { transaction, attributedAmount } of scoped) {
      if (hiddenSpendingTxIds.has(transaction.txId)) continue
      if (showCategory && hiddenSpendingCategories.has(transaction.category?.trim() || '')) continue
      map.set(transaction.date, (map.get(transaction.date) ?? 0) + attributedAmount)
    }
    return map
  }, [scoped, hiddenSpendingTxIds, hiddenSpendingCategories, showCategory])

  const sortedDays = useMemo(() => {
    // Ascending for the bar chart (oldest left, newest right).
    return Array.from(perDayTotals.entries()).sort(
      (a, b) => parseTxDate(a[0]).getTime() - parseTxDate(b[0]).getTime(),
    )
  }, [perDayTotals])

  const maxDayTotal = useMemo(
    () => Math.max(...sortedDays.map(([, v]) => v), 1),
    [sortedDays],
  )

  const yAxisTicks = useMemo(() => niceTicks(maxDayTotal), [maxDayTotal])

  // Transactions behind the tapped day bar, grouped by category.
  const tappedDayScoped = useMemo(() => {
    if (!tappedDayKey) return []
    return scoped.filter((s) => s.transaction.date === tappedDayKey)
  }, [tappedDayKey, scoped])

  const tappedDayTotal = useMemo(
    () => scopedTotal(tappedDayScoped),
    [tappedDayScoped],
  )

  const tappedDayByCategory = useMemo(() => {
    if (!tappedDayKey) return []
    const map = new Map<string, ScopedTransaction<TransactionWithStatus>[]>()
    for (const s of tappedDayScoped) {
      const key = categoryKey(s.transaction)
      const arr = map.get(key) ?? []
      arr.push(s)
      map.set(key, arr)
    }
    return Array.from(map.entries())
      .map(([name, items]) => ({
        categoryName: name,
        color: showCategory ? categoryColor(name || UNCATEGORIZED_COLOR_KEY) : CATEGORY_PALETTE[0],
        items,
        total: scopedTotal(items),
      }))
      .sort((a, b) => b.total - a.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tappedDayKey, tappedDayScoped, showCategory])

  // ---------------------------------------------------------------------------
  // Day by day (Card ③)
  // ---------------------------------------------------------------------------
  //
  // ⚠️ Phase 7a: this card used to own its own look-back window (a "3 / 7 / 15
  // days" pill row). That per-card period is gone — the card now shows the
  // days inside the GLOBAL range, newest first, capped at DAY_ROWS_LIMIT rows.

  const dayRows = useMemo(() => {
    const byDate = new Map<string, ScopedTransaction<TransactionWithStatus>[]>()
    for (const s of scoped) {
      const arr = byDate.get(s.transaction.date) ?? []
      arr.push(s)
      byDate.set(s.transaction.date, arr)
    }

    return Array.from(byDate.entries())
      .sort((a, b) => parseTxDate(b[0]).getTime() - parseTxDate(a[0]).getTime())
      .map(([dateStr, items]) => {
        const catMap = new Map<string, number>()
        let total = 0
        for (const { transaction, attributedAmount } of items) {
          if (hiddenTxIds.has(transaction.txId)) continue
          const key = categoryKey(transaction)
          catMap.set(key, (catMap.get(key) ?? 0) + attributedAmount)
          total += attributedAmount
        }
        const categories = Array.from(catMap.entries())
          .map(([name, amount]) => ({
            name,
            amount,
            color: showCategory ? categoryColor(name || UNCATEGORIZED_COLOR_KEY) : CATEGORY_PALETTE[0],
          }))
          .sort((a, b) => b.amount - a.amount)
        return { dateStr, total, categories }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, hiddenTxIds, showCategory])

  // Apply the hidden-category exclusions and rescale.
  const filteredDayRows = useMemo(() => {
    if (hiddenCategories.size === 0) return dayRows
    return dayRows.map((day) => {
      const cats = day.categories.filter((c) => !hiddenCategories.has(c.name))
      return { ...day, total: cats.reduce((sum, c) => sum + c.amount, 0), categories: cats }
    })
  }, [dayRows, hiddenCategories])

  const shownDayRows = showAllDays ? filteredDayRows : filteredDayRows.slice(0, DAY_ROWS_LIMIT)

  const dayMaxTotal = useMemo(
    () => Math.max(...shownDayRows.map((d) => d.total), 1),
    [shownDayRows],
  )

  const dayXTicks = useMemo(() => niceTicks(dayMaxTotal), [dayMaxTotal])

  // Transactions behind the tapped (category, day) segment.
  const tappedSegmentScoped = useMemo(() => {
    if (!tappedSegmentKey) return []
    return scoped.filter(
      (s) =>
        s.transaction.date === tappedSegmentKey.dateStr &&
        categoryKey(s.transaction) === tappedSegmentKey.categoryName,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tappedSegmentKey, scoped, showCategory])

  const tappedSegmentTotal = useMemo(
    () => scopedTotal(tappedSegmentScoped),
    [tappedSegmentScoped],
  )

  const tappedSegmentColor = tappedSegmentKey && showCategory
    ? categoryColor(tappedSegmentKey.categoryName || UNCATEGORIZED_COLOR_KEY)
    : CATEGORY_PALETTE[0]

  // ---------------------------------------------------------------------------
  // Per person (Card ⑤)
  // ---------------------------------------------------------------------------

  const perMemberStats = useMemo(() => {
    const stats = space.members.map((member, idx) => ({
      member,
      memberIndex: idx,
      ...computeMemberStats(scopedTxs, member.travelMemberId),
    }))

    return stats.sort((a, b) => {
      const aIsCurrent = a.member.userId === currentUserUid
      const bIsCurrent = b.member.userId === currentUserUid
      if (aIsCurrent && !bIsCurrent) return -1
      if (bIsCurrent && !aIsCurrent) return 1
      return b.consumed - a.consumed
    })
  }, [scopedTxs, space.members, currentUserUid])

  // ---------------------------------------------------------------------------
  // Currencies (Card ⑥)
  // ---------------------------------------------------------------------------

  const currenciesData = useMemo(() => {
    const map = new Map<string, number>()
    for (const { transaction, attributedAmount } of scoped) {
      map.set(transaction.currency, (map.get(transaction.currency) ?? 0) + attributedAmount)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [scoped])

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-3 pb-6">

      {/* ================================================================ */}
      {/* Global controls (§2)                                             */}
      {/* ================================================================ */}
      <DashboardControls
        range={range}
        onRangeChange={setRange}
        mode={effectiveMode}
        onModeChange={setMode}
        members={space.members}
        currentMemberId={currentTravelMemberId}
        isSolo={isSolo}
      />

      {/* ================================================================ */}
      {/* Card ① — Hero (not collapsible)                                  */}
      {/* ================================================================ */}
      <div className="rounded-xl border bg-card px-4 py-4 shadow-sm">
        <div className="mb-1 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {scopedMember === null
            ? tt.totalSpent
            : scopedMember.travelMemberId === currentTravelMemberId
              ? tt.yourShare
              : tt.memberShare({ name: scopedMember.displayName })}
        </div>
        <div className="mb-1 text-center text-3xl font-bold text-foreground">
          {formatAmount(totalSpent, mainCurrency)}
        </div>

        <div className="mb-4 text-center text-xs text-muted-foreground">
          {tt.txCountInRange({ count: scoped.length, range: rangeLabel(range) })}
        </div>

        <div className={`grid gap-2 ${isSolo ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center">
            <div className="text-xs text-muted-foreground">{tt.avgPerDay}</div>
            <div className="mt-0.5 text-sm font-semibold">
              {formatAmount(avgPerDay, mainCurrency)}
            </div>
          </div>

          {/* Your own consumed/paid — always about you, regardless of You/All. */}
          {!isSolo && (
            <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-center">
              <div className="truncate text-xs text-primary">
                {tt.nameYou({ name: currentMember?.displayName ?? tt.you })}
              </div>
              <div className="mt-0.5 text-sm font-semibold text-foreground">
                {formatAmount(focusStats.consumed, mainCurrency)}
              </div>
              <div className="text-xs text-muted-foreground">
                {tt.paidColon({ amount: formatAmount(focusStats.paid, mainCurrency) })}
              </div>
            </div>
          )}

          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center">
            <div className="text-xs text-muted-foreground">{tt.transactions}</div>
            <div className="mt-0.5 text-sm font-semibold">{scoped.length}</div>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* Card ② — Spending over time                                       */}
      {/* ================================================================ */}
      <CollapsibleCard
        title={tt.spendingOverTime}
        summary={formatAmount(totalSpent, mainCurrency)}
      >
        {sortedDays.length < 2 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {tt.notEnoughData}
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
                    style={{ bottom: `calc(${(tick / maxDayTotal) * 100}% - 5px)` }}
                  >
                    {tick >= 1000 ? `${Math.round(tick / 1000)}k` : Math.round(tick)}
                  </span>
                ))}
              </div>

              <div className="relative flex-1">
                {yAxisTicks.map((tick) => (
                  <div
                    key={tick}
                    className="pointer-events-none absolute left-0 right-0 z-0 border-t border-dashed border-muted-foreground/20"
                    style={{ bottom: `${(tick / maxDayTotal) * 100}%` }}
                  />
                ))}

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
                          title={tt.labelValue({
                            label: formatDayLabel(dateStr),
                            value: formatAmount(total, mainCurrency),
                          })}
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
              const first = sortedDays[0][0]
              const last = sortedDays[sortedDays.length - 1][0]
              const mid = sortedDays[Math.floor(sortedDays.length / 2)][0]
              return (
                <div className="ml-[1.875rem] mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>{formatDayLabel(first)}</span>
                  <span>{formatDayLabel(mid)}</span>
                  <span>{formatDayLabel(last)}</span>
                </div>
              )
            })()}

            {/* Tapped day info panel */}
            {tappedDayKey && (
              <div className="mt-2 rounded-lg border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {formatDayLabel(tappedDayKey)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatAmount(tappedDayTotal, mainCurrency)}
                    {' · '}{tt.txCountShort(tappedDayScoped.length)}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-col gap-2 border-t pt-1.5">
                  {tappedDayByCategory.map((group) => {
                    const isCatHidden = hiddenSpendingCategories.has(group.categoryName)
                    return (
                      <div key={group.categoryName || '__uncategorized__'}>
                        {/* Category sub-header — only when the space tracks categories */}
                        {showCategory && (
                          <div className={`flex items-center gap-2 ${isCatHidden ? 'opacity-40' : ''}`}>
                            <span
                              className="inline-block shrink-0 rounded-full"
                              style={{ width: 8, height: 8, backgroundColor: group.color }}
                            />
                            <span className="flex-1 text-xs font-medium text-foreground">
                              {group.categoryName || tt.uncategorized}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatAmount(group.total, mainCurrency)}
                            </span>
                            <button
                              type="button"
                              className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              title={isCatHidden ? tt.showCategory : tt.hideCategoryFromChart}
                              onClick={() => {
                                setHiddenSpendingCategories((prev) => {
                                  const next = new Set(prev)
                                  if (isCatHidden) next.delete(group.categoryName)
                                  else next.add(group.categoryName)
                                  return next
                                })
                              }}
                            >
                              {isCatHidden ? tt.showPill : tt.hideAllPill}
                            </button>
                          </div>
                        )}

                        <div className={`${showCategory ? 'ml-4 mt-1' : ''} flex flex-col gap-1`}>
                          {group.items.map(({ transaction: tx, attributedAmount }) => {
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
                                  {formatAmount(attributedAmount, mainCurrency)}
                                </span>
                                <button
                                  type="button"
                                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                                  title={tt.editTransaction}
                                  onClick={() => onEditTransaction(tx.txId)}
                                >
                                  ✏️
                                </button>
                                {!isCatHidden && (
                                  <button
                                    type="button"
                                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                                    title={hiddenSpendingTxIds.has(tx.txId) ? tt.showTransaction : tt.hideTransaction}
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

            {/* Hidden items pills — click to re-show */}
            {(hiddenSpendingCategories.size > 0 || hiddenSpendingTxIds.size > 0) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{tt.hidden}</span>
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
                      style={{ width: 6, height: 6, backgroundColor: categoryColor(name || UNCATEGORIZED_COLOR_KEY) }}
                    />
                    {name || tt.uncategorized}
                    <span className="text-[10px]">👁️</span>
                  </button>
                ))}
                {Array.from(hiddenSpendingTxIds).map((txId) => {
                  const tx = scopedTxs.find((t) => t.txId === txId)
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
      {/* Card ③ — Day by day                                              */}
      {/* ================================================================ */}
      <CollapsibleCard
        title={tt.dayByDay}
        summary={tt.dayCount(filteredDayRows.length)}
      >
        {shownDayRows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{tt.noExpensesInRange}</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {shownDayRows.map(({ dateStr, total, categories }) => (
                <div key={dateStr} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-xs text-muted-foreground">
                    {formatDayLabel(dateStr)}
                  </span>

                  <div className="relative flex flex-1 items-center" style={{ minHeight: 14 }}>
                    {dayXTicks.map((tick) => (
                      <div
                        key={tick}
                        className="pointer-events-none absolute top-0 bottom-0 z-0 border-l border-dashed border-muted-foreground/40"
                        style={{ left: `${(tick / dayMaxTotal) * 100}%` }}
                      />
                    ))}

                    {categories.length === 0 ? (
                      <div className="relative z-10 flex items-center gap-2">
                        <div style={{ width: 20, height: 14, borderRadius: 3, backgroundColor: '#d1d5db' }} />
                        <span className="text-xs text-muted-foreground">{tt.noExpenses}</span>
                      </div>
                    ) : (
                      <div
                        className="relative z-10 flex overflow-hidden rounded"
                        style={{ width: `${(total / dayMaxTotal) * 100}%`, minWidth: 4, height: 14 }}
                      >
                        {categories.map((cat, i) => {
                          const pct = total > 0 ? (cat.amount / total) * 100 : 0
                          return (
                            <div
                              key={cat.name}
                              title={
                                showCategory
                                  ? tt.labelValue({
                                      label: cat.name || tt.uncategorized,
                                      value: formatAmount(cat.amount, mainCurrency),
                                    })
                                  : formatAmount(cat.amount, mainCurrency)
                              }
                              className="cursor-pointer transition-opacity hover:opacity-80"
                              onClick={() =>
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

                  <span className="w-16 shrink-0 text-right text-xs font-semibold text-foreground">
                    {total > 0 ? formatAmount(total, mainCurrency) : '—'}
                  </span>
                </div>
              ))}

              {/* X-axis tick labels — aligned with the bar area */}
              {dayXTicks.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-12 shrink-0" />
                  <div className="relative flex-1" style={{ height: 14 }}>
                    {dayXTicks.map((tick) => (
                      <span
                        key={tick}
                        className="absolute text-[10px] leading-none text-muted-foreground"
                        style={{ left: `${(tick / dayMaxTotal) * 100}%`, transform: 'translateX(-50%)' }}
                      >
                        {tick >= 1000 ? `${Math.round(tick / 1000)}k` : Math.round(tick)}
                      </span>
                    ))}
                  </div>
                  <span className="w-16 shrink-0" />
                </div>
              )}
            </div>

            {/* Paging — the range can be long, the card must not be endless */}
            {filteredDayRows.length > DAY_ROWS_LIMIT && (
              <button
                type="button"
                onClick={() => setShowAllDays((prev) => !prev)}
                className="mt-2 w-full text-xs text-muted-foreground underline hover:text-foreground"
              >
                {showAllDays
                  ? tt.showFewerDays
                  : tt.showAllDays(filteredDayRows.length)}
              </button>
            )}

            {/* Tapped segment info panel */}
            {tappedSegmentKey && (
              <div className="mt-2 rounded-lg border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block shrink-0 rounded-full"
                    style={{ width: 8, height: 8, backgroundColor: tappedSegmentColor }}
                  />
                  {showCategory && (
                    <span className="text-xs font-medium text-foreground">
                      {tappedSegmentKey.categoryName || tt.uncategorized}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatDayLabel(tappedSegmentKey.dateStr)} · {formatAmount(tappedSegmentTotal, mainCurrency)}
                  </span>
                  {showCategory && (
                    <button
                      type="button"
                      className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                      title={tt.hideCategoryFromTheChart}
                      onClick={() => {
                        setHiddenCategories((prev) => new Set(prev).add(tappedSegmentKey.categoryName))
                        setTappedSegmentKey(null)
                      }}
                    >
                      {tt.hideAllPill}
                    </button>
                  )}
                </div>

                <div className="mt-1.5 flex flex-col gap-1 border-t pt-1.5">
                  {tappedSegmentScoped.map(({ transaction: tx, attributedAmount }) => {
                    const isHidden = hiddenTxIds.has(tx.txId)
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
                          {formatAmount(attributedAmount, mainCurrency)}
                        </span>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                          title={tt.editTransaction}
                          onClick={() => onEditTransaction(tx.txId)}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                          title={isHidden ? tt.showTransaction : tt.hideTransaction}
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

            {/* Hidden items — pills to re-show */}
            {(hiddenCategories.size > 0 || hiddenTxIds.size > 0) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{tt.hidden}</span>
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
                      style={{ width: 6, height: 6, backgroundColor: categoryColor(name || UNCATEGORIZED_COLOR_KEY) }}
                    />
                    {name || tt.uncategorized}
                    <span className="text-[10px]">👁️</span>
                  </button>
                ))}
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
          </>
        )}
      </CollapsibleCard>

      {/* ================================================================ */}
      {/* Breakdown cards (§4) — one generic component per card definition */}
      {/* ================================================================ */}
      {visibleCards.map(({ card, dims }) => {
        // Position within the STORED list, so the arrows move a card past its
        // real neighbour even when a hidden card sits between them.
        const storedIndex = storedCards.findIndex((c) => c.id === card.id)
        const actions = cardsEditMode ? (
          <>
            <CardActionButton
              label={tt.moveCardUp}
              glyph="↑"
              disabled={storedIndex <= 0}
              onClick={() => handleMoveCard(card.id, -1)}
            />
            <CardActionButton
              label={tt.moveCardDown}
              glyph="↓"
              disabled={storedIndex >= storedCards.length - 1}
              onClick={() => handleMoveCard(card.id, 1)}
            />
            <CardActionButton label={tt.editCard} glyph="✏️" onClick={() => openBuilder(card)} />
            <CardActionButton
              label={tt.deleteCard}
              glyph="✕"
              onClick={() => handleDeleteCard(card.id)}
            />
          </>
        ) : undefined

        // Two dimensions → the pivot renderer. One → the Phase 7a card,
        // untouched: a pivot is a new rendering MODE, not a rewrite.
        if (dims.length === 2) {
          return (
            <PivotCard
              // Remount when the pair changes, so the collapsed state is
              // re-derived (first section open) for the new structure.
              key={`${card.id}:${card.dimensions.join('|')}`}
              card={card}
              dims={[dims[0], dims[1]]}
              scoped={scoped}
              mainCurrency={mainCurrency}
              onDrillDown={handleRowDrillDown}
              actions={actions}
            />
          )
        }

        return (
          <BreakdownCard
            key={card.id}
            card={card}
            dimension={dims[0]}
            scoped={scoped}
            mainCurrency={mainCurrency}
            onDrillDown={(values) =>
              handleRowDrillDown([{ dimensionKey: dims[0].key, values }])
            }
            actions={actions}
          />
        )
      })}

      {/* Quiet invitation when the dashboard has no breakdown card at all —
          an invitation, not an apology, and not a wall of suggestions. */}
      {visibleCards.length === 0 && dimensions.length > 0 && (
        <button
          type="button"
          onClick={() => openBuilder()}
          className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/30"
        >
          {tt.emptyCardsInvite({ dimension: dimensions[0].label })}
          <span className="mt-1 block text-xs font-medium text-primary">{tt.addACard}</span>
        </button>
      )}

      {/* Card management row */}
      {dimensions.length > 0 && visibleCards.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openBuilder()}
            className="flex-1 rounded-lg border border-dashed border-primary/30 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
          >
            {tt.addCard}
          </button>
          <button
            type="button"
            onClick={() => setCardsEditMode((prev) => !prev)}
            aria-pressed={cardsEditMode}
            className="rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {cardsEditMode ? t.common.done : tt.editCards}
          </button>
        </div>
      )}

      {/* ================================================================ */}
      {/* Card ⑤ — Per person (hidden when isSolo)                         */}
      {/* ================================================================ */}
      {!isSolo && (() => {
        const maxConsumed = Math.max(...perMemberStats.map((s) => s.consumed), 1)

        return (
          <CollapsibleCard
            title={tt.perPerson}
            summary={tt.labelValue({
              label: currentMember?.displayName ?? tt.you,
              value: formatAmount(focusStats.consumed, mainCurrency),
            })}
          >
            <div className="flex flex-col gap-3">
              {perMemberStats.map(({ member, memberIndex, consumed, paid }) => {
                const isCurrentUser = member.userId === currentUserUid
                const barWidth = (consumed / maxConsumed) * 100

                return (
                  <div key={member.travelMemberId} className="flex items-center gap-3">
                    <MemberAvatar name={member.displayName} index={memberIndex} size="md" />

                    <div className="min-w-0 flex-1">
                      <div className="mb-1 text-xs font-medium text-foreground">
                        {member.displayName}
                        {isCurrentUser ? (
                          <span className="ml-1 text-muted-foreground">{tt.youSuffix}</span>
                        ) : null}
                      </div>
                      <div className="h-1 w-full rounded bg-muted">
                        <div
                          className="h-1 rounded"
                          style={{
                            width: `${barWidth}%`,
                            backgroundColor: CATEGORY_PALETTE[memberIndex % CATEGORY_PALETTE.length],
                          }}
                        />
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold text-foreground">
                        {formatAmount(consumed, mainCurrency)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {tt.paidAmount({ amount: formatAmount(paid, mainCurrency) })}
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
      {/* Card — Wallet balances (gated on features.wallets)               */}
      {/* ================================================================ */}
      {showWallets && (
        <CollapsibleCard
          title={tt.walletBalances}
          summary={walletBalances.length > 0 ? tt.walletCount(walletBalances.length) : tt.noWalletsYet}
        >
          {walletBalances.length > 0 ? (
            <div className="flex flex-col gap-3">

              {/* (a) Horizontal carousel of wallet sub-cards */}
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                {walletBalances.map((wb) => {
                  const key = `${wb.paymentMethod}|${wb.currency}`
                  const isSelected = selectedWalletKey === key
                  const labelStr = wb.paymentMethodLabel
                  const firstCp = labelStr.codePointAt(0) ?? 0
                  const hasEmoji = firstCp > 0xff
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
                      <span className="text-[10px] text-muted-foreground">{tt.currencyRemaining({ currency: wb.currency })}</span>
                    </button>
                  )
                })}
              </div>

              {/* (c) Drill-down detail when a wallet card is selected */}
              {selectedWalletDetail && (
                <div className="rounded-lg border bg-muted/20 px-3 py-2.5 space-y-2">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div>
                      <span className="text-muted-foreground">{tt.totalDeposited}</span>
                      <span className="font-medium">{formatAmount(selectedWalletDetail.wb.deposited, selectedWalletDetail.wb.currency)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{tt.totalSpentColon}</span>
                      <span className="font-medium">{formatAmount(selectedWalletDetail.wb.spent, selectedWalletDetail.wb.currency)}</span>
                    </div>
                    {selectedWalletDetail.wb.adjustments !== 0 && (
                      <div>
                        <span className="text-muted-foreground">{tt.adjustments}</span>
                        <span className="font-medium">
                          {selectedWalletDetail.wb.adjustments > 0 ? '+' : ''}{formatAmount(selectedWalletDetail.wb.adjustments, selectedWalletDetail.wb.currency)}
                        </span>
                      </div>
                    )}
                  </div>

                  {selectedWalletDetail.lastTopup && (
                    <div className="border-t pt-2 space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">{tt.sinceLastTopup}</div>
                      <div className="text-[10px] text-muted-foreground italic">{tt.sinceLastTopupNote}</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div>
                          <span className="text-muted-foreground">{tt.date}</span>
                          <span className="font-medium">{formatDayLabel(selectedWalletDetail.lastTopup.date)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{tt.amount}</span>
                          <span className="font-medium">{formatAmount(selectedWalletDetail.lastTopupNetAmount, selectedWalletDetail.wb.currency)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{tt.balanceAfter}</span>
                          <span className="font-medium">{formatAmount(selectedWalletDetail.balanceAfterLastTopup, selectedWalletDetail.wb.currency)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{tt.spentSince}</span>
                          <span className="font-medium">{formatAmount(selectedWalletDetail.spentSinceLastTopup, selectedWalletDetail.wb.currency)}</span>
                        </div>
                      </div>
                      <div className="pt-1 text-xs">
                        <span className="text-muted-foreground">{tt.estRemaining}</span>
                        <span className={`font-semibold ${
                          selectedWalletDetail.wb.remaining > 0 ? 'text-green-600 dark:text-green-400'
                            : selectedWalletDetail.wb.remaining < 0 ? 'text-red-600 dark:text-red-400'
                            : ''
                        }`}>
                          {formatAmount(selectedWalletDetail.wb.remaining, selectedWalletDetail.wb.currency)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 pt-1.5">
                        <span className="text-[11px] text-muted-foreground">{tt.notTheAmount}</span>
                        <button
                          type="button"
                          onClick={() => setReconcileBalance(selectedWalletDetail.wb)}
                          className="rounded-md border border-primary/30 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/5"
                        >
                          {tt.reconcile}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* (b)/(d) Wallet event list — withdrawals + adjustments */}
              {(() => {
                const displayedEvents = selectedWalletDetail
                  ? selectedWalletDetail.walletEvents
                  : walletEventTxs

                if (displayedEvents.length === 0) {
                  return (
                    <p className="py-1 text-center text-xs text-muted-foreground">
                      {tt.noWalletEvents}
                    </p>
                  )
                }

                return (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">
                      {selectedWalletDetail ? tt.history : tt.allWalletEvents}
                    </div>
                    <div className="max-h-[200px] space-y-1 overflow-y-auto">
                      {displayedEvents.map((tx, idx) => {
                        const txIsWithdrawal = isWithdrawal(tx)
                        const typeEmoji = txIsWithdrawal ? '🏧' : '⚖️'
                        const paid = tx.paidBy.find(s => s.travelMemberId === currentTravelMemberId)?.amount ?? 0
                        const gap = selectedWalletDetail ? walletSpendingGaps.get(idx) : null
                        return (
                          <div key={tx.txId}>
                            <div className="flex items-center justify-between rounded-md bg-muted/30 px-2 py-1.5 text-xs">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span>{typeEmoji}</span>
                                <span className="text-muted-foreground">{formatDayLabel(tx.date)}</span>
                                <span className="truncate font-medium">{tx.name}</span>
                              </div>
                              <div className="ml-2 flex shrink-0 items-center gap-1.5">
                                <div className="text-right">
                                  <span className={`font-medium ${
                                    txIsWithdrawal
                                      ? 'text-green-600 dark:text-green-400'
                                      : paid >= 0
                                        ? 'text-blue-600 dark:text-blue-400'
                                        : 'text-red-600 dark:text-red-400'
                                  }`}>
                                    {txIsWithdrawal ? '+' : paid >= 0 ? '+' : ''}{formatAmount(paid, tx.currency)}
                                  </span>
                                  {tx.fees != null && tx.fees > 0 && (
                                    <div className="text-[10px] text-muted-foreground">
                                      {tt.feesAmount({ amount: formatAmount(tx.fees, tx.currency) })}
                                    </div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); onEditTransaction(tx.txId) }}
                                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                  title={t.common.edit}
                                >
                                  ✏️
                                </button>
                              </div>
                            </div>
                            {gap && (
                              <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] text-muted-foreground">
                                <span>↕</span>
                                <span>
                                  {tt.spentBetween({
                                    from: formatDayLabel(gap.fromDate),
                                    to: formatDayLabel(gap.toDate),
                                  })}
                                </span>
                                <span className="font-medium">
                                  {gap.amount > 0
                                    ? formatAmount(gap.amount, selectedWalletDetail!.wb.currency)
                                    : `0 ${selectedWalletDetail!.wb.currency}`
                                  }
                                </span>
                              </div>
                            )}
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
              {tt.recordWithdrawalHint}
            </p>
          )}
          {onAddWithdrawal && (
            <button
              type="button"
              onClick={onAddWithdrawal}
              className="mt-2 w-full rounded-lg border border-dashed border-primary/30 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
            >
              {tt.recordWithdrawal}
            </button>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {tt.walletPrivacyNote}
          </p>
        </CollapsibleCard>
      )}

      {/* ================================================================ */}
      {/* Card ⑥ — Currencies (gated on features.multiCurrency)            */}
      {/* ================================================================ */}
      {showCurrencies && (
        <CollapsibleCard
          title={tt.currencies}
          summary={currenciesData.map(([code]) => code).join(' · ') || t.common.none}
        >
          {currenciesData.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t.dashboard.breakdown.noData}</p>
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
                {tt.convertedNote}
              </p>
            </>
          )}
        </CollapsibleCard>
      )}

      {/* ================================================================ */}
      {/* Card builder dialog                                               */}
      {/* ================================================================ */}
      <CardBuilder
        key={builderKey}
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        dimensions={dimensions}
        scoped={scoped}
        mainCurrency={mainCurrency}
        editing={editingCard}
        // From the STORED list, not the visible one: a card hidden behind a
        // disabled field still occupies its dimension combination.
        usedKeys={usedCardKeys(storedCards, editingCard?.id)}
        onSave={handleSaveCard}
      />

      {/* ================================================================ */}
      {/* Reconciliation dialog                                             */}
      {/* ================================================================ */}
      {reconcileBalance && (
        <ReconciliationDialog
          open={!!reconcileBalance}
          onOpenChange={(open) => { if (!open) setReconcileBalance(null) }}
          spaceId={space.spaceId}
          balance={reconcileBalance}
          currentTravelMemberId={currentTravelMemberId}
          mainCurrency={mainCurrency}
          defaultRates={space.defaultRates}
          onSuccess={() => setReconcileBalance(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chart helpers
// ---------------------------------------------------------------------------

/**
 * "Nice" round values for chart grid lines: aim for ~4 ticks, then snap the
 * step up to the nearest 1 / 2 / 5 × 10^n so the labels read cleanly
 * (50, 100, 200, 500, 1000…).
 */
function niceTicks(max: number): number[] {
  if (max <= 0) return []
  const TARGET_TICKS = 4
  const rawStep = max / TARGET_TICKS
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const residual = rawStep / magnitude
  let niceStep: number
  if (residual <= 1.5) niceStep = 1 * magnitude
  else if (residual <= 3.5) niceStep = 2 * magnitude
  else if (residual <= 7.5) niceStep = 5 * magnitude
  else niceStep = 10 * magnitude

  const ticks: number[] = []
  for (let v = niceStep; v <= max; v += niceStep) ticks.push(v)
  return ticks
}
