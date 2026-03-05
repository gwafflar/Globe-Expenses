// src/travels/components/tabs/TransactionsTab.tsx
//
// Transactions tab for TravelDetailPage.
// Displays the transaction list extracted from TravelDetailPage,
// plus placeholder Filter and Display Mode controls.

import { useRef, useState, useEffect } from 'react'
import type { Travel } from '@/travels/types'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import { Button } from '@/components/ui/button'
import { Card, CardTitle, CardDescription } from '@/components/ui/card'

// ---------------------------------------------------------------------------
// Category emoji map
// ---------------------------------------------------------------------------

const CATEGORY_EMOJIS: Record<string, string> = {
  Transport: '🚗',
  Accommodation: '🏨',
  Food: '🍽️',
  Activities: '🎭',
  Shopping: '🛍️',
  Health: '💊',
  Communication: '📱',
  Other: '💸',
}

function getCategoryEmoji(category?: string): string {
  if (!category) return '💸'
  return CATEGORY_EMOJIS[category] ?? '💸'
}

function formatDateLabel(dateString: string): string {
  const [day, month, year] = dateString.split('-').map(Number)
  if (!day || !month || !year) return dateString
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
  })
}

// ---------------------------------------------------------------------------
// Pending badge
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
      <span className="ml-1 cursor-help rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-600"
        title="Saved locally — will sync when back online.">
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
// Payer label
// ---------------------------------------------------------------------------

function buildPayerLabel(
  paidBy: TransactionWithStatus['paidBy'],
  members: Travel['members'],
  currentUserUid: string,
): string {
  if (paidBy.length === 0) return '?'
  const includesMe = paidBy.some((s) => s.uid === currentUserUid)
  if (paidBy.length === 1) {
    if (includesMe) return 'You'
    return members.find((m) => m.uid === paidBy[0].uid)?.displayName ?? 'Someone'
  }
  const othersCount = paidBy.length - (includesMe ? 1 : 0)
  if (includesMe) return othersCount === 1 ? 'You + 1 other' : `You + ${othersCount} others`
  return `${paidBy.length} people`
}

// ---------------------------------------------------------------------------
// Split icon
// ---------------------------------------------------------------------------

function getSplitIcon(
  tx: TransactionWithStatus,
  members: Travel['members'],
  currentUserUid: string,
): string {
  const myBeneficiary = tx.beneficiaries.find((s) => s.uid === currentUserUid)
  if (!myBeneficiary) return '🙅'
  const allMemberUids = members.map((m) => m.uid).sort()
  const beneficiaryUids = tx.beneficiaries.map((s) => s.uid).sort()
  const allIncluded =
    allMemberUids.length === beneficiaryUids.length &&
    allMemberUids.every((uid, i) => uid === beneficiaryUids[i])
  if (allIncluded) {
    const expected = tx.totalAmountMain / members.length
    const allEqual = tx.beneficiaries.every(
      (s) => Math.abs(s.amount * tx.exchangeRate - expected) < 0.01,
    )
    if (allEqual) return '➗'
  }
  return '👥'
}

// ---------------------------------------------------------------------------
// Transaction row
// ---------------------------------------------------------------------------

function TransactionRow({
  transaction,
  members,
  currentUserUid,
  isSolo,
}: {
  transaction: TransactionWithStatus
  members: Travel['members']
  currentUserUid: string
  isSolo: boolean
}) {
  const dateLabel = formatDateLabel(transaction.date)
  const categoryEmoji = getCategoryEmoji(transaction.category)
  const payerLabel = buildPayerLabel(transaction.paidBy, members, currentUserUid)
  const myBeneficiary = transaction.beneficiaries.find((s) => s.uid === currentUserUid)
  const myCostMain = myBeneficiary
    ? Math.round(myBeneficiary.amount * transaction.exchangeRate * 100) / 100
    : null
  const splitIcon = getSplitIcon(transaction, members, currentUserUid)
  const splitTitle =
    splitIcon === '🙅' ? 'Not your expense'
    : splitIcon === '➗' ? 'Split equally among all'
    : 'Custom split'

  return (
    <Card className="flex items-center justify-between px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="w-12 shrink-0 text-center">
          <span className="text-xs font-medium text-muted-foreground">{dateLabel}</span>
        </div>
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm">{categoryEmoji}</span>
            <CardTitle className="text-sm font-medium leading-tight">{transaction.name}</CardTitle>
            <PendingBadge isPending={transaction.isPending} />
          </div>
          <CardDescription className="text-xs">
            Paid by <span className="font-medium text-foreground">{payerLabel}</span>
            {(transaction.city || transaction.country) && (
              <span className="ml-1 text-muted-foreground">
                · {[transaction.city, transaction.country].filter(Boolean).join(', ')}
              </span>
            )}
          </CardDescription>
        </div>
      </div>

      <div className="ml-3 shrink-0 text-right">
        <div className="text-sm font-semibold">
          {transaction.totalAmount.toFixed(2)} {transaction.currency}
        </div>
        {isSolo ? (
          transaction.currency !== 'EUR' && (
            <div className="text-xs text-muted-foreground">
              {transaction.totalAmountMain.toFixed(2)} main
            </div>
          )
        ) : (
          <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
            <span title={splitTitle}>{splitIcon}</span>
            {myCostMain !== null ? (
              <span>{myCostMain.toFixed(2)} for you</span>
            ) : (
              <span>not yours</span>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Placeholder toolbar button
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
      {/* "Coming soon" tooltip */}
      <div className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-[10px] text-background opacity-0 transition-opacity group-hover:opacity-100">
        Coming soon
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface TransactionsTabProps {
  transactions: TransactionWithStatus[]
  loading: boolean
  error: string | null
  members: Travel['members']
  currentUserUid: string
  isSolo: boolean
  onAddExpense: () => void
}

export function TransactionsTab({
  transactions,
  loading,
  error,
  members,
  currentUserUid,
  isSolo,
  onAddExpense,
}: TransactionsTabProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <PlaceholderButton label="🔍 Filter" />
          <PlaceholderButton label="⊞ Display" />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm font-medium">No expenses recorded yet.</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Tap + to add your first expense.
          </p>
          <Button type="button" size="sm" onClick={onAddExpense}>
            Add your first expense
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <TransactionRow
              key={tx.txId}
              transaction={tx}
              members={members}
              currentUserUid={currentUserUid}
              isSolo={isSolo}
            />
          ))}
        </div>
      )}
    </div>
  )
}