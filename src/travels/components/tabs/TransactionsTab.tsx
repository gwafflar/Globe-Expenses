// src/travels/components/tabs/TransactionsTab.tsx
//
// Transactions tab for TravelDetailPage.
// Displays the transaction list extracted from TravelDetailPage,
// plus placeholder Filter and Display Mode controls, and
// Export / Import xlsx buttons.

import { useRef, useState, useEffect, useMemo } from 'react'
import type { Travel, LabeledItem } from '@/travels/types'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import { Button } from '@/components/ui/button'
import { Card, CardTitle, CardDescription } from '@/components/ui/card'
import { exportTravelToXlsx } from '@/shared/utils/sheetExport'
import { ImportXlsxDialog } from '@/shared/components/ImportXlsxDialog'
import { FormulaBadge } from '@/transactions/components/FormulaBadge'

// ---------------------------------------------------------------------------
// Category emoji — resolved from the travel's per-travel category list
// ---------------------------------------------------------------------------

function getCategoryEmoji(category: string | undefined, categories: LabeledItem[]): string {
  if (!category) return '💸'
  // Category may be stored as "🍽️ Food" (emoji + label) when the LabeledItem had an emoji at save time
  const byFull = categories.find((c) => c.emoji && category === `${c.emoji} ${c.label}`)
  if (byFull?.emoji) return byFull.emoji
  // Or stored as plain label "Food" — look up the emoji from the list
  return categories.find((c) => c.label === category)?.emoji ?? '💸'
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
// Payer label — uses travelMemberId for "You" detection
// ---------------------------------------------------------------------------

function buildPayerLabel(
  paidBy: TransactionWithStatus['paidBy'],
  members: Travel['members'],
  currentUserTravelMemberId: string,
): string {
  if (paidBy.length === 0) return '?'
  const includesMe = paidBy.some((s) => s.travelMemberId === currentUserTravelMemberId)
  if (paidBy.length === 1) {
    if (includesMe) return 'You'
    return members.find((m) => m.travelMemberId === paidBy[0].travelMemberId)?.displayName ?? 'Someone'
  }
  const othersCount = paidBy.length - (includesMe ? 1 : 0)
  if (includesMe) return othersCount === 1 ? 'You + 1 other' : `You + ${othersCount} others`
  return `${paidBy.length} people`
}

// ---------------------------------------------------------------------------
// Split icon — uses travelMemberId for beneficiary detection
// ---------------------------------------------------------------------------

function getSplitIcon(
  tx: TransactionWithStatus,
  members: Travel['members'],
  currentUserTravelMemberId: string,
): string {
  const myBeneficiary = tx.beneficiaries.find((s) => s.travelMemberId === currentUserTravelMemberId)
  if (!myBeneficiary) return '🙅'
  // Check if all members are beneficiaries with equal shares
  const allMemberIds = members.map((m) => m.travelMemberId).sort()
  const beneficiaryIds = tx.beneficiaries.map((s) => s.travelMemberId).sort()
  const allIncluded =
    allMemberIds.length === beneficiaryIds.length &&
    allMemberIds.every((id, i) => id === beneficiaryIds[i])
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
  categories,
  currentUserTravelMemberId,
  isSolo,
  onEdit,
}: {
  transaction: TransactionWithStatus
  members: Travel['members']
  categories: LabeledItem[]
  currentUserTravelMemberId: string
  isSolo: boolean
  onEdit: (tx: TransactionWithStatus) => void
}) {
  const dateLabel = formatDateLabel(transaction.date)
  const categoryEmoji = getCategoryEmoji(transaction.category, categories)
  const payerLabel = buildPayerLabel(transaction.paidBy, members, currentUserTravelMemberId)
  const myBeneficiary = transaction.beneficiaries.find((s) => s.travelMemberId === currentUserTravelMemberId)
  const myCostMain = myBeneficiary
    ? Math.round(myBeneficiary.amount * transaction.exchangeRate * 100) / 100
    : null
  const splitIcon = getSplitIcon(transaction, members, currentUserTravelMemberId)
  const splitTitle =
    splitIcon === '🙅' ? 'Not your expense'
    : splitIcon === '➗' ? 'Split equally among all'
    : 'Custom split'

  return (
    <Card
      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/30 active:bg-accent/50 transition-colors"
      onClick={() => onEdit(transaction)}
    >
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
          <span className="flex items-center gap-1.5">
            {transaction.totalAmount.toFixed(2)} {transaction.currency}
            {transaction.amountFormula && (
              <FormulaBadge formula={transaction.amountFormula} />
            )}
          </span>        
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
  travel: Travel
  transactions: TransactionWithStatus[]
  loading: boolean
  error: string | null
  currentUserUid: string   // Firebase Auth UID — used to derive travelMemberId and for import
  isSolo: boolean
  onAddExpense: () => void
  onEditTransaction: (tx: TransactionWithStatus) => void
}

export function TransactionsTab({
  travel,
  transactions,
  loading,
  error,
  currentUserUid,
  isSolo,
  onAddExpense,
  onEditTransaction,
}: TransactionsTabProps) {
  // Derive the current user's travelMemberId from the travel's member list.
  // This is what Split objects use — NOT the Firebase Auth UID.
  const currentUserTravelMemberId = useMemo(
    () => travel.members.find((m) => m.userId === currentUserUid)?.travelMemberId ?? '',
    [travel.members, currentUserUid],
  )

  // Export state — brief spinner while generating the xlsx
  const [isExporting, setIsExporting] = useState(false)
  // Import dialog visibility
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
          <PlaceholderButton label="🔍 Filter" />
          <PlaceholderButton label="⊞ Display" />
        </div>
        <div className="flex gap-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          {/* Import — always available (user may want to populate an empty travel) */}
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          >
            Import
          </button>
          {/* Export — only shown once there are transactions to export */}
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
              members={travel.members}
              categories={travel.categories ?? []}
              currentUserTravelMemberId={currentUserTravelMemberId}
              isSolo={isSolo}
              onEdit={onEditTransaction}
            />
          ))}
        </div>
      )}
    </div>
  )
}
