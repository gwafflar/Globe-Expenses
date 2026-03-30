// src/travels/pages/TravelDetailPage.tsx
//
// Travel detail page. Fetches the travel document once on mount (getDoc),
// then renders TravelTabs which owns the three-tab UI.
// Transaction list is subscribed via useTransactions (onSnapshot).

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { LabeledItem, Travel } from '@/travels/types'
import { normaliseMember, getTravelMainCurrency } from '@/travels/types'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { usePendingInvites } from '@/friends/hooks/usePendingInvites'
import { ChevronLeft } from 'lucide-react'

function avatarHue(uid: string): number {
  let hash = 0
  for (const ch of uid) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff
  return Math.abs(hash) % 360
}
import { useTransactions, type TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import { Button } from '@/components/ui/button'
import { TransactionForm } from '@/transactions/components/TransactionForm'
import type { TransactionType } from '@/transactions/types'
import { TravelTabs } from '@/travels/components/TravelTabs'
import { InstallPromptBanner } from '@/shared/components/InstallPromptBanner'
import { deleteTransaction } from '@/transactions/services/transactionService'
import { unarchiveTravel } from '@/travels/services/travelService'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// ArchiveBanner — shown at the top of an archived travel with unarchive action.
// Shows loading state while unarchiving, then green confirmation for 10 seconds.
// ---------------------------------------------------------------------------

function ArchiveBanner({
  travel,
  currentUserUid,
  onTravelChange,
}: {
  travel: Travel
  currentUserUid: string
  onTravelChange: (updated: Partial<Travel>) => void
}) {
  const isArchived = (travel.archivedByUids ?? []).includes(currentUserUid)
  const [unarchiving, setUnarchiving] = useState(false)
  const [done, setDone] = useState(false)

  // Auto-dismiss the green confirmation after 10 seconds
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(false), 10000)
    return () => clearTimeout(t)
  }, [done])

  if (!isArchived && !done) return null

  async function handleUnarchive() {
    setUnarchiving(true)
    await unarchiveTravel(travel.travelId, currentUserUid)
    onTravelChange({
      archivedByUids: (travel.archivedByUids ?? []).filter((u) => u !== currentUserUid),
    })
    setUnarchiving(false)
    setDone(true)
  }

  // Green confirmation after successful unarchive
  if (done) {
    return (
      <div className="mx-4 mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
        This travel has been unarchived and is back in your active list.
      </div>
    )
  }

  // Amber banner with unarchive action
  return (
    <div className="mx-4 mt-2 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950">
      <span className="text-amber-800 dark:text-amber-200">This travel is archived.</span>
      <button
        type="button"
        onClick={handleUnarchive}
        disabled={unarchiving}
        className="text-sm font-medium text-amber-700 underline hover:text-amber-900 disabled:opacity-50 disabled:no-underline dark:text-amber-300 dark:hover:text-amber-100"
      >
        {unarchiving ? 'Unarchiving…' : 'Unarchive'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TravelDetailPage() {
  const { travelId } = useParams()
  const navigate = useNavigate()
  const { currentUser, userProfile } = useAuthStore()
  const currentUserUid = currentUser?.uid ?? ''

  const [travel, setTravel] = useState<Travel | null>(null)
  const [loadingTravel, setLoadingTravel] = useState(true)
  const [travelError, setTravelError] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  // When non-null, the form opens in edit mode pre-filled from this transaction.
  const [editingTx, setEditingTx] = useState<TransactionWithStatus | null>(null)
  // Pre-set type for new transactions (e.g. 'withdrawal' from DashboardTab)
  const [formInitialType, setFormInitialType] = useState<TransactionType | undefined>(undefined)
  // Incremented each time the form is opened — passed as `key` to TransactionForm
  // so React unmounts and remounts it fresh, ensuring useState pre-fills (country,
  // city, currency) pick up the latest values from existingTransactions.
  const [formKey, setFormKey] = useState(0)
  const [watchedTxId, setWatchedTxId] = useState<string | null>(null)
  const [bannerState, setBannerState] = useState<BannerState>(null)
  // Holds the txId the user wants to delete — non-null opens the confirmation dialog
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null)

  // mainCurrency is now per-travel, not per-user.
  // getTravelMainCurrency handles legacy docs that lack the field.
  const mainCurrency = travel ? getTravelMainCurrency(travel) : 'EUR'
  const [settlementCurrency, setSettlementCurrency] = useState<string>(mainCurrency)
  const [settlementRate, setSettlementRate] = useState<number>(1)

  const { transactions, loading: loadingTransactions, error: transactionsError } =
    useTransactions(travelId)

  // Reset settlement currency when mainCurrency changes (e.g. userProfile loads after mount)
  useEffect(() => {
    setSettlementCurrency(mainCurrency)
    setSettlementRate(1)
  }, [mainCurrency])

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
            // Apply normaliseMember to handle legacy MemberRef documents transparently
            members: (d.members ?? []).map((m: Record<string, unknown>) => normaliseMember(m)),
            memberUids: d.memberUids ?? [],
            createdBy: d.createdBy as string,
            createdAt: d.createdAt,
            currencies: d.currencies ?? [],
            mainCurrency: d.mainCurrency as string | undefined,
            defaultRates: d.defaultRates as Record<string, number> | undefined,
            settings: d.settings,
            categories: d.categories ?? [],
            paymentMethods: d.paymentMethods ?? [],
            countries: d.countries ?? [],
            cities: d.cities ?? [],
            archivedByUids: d.archivedByUids ?? [],
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

  // Opens the new-expense form and forces TransactionForm to remount (fresh state).
  function openForm(initialType?: TransactionType) {
    setFormKey((k) => k + 1)
    setEditingTx(null)
    setFormInitialType(initialType)
    setIsFormOpen(true)
  }

  // Opens the withdrawal form — now just opens the unified form with initialType.
  function openWithdrawalForm() {
    openForm('withdrawal')
  }

  // Called by TransactionsTab accordion with a txId — all types now open the same form.
  // TransactionForm reads getTransactionType(initialValues) internally to pre-set the type.
  function handleEditById(txId: string) {
    const tx = transactions.find((t) => t.txId === txId)
    if (!tx) return
    setFormKey((k) => k + 1)
    setEditingTx(tx)
    setFormInitialType(undefined) // not needed in edit mode — form reads from initialValues
    setIsFormOpen(true)
  }

  // Opens the confirmation dialog before deleting a transaction.
  function handleDeleteTransaction(txId: string) {
    setDeletingTxId(txId)
  }

  // Called when the user confirms deletion in the AlertDialog.
  function confirmDelete() {
    if (!travelId || !deletingTxId) return
    deleteTransaction(travelId, deletingTxId)
    setDeletingTxId(null)
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

  const isSolo = (travel?.members.length ?? 0) === 1

  // Tab navigation request — used by the solo-travel CTA to switch to Parameters
  const [requestTab, setRequestTab] = useState<string | undefined>(undefined)

  const handleBack = () => navigate('/travels')

  const hue = currentUser ? avatarHue(currentUser.uid) : 0
  const initials = (userProfile?.displayName || currentUser?.email || '?').charAt(0).toUpperCase()
  const { count: pendingCount } = usePendingInvites(currentUser?.uid)

  function handleTransactionSaved(txId: string) {
    setIsFormOpen(false)
    setEditingTx(null)
    if (!editingTx) {
      // Create mode: watch for pending→synced transition and show save banner.
      setWatchedTxId(txId)
      setBannerState(null)
    }
    // Edit mode: no banner — the tx is already in the list and updates immediately
    // via the onSnapshot listener (hasPendingWrites flip).
  }

  // Called when user adds a new category from within the transaction form
  function handleCategoryAdded(item: LabeledItem) {
    setTravel((prev) => prev ? { ...prev, categories: [...prev.categories, item] } : prev)
  }

  // Called when user adds a new payment method from within the transaction form
  function handlePaymentMethodAdded(item: LabeledItem) {
    setTravel((prev) => prev ? { ...prev, paymentMethods: [...prev.paymentMethods, item] } : prev)
  }

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (loadingTravel) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <button type="button" onClick={handleBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />All travels
          </button>
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
          <button type="button" onClick={handleBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />All travels
          </button>
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
        {/* Left: back to travels list */}
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          All travels
        </button>

        {/* Centre: travel emoji + name */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-lg">
            {travel.emoji || '🌍'}
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">{travel.name}</h1>
          </div>
        </div>

        {/* Right: profile avatar with pending-invites badge */}
        <button
          type="button"
          onClick={() => navigate('/profile')}
          title="Profile"
          className="relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm transition hover:opacity-90"
          style={{ backgroundColor: `hsl(${hue}, 55%, 50%)` }}
        >
          {initials}
          {pendingCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </button>
      </header>

      {/* Install PWA banner — shown on mobile browsers only, hidden once installed */}
      <InstallPromptBanner />

      {/* Archived travel banner — shown when the travel is archived for the current user.
          Three states: idle (amber), unarchiving (amber + spinner text), done (green + confirmation). */}
      <ArchiveBanner
        travel={travel}
        currentUserUid={currentUserUid}
        onTravelChange={handleTravelChange}
      />

      {/* Tab content */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4">
        <TravelTabs
          travel={travel}
          transactions={transactions}
          loadingTransactions={loadingTransactions}
          transactionsError={transactionsError}
          currentUserUid={currentUserUid}
          isSolo={isSolo}
          mainCurrency={mainCurrency}
          settlementCurrency={settlementCurrency}
          settlementRate={settlementRate}
          onSettlementCurrencyChange={setSettlementCurrency}
          onSettlementRateChange={setSettlementRate}
          onAddExpense={openForm}
          onAddWithdrawal={openWithdrawalForm}
          onEditTransaction={handleEditById}
          onDeleteTransaction={handleDeleteTransaction}
          onTravelChange={handleTravelChange}
          requestTab={requestTab}
          onRequestTabHandled={() => setRequestTab(undefined)}
        />
      </main>

      {/* FAB area: camera placeholder + add button */}
      <div className="fixed bottom-6 right-6 flex items-center gap-2">
        {/* Camera button — v2 placeholder for "encode from ticket" */}
        <div className="group relative">
          <button
            type="button"
            disabled
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted text-lg text-muted-foreground opacity-60 cursor-not-allowed"
          >
            📷
          </button>
          <div
            role="tooltip"
            className="pointer-events-none absolute bottom-full right-0 mb-1.5 w-44 rounded-md bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md border border-border opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10"
          >
            Coming in v2 — snap a receipt and let AI fill in the transaction.
          </div>
        </div>
        {/* Add transaction FAB */}
        <button
          type="button"
          onClick={() => openForm()}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground shadow-lg shadow-primary/40 transition hover:bg-primary/90"
        >
          +
        </button>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deletingTxId !== null} onOpenChange={(open) => { if (!open) setDeletingTxId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The expense will be permanently removed for all members.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-white hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unified transaction form — full-screen overlay (renders its own fixed container) */}
      {isFormOpen && (
        <TransactionForm
          key={formKey}
          travelId={travelId!}
          members={travel.members}
          travelSettings={travel.settings}
          travelCategories={travel.categories}
          travelPaymentMethods={travel.paymentMethods}
          travelCurrencies={travel.currencies}
          mainCurrency={mainCurrency}
          defaultRates={travel.defaultRates}
          onDefaultRateChanged={(code, rate) => {
            // Optimistic local update so the rate is immediately reflected in the form
            setTravel((prev) => prev ? {
              ...prev,
              defaultRates: { ...(prev.defaultRates ?? {}), [code]: rate },
            } : prev)
          }}
          travelCountries={travel.countries}
          travelCities={travel.cities}
          existingTransactions={transactions}
          initialValues={editingTx ?? undefined}
          initialType={formInitialType}
          onSuccess={handleTransactionSaved}
          onCancel={() => { setIsFormOpen(false); setEditingTx(null) }}
          onDelete={(txId) => {
            // Close the form first, then open the delete confirmation dialog
            setIsFormOpen(false)
            setEditingTx(null)
            handleDeleteTransaction(txId)
          }}
          onLocationAdded={handleLocationAdded}
          onCategoryAdded={handleCategoryAdded}
          onPaymentMethodAdded={handlePaymentMethodAdded}
          onNavigateToParameters={() => setRequestTab('parameters')}
        />
      )}
    </div>
  )
}