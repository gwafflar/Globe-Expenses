// src/travels/pages/TravelDetailPage.tsx
//
// Travel detail page. Fetches the travel document once on mount (getDoc),
// then renders TravelTabs which owns the three-tab UI.
// Transaction list is subscribed via useTransactions (onSnapshot).

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { LabeledItem, Travel } from '@/travels/types'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { useTransactions } from '@/transactions/hooks/useTransactions'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { TransactionForm } from '@/transactions/components/TransactionForm'
import { TravelTabs } from '@/travels/components/TravelTabs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTravelDate(date?: Timestamp): string {
  if (!date) return ''
  return date.toDate().toLocaleDateString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

type BannerState = 'pending' | 'saved' | null

function SaveBanner({ state, onDismiss }: { state: BannerState; onDismiss: () => void }) {
  useEffect(() => {
    if (state === null) return
    const t = setTimeout(onDismiss, 3000)
    return () => clearTimeout(t)
  }, [state, onDismiss])

  if (state === null) return null
  return (
    <div className={`fixed left-0 right-0 top-0 z-50 px-4 py-3 text-center text-sm font-medium text-white shadow-md ${
      state === 'pending' ? 'bg-orange-500' : 'bg-green-600'
    }`}>
      {state === 'pending' ? '⏳ Saved locally — will sync when back online' : '✅ Transaction saved'}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TravelDetailPage() {
  const { travelId } = useParams()
  const navigate = useNavigate()
  const { currentUser } = useAuthStore()
  const currentUserUid = currentUser?.uid ?? ''

  const [travel, setTravel] = useState<Travel | null>(null)
  const [loadingTravel, setLoadingTravel] = useState(true)
  const [travelError, setTravelError] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [watchedTxId, setWatchedTxId] = useState<string | null>(null)
  const [bannerState, setBannerState] = useState<BannerState>(null)

  const { transactions, loading: loadingTransactions, error: transactionsError } =
    useTransactions(travelId)

  // Watch newly created transaction for pending→synced transition
  useEffect(() => {
    if (!watchedTxId) return
    const watched = transactions.find((tx) => tx.txId === watchedTxId)
    if (!watched) return
    setBannerState(watched.isPending ? 'pending' : 'saved')
    if (!watched.isPending) setWatchedTxId(null)
  }, [transactions, watchedTxId])

  // Fetch travel document once on mount
  useEffect(() => {
    if (!travelId) {
      setLoadingTravel(false)
      setTravelError('Missing travel identifier.')
      return
    }
    const id = travelId
    setLoadingTravel(true)
    async function fetchTravel() {
      try {
        const snapshot = await getDoc(doc(db, 'travels', id))
        if (!snapshot.exists()) {
          setTravelError('This travel does not exist or you do not have access to it.')
        } else {
          const d = snapshot.data()
          setTravel({
            travelId: snapshot.id,
            name: d.name as string,
            emoji: d.emoji as string | undefined,
            description: d.description as string | undefined,
            startDate: d.startDate as Timestamp | undefined,
            endDate: d.endDate as Timestamp | undefined,
            members: d.members ?? [],
            memberUids: d.memberUids ?? [],
            createdBy: d.createdBy as string,
            createdAt: d.createdAt as Timestamp,
            currencies: d.currencies ?? [],
            settings: d.settings,
            categories: d.categories ?? [],
            paymentMethods: d.paymentMethods ?? [],
            countries: d.countries ?? [],
            cities: d.cities ?? [],
          })
        }
      } catch {
        setTravelError('Unable to load this travel. Please try again later.')
      } finally {
        setLoadingTravel(false)
      }
    }
    fetchTravel()
  }, [travelId])

  // Called by ParametersTab when it saves a field change — keeps local state in sync
  function handleTravelChange(updated: Partial<Travel>) {
    setTravel((prev) => prev ? { ...prev, ...updated } : prev)
  }

  // Called by TransactionForm after a new transaction introduces a country/city
  // not yet in the travel's lists — updates local state immediately so dropdowns
  // and ParametersTab reflect the new value without a page reload.
  function handleLocationAdded(newCountry: LabeledItem | null, newCity: LabeledItem | null) {
    setTravel((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        countries: newCountry ? [...prev.countries, newCountry] : prev.countries,
        cities: newCity ? [...prev.cities, newCity] : prev.cities,
      }
    })
  }

  const headerDates = useMemo(() => {
    if (!travel) return ''
    const s = formatTravelDate(travel.startDate)
    const e = formatTravelDate(travel.endDate)
    return s && e ? `${s} – ${e}` : s
  }, [travel])

  const isSolo = (travel?.members.length ?? 0) === 1

  const handleBack = () => navigate('/travels')

  function handleTransactionSaved(newTxId: string) {
    setIsFormOpen(false)
    setWatchedTxId(newTxId)
    setBannerState(null)
  }

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (loadingTravel) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <Button type="button" variant="outline" className="px-3 py-1 text-xs" onClick={handleBack}>Back</Button>
          <h1 className="text-base font-semibold">Loading travel…</h1>
        </header>
        <main className="flex flex-1 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </main>
      </div>
    )
  }

  if (!travel || travelError) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <Button type="button" variant="outline" className="px-3 py-1 text-xs" onClick={handleBack}>Back</Button>
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

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="relative flex min-h-screen flex-col bg-background pb-20">
      <SaveBanner state={bannerState} onDismiss={() => setBannerState(null)} />

      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" className="px-3 py-1 text-xs" onClick={handleBack}>
            Back
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-lg">
              {travel.emoji || '🌍'}
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">{travel.name}</h1>
              {headerDates && <p className="text-xs text-muted-foreground">{headerDates}</p>}
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

      {/* Tab content */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4">
        <TravelTabs
          travel={travel}
          transactions={transactions}
          loadingTransactions={loadingTransactions}
          transactionsError={transactionsError}
          currentUserUid={currentUserUid}
          isSolo={isSolo}
          onAddExpense={() => setIsFormOpen(true)}
          onTravelChange={handleTravelChange}
        />
      </main>

      {/* FAB */}
      <button
        type="button"
        onClick={() => setIsFormOpen(true)}
        className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground shadow-lg shadow-primary/40 transition hover:bg-primary/90"
      >
        +
      </button>

      {/* New expense drawer */}
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
              travelCategories={travel.categories}
              travelPaymentMethods={travel.paymentMethods}
              travelCurrencies={travel.currencies}
              travelCountries={travel.countries}
              travelCities={travel.cities}
              existingTransactions={transactions}
              onSuccess={handleTransactionSaved}
              onCancel={() => setIsFormOpen(false)}
              onLocationAdded={handleLocationAdded}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}