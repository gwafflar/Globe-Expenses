import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { Travel } from '@/travels/types'
import { useTransactions } from '@/transactions/hooks/useTransactions'
import type { Transaction } from '@/transactions/types'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// Maps category names to display emojis.
// Hardcoded for v1 — user-customizable in v2 settings.
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

// Helper to format a Firestore Timestamp (or undefined) to "DD MMM YYYY".
function formatTravelDate(date?: Timestamp): string {
  if (!date) return ''
  const jsDate = date.toDate()
  return jsDate.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// Helper to format the transaction's date string ("DD-MM-YYYY") into "DD MMM".
function formatTransactionDateLabel(dateString: Transaction['date']): string {
  const [day, month, year] = dateString.split('-').map((part) => parseInt(part, 10))
  if (!day || !month || !year) return dateString

  const jsDate = new Date(year, month - 1, day)
  return jsDate.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
  })
}

function TransactionListItem({
  transaction,
  members,
}: {
  transaction: Transaction
  members: Travel['members']
}) {
  const dateLabel = formatTransactionDateLabel(transaction.date)
  const categoryEmoji = getCategoryEmoji(transaction.category)

  // Resolve paidBy uid to displayName using the travel's members list.
  // Falls back to the uid itself if the member isn't found (shouldn't happen in practice).
  const primaryPayerUid = transaction.paidBy[0]?.uid ?? ''
  const primaryPayerName =
    members.find((m) => m.uid === primaryPayerUid)?.displayName ?? primaryPayerUid

  return (
    <Card className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        {/* Date — plain text, no circle */}
        <div className="w-12 shrink-0 text-center">
          <span className="text-xs font-medium text-muted-foreground">{dateLabel}</span>
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{categoryEmoji}</span>
            <CardTitle className="text-sm font-medium leading-tight">{transaction.name}</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Paid by <span className="font-medium text-foreground">{primaryPayerName}</span>
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

export function TravelDetailPage() {
  const { travelId } = useParams()
  const navigate = useNavigate()

  const [travel, setTravel] = useState<Travel | null>(null)
  const [loadingTravel, setLoadingTravel] = useState<boolean>(true)
  const [travelError, setTravelError] = useState<string | null>(null)

  const {
    transactions,
    loading: loadingTransactions,
    error: transactionsError,
  } = useTransactions(travelId)

  useEffect(() => {
    if (!travelId) {
      setTravel(null)
      setLoadingTravel(false)
      setTravelError('Missing travel identifier.')
      return
    }

    const id = travelId

    // Fetch the travel document once to display its metadata.
    // getDoc performs a single read (no live subscription).
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

  const handleBack = () => {
    navigate('/travels')
  }

  const handleAddExpense = () => {
    // Placeholder for transaction creation flow (Prompt B).
    // For now we simply log; later this will navigate or open a modal.
    // eslint-disable-next-line no-console
    console.log('Open transaction creation (to be implemented).')
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
          <Button type="button" onClick={handleBack}>
            Back to travels
          </Button>
        </main>
      </div>
    )
  }

  const hasTransactions = transactions.length > 0

  return (
    <div className="relative flex min-h-screen flex-col bg-background pb-20">
      {/* Top bar with back button and travel title */}
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="px-3 py-1 text-xs"
            onClick={handleBack}
          >
            Back
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-lg">
              <span>{travel.emoji || '🌍'}</span>
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">{travel.name}</h1>
              {headerDates && (
                <p className="text-xs text-muted-foreground">{headerDates}</p>
              )}
            </div>
          </div>
        </div>
        <Link
          to="/travels"
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          All travels
        </Link>
      </header>

      <main className="flex-1 space-y-4 px-4 py-4 mx-auto w-full max-w-2xl">
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
            {transactionsError && (
              <p className="text-xs text-destructive">{transactionsError}</p>
            )}
          </div>

          {loadingTransactions ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : !hasTransactions ? (
            <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm font-medium">No expenses recorded yet.</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Start by adding your first expense for this trip. You can always edit or delete it
                later.
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

      {/* Floating Action Button for creating a new transaction.
          Currently a placeholder that will be wired in a later prompt. */}
      <button
        type="button"
        onClick={handleAddExpense}
        className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground shadow-lg shadow-primary/40 transition hover:bg-primary/90"
      >
        +
      </button>
    </div>
  )
}

