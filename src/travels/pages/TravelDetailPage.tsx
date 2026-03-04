import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { Travel } from '@/travels/types'
import { useTransactions, type TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { TransactionForm } from '@/transactions/components/TransactionForm'

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

function formatTravelDate(date?: Timestamp): string {
  if (!date) return ''
  return date.toDate().toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatTransactionDateLabel(dateString: string): string {
  const [day, month, year] = dateString.split('-').map((part) => parseInt(part, 10))
  if (!day || !month || !year) return dateString
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
  })
}

// ---------------------------------------------------------------------------
// Pending badge with "synced" flash
// ---------------------------------------------------------------------------

function PendingBadge({ isPending }: { isPending: boolean }) {
  const [showSynced, setShowSynced] = useState(false)
  const prevPendingRef = useRef(isPending)

  useEffect(() => {
    if (prevPendingRef.current === true && isPending === false) {
      setShowSynced(true)
      const timer = setTimeout(() => setShowSynced(false), 2000)
      return () => clearTimeout(timer)
    }
    prevPendingRef.current = isPending
  }, [isPending])

  if (isPending) {
    return (
      <span
        title="Saved locally — will sync automatically when back online."
        className="ml-1 cursor-help rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-600"
      >
        ⏳ not synced
      </span>
    )
  }

  if (showSynced) {
    return (
      <span className="ml-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
        ✅ synced
      </span>
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// Transaction list item
// ---------------------------------------------------------------------------
function TransactionListItem({
  transaction,
  members,
}: {
  transaction: TransactionWithStatus
  members: Travel['members']
}) {
  const dateLabel = formatTransactionDateLabel(transaction.date)
  const categoryEmoji = getCategoryEmoji(transaction.category)
  const primaryPayerUid = transaction.paidBy[0]?.uid ?? ''
  const primaryPayerName =
    members.find((m) => m.uid === primaryPayerUid)?.displayName ?? primaryPayerUid

  return (
    <Card className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="w-12 shrink-0 text-center">
          <span className="text-xs font-medium text-muted-foreground">{dateLabel}</span>
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm">{categoryEmoji}</span>
            <CardTitle className="text-sm font-medium leading-tight">{transaction.name}</CardTitle>
            <PendingBadge isPending={transaction.isPending} />
          </div>
          <CardDescription className="text-xs">
            Paid by <span className="font-medium text-foreground">{primaryPayerName}</span>
            {/* Show location if present */}
            {(transaction.city || transaction.country) && (
              <span className="ml-1 text-muted-foreground">
                · {[transaction.city, transaction.country].filter(Boolean).join(', ')}
              </span>
            )}
          </CardDescription>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold">
          {transaction.totalAmount.toFixed(2)} {transaction.currency}
        </div>
        <div className="text-xs text-muted-foreground">
          {transaction.totalAmountMain.toFixed(2)} main
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Save banner
// ---------------------------------------------------------------------------

type BannerState = 'pending' | 'saved' | null

function SaveBanner({ state, onDismiss }: { state: BannerState; onDismiss: () => void }) {
  useEffect(() => {
    if (state === null) return
    const timer = setTimeout(onDismiss, 3000)
    return () => clearTimeout(timer)
  }, [state, onDismiss])

  if (state === null) return null

  return (
    <div
      className={`fixed left-0 right-0 top-0 z-50 px-4 py-3 text-center text-sm font-medium text-white shadow-md ${
        state === 'pending' ? 'bg-orange-500' : 'bg-green-600'
      }`}
    >
      {state === 'pending'
        ? '⏳ Saved locally — will sync when back online'
        : '✅ Transaction saved'}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export function TravelDetailPage() {
  const { travelId } = useParams()
  const navigate = useNavigate()

  const [travel, setTravel] = useState<Travel | null>(null)
  const [loadingTravel, setLoadingTravel] = useState<boolean>(true)
  const [travelError, setTravelError] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false)

  const [watchedTxId, setWatchedTxId] = useState<string | null>(null)
  const [bannerState, setBannerState] = useState<BannerState>(null)

  const { transactions, loading: loadingTransactions, error: transactionsError } =
    useTransactions(travelId)

  // Watch the newly created transaction in the live snapshot.
  // Orange when isPending=true (offline), green when it flips to false (synced).
  useEffect(() => {
    if (!watchedTxId) return
    const watched = transactions.find((tx) => tx.txId === watchedTxId)
    if (!watched) return
    if (watched.isPending) {
      setBannerState('pending')
    } else {
      setBannerState('saved')
      setWatchedTxId(null)
    }
  }, [transactions, watchedTxId])

  useEffect(() => {
    if (!travelId) {
      setTravel(null)
      setLoadingTravel(false)
      setTravelError('Missing travel identifier.')
      return
    }

    const id = travelId

    async function fetchTravel() {
      try {
        const ref = doc(db, 'travels', id)
        const snapshot = await getDoc(ref)
        if (!snapshot.exists()) {
          setTravel(null)
          setTravelError('This travel does not exist or you do not have access to it.')
        } else {
          const data = snapshot.data()
          setTravel({
            travelId: snapshot.id,
            name: data.name as string,
            emoji: data.emoji as string | undefined,
            description: data.description as string | undefined,
            startDate: data.startDate as Timestamp | undefined,
            endDate: data.endDate as Timestamp | undefined,
            members: data.members ?? [],
            memberUids: data.memberUids ?? [],
            createdBy: data.createdBy as string,
            createdAt: data.createdAt as Timestamp,
            currencies: data.currencies ?? [],
            // Read settings if present — older travels won't have this field.
            // The form treats undefined settings as { trackLocation: true }.
            settings: data.settings,
          })
          setTravelError(null)
        }
      } catch {
        setTravel(null)
        setTravelError('Unable to load this travel. Please try again later.')
      } finally {
        setLoadingTravel(false)
      }
    }

    setLoadingTravel(true)
    fetchTravel()
  }, [travelId])

  const headerDates = useMemo(() => {
    if (!travel) return ''
    const start = formatTravelDate(travel.startDate)
    const end = formatTravelDate(travel.endDate)
    if (start && end) return `${start} – ${end}`
    if (start) return start
    return ''
  }, [travel])

  const handleBack = () => navigate('/travels')
  const handleAddExpense = () => setIsFormOpen(true)

  function handleTransactionSaved(newTxId: string) {
    setIsFormOpen(false)
    setWatchedTxId(newTxId)
    setBannerState(null)
  }

  if (loadingTravel) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <Button type="button" variant="outline" className="px-3 py-1 text-xs" onClick={handleBack}>
            Back
          </Button>
          <h1 className="text-base font-semibold">Loading travel…</h1>
        </header>
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </main>
      </div>
    )
  }

  if (!travel || travelError) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <Button type="button" variant="outline" className="px-3 py-1 text-xs" onClick={handleBack}>
            Back
          </Button>
          <h1 className="text-base font-semibold">Travel not found</h1>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-lg font-medium">We couldn&apos;t find this travel.</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            It may have been deleted, or you might not have permission to view it.
          </p>
          <Button type="button" onClick={handleBack}>Back to travels</Button>
        </main>
      </div>
    )
  }

  const hasTransactions = transactions.length > 0

  return (
    <div className="relative flex min-h-screen flex-col bg-background pb-20">

      <SaveBanner state={bannerState} onDismiss={() => setBannerState(null)} />

      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" className="px-3 py-1 text-xs" onClick={handleBack}>
            Back
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-lg">
              <span>{travel.emoji || '🌍'}</span>
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">{travel.name}</h1>
              {headerDates && <p className="text-xs text-muted-foreground">{headerDates}</p>}
            </div>
          </div>
        </div>
        <Link to="/travels" className="text-xs font-medium text-primary underline-offset-2 hover:underline">
          All travels
        </Link>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-4">
        {travel.description && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">About this trip</CardTitle>
              <CardDescription className="text-xs">{travel.description}</CardDescription>
            </CardHeader>
          </Card>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Transactions</h2>
            {transactionsError && <p className="text-xs text-destructive">{transactionsError}</p>}
          </div>

          {loadingTransactions ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : !hasTransactions ? (
            <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm font-medium">No expenses recorded yet.</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Start by adding your first expense for this trip.
              </p>
              <Button type="button" size="sm" onClick={handleAddExpense}>
                Add your first expense
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <TransactionListItem key={tx.txId} transaction={tx} members={travel.members} />
              ))}
            </div>
          )}
        </section>
      </main>

      <button
        type="button"
        onClick={handleAddExpense}
        className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground shadow-lg shadow-primary/40 transition hover:bg-primary/90"
      >
        +
      </button>

      {/* Transaction creation bottom sheet.
          existingTransactions is passed so TransactionForm can derive
          previously used country/city values and pre-fill the last used ones.
          transactions is already loaded — no extra Firestore call needed. */}
      <Drawer open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>New expense</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">
            <TransactionForm
              travelId={travelId!}
              members={travel.members}
              travelSettings={travel.settings}
              existingTransactions={transactions}
              onSuccess={handleTransactionSaved}
              onCancel={() => setIsFormOpen(false)}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}