// ReconciliationDialog.tsx — bottom-sheet dialog for reconciling a wallet balance.
//
// Flow:
//   1. User taps "Reconcile" on a wallet balance row in the Dashboard.
//   2. Dialog shows the computed remaining balance.
//   3. User enters how much they actually have.
//   4. If there's a difference, user chooses:
//      - "Create expense" → adjustment with adjustmentMode='expense' (counts in spending stats)
//      - "Adjust balance only" → adjustment with adjustmentMode='balance_only' (wallet-only)
//   5. On confirm, creates a transaction with type='adjustment'.

import { useState } from 'react'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { createTransaction } from '@/transactions/services/transactionService'
import { getExchangeRate } from '@/shared/utils/exchangeRates'
import { computeReconciliationDiff, type WalletBalance } from '@/transactions/utils/walletHelpers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import type { AdjustmentMode } from '@/transactions/types'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReconciliationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  travelId: string
  balance: WalletBalance
  currentTravelMemberId: string
  // The travel's reference currency for exchange rate computation.
  mainCurrency: string
  onSuccess: (txId: string) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTodayDDMMYYYY(): string {
  const today = new Date()
  const dd = String(today.getDate()).padStart(2, '0')
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const yyyy = today.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

function formatAmount(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReconciliationDialog({
  open,
  onOpenChange,
  travelId,
  balance,
  currentTravelMemberId,
  mainCurrency,
  onSuccess,
}: ReconciliationDialogProps) {
  const { currentUser, userProfile } = useAuthStore()

  const [actualStr, setActualStr] = useState('')
  const [saving, setSaving] = useState(false)

  const actualVal = parseFloat(actualStr)
  const hasValidInput = !isNaN(actualVal) && actualVal >= 0
  const diff = hasValidInput ? computeReconciliationDiff(actualVal, balance) : 0
  // Tolerance: differences smaller than 0.01 are treated as zero
  const hasDiff = Math.abs(diff) >= 0.01

  function handleCreate(mode: AdjustmentMode) {
    if (!currentUser || !userProfile || !hasValidInput || !hasDiff) return
    setSaving(true)

    const exchangeRate = getExchangeRate(balance.currency, mainCurrency)
    // The adjustment amount is the absolute difference.
    // The sign convention: positive diff means user has MORE than expected (wallet gains),
    // negative diff means user has LESS (wallet loses / missing money).
    // We store the signed value as totalAmount — but totalAmount is typically positive.
    // To handle negative adjustments, we use a simple convention:
    // - If diff > 0 (user has extra), adjustment adds to wallet → positive paidBy amount
    // - If diff < 0 (user is missing money), adjustment subtracts → we still store positive
    //   totalAmount but with a negative adjustment effect.
    //
    // Implementation: we store the absolute amount as totalAmount, and the sign is encoded
    // in the paidBy amount. For positive diff, paidBy.amount = diff (adds to wallet).
    // For negative diff, paidBy.amount = diff (negative, subtracts from wallet).
    // But Split.amount is supposed to be positive...
    //
    // Simplest approach: store totalAmount = abs(diff), and use two different patterns:
    // - diff > 0: paidBy amount = diff → computeWalletBalances adds this to adjustments
    // - diff < 0: paidBy amount = diff (negative) → computeWalletBalances adds negative
    //
    // Actually, looking at walletHelpers.computeWalletBalances, it uses:
    //   bucket.adjustments += paidAmount
    // where paidAmount = split.amount from paidBy. So we need split.amount to be signed.
    //
    // Let's just store the signed diff as the paidBy amount. totalAmount = abs(diff)
    // for display purposes, but the split carries the sign.
    const absDiff = Math.abs(diff)
    const totalAmountMain = Math.round(absDiff * exchangeRate * 100) / 100

    const directionLabel = diff > 0 ? 'surplus' : 'shortfall'
    const txName = `Reconciliation ${directionLabel} — ${balance.paymentMethodLabel}`

    const txId = createTransaction(travelId, {
      date: getTodayDDMMYYYY(),
      name: txName,
      totalAmount: absDiff,
      currency: balance.currency,
      exchangeRate,
      totalAmountMain,
      paymentMethod: balance.paymentMethod,
      // Signed split: positive = wallet gains, negative = wallet loses
      paidBy: [{ travelMemberId: currentTravelMemberId, amount: diff }],
      beneficiaries: [{ travelMemberId: currentTravelMemberId, amount: absDiff }],
      lastModifiedBy: currentUser.uid,
      createdBy: { type: 'user' as const, uid: currentUser.uid },
      type: 'adjustment',
      adjustmentMode: mode,
    })

    setSaving(false)
    setActualStr('')
    onSuccess(txId)
    onOpenChange(false)
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Reconcile — {balance.paymentMethodLabel} ({balance.currency})</DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-4 pb-6">
          {/* Computed balance */}
          <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-sm text-muted-foreground">Computed remaining</p>
            <p className="text-lg font-semibold">
              {formatAmount(balance.remaining)} {balance.currency}
            </p>
          </div>

          {/* Actual remaining input */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">How much do you actually have?</label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={actualStr}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActualStr(e.target.value)}
              autoFocus
            />
          </div>

          {/* Difference display */}
          {hasValidInput && (
            <div className="rounded-lg border px-3 py-2">
              <p className="text-sm text-muted-foreground">Difference</p>
              {hasDiff ? (
                <p className={`text-lg font-semibold ${
                  diff > 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {diff > 0 ? '+' : ''}{formatAmount(diff)} {balance.currency}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {diff > 0 ? '(you have more than expected)' : '(you have less than expected)'}
                  </span>
                </p>
              ) : (
                <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                  Balanced — no adjustment needed
                </p>
              )}
            </div>
          )}

          {/* Action buttons — only shown when there's a difference */}
          {hasValidInput && hasDiff && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">How should the difference be recorded?</p>

              <Button
                variant="outline"
                className="justify-start text-left"
                onClick={() => handleCreate('expense')}
                disabled={saving}
              >
                <div className="flex flex-col">
                  <span className="font-medium">Create expense</span>
                  <span className="text-xs text-muted-foreground">
                    Counts toward spending stats (category breakdown, totals)
                  </span>
                </div>
              </Button>

              <Button
                variant="outline"
                className="justify-start text-left"
                onClick={() => handleCreate('balance_only')}
                disabled={saving}
              >
                <div className="flex flex-col">
                  <span className="font-medium">Adjust balance only</span>
                  <span className="text-xs text-muted-foreground">
                    Corrects the wallet balance without affecting spending analytics
                  </span>
                </div>
              </Button>
            </div>
          )}

          {/* Cancel */}
          <Button
            variant="ghost"
            onClick={() => { setActualStr(''); onOpenChange(false) }}
          >
            Cancel
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
