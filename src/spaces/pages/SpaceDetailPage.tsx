// src/spaces/pages/SpaceDetailPage.tsx
//
// Space detail page. Subscribes to the space document with onSnapshot,
// then renders SpaceTabs which owns the four-tab UI.
// Transaction list is subscribed via useTransactions (onSnapshot).

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { LabeledItem, Space } from '@/spaces/types'
import { getSpaceMainCurrency } from '@/spaces/types'
import { getSpaceConfig } from '@/spaces/config'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { usePendingInvites } from '@/friends/hooks/usePendingInvites'
import { ChevronLeft, WifiOff } from 'lucide-react'

// why the f*ck did claude put this here ?? to clean later
function avatarHue(uid: string): number {
  let hash = 0
  for (const ch of uid) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff
  return Math.abs(hash) % 360
}
import { useTransactions, type TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import { Button } from '@/components/ui/button'
import { TransactionForm, type TransferPrefill } from '@/transactions/components/TransactionForm'
import type { TransactionType } from '@/transactions/types'
import type { FilterRequest } from '@/transactions/utils/filterDimensions'
import { SpaceTabs } from '@/spaces/components/SpaceTabs'
import { InstallPromptBanner } from '@/shared/components/InstallPromptBanner'
import { deleteTransaction } from '@/transactions/services/transactionService'
import { mapSpaceDoc, unarchiveSpace, updateSpaceDefaultRate } from '@/spaces/services/spaceService'
import { findStaleDefaultRates } from '@/shared/utils/exchangeRates'
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

// Why the space document is unavailable, so the render can pick different
// wording for "genuinely missing" vs "we're offline and can't confirm either way".
type SpaceUnavailable = { reason: 'not-found' | 'offline' | 'error'; message: string } | null

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
      {state === 'pending' ? '⏳ Saved locally — will sync with the server' : '✅ Transaction saved'}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ArchiveBanner — shown at the top of an archived space with unarchive action.
// Shows loading state while unarchiving, then green confirmation for 10 seconds.
// ---------------------------------------------------------------------------

function ArchiveBanner({
  space,
  currentUserUid,
  onSpaceChange,
}: {
  space: Space
  currentUserUid: string
  onSpaceChange: (updated: Partial<Space>) => void
}) {
  const isArchived = (space.archivedByUids ?? []).includes(currentUserUid)
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
    await unarchiveSpace(space.spaceId, currentUserUid)
    onSpaceChange({
      archivedByUids: (space.archivedByUids ?? []).filter((u) => u !== currentUserUid),
    })
    setUnarchiving(false)
    setDone(true)
  }

  // Green confirmation after successful unarchive
  if (done) {
    return (
      <div className="mx-4 mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
        This space has been unarchived and is back in your active list.
      </div>
    )
  }

  // Amber banner with unarchive action
  return (
    <div className="mx-4 mt-2 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950">
      <span className="text-amber-800 dark:text-amber-200">This space is archived.</span>
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
// RateRepairBanner — one-time notice when stale (pre-fix) default exchange
// rates were auto-corrected on load. Dismissible, auto-hides after 12s.
// ---------------------------------------------------------------------------

function RateRepairBanner({ codes, onDismiss }: { codes: string[]; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 12000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="mx-4 mt-2 flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950">
      <span className="text-amber-800 dark:text-amber-200">
        ⚠️ Corrected {codes.length} exchange rate{codes.length > 1 ? 's' : ''} ({codes.join(', ')}) that were stored backwards due to a since-fixed bug. Past transactions are unaffected.
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SpaceDetailPage() {
  const { spaceId } = useParams()
  const navigate = useNavigate()
  const { currentUser, userProfile } = useAuthStore()
  const currentUserUid = currentUser?.uid ?? ''

  const [space, setSpace] = useState<Space | null>(null)
  const [loadingSpace, setLoadingSpace] = useState(true)
  // Distinguishes *why* the space is unavailable so the render can word the
  // offline case differently from a genuine "this space doesn't exist".
  const [unavailable, setUnavailable] = useState<SpaceUnavailable>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  // When non-null, the form opens in edit mode pre-filled from this transaction.
  const [editingTx, setEditingTx] = useState<TransactionWithStatus | null>(null)
  // Pre-set type for new transactions (e.g. 'withdrawal' from DashboardTab)
  const [formInitialType, setFormInitialType] = useState<TransactionType | undefined>(undefined)
  // Pre-fill data for new transfers (e.g. from BalanceTab settlement buttons)
  const [transferPrefill, setTransferPrefill] = useState<TransferPrefill | undefined>(undefined)
  // Incremented each time the form is opened — passed as `key` to TransactionForm
  // so React unmounts and remounts it fresh, ensuring useState pre-fills (country,
  // city, currency) pick up the latest values from existingTransactions.
  const [formKey, setFormKey] = useState(0)
  const [watchedTxId, setWatchedTxId] = useState<string | null>(null)
  const [bannerState, setBannerState] = useState<BannerState>(null)
  // Holds the txId the user wants to delete — non-null opens the confirmation dialog
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null)
  // Dialog shown when user tries to create a transaction without claiming a member slot
  const [showNoSlotDialog, setShowNoSlotDialog] = useState(false)
  // Currency codes auto-corrected by the stale-defaultRates repair (null = nothing to show)
  const [repairedRateCodes, setRepairedRateCodes] = useState<string[] | null>(null)

  // mainCurrency is now per-space, not per-user.
  // getSpaceMainCurrency handles legacy docs that lack the field.
  const mainCurrency = space ? getSpaceMainCurrency(space) : 'EUR'
  const [settlementCurrency, setSettlementCurrency] = useState<string>(mainCurrency)
  const [settlementRate, setSettlementRate] = useState<number>(1)

  const { transactions, loading: loadingTransactions, error: transactionsError } =
    useTransactions(spaceId)

  // One-time repair: getExchangeRate()/buildDefaultRates() computed the reciprocal
  // of the correct rate until 2026-07-24. Spaces created/edited before that fix
  // may have defaultRates entries baked in backwards. rateRepairDone guards against
  // re-running (and re-fetching/re-writing) on every re-render of this effect.
  const rateRepairDone = useRef(false)
  useEffect(() => {
    if (!space || rateRepairDone.current || !space.defaultRates) return
    rateRepairDone.current = true
    const corrections = findStaleDefaultRates(space.defaultRates, mainCurrency)
    const codes = Object.keys(corrections)
    if (codes.length === 0) return
    Promise.all(
      codes.map((code) => updateSpaceDefaultRate(space.spaceId, code, corrections[code])),
    )
      .then(() => {
        setSpace((prev) =>
          prev ? { ...prev, defaultRates: { ...prev.defaultRates, ...corrections } } : prev,
        )
        setRepairedRateCodes(codes)
      })
      .catch((err) => console.error('[rate repair] failed to persist corrections:', err))
  }, [space, mainCurrency])

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

  // Subscribe to the space document. onSnapshot serves the local cache
  // immediately (including a doc with hasPendingWrites: true right after a
  // fire-and-forget createSpace()), then updates when the server confirms —
  // this removes the "Space not found" / delayed-render race that a one-shot
  // getDoc() has (getDoc is server-first while online, so it finds nothing
  // until the just-created doc reaches the server). It also makes the page
  // reactive to another member's edits without a manual reload.
  useEffect(() => {
    if (!spaceId) {
      setSpace(null)
      setLoadingSpace(false)
      setUnavailable({ reason: 'error', message: 'Missing space identifier.' })
      return
    }
    const id = spaceId
    let cancelled = false
    // Flips true once we have a definitive answer (found, or genuinely missing
    // per the server) — guards the offline timer below from firing after that.
    let resolved = false

    setSpace(null)
    setLoadingSpace(true)
    setUnavailable(null)

    // Offline guard: a snapshot reporting exists()===false is ambiguous while
    // fromCache is true — it may just not have arrived yet from the server.
    // Without a bound, a bad URL opened offline would spin forever, since no
    // server answer is ever coming. After 5s, give up waiting and show a
    // not-found state that acknowledges the offline case.
    const offlineTimer = setTimeout(() => {
      if (cancelled || resolved) return
      setLoadingSpace(false)
      setUnavailable({
        reason: 'offline',
        message: 'Check your connection and try again — we can\'t tell whether this space exists until we hear back from the server.',
      })
    }, 5000)

    const unsubscribe = onSnapshot(
      doc(db, 'travels', id),
      (snapshot) => {
        if (cancelled) return
        if (snapshot.exists()) {
          resolved = true
          clearTimeout(offlineTimer)
          setSpace(mapSpaceDoc(snapshot.id, snapshot.data()))
          setUnavailable(null)
          setLoadingSpace(false)
        } else if (!snapshot.metadata.fromCache) {
          // The server has spoken and has nothing — genuinely missing.
          resolved = true
          clearTimeout(offlineTimer)
          setSpace(null)
          setUnavailable({
            reason: 'not-found',
            message: 'It may have been deleted, or you might not have permission to view it.',
          })
          setLoadingSpace(false)
        }
        // else: fromCache && !exists() — not yet synced, not necessarily gone.
        // Keep showing the loading state; the offline timer above bounds the wait.
      },
      () => {
        if (cancelled) return
        resolved = true
        clearTimeout(offlineTimer)
        setSpace(null)
        setUnavailable({ reason: 'error', message: 'Unable to load this space. Please try again later.' })
        setLoadingSpace(false)
      },
    )

    return () => {
      cancelled = true
      clearTimeout(offlineTimer)
      unsubscribe()
    }
  }, [spaceId])

  // Called by ParametersTab when it saves a field change — keeps local state in sync
  function handleSpaceChange(updated: Partial<Space>) {
    setSpace((prev) => prev ? { ...prev, ...updated } : prev)
  }

  // Opens the new-expense form and forces TransactionForm to remount (fresh state).
  // First checks: user must have claimed a member slot to create transactions.
  function openForm(initialType?: TransactionType, prefill?: TransferPrefill) {
    // Check if current user has a claimed member slot
    const myMember = space?.members.find((m) => m.userId === currentUser?.uid)
    if (!myMember) {
      // User has no claimed slot — show guidance dialog instead of opening form
      setShowNoSlotDialog(true)
      return
    }
    setFormKey((k) => k + 1)
    setEditingTx(null)
    setFormInitialType(initialType)
    setTransferPrefill(prefill)
    setIsFormOpen(true)
  }

  // Opens the withdrawal form — now just opens the unified form with initialType.
  function openWithdrawalForm() {
    openForm('withdrawal')
  }

  // Opens the transfer form, optionally pre-filled with settlement data from BalanceTab.
  function openTransferForm(prefill?: TransferPrefill) {
    openForm('transfer', prefill)
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
    if (!spaceId || !deletingTxId) return
    deleteTransaction(spaceId, deletingTxId)
    setDeletingTxId(null)
  }

  // Called by TransactionForm after a new transaction introduces a country/city
  // not yet in the space's lists — updates local state immediately so dropdowns
  // and ParametersTab reflect the new value without a page reload.
  function handleLocationAdded(newCountry: LabeledItem | null, newCity: LabeledItem | null) {
    setSpace((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        countries: newCountry ? [...prev.countries, newCountry] : prev.countries,
        cities: newCity ? [...prev.cities, newCity] : prev.cities,
      }
    })
  }

  const isSolo = (space?.members.length ?? 0) === 1

  // Tab navigation request — used by the solo-space CTA to switch to Parameters
  const [requestTab, setRequestTab] = useState<'transactions' | 'balance' | 'dashboard' | 'parameters' | undefined>(undefined)

  // Dashboard drill-down (Phase 7a §5): the filter selection to hand to the
  // Transactions tab. The nonce is minted here so the same row can be tapped
  // twice in a row and still re-apply. Reusing the existing requestTab
  // mechanism for the tab switch keeps the two concerns separate.
  const [filterRequest, setFilterRequest] = useState<FilterRequest | undefined>(undefined)
  const drillDownNonce = useRef(0)

  function handleDrillDown(request: Omit<FilterRequest, 'nonce'>) {
    drillDownNonce.current += 1
    setFilterRequest({ ...request, nonce: drillDownNonce.current })
    setRequestTab('transactions')
  }

  const handleBack = () => navigate('/spaces')

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
    setSpace((prev) => prev ? { ...prev, categories: [...prev.categories, item] } : prev)
  }

  // Called when user adds a new payment method from within the transaction form
  function handlePaymentMethodAdded(item: LabeledItem) {
    setSpace((prev) => prev ? { ...prev, paymentMethods: [...prev.paymentMethods, item] } : prev)
  }

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  // Show an offline hint after 2 seconds of loading — helps users on flaky
  // connections understand they can switch to airplane mode to use cached data.
  const [showSlowHint, setShowSlowHint] = useState(false)
  const slowHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (loadingSpace) {
      slowHintTimer.current = setTimeout(() => setShowSlowHint(true), 5000)
    } else {
      setShowSlowHint(false)
    }
    return () => {
      if (slowHintTimer.current) clearTimeout(slowHintTimer.current)
    }
  }, [loadingSpace])

  if (loadingSpace) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <button type="button" onClick={handleBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />All spaces
          </button>
          <h1 className="text-base font-semibold">Loading space…</h1>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          {showSlowHint && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                You seem to have connection issues. If the space doesn&apos;t load,
                try turning off Wi-Fi and mobile data to use the app offline.
              </p>
            </div>
          )}
        </main>
      </div>
    )
  }

  if (!space || unavailable) {
    const isOffline = unavailable?.reason === 'offline'
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <button type="button" onClick={handleBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />All spaces
          </button>
          <h1 className="text-base font-semibold">{isOffline ? "Can't confirm this space" : 'Space not found'}</h1>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          {isOffline && <WifiOff className="h-8 w-8 text-amber-600" />}
          <p className="text-lg font-medium">
            {isOffline ? "You're offline, and this space isn't in your local cache." : "We couldn't find this space."}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {unavailable?.message ?? 'It may have been deleted, or you might not have permission to view it.'}
          </p>
          <Button type="button" onClick={handleBack}>Back to spaces</Button>
        </main>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="relative flex h-screen flex-col bg-background">
      <SaveBanner state={bannerState} onDismiss={() => setBannerState(null)} />

      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        {/* Left: back to spaces list */}
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          All spaces
        </button>

        {/* Centre: space emoji + name — tap to go to Parameters tab */}
        <button
          type="button"
          onClick={() => setRequestTab('parameters')}
          className="flex items-center gap-2 hover:opacity-70 transition-opacity"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-lg">
            {space.emoji || '🌍'}
          </div>
          <h1 className="text-base font-semibold leading-tight">{space.name}</h1>
        </button>

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

      {/* Archived space banner — shown when the space is archived for the current user.
          Three states: idle (amber), unarchiving (amber + spinner text), done (green + confirmation). */}
      <ArchiveBanner
        space={space}
        currentUserUid={currentUserUid}
        onSpaceChange={handleSpaceChange}
      />

      {/* One-time notice when stale (pre-fix) default exchange rates were auto-corrected */}
      {repairedRateCodes && (
        <RateRepairBanner codes={repairedRateCodes} onDismiss={() => setRepairedRateCodes(null)} />
      )}

      {/* Tab content — flex-1 + overflow-hidden so SpaceTabs fills remaining height */}
      <main className="mx-auto w-full max-w-2xl flex-1 overflow-hidden px-4">
        <SpaceTabs
          space={space}
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
          onCreateTransfer={openTransferForm}
          onAddWithdrawal={openWithdrawalForm}
          onEditTransaction={handleEditById}
          onDeleteTransaction={handleDeleteTransaction}
          onSpaceChange={handleSpaceChange}
          requestTab={requestTab}
          onRequestTabHandled={() => setRequestTab(undefined)}
          filterRequest={filterRequest}
          onDrillDown={handleDrillDown}
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

      {/* "No claimed slot" dialog — shown when user tries to create transaction without claiming a member */}
      <AlertDialog open={showNoSlotDialog} onOpenChange={(open) => { if (!open) setShowNoSlotDialog(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Claim your member slot first</AlertDialogTitle>
            <AlertDialogDescription>
              You haven't claimed a member slot yet. Choose who you are in this space so we know who paid for transactions you record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowNoSlotDialog(false)
                setRequestTab('parameters')
              }}
            >
              Go to Members
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
          spaceId={spaceId!}
          space={space}
          members={space.members}
          mainCurrency={mainCurrency}
          defaultRates={space.defaultRates}
          onDefaultRateChanged={(code, rate) => {
            // Optimistic local update so the rate is immediately reflected in the form
            setSpace((prev) => prev ? {
              ...prev,
              defaultRates: { ...(prev.defaultRates ?? {}), [code]: rate },
            } : prev)
          }}
          onMultiCurrencyUpgraded={() => {
            // Optimistic local update — same pattern as onDefaultRateChanged above.
            // The Firestore write itself is fire-and-forget (ensureMultiCurrency()).
            setSpace((prev) => prev ? {
              ...prev,
              config: { ...getSpaceConfig(prev), features: { ...getSpaceConfig(prev).features, multiCurrency: true } },
            } : prev)
          }}
          existingTransactions={transactions}
          initialValues={editingTx ?? undefined}
          initialType={formInitialType}
          transferPrefill={transferPrefill}
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