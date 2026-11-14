// src/spaces/components/tabs/BalanceTab.tsx
// Balance & settlement tab — shows per-member net balances and optimal settlements.
//
// Normalisation: legacy splits (pre-Session-009) must be normalised before reaching
// this component. SpaceTabs passes transactions from useTransactions which are
// already normalised in the parent (same pattern as DashboardTab).

import { useMemo, useState } from 'react'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import type { SpaceMember } from '@/spaces/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  computeBalances,
  computeBalancesRaw,
  computeSettlements,
  getSingleCurrency,
} from '@/spaces/utils/balanceUtils'
import { normalizeTransactionSplits } from '@/spaces/components/tabs/dashboardHelpers'
import { affectsBalance } from '@/transactions/utils/walletHelpers'
import { SettlementCurrencyDrawer } from '@/spaces/components/SettlementCurrencyDrawer'
import type { TransferPrefill } from '@/transactions/components/TransactionForm'
import { Check, Plus } from 'lucide-react'
import { useT } from '@/i18n'

// ---------------------------------------------------------------------------
// Avatar colour palette — cycles when members > palette length
// ---------------------------------------------------------------------------

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-purple-500',
  'bg-rose-500',
]

function avatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length]
}

/** First letter of displayName, uppercased. */
function initials(name: string): string {
  return (name.charAt(0) || '?').toUpperCase()
}

// ---------------------------------------------------------------------------
// Per-member paid / share totals (for the subtitle line)
// ---------------------------------------------------------------------------

interface MemberTotals {
  paid: number
  share: number
}

/**
 * Compute total paid and total share (beneficiary) per member.
 * When useRaw is true, amounts are used directly (no exchange rate);
 * otherwise amounts are converted to main currency via tx.exchangeRate.
 */
function computeMemberTotals(
  transactions: TransactionWithStatus[],
  members: SpaceMember[],
  useRaw = false,
): Map<string, MemberTotals> {
  const totals = new Map<string, MemberTotals>()
  for (const m of members) {
    totals.set(m.travelMemberId, { paid: 0, share: 0 })
  }
  for (const tx of transactions) {
    const rate = useRaw ? 1 : tx.exchangeRate
    for (const s of tx.paidBy) {
      const t = totals.get(s.travelMemberId)
      if (t) t.paid += s.amount * rate
    }
    for (const s of tx.beneficiaries) {
      const t = totals.get(s.travelMemberId)
      if (t) t.share += s.amount * rate
    }
  }
  return totals
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function fmt(n: number, currency: string): string {
  return `${n.toFixed(2)} ${currency}`
}

/** Convert a mainCurrency amount to settlement currency, rounded to 2dp. */
function toSettlement(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100
}

function netClass(net: number): string {
  if (net > 0.005) return 'text-emerald-600 dark:text-emerald-400'
  if (net < -0.005) return 'text-orange-600 dark:text-orange-400'
  return 'text-muted-foreground'
}

function netPrefix(net: number): string {
  return net > 0.005 ? '+' : ''
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BalanceTabProps {
  transactions: TransactionWithStatus[]
  members: SpaceMember[]
  isSolo: boolean
  mainCurrency: string
  spaceName: string
  settlementCurrency: string
  settlementRate: number
  onSettlementCurrencyChange: (currency: string) => void
  onSettlementRateChange: (rate: number) => void
  /** Per-space default exchange rates, passed to SettlementCurrencyDrawer. */
  defaultRates?: Record<string, number>
  /** Opens TransactionForm in transfer mode, optionally pre-filled with settlement data. */
  onCreateTransfer?: (prefill?: TransferPrefill) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BalanceTab({
  transactions,
  members,
  isSolo,
  mainCurrency,
  spaceName,
  settlementCurrency,
  settlementRate,
  onSettlementCurrencyChange,
  onSettlementRateChange,
  defaultRates,
  onCreateTransfer,
}: BalanceTabProps) {
  // translation hook — re-renders when the language changes
  const t = useT()
  const [copied, setCopied] = useState(false)
  const [currencyDialogOpen, setCurrencyDrawerOpen] = useState(false)

  // Normalise legacy splits (same pattern as DashboardTab)
  const normalizedTx = useMemo(
    () => normalizeTransactionSplits(transactions, members),
    [transactions, members],
  )

  // Filter to balance-affecting transactions — expenses, transfers, and expense-mode
  // adjustments create inter-member debts. Withdrawals and balance-only adjustments don't.
  // Note: transfers affect balance (shift who owes whom) but don't count as spending.
  const spendingTx = useMemo(
    () => normalizedTx.filter(affectsBalance),
    [normalizedTx],
  )

  // Detect if all balance-affecting transactions use a single currency.
  // When the settlement currency matches this single currency, we skip the
  // mainCurrency conversion to avoid lossy round-trip distortion (e.g. MYR→EUR→MYR).
  const singleCurrency = useMemo(() => getSingleCurrency(spendingTx), [spendingTx])
  const useRawBalances = singleCurrency !== null && settlementCurrency === singleCurrency

  // Core computations — memoised so they don't recompute on unrelated re-renders.
  // When useRawBalances is true, balances are computed in the transaction currency
  // (no exchange rate applied), and the settlement rate is ignored (effectively 1).
  const balances = useMemo(
    () => useRawBalances
      ? computeBalancesRaw(spendingTx, members)
      : computeBalances(spendingTx, members),
    [spendingTx, members, useRawBalances],
  )
  const settlements = useMemo(
    () => computeSettlements(balances),
    [balances],
  )
  const memberTotals = useMemo(
    () => computeMemberTotals(spendingTx, members, useRawBalances),
    [spendingTx, members, useRawBalances],
  )

  // Build a travelMemberId → index map for deterministic avatar colours
  const memberIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    members.forEach((m, i) => map.set(m.travelMemberId, i))
    return map
  }, [members])

  // Max abs(net) for proportional bar widths
  const maxAbs = useMemo(
    () => Math.max(...balances.map((b) => Math.abs(b.net)), 0.01),
    [balances],
  )

  // ── Solo upsell ──
  if (isSolo) {
    return (
      <Card className="border-primary/30">
        <CardContent className="px-5 py-4">
          <p className="text-xs text-muted-foreground">{t.balance.soloKicker}</p>
          <p className="mt-1 text-sm font-semibold">{t.balance.soloTitle}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {t.balance.soloBody}
          </p>
        </CardContent>
      </Card>
    )
  }

  // ── Empty state ──
  if (transactions.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {t.balance.empty}
      </p>
    )
  }

  // When useRawBalances is true, balances are already in the settlement currency.
  // No need to apply settlementRate — use 1 instead.
  const displayRate = useRawBalances ? 1 : settlementRate
  // Display currency for balances: in raw mode, use the single transaction currency;
  // otherwise use mainCurrency for the net balance section.
  const balanceDisplayCurrency = useRawBalances ? settlementCurrency : mainCurrency

  // ── Copy handler — uses settlement currency for amounts ──
  function handleCopy() {
    const lines = settlements.map(
      (s) => `${s.fromName} → ${s.toName}: ${fmt(toSettlement(s.amount, displayRate), settlementCurrency)}`,
    )
    // The copied text is meant to be pasted to other people, so it is written
    // in the current UI language (it is not a data format).
    const text = [
      t.balance.summary.header({ spaceName }),
      '──────────────────────────────────',
      ...lines,
      '──────────────────────────────────',
      t.balance.summary.madeWith,
      t.balance.summary.inviteLink,
    ].join('\n')

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  // ── Settlement currency drawer callback ──
  function handleSettlementApply(currency: string, rate: number) {
    onSettlementCurrencyChange(currency)
    onSettlementRateChange(rate)
  }

  // ── Avatar helper (shared between balance rows and settlement cards) ──
  function Avatar({ memberId }: { memberId: string }) {
    const idx = memberIndexMap.get(memberId) ?? 0
    const name = members.find((m) => m.travelMemberId === memberId)?.displayName ?? ''
    return (
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColor(idx)}`}
      >
        {initials(name)}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0">
      {/* ── Net balances (always in mainCurrency) ── */}
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t.balance.netBalances}
      </h3>

      <div className="flex flex-col gap-3">
        {balances.map((b) => {
          const totals = memberTotals.get(b.memberId)
          const barWidth = maxAbs > 0.01 ? (Math.abs(b.net) / maxAbs) * 100 : 0
          const barColor = b.net > 0.005 ? 'bg-emerald-500' : b.net < -0.005 ? 'bg-orange-500' : 'bg-muted'

          return (
            <div key={b.memberId} className="flex items-center gap-3">
              <Avatar memberId={b.memberId} />

              {/* Name + subtitle */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{b.displayName}</p>
                {totals && (
                  <p className="text-xs text-muted-foreground">
                    {t.balance.totals({
                      spent: fmt(totals.share, balanceDisplayCurrency),
                      paid: fmt(totals.paid, balanceDisplayCurrency),
                    })}
                  </p>
                )}
              </div>

              {/* Net amount + bar */}
              <div className="flex flex-col items-end gap-0.5">
                <span className={`text-sm font-semibold tabular-nums ${netClass(b.net)}`}>
                  {netPrefix(b.net)}{fmt(b.net, balanceDisplayCurrency)}
                </span>
                {/* Proportional bar */}
                <div className="h-1 w-14 rounded-full bg-muted">
                  <div
                    className={`h-1 rounded-full ${barColor}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Settlements (amounts in settlementCurrency) ── */}
      {settlements.length > 0 && (
        <>
          {/* Separator */}
          <div className="my-4 border-t" />

          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t.balance.suggestedSettlements}
          </h3>

          <div className="flex flex-col gap-2">
            {settlements.map((s, i) => {
              const settlementAmount = toSettlement(s.amount, displayRate)
              return (
                <Card key={i} className="flex flex-col gap-2 px-3 py-2.5">
                  {/* Settlement row: from → to + amount */}
                  <div className="flex items-center gap-2">
                    <Avatar memberId={s.fromId} />
                    <span className="truncate text-sm">{s.fromName}</span>
                    <span className="text-xs text-muted-foreground">→</span>
                    <span className="truncate text-sm">{s.toName}</span>
                    <Avatar memberId={s.toId} />
                    <span className="ml-auto text-sm font-medium tabular-nums">
                      {fmt(settlementAmount, settlementCurrency)}
                    </span>
                  </div>
                  {/* "Mark as paid" button — opens TransactionForm as a pre-filled transfer */}
                  {onCreateTransfer && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => onCreateTransfer({
                        amount: settlementAmount,
                        currency: settlementCurrency,
                        fromMemberId: s.fromId,
                        toMemberId: s.toId,
                      })}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      {t.balance.markAsPaid}
                    </Button>
                  )}
                </Card>
              )
            })}
          </div>

          {/* Change currency + copy + add settlement — separated by a discreet border */}
          <div className="mt-3 flex flex-col gap-2 border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={() => setCurrencyDrawerOpen(true)}
            >
              {settlementCurrency === mainCurrency
                ? t.balance.changeCurrency
                : `${settlementCurrency} ↗`}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleCopy}
            >
              {copied ? t.common.copied : t.balance.copySummary}
            </Button>
            {/* General "Add a settlement" — opens a blank transfer form */}
            {onCreateTransfer && (
              <Button
                className="w-full"
                onClick={() => onCreateTransfer()}
              >
                <Plus className="mr-1 h-4 w-4" />
                {t.balance.addSettlement}
              </Button>
            )}
          </div>
        </>
      )}

      {/* ── Settlement currency drawer ── */}
      <SettlementCurrencyDrawer
        open={currencyDialogOpen}
        onOpenChange={setCurrencyDrawerOpen}
        mainCurrency={mainCurrency}
        currentCurrency={settlementCurrency}
        currentRate={settlementRate}
        onApply={handleSettlementApply}
        defaultRates={defaultRates}
      />
    </div>
  )
}
