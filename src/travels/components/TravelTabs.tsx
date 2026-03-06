// src/travels/components/TravelTabs.tsx
//
// Tab bar + swipe container for TravelDetailPage.
// Supports both tap-to-switch and horizontal swipe gesture.
//
// Swipe implementation:
//   - Tracks touchstart/touchend X positions.
//   - If horizontal delta > SWIPE_THRESHOLD (50px) and > vertical delta,
//     switches tab in the swipe direction.
//   - No animation library needed — CSS transform + transition handles the slide.

import { useRef, useState } from 'react'
import type { Travel } from '@/travels/types'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import { TransactionsTab } from '@/travels/components/tabs/TransactionsTab'
import { BalanceTab } from '@/travels/components/tabs/BalanceTab'
import { ParametersTab } from '@/travels/components/tabs/ParametersTab'

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'transactions', label: 'Transactions' },
  { id: 'balance',      label: 'Balance' },
  { id: 'parameters',   label: 'Parameters' },
] as const

type TabId = typeof TABS[number]['id']

const SWIPE_THRESHOLD = 50 // px

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TravelTabsProps {
  travel: Travel
  transactions: TransactionWithStatus[]
  loadingTransactions: boolean
  transactionsError: string | null
  currentUserUid: string
  isSolo: boolean
  onAddExpense: () => void
  onEditTransaction: (tx: TransactionWithStatus) => void
  onTravelChange: (updated: Partial<Travel>) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TravelTabs({
  travel,
  transactions,
  loadingTransactions,
  transactionsError,
  currentUserUid,
  isSolo,
  onAddExpense,
  onEditTransaction,
  onTravelChange,
}: TravelTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('transactions')
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
    <div className="flex flex-col">
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

      {/* ── Swipeable content area ── */}
      <div
        className="overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Sliding track — 3 panels side by side, shifted by activeIndex */}
        <div
          className="flex transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {TABS.map((tab) => (
            <div
              key={tab.id}
              className="w-full shrink-0 pt-4"
              // aria-hidden for non-active panels for a11y
              aria-hidden={tab.id !== activeTab}
            >
              {tab.id === 'transactions' && (
                <TransactionsTab
                  transactions={transactions}
                  loading={loadingTransactions}
                  error={transactionsError}
                  members={travel.members}
                  currentUserUid={currentUserUid}
                  isSolo={isSolo}
                  onAddExpense={onAddExpense}
                  onEditTransaction={onEditTransaction}
                />
              )}
              {tab.id === 'balance' && <BalanceTab />}
              {tab.id === 'parameters' && (
                <ParametersTab
                  travel={travel}
                  transactions={transactions}
                  onTravelChange={onTravelChange}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}