// src/spaces/components/SpaceTabs.tsx
//
// Tab bar + swipe container for SpaceDetailPage.
// Supports both tap-to-switch and horizontal swipe gesture.
//
// Swipe implementation:
//   - Tracks touchstart/touchend X positions.
//   - If horizontal delta > SWIPE_THRESHOLD (50px) and > vertical delta,
//     switches tab in the swipe direction.
//   - No animation library needed — CSS transform + transition handles the slide.

import { useEffect, useRef, useState } from 'react'
import type { Space } from '@/spaces/types'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import type { TransferPrefill } from '@/transactions/components/TransactionForm'
import type { FilterRequest } from '@/transactions/utils/filterDimensions'
import { TransactionsTab } from '@/spaces/components/tabs/TransactionsTab'
import { BalanceTab } from '@/spaces/components/tabs/BalanceTab'
import { DashboardTab } from '@/spaces/components/tabs/DashboardTab'
import { ParametersTab } from '@/spaces/components/tabs/ParametersTab'

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'transactions', label: 'Transactions' },
  { id: 'balance',      label: 'Balance' },
  { id: 'dashboard',    label: 'Dashboard' },
  { id: 'parameters',   label: 'Parameters' },
] as const

type TabId = typeof TABS[number]['id']

const SWIPE_THRESHOLD = 50 // px

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SpaceTabsProps {
  space: Space
  transactions: TransactionWithStatus[]
  loadingTransactions: boolean
  transactionsError: string | null
  currentUserUid: string
  isSolo: boolean
  mainCurrency: string
  settlementCurrency: string
  settlementRate: number
  onSettlementCurrencyChange: (currency: string) => void
  onSettlementRateChange: (rate: number) => void
  onAddExpense: () => void
  onAddWithdrawal?: () => void
  onEditTransaction: (txId: string) => void
  onDeleteTransaction: (txId: string) => void
  onSpaceChange: (updated: Partial<Space>) => void
  /** Opens TransactionForm in transfer mode, optionally pre-filled with settlement data. */
  onCreateTransfer?: (prefill?: TransferPrefill) => void
  /** When set, SpaceTabs switches to this tab. Caller should reset to undefined after. */
  requestTab?: typeof TABS[number]['id']
  onRequestTabHandled?: () => void
  /** Dashboard drill-down (Phase 7a §5): a filter selection for the
   *  Transactions tab. Travels down as data; the tab switch is a separate
   *  requestTab, so the two mechanisms stay independent. */
  filterRequest?: FilterRequest
  /** Called when a dashboard breakdown row is tapped. */
  onDrillDown?: (request: Omit<FilterRequest, 'nonce'>) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SpaceTabs({
  space,
  transactions,
  loadingTransactions,
  transactionsError,
  currentUserUid,
  isSolo,
  mainCurrency,
  settlementCurrency,
  settlementRate,
  onSettlementCurrencyChange,
  onSettlementRateChange,
  onAddExpense,
  onAddWithdrawal,
  onEditTransaction,
  onDeleteTransaction,
  onSpaceChange,
  onCreateTransfer,
  requestTab,
  onRequestTabHandled,
  filterRequest,
  onDrillDown,
}: SpaceTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('transactions')

  // External tab navigation request — switch to the requested tab and notify caller
  useEffect(() => {
    if (requestTab && requestTab !== activeTab) {
      setActiveTab(requestTab)
      onRequestTabHandled?.()
    } else if (requestTab) {
      onRequestTabHandled?.()
    }
  }, [requestTab]) // eslint-disable-line react-hooks/exhaustive-deps
  const activeIndex = TABS.findIndex((t) => t.id === activeTab)

  // Touch tracking refs — no state needed, avoids re-renders
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    touchStartX.current = null
    touchStartY.current = null

    // Only act if horizontal movement dominates and exceeds threshold
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return

    if (dx < 0 && activeIndex < TABS.length - 1) {
      // Swipe left → next tab
      setActiveTab(TABS[activeIndex + 1].id)
    } else if (dx > 0 && activeIndex > 0) {
      // Swipe right → previous tab
      setActiveTab(TABS[activeIndex - 1].id)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Tab bar ── */}
      <div className="flex border-b">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-2 py-2.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Swipeable content area ── fills remaining height, clips horizontal overflow ── */}
      <div
        className="flex-1 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Sliding track — panels side by side, shifted by activeIndex.
            h-full ensures each panel matches the viewport height so panels
            scroll independently and there is no blank space below short tabs. */}
        <div
          className="flex h-full transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {TABS.map((tab) => (
            <div
              key={tab.id}
              className="h-full w-full shrink-0 overflow-y-auto pt-4 pb-24"
              // aria-hidden for non-active panels for a11y
              aria-hidden={tab.id !== activeTab}
            >
              {tab.id === 'transactions' && (
                <TransactionsTab
                  space={space}
                  transactions={transactions}
                  loading={loadingTransactions}
                  error={transactionsError}
                  currentUserUid={currentUserUid}
                  isSolo={isSolo}
                  mainCurrency={mainCurrency}
                  onAddExpense={onAddExpense}
                  onEditTransaction={onEditTransaction}
                  onDeleteTransaction={onDeleteTransaction}
                  filterRequest={filterRequest}
                />
              )}
              {tab.id === 'balance' && (
                <BalanceTab
                  transactions={transactions}
                  members={space.members}
                  isSolo={isSolo}
                  mainCurrency={mainCurrency}
                  spaceName={space.name}
                  settlementCurrency={settlementCurrency}
                  settlementRate={settlementRate}
                  onSettlementCurrencyChange={onSettlementCurrencyChange}
                  onSettlementRateChange={onSettlementRateChange}
                  defaultRates={space.defaultRates}
                  onCreateTransfer={onCreateTransfer}
                />
              )}
              {tab.id === 'dashboard' && (
                <DashboardTab
                  space={space}
                  transactions={transactions}
                  currentUserUid={currentUserUid}
                  isSolo={isSolo}
                  mainCurrency={mainCurrency}
                  onEditTransaction={onEditTransaction}
                  onAddWithdrawal={onAddWithdrawal}
                  onSpaceChange={onSpaceChange}
                  onDrillDown={onDrillDown}
                />
              )}
              {tab.id === 'parameters' && (
                <ParametersTab
                  space={space}
                  transactions={transactions}
                  onSpaceChange={onSpaceChange}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}