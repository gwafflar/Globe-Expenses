// src/travels/components/tabs/TransactionsTab.tsx
//
// Transactions tab for TravelDetailPage.
// Day-grouped accordion list: each row expands in-place to show full detail.
// Edit opens the existing TransactionForm drawer via onEditTransaction(txId).

import { useRef, useState, useEffect, useMemo } from 'react'
import type { Travel, LabeledItem } from '@/travels/types'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { exportTravelToXlsx } from '@/shared/utils/sheetExport'
import { ImportXlsxDialog } from '@/shared/components/ImportXlsxDialog'
import { normalizeTransactionSplits, parseTxDate } from '@/travels/components/tabs/dashboardHelpers'
import { useTransactionFilters } from '@/transactions/hooks/useTransactionFilters'
import { FilterPanel } from '@/transactions/components/FilterPanel'
import { getTransactionType, countsAsSpending, isTransfer } from '@/transactions/utils/walletHelpers'

// ---------------------------------------------------------------------------
// Currency symbol helpers
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  THB: '฿',
  JPY: '¥',
  CHF: 'Fr',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  HKD: 'HK$',
}

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code
}

/**
 * Format a number with space as thousands separator and the currency symbol appended.
 * Integer values show no decimals; fractional values show 2 decimal places.
 * Example: formatAmount(8900, 'THB') → "8 900 ฿"
 */
export function formatAmount(amount: number, currencyCode: string): string {
  const sym = currencySymbol(currencyCode)
  const isInteger = amount === Math.floor(amount)
  const numStr = isInteger
    ? Math.floor(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    : amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${numStr} ${sym}`
}

// ---------------------------------------------------------------------------
// Day-grouping logic
// ---------------------------------------------------------------------------

export interface DayGroup {
  date: string // DD-MM-YYYY
  transactions: TransactionWithStatus[]
}

/**
 * Group a date-desc sorted transaction list into day buckets.
 * Preserves the existing sort order within each group.
 */
export function groupByDay(transactions: TransactionWithStatus[]): DayGroup[] {
  const groups: DayGroup[] = []
  const map = new Map<string, TransactionWithStatus[]>()
  for (const tx of transactions) {
    if (!map.has(tx.date)) {
      const bucket: TransactionWithStatus[] = []
      map.set(tx.date, bucket)
      groups.push({ date: tx.date, transactions: bucket })
    }
    map.get(tx.date)!.push(tx)
  }
  return groups
}

function formatDateLabel(dateString: string): string {
  const [day, month, year] = dateString.split('-').map(Number)
  if (!day || !month || !year) return dateString
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
  })
}

/**
 * Extract the leading flag emoji from a country string like "🇹🇭 Thailand".
 * Returns '' if the string doesn't start with an emoji (e.g. legacy entries stored as plain "Thailand").
 */
function extractCountryEmoji(country: string): string {
  const cp = country.codePointAt(0) ?? 0
  // Code points above U+00FF are emoji / non-Latin — safe to treat as emoji prefix
  if (cp <= 0x00ff) return ''
  return country.split(' ')[0] ?? ''
}

// ---------------------------------------------------------------------------
// Category emoji — resolved from the travel's per-travel category list
// ---------------------------------------------------------------------------

function getCategoryEmoji(category: string | undefined, categories: LabeledItem[]): string {
  if (!category) return '💸'
  // Category may be stored as "🍽️ Food" (emoji + label) when the LabeledItem had an emoji
  const byFull = categories.find((c) => c.emoji && category === `${c.emoji} ${c.label}`)
  if (byFull?.emoji) return byFull.emoji
  // Or stored as plain label "Food" — look up the emoji from the list
  return categories.find((c) => c.label === category)?.emoji ?? '💸'
}

// ---------------------------------------------------------------------------
// Member avatar color scheme (deterministic by position in travel.members)
// ---------------------------------------------------------------------------

const AVATAR_BG_COLORS = ['#CECBF6', '#9FE1CB', '#F5C4B3', '#FAC775', '#B5D4F4', '#F4C0D1']
const AVATAR_TEXT_COLORS = ['#3C3489', '#085041', '#711713', '#633806', '#0C447C', '#72243E']

function memberColors(memberIndex: number): { bg: string; text: string } {
  // Cycle through the palette if there are more than 6 members
  const idx = memberIndex % AVATAR_BG_COLORS.length
  return { bg: AVATAR_BG_COLORS[idx], text: AVATAR_TEXT_COLORS[idx] }
}

// ---------------------------------------------------------------------------
// MemberAvatar — small circle with member initials
// ---------------------------------------------------------------------------

function MemberAvatar({
  displayName,
  memberIndex,
  size = 18,
}: {
  displayName: string
  memberIndex: number
  size?: number
}) {
  const { bg, text } = memberColors(memberIndex)
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium"
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        color: text,
        fontSize: Math.floor(size * 0.55),
        lineHeight: 1,
      }}
    >
      {displayName.charAt(0).toUpperCase()}
    </span>
  )
}

// ---------------------------------------------------------------------------
// PendingBadge — amber flash while hasPendingWrites is true, green on sync
// ---------------------------------------------------------------------------

function PendingBadge({ isPending }: { isPending: boolean }) {
  const [showSynced, setShowSynced] = useState(false)
  const prevRef = useRef(isPending)

  useEffect(() => {
    if (prevRef.current === true && !isPending) {
      setShowSynced(true)
      const t = setTimeout(() => setShowSynced(false), 2000)
      return () => clearTimeout(t)
    }
    prevRef.current = isPending
  }, [isPending])

  if (isPending)
    return (
      <span
        className="ml-1 cursor-help rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-600"
        title="Saved locally — will sync when back online."
      >
        ⏳ not synced
      </span>
    )
  if (showSynced)
    return (
      <span className="ml-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
        ✅ synced
      </span>
    )
  return null
}

// ---------------------------------------------------------------------------
// DayGroupHeader — thin separator row above each day bucket
// ---------------------------------------------------------------------------

function DayGroupHeader({
  date,
  transactions,
  mainCurrency,
}: {
  date: string
  transactions: TransactionWithStatus[]
  mainCurrency: string
}) {
  const dateLabel = formatDateLabel(date)

  // Collect up to 3 unique country emojis from this day's transactions
  const countryEmojis = useMemo(() => {
    const seen = new Set<string>()
    for (const tx of transactions) {
      if (tx.country) seen.add(extractCountryEmoji(tx.country))
      if (seen.size >= 3) break
    }
    return Array.from(seen)
  }, [transactions])

  // Collect up to 3 unique city names from this day's transactions
  const cities = useMemo(() => {
    const seen = new Set<string>()
    for (const tx of transactions) {
      if (tx.city) seen.add(tx.city)
      if (seen.size >= 3) break
    }
    return Array.from(seen)
  }, [transactions])

  // Sum of spending transactions only (excludes withdrawals and balance-only adjustments)
  const dayTotal = useMemo(
    () => transactions.filter(countsAsSpending).reduce((sum, tx) => sum + tx.totalAmountMain, 0),
    [transactions],
  )

  return (
    <div className="flex items-center gap-2 border-b pb-1 pt-3">
      <span className="text-xs font-semibold text-muted-foreground">{dateLabel}</span>
      {countryEmojis.length > 0 && (
        <span className="text-xs text-muted-foreground">{countryEmojis.join(' ')}</span>
      )}
      {cities.length > 0 && (
        <span className="text-xs text-muted-foreground">{cities.join(' · ')}</span>
      )}
      {/* Day total pushed to the right */}
      <span className="ml-auto text-xs font-semibold text-muted-foreground">
        {formatAmount(dayTotal, mainCurrency)}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TransactionRow — collapsed accordion row
// ---------------------------------------------------------------------------

function TransactionRow({
  transaction,
  members,
  categories,
  currentUserTravelMemberId,
  isSolo,
  mainCurrency,
  onToggle,
}: {
  transaction: TransactionWithStatus
  members: Travel['members']
  categories: LabeledItem[]
  currentUserTravelMemberId: string
  isSolo: boolean
  mainCurrency: string
  onToggle: () => void
}) {
  // Transaction type determines the leading emoji:
  // - transfer  → 🤝 (person-to-person)
  // - withdrawal → 🏧 (ATM/top-up)
  // - adjustment → ⚖️ (reconciliation)
  // - expense → category emoji (default)
  const txType = getTransactionType(transaction)
  const categoryEmoji = txType === 'transfer' ? '🤝'
    : txType === 'withdrawal' ? '🏧'
    : txType === 'adjustment' ? '⚖️'
    : getCategoryEmoji(transaction.category, categories)

  // Beneficiary avatars — show up to 3, overlapping
  const beneficiaryAvatars = useMemo(() => {
    if (isSolo) return []
    return transaction.beneficiaries.slice(0, 3).map((b) => ({
      displayName: members.find((m) => m.travelMemberId === b.travelMemberId)?.displayName ?? '?',
      memberIndex: members.findIndex((m) => m.travelMemberId === b.travelMemberId),
    }))
  }, [transaction.beneficiaries, members, isSolo])

  // Current user's beneficiary share for "your share" line
  const myBeneficiary = transaction.beneficiaries.find(
    (b) => b.travelMemberId === currentUserTravelMemberId,
  )
  // Only show "your share" when the cost is actually split (share ≠ full amount).
  // Transfers don't have a "your share" concept — they're person-to-person movements.
  const showYourShare =
    !isSolo && !isTransfer(transaction) && myBeneficiary !== undefined && myBeneficiary.amount !== transaction.totalAmount

  return (
    <div
      className="flex cursor-pointer items-center justify-between px-3 py-2.5 transition-colors hover:bg-accent/30 active:bg-accent/50"
      onClick={onToggle}
    >
      {/* Left: emoji + name + category pill + avatars */}
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 shrink-0 text-base leading-none">{categoryEmoji}</span>
        <div className="min-w-0">
          {/* Transaction name + pending badge */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[13px] font-semibold leading-tight">{transaction.name}</span>
            <PendingBadge isPending={transaction.isPending} />
          </div>
          {/* Type badge (non-expense only) + category pill + beneficiary avatars */}
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {txType === 'transfer' && (
              <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                Transfer
              </span>
            )}
            {txType === 'withdrawal' && (
              <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                Withdrawal
              </span>
            )}
            {txType === 'adjustment' && (
              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                Adjustment
              </span>
            )}
            {transaction.category && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {transaction.category}
              </span>
            )}
            {beneficiaryAvatars.length > 0 && (
              <div className="flex items-center">
                {beneficiaryAvatars.map((av, i) => (
                  <span key={i} style={{ marginLeft: i === 0 ? 0 : -4 }}>
                    <MemberAvatar
                      displayName={av.displayName}
                      memberIndex={av.memberIndex >= 0 ? av.memberIndex : 0}
                      size={18}
                    />
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: primary amount, your share, native/converted */}
      <div className="ml-3 shrink-0 text-right">
        <div className="text-sm font-semibold">
          {formatAmount(transaction.totalAmount, transaction.currency)}
        </div>
        {showYourShare && (
          <div className="text-[10px] text-muted-foreground">
            your share: {formatAmount(myBeneficiary!.amount, transaction.currency)}
          </div>
        )}
        {transaction.currency !== mainCurrency && (
          <div className="text-[10px] text-muted-foreground">
            {formatAmount(transaction.totalAmountMain, mainCurrency)}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TransactionDetail — expanded accordion panel
// ---------------------------------------------------------------------------

function TransactionDetail({
  transaction,
  members,
  currentUserUid,
  isSolo,
  mainCurrency,
  onEdit,
  onDelete,
}: {
  transaction: TransactionWithStatus
  members: Travel['members']
  currentUserUid: string
  isSolo: boolean
  mainCurrency: string
  onEdit: () => void
  onDelete: () => void
}) {
  // Toggle between "1 TX = N main" and "1 main = N TX"
  const [rateDirection, setRateDirection] = useState<'toMain' | 'fromMain'>('toMain')

  const showRate = transaction.currency !== mainCurrency

  const rateLabel = useMemo(() => {
    if (!showRate) return null
    const txSym = currencySymbol(transaction.currency)
    const mainSym = currencySymbol(mainCurrency)
    if (rateDirection === 'toMain') {
      return `1 ${txSym} = ${transaction.exchangeRate.toFixed(4)} ${mainSym}`
    }
    // fromMain: reciprocal, rounded to 2dp
    return `1 ${mainSym} = ${(1 / transaction.exchangeRate).toFixed(2)} ${txSym}`
  }, [showRate, rateDirection, transaction.currency, transaction.exchangeRate, mainCurrency])

  // amountFormula is an optional display-only field storing the raw formula (e.g. "2*2.5 + 1.5")
  const formulaStr = transaction.amountFormula ?? null

  return (
    <div className="space-y-3 border-t bg-muted px-3 py-3 text-sm">

      {/* Amount block */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xl font-bold">
            {formatAmount(transaction.totalAmount, transaction.currency)}
          </span>
          {formulaStr && (
            <span className="rounded border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              🧮 {formulaStr} = {transaction.totalAmount}
            </span>
          )}
        </div>
        {/* Exchange rate toggle */}
        {showRate && (
          <button
            type="button"
            className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setRateDirection((d) => (d === 'toMain' ? 'fromMain' : 'toMain'))}
          >
            <span>{rateLabel}</span>
            <span className="text-[10px]">⇄</span>
          </button>
        )}
        {/* Arrow to main currency total */}
        <div className="mt-0.5 text-xs text-muted-foreground">
          → {formatAmount(transaction.totalAmountMain, mainCurrency)}
        </div>
      </div>

      {/* Meta grid — 2 columns */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div>
          <span className="text-muted-foreground">Category </span>
          <span>{transaction.category ?? '—'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Payment </span>
          <span>{transaction.paymentMethod ?? '—'}</span>
        </div>
        {/* Fees — only shown on withdrawal transactions */}
        {transaction.fees != null && transaction.fees > 0 && (
          <div>
            <span className="text-muted-foreground">Fees </span>
            <span>{formatAmount(transaction.fees, transaction.currency)}</span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Country </span>
          <span>{transaction.country ?? '—'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">City </span>
          <span>{transaction.city ?? '—'}</span>
        </div>
      </div>

      {/* Notes — only when present */}
      {transaction.notes && (
        <div className="text-xs">
          <span className="font-medium text-foreground">Notes: </span>
          <span className="text-muted-foreground">{transaction.notes}</span>
        </div>
      )}

      {/* Paid by / Split — hidden in solo travel (only one member, no split info needed).
          Transfers use "From" / "To" labels instead of "Paid by" / "Split". */}
      {!isSolo && (
        <>
          <SplitSection
            label={isTransfer(transaction) ? 'From' : 'Paid by'}
            splits={transaction.paidBy}
            members={members}
            currentUserUid={currentUserUid}
            currency={transaction.currency}
          />
          <SplitSection
            label={isTransfer(transaction) ? 'To' : 'Split'}
            splits={transaction.beneficiaries}
            members={members}
            currentUserUid={currentUserUid}
            currency={transaction.currency}
          />
        </>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="default" size="sm" className="flex-1" onClick={onEdit}>
          Edit
        </Button>
        <Button type="button" variant="destructive" size="sm" className="w-20" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SplitSection — shared row layout for "Paid by" and "Split"
// ---------------------------------------------------------------------------

function SplitSection({
  label,
  splits,
  members,
  currentUserUid,
  currency,
}: {
  label: string
  splits: { travelMemberId: string; amount: number }[]
  members: Travel['members']
  currentUserUid: string
  currency: string
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <div className="space-y-1">
        {splits.map((split) => {
          const member = members.find((m) => m.travelMemberId === split.travelMemberId)
          const memberIndex = members.findIndex((m) => m.travelMemberId === split.travelMemberId)
          const isMe = member?.userId === currentUserUid
          return (
            <div key={split.travelMemberId} className="flex items-center gap-2 text-xs">
              <MemberAvatar
                displayName={member?.displayName ?? '?'}
                memberIndex={memberIndex >= 0 ? memberIndex : 0}
                size={24}
              />
              <span>
                {member?.displayName ?? '?'}
                {isMe && <span className="ml-1 text-muted-foreground">(you)</span>}
              </span>
              <span className="ml-auto font-medium">{formatAmount(split.amount, currency)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DayGroup — header + card list for one day
// ---------------------------------------------------------------------------

function DayGroupSection({
  group,
  members,
  categories,
  currentUserTravelMemberId,
  currentUserUid,
  isSolo,
  mainCurrency,
  expandedTxId,
  onToggle,
  onEditTransaction,
  onDeleteTransaction,
}: {
  group: DayGroup
  members: Travel['members']
  categories: LabeledItem[]
  currentUserTravelMemberId: string
  currentUserUid: string
  isSolo: boolean
  mainCurrency: string
  expandedTxId: string | null
  onToggle: (txId: string) => void
  onEditTransaction: (txId: string) => void
  onDeleteTransaction: (txId: string) => void
}) {
  return (
    <div>
      <DayGroupHeader date={group.date} transactions={group.transactions} mainCurrency={mainCurrency} />
      <div className="mt-1 space-y-1">
        {group.transactions.map((tx) => (
          <Card key={tx.txId} className="overflow-hidden p-0">
            <TransactionRow
              transaction={tx}
              members={members}
              categories={categories}
              currentUserTravelMemberId={currentUserTravelMemberId}
              isSolo={isSolo}
              mainCurrency={mainCurrency}
              onToggle={() => onToggle(tx.txId)}
            />
            {expandedTxId === tx.txId && (
              <TransactionDetail
                transaction={tx}
                members={members}
                currentUserUid={currentUserUid}
                isSolo={isSolo}
                mainCurrency={mainCurrency}
                onEdit={() => onEditTransaction(tx.txId)}
                onDelete={() => onDeleteTransaction(tx.txId)}
              />
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Placeholder toolbar button (for features not yet implemented)
// ---------------------------------------------------------------------------

function PlaceholderButton({ label }: { label: string }) {
  return (
    <div className="relative group">
      <button
        type="button"
        disabled
        className="rounded-md border border-input bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground opacity-60 cursor-not-allowed"
      >
        {label}
      </button>
      <div className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-[10px] text-background opacity-0 transition-opacity group-hover:opacity-100">
        Coming soon
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FilterToggleButton — replaces the old placeholder, shows active filter count
// ---------------------------------------------------------------------------

function FilterToggleButton({
  isOpen,
  activeCount,
  onClick,
}: {
  isOpen: boolean
  activeCount: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors
        ${isOpen
          ? 'border-primary bg-primary/10 text-primary'
          : activeCount > 0
            ? 'border-primary/50 bg-primary/5 text-primary hover:bg-primary/10'
            : 'border-input bg-background text-foreground hover:bg-accent'
        }
      `}
    >
      🔍 Filter
      {activeCount > 0 && (
        <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {activeCount}
        </span>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface TransactionsTabProps {
  travel: Travel
  transactions: TransactionWithStatus[]
  loading: boolean
  error: string | null
  currentUserUid: string
  isSolo: boolean
  mainCurrency: string
  onAddExpense: () => void
  onEditTransaction: (txId: string) => void
  onDeleteTransaction: (txId: string) => void
}

export function TransactionsTab({
  travel,
  transactions,
  loading,
  error,
  currentUserUid,
  isSolo,
  mainCurrency,
  onAddExpense,
  onEditTransaction,
  onDeleteTransaction,
}: TransactionsTabProps) {
  // Derive the current user's travelMemberId — used for "your share" and "(you)" labels
  const currentUserTravelMemberId = useMemo(
    () => travel.members.find((m) => m.userId === currentUserUid)?.travelMemberId ?? '',
    [travel.members, currentUserUid],
  )

  // Accordion state — only one card open at a time; null = all collapsed
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null)

  function handleToggle(txId: string) {
    setExpandedTxId((prev) => (prev === txId ? null : txId))
  }

  // Normalize legacy splits (pre-Session 009 docs stored split.uid instead of split.travelMemberId).
  // Same approach as DashboardTab — returns same reference when nothing needs remapping.
  const normalizedTransactions = useMemo(
    () => normalizeTransactionSplits(transactions, travel.members),
    [transactions, travel.members],
  )

  // -- Filter & search (all client-side, no extra Firestore reads) --
  const {
    filtered: filteredTransactions,
    searchQuery,
    setSearchQuery,
    filters,
    toggleFilter,
    clearDimension,
    clearAll,
    hasActiveFilters,
    options,
    availableOptions,
    resultCount,
  } = useTransactionFilters(normalizedTransactions, travel, isSolo)

  // Controls whether the filter panel is visible
  const [filterOpen, setFilterOpen] = useState(false)

  // Count of active filter dimensions (not counting search) — shown on the toggle button
  const activeFilterCount = Object.keys(filters).length + (searchQuery.trim() ? 1 : 0)

  // Sort by spending date descending (most recent first), with createdAt as tiebreaker.
  // parseTxDate converts "DD-MM-YYYY" → JS Date so we don't sort lexicographically.
  const sortedTransactions = useMemo(
    () => [...filteredTransactions].sort((a, b) => {
      const dateDiff = parseTxDate(b.date).getTime() - parseTxDate(a.date).getTime()
      if (dateDiff !== 0) return dateDiff
      // createdAt can be null for pending fire-and-forget writes (serverTimestamp()
      // is null locally until the server confirms). Treat null as "most recent".
      const aMs = a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER
      const bMs = b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER
      return bMs - aMs
    }),
    [filteredTransactions],
  )

  // Day-grouped transactions — now uses the sorted FILTERED list
  const dayGroups = useMemo(() => groupByDay(sortedTransactions), [sortedTransactions])

  const [isExporting, setIsExporting] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  async function handleExport() {
    setIsExporting(true)
    try {
      await exportTravelToXlsx(travel, transactions)
    } catch (err) {
      console.error('[TransactionsTab] export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Import dialog (portal, rendered outside the flex flow) */}
      <ImportXlsxDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        travel={travel}
        currentUserUid={currentUserUid}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <FilterToggleButton
            isOpen={filterOpen}
            activeCount={activeFilterCount}
            onClick={() => setFilterOpen((prev) => !prev)}
          />
          <PlaceholderButton label="⊞ Display" />
        </div>
        <div className="flex gap-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          >
            Import
          </button>
          {transactions.length > 0 && (
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isExporting ? 'Exporting…' : 'Export'}
            </button>
          )}
        </div>
      </div>

      {/* Filter panel — slides in below toolbar when open */}
      {filterOpen && (
        <FilterPanel
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filters={filters}
          options={options}
          availableOptions={availableOptions}
          onToggleFilter={toggleFilter}
          onClearDimension={clearDimension}
          onClearAll={clearAll}
          hasActiveFilters={hasActiveFilters}
          resultCount={resultCount}
          totalCount={normalizedTransactions.length}
          travel={travel}
          isSolo={isSolo}
        />
      )}

      {/* List */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm font-medium">No expenses recorded yet.</p>
          <p className="max-w-xs text-xs text-muted-foreground">Tap + to add your first expense.</p>
          <Button type="button" size="sm" onClick={onAddExpense}>
            Add your first expense
          </Button>
        </div>
      ) : filteredTransactions.length === 0 && hasActiveFilters ? (
        /* No results after filtering — show a message instead of empty space */
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm font-medium text-muted-foreground">No transactions match your filters.</p>
          <Button type="button" variant="outline" size="sm" onClick={clearAll}>
            Clear all filters
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {dayGroups.map((group) => (
            <DayGroupSection
              key={group.date}
              group={group}
              members={travel.members}
              categories={travel.categories ?? []}
              currentUserTravelMemberId={currentUserTravelMemberId}
              currentUserUid={currentUserUid}
              isSolo={isSolo}
              mainCurrency={mainCurrency}
              expandedTxId={expandedTxId}
              onToggle={handleToggle}
              onEditTransaction={onEditTransaction}
              onDeleteTransaction={onDeleteTransaction}
            />
          ))}
        </div>
      )}
    </div>
  )
}
