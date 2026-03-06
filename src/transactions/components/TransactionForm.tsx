// TransactionForm.tsx — form for creating a new transaction.
//
// Data flow:
// - User profile (mainCurrency, categories, paymentMethods) from Zustand auth store.
// - Travel members and settings from props (fetched by TravelDetailPage).
// - Existing transactions from props — used to derive previously used
//   country/city values for the dropdown, and to pre-fill the last used value.
// - On submit, calls createTransaction() (fire-and-forget): form closes immediately,
//   transaction appears in list with isPending=true until server confirms.

import { useState, useMemo, useEffect, useRef } from 'react'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { createTransaction, updateTransaction } from '@/transactions/services/transactionService'
import { getExchangeRate } from '@/shared/utils/exchangeRates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { LabeledItem, MemberRef, TravelSettings } from '@/travels/types'
import { updateTravelCurrencies, updateTravelList, syncTransactionLocation } from '@/travels/services/travelService'
import { ALL_CURRENCIES, ALL_COUNTRIES } from '@/shared/data/pickerData'
import type { Split } from '@/transactions/types'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { SplitEditor } from '@/transactions/components/SplitEditor'
import { SplitSummaryRow } from '@/transactions/components/SplitSummaryRow'

// ---------------------------------------------------------------------------
// Date conversion helpers
// ---------------------------------------------------------------------------

// HTML <input type="date"> always uses YYYY-MM-DD internally.
// Firestore storage format is DD-MM-YYYY.

function toInputFormat(ddmmyyyy: string): string {
  const [dd, mm, yyyy] = ddmmyyyy.split('-')
  if (!dd || !mm || !yyyy) return ddmmyyyy
  return `${yyyy}-${mm}-${dd}`
}

function fromInputFormat(yyyymmdd: string): string {
  const [yyyy, mm, dd] = yyyymmdd.split('-')
  if (!yyyy || !mm || !dd) return yyyymmdd
  return `${dd}-${mm}-${yyyy}`
}

function getTodayDDMMYYYY(): string {
  const today = new Date()
  const dd = String(today.getDate()).padStart(2, '0')
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const yyyy = today.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

// ---------------------------------------------------------------------------
// Location dropdown helpers
// ---------------------------------------------------------------------------

// Special sentinel value shown in the dropdown when a user previously chose
// "Other" without entering a named country/city. Stored as-is in Firestore.
const OTHER_VALUE = 'Other'

// Scans existing transactions and returns unique non-empty values for a given
// field, ordered by most recently used (based on transaction date, then createdAt).
// "Other" is excluded from this list — it's always appended as a fixed option.
function getPreviousValues(
  transactions: TransactionWithStatus[],
  field: 'country' | 'city',
): string[] {
  // Build a map of value → most recent date string seen (DD-MM-YYYY sorts lexically
  // when reversed to YYYY-MM-DD, but we use index order as a proxy here — Firestore
  // returns transactions ordered by date desc, so first occurrence = most recent).
  const seen = new Map<string, number>() // value → first index seen (lower = more recent)
  transactions.forEach((tx, index) => {
    const val = tx[field]
    if (val && val !== OTHER_VALUE && !seen.has(val)) {
      seen.set(val, index)
    }
  })
  // Sort by index ascending = most recently used first
  return [...seen.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([val]) => val)
}

// ---------------------------------------------------------------------------
// LocationSelect — dropdown for country or city
// ---------------------------------------------------------------------------
// Three states:
//   1. Selecting from list (default)
//   2. "Other" selected — shows plain text, no input
//   3. "Add new" — shows a text input for a brand new value

interface LocationSelectProps {
  label: string
  value: string        // current field value (stored string, or '' if unset)
  onChange: (val: string) => void
  previousValues: string[]  // ordered list of previously used values
  placeholder: string  // shown as the "unset" option in the dropdown
}

function LocationSelect({ label, value, onChange, previousValues, placeholder }: LocationSelectProps) {
  // Track whether the user is currently typing a new value
  const [addingNew, setAddingNew] = useState(false)
  const [newInput, setNewInput] = useState('')

  // Determine what the <select> should show.
  // If value is something not in previousValues and not OTHER_VALUE and not '',
  // it's a custom value the user typed — treat it as selected in the dropdown
  // by adding it temporarily to the list.
  const isCustomValue = value !== '' && value !== OTHER_VALUE && !previousValues.includes(value)

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const selected = e.target.value
    if (selected === '__add_new__') {
      // User wants to type a new value
      setAddingNew(true)
      setNewInput('')
      // Don't call onChange yet — wait until they confirm
    } else {
      setAddingNew(false)
      onChange(selected) // '' = unset, OTHER_VALUE = "Other", or a named value
    }
  }

  function handleNewInputConfirm() {
    const trimmed = newInput.trim()
    if (trimmed) {
      onChange(trimmed)
    }
    setAddingNew(false)
  }

  function handleNewInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleNewInputConfirm()
    if (e.key === 'Escape') {
      setAddingNew(false)
      // Revert to previous value (don't change onChange)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">{label}</label>

      {addingNew ? (
        // Inline text input to type the new value
        <div className="flex gap-2">
          <Input
            autoFocus
            type="text"
            placeholder={`Enter ${label.toLowerCase()}…`}
            value={newInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewInput(e.target.value)}
            onKeyDown={handleNewInputKeyDown}
          />
          <Button type="button" size="sm" onClick={handleNewInputConfirm}>
            OK
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAddingNew(false)}
          >
            ✕
          </Button>
        </div>
      ) : (
        <select
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
          // The select value must be one of the <option> values.
          // If isCustomValue, we display it as a temporary selected option below.
          value={isCustomValue ? value : value}
          onChange={handleSelectChange}
        >
          {/* Unset / empty option */}
          <option value="">{placeholder}</option>

          {/* Custom value typed in a previous session — show it at the top */}
          {isCustomValue && (
            <option value={value}>{value}</option>
          )}

          {/* Previously used values, ordered by most recent */}
          {previousValues.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}

          {/* Fixed options at the bottom */}
          <option value={OTHER_VALUE}>Other</option>
          <option value="__add_new__">+ Add new…</option>
        </select>
      )}

      {/* Display hint when "Other" is selected */}
      {value === OTHER_VALUE && !addingNew && (
        <p className="text-xs text-muted-foreground">Saved as "Other". Use "Add new…" to enter a specific name.</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SmartCurrencySelect
// Shows travel currencies first (ordered by recent use), then "Add…" which
// opens an inline searchable picker. Selecting from picker adds to travel list.
// ---------------------------------------------------------------------------

interface SmartCurrencySelectProps {
  value: string
  onChange: (code: string) => void
  travelId: string
  orderedCurrencies: string[]
  onCurrencyAdded: (code: string) => void
}

function SmartCurrencySelect({ value, onChange, orderedCurrencies, onCurrencyAdded }: SmartCurrencySelectProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (pickerOpen && searchRef.current) searchRef.current.focus()
  }, [pickerOpen])

  const filtered = ALL_CURRENCIES.filter(([code, , name]) => {
    const q = search.toLowerCase()
    return code.toLowerCase().includes(q) || name.toLowerCase().includes(q)
  })

  // For the select: show travel currencies + current value (if not in list)
  const selectOptions = [...new Set([...orderedCurrencies, value])]

  if (pickerOpen) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Currency</label>
        <div className="flex flex-col gap-1 rounded-md border bg-background p-2 shadow-md">
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="rounded border px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="max-h-40 overflow-y-auto">
            {filtered.map(([code, symbol, name]) => (
              <button
                key={code}
                type="button"
                onClick={() => {
                  onChange(code)
                  onCurrencyAdded(code)
                  setPickerOpen(false)
                  setSearch('')
                }}
                className="flex w-full gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent/40"
              >
                <span className="font-medium w-10 shrink-0">{code}</span>
                <span className="text-muted-foreground">({symbol})</span>
                <span className="truncate text-muted-foreground">{name}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { setPickerOpen(false); setSearch('') }}
            className="text-xs text-muted-foreground hover:text-foreground text-right">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">Currency</label>
      <select
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
        value={value}
        onChange={(e) => {
          if (e.target.value === '__add__') {
            setPickerOpen(true)
          } else {
            onChange(e.target.value)
          }
        }}
      >
        {selectOptions.map((code) => (
          <option key={code} value={code}>{code}</option>
        ))}
        <option value="__add__">+ Add…</option>
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SmartCountrySelect
// Shows travel countries first (ordered by recent use), then "Add…" picker.
// ---------------------------------------------------------------------------

interface SmartCountrySelectProps {
  value: string
  onChange: (name: string) => void
  travelId: string
  orderedCountries: LabeledItem[]
  onCountryAdded: (name: string, flag: string) => void
}

function SmartCountrySelect({ value, onChange, orderedCountries, onCountryAdded }: SmartCountrySelectProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (pickerOpen && searchRef.current) searchRef.current.focus()
  }, [pickerOpen])

  const filtered = ALL_COUNTRIES.filter(([, name]) =>
    name.toLowerCase().includes(search.toLowerCase())
  )

  const selectOptions = [
    ...orderedCountries,
    // Include current value if not already in list
    ...(value && !orderedCountries.find((c) => c.label === value)
      ? [{ id: 'current', label: value, emoji: '🌍' }]
      : []),
  ]

  if (pickerOpen) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Country</label>
        <div className="flex flex-col gap-1 rounded-md border bg-background p-2 shadow-md">
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search country…"
            className="rounded border px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="max-h-40 overflow-y-auto">
            {filtered.map(([flag, name]) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onChange(name)
                  onCountryAdded(name, flag)
                  setPickerOpen(false)
                  setSearch('')
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent/40"
              >
                <span className="text-base">{flag}</span>
                <span>{name}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { setPickerOpen(false); setSearch('') }}
            className="text-xs text-muted-foreground hover:text-foreground text-right">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">Country</label>
      <select
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
        value={value}
        onChange={(e) => {
          if (e.target.value === '__add__') {
            setPickerOpen(true)
          } else {
            onChange(e.target.value)
          }
        }}
      >
        <option value="">— optional —</option>
        {selectOptions.map((c) => (
          <option key={c.id} value={c.label}>
            {c.emoji ? `${c.emoji} ${c.label}` : c.label}
          </option>
        ))}
        <option value="__add__">+ Add…</option>
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SmartLabeledItemSelect — dropdown for category or payment method
// ---------------------------------------------------------------------------
// Shows existing items from the travel's per-travel list (or global fallback),
// plus a "+ Add new…" option that opens an inline text input.
// When the user confirms a new item, it is saved to the travel list and
// the parent is notified via onAddNew so it can update local state.

interface SmartLabeledItemSelectProps {
  label: string
  value: string                 // currently selected value (formatted "emoji label" string)
  onChange: (val: string) => void
  items: string[]               // formatted display strings (already "emoji label")
  onAddNew: (label: string) => void  // called with just the label text (no emoji)
  placeholder?: string
}

function SmartLabeledItemSelect({
  label,
  value,
  onChange,
  items,
  onAddNew,
  placeholder = '— optional —',
}: SmartLabeledItemSelectProps) {
  const [addingNew, setAddingNew] = useState(false)
  const [newInput, setNewInput] = useState('')

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === '__add_new__') {
      setAddingNew(true)
      setNewInput('')
    } else {
      onChange(e.target.value)
    }
  }

  function handleConfirm() {
    const trimmed = newInput.trim()
    if (trimmed) {
      onAddNew(trimmed)   // persists to Firestore and updates parent state
      onChange(trimmed)   // sets form field to the new value
    }
    setAddingNew(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleConfirm()
    if (e.key === 'Escape') setAddingNew(false)
  }

  if (addingNew) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">{label}</label>
        <div className="flex gap-2">
          <Input
            autoFocus
            type="text"
            placeholder={`New ${label.toLowerCase()}…`}
            value={newInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Button type="button" size="sm" onClick={handleConfirm}>OK</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAddingNew(false)}>
            ✕
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">{label}</label>
      <select
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
        value={value}
        onChange={handleSelectChange}
      >
        <option value="">{placeholder}</option>
        {items.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
        <option value="__add_new__">+ Add new…</option>
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Field wrapper
// ---------------------------------------------------------------------------
function FieldWrapper({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Split helpers
// ---------------------------------------------------------------------------

function round(x: number, dp: number): number {
  const f = Math.pow(10, dp)
  return Math.round(x * f) / f
}

/**
 * Splits `total` equally among `uids`, rounded to 3dp internally.
 * Validity is checked at 2dp — matches SplitEditor's rounding model.
 * Using the functional setState updater (prev =>) with this helper avoids
 * stale-closure issues when reading current UIDs inside a useEffect.
 */
function distributeEqually(total: number, uids: string[]): Split[] {
  if (uids.length === 0) return []
  const amount = round(total / uids.length, 3)
  return uids.map((uid) => ({ uid, amount }))
}


// ---------------------------------------------------------------------------
// Split mode detection (used when pre-filling edit mode)
// ---------------------------------------------------------------------------

// If all splits have the same amount (within 1 cent), the split was 'equal'.
// Single-payer/single-beneficiary is always 'equal' (mode has no visible effect).
function detectSplitMode(splits: Split[]): 'equal' | 'custom' {
  if (splits.length <= 1) return 'equal'
  const first = splits[0].amount
  return splits.every((s) => Math.abs(s.amount - first) < 0.01) ? 'equal' : 'custom'
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface TransactionFormProps {
  travelId: string
  members: MemberRef[]
  travelSettings?: TravelSettings
  travelCategories?: LabeledItem[]
  travelPaymentMethods?: LabeledItem[]
  // Per-travel currency and country lists (from Parameters tab)
  travelCurrencies?: string[]         // ISO codes, ordered by user preference
  travelCountries?: LabeledItem[]     // countries with flag emoji
  travelCities?: LabeledItem[]        // cities for dedup check
  existingTransactions: TransactionWithStatus[]
  // When set, the form opens in edit mode pre-filled from this transaction.
  // When absent, the form opens in create mode with smart defaults.
  initialValues?: TransactionWithStatus
  onSuccess: (txId: string) => void   // receives newTxId (create) or existing txId (edit)
  onCancel: () => void
  // Called after save when a new country or city was introduced — so parent
  // (TravelDetailPage) can update travel.countries / travel.cities immediately
  onLocationAdded?: (newCountry: LabeledItem | null, newCity: LabeledItem | null) => void
  // Called when user creates a new category from the form — parent updates travel.categories
  onCategoryAdded?: (item: LabeledItem) => void
  // Called when user creates a new payment method from the form — parent updates travel.paymentMethods
  onPaymentMethodAdded?: (item: LabeledItem) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TransactionForm({
  travelId,
  members,
  travelSettings,
  travelCategories,
  travelPaymentMethods,
  travelCurrencies,
  travelCountries,
  travelCities,
  existingTransactions,
  initialValues,
  onSuccess,
  onCancel,
  onLocationAdded,
  onCategoryAdded,
  onPaymentMethodAdded,
}: TransactionFormProps) {
  // true when editing an existing transaction, false for a new one
  const isEdit = !!initialValues
  const { currentUser, userProfile } = useAuthStore()

  if (!currentUser || !userProfile) {
    return (
      <p className="py-4 text-center text-sm text-destructive">
        User profile unavailable. Please sign out and sign in again.
      </p>
    )
  }

  // Effective category and payment method lists:
  // use per-travel lists if available, else fall back to userProfile global lists.
  // Per-travel items carry an optional emoji prefix for display.
  const effectiveCategories: string[] =
    travelCategories && travelCategories.length > 0
      ? travelCategories.map((c) => c.emoji ? `${c.emoji} ${c.label}` : c.label)
      : userProfile.categories

  const effectivePaymentMethods: string[] =
    travelPaymentMethods && travelPaymentMethods.length > 0
      ? travelPaymentMethods.map((p) => p.emoji ? `${p.emoji} ${p.label}` : p.label)
      : userProfile.paymentMethods

  // --- Currency list -------------------------------------------------------
  // Travel currencies ordered as: previously used (from transactions, most recent first),
  // then remaining travel currencies, then everything else is accessible via "Add…".
  // Default currency = last transaction's currency, else userProfile.mainCurrency.
  const lastUsedCurrency = existingTransactions[0]?.currency ?? userProfile.mainCurrency

  // Build ordered currency list: travel currencies come first, ordered by last use
  const orderedCurrencies = useMemo(() => {
    const travelSet = new Set(travelCurrencies ?? [])
    // Most recently used first (transactions are already ordered desc by date)
    const recentlyUsed = [...new Set(existingTransactions.map((tx) => tx.currency))].filter(
      (c) => travelSet.has(c),
    )
    const rest = (travelCurrencies ?? []).filter((c) => !recentlyUsed.includes(c))
    return [...recentlyUsed, ...rest]
  }, [travelCurrencies, existingTransactions])

  // --- Country list --------------------------------------------------------
  // Travel countries ordered by most recently used in transactions.
  const orderedCountries = useMemo(() => {
    const travelCountryNames = new Set((travelCountries ?? []).map((c) => c.label.toLowerCase()))
    const recentlyUsed = [...new Set(existingTransactions.map((tx) => tx.country).filter(Boolean) as string[])].filter(
      (name) => travelCountryNames.has(name.toLowerCase()),
    )
    const rest = (travelCountries ?? []).filter(
      (c) => !recentlyUsed.map((r) => r.toLowerCase()).includes(c.label.toLowerCase()),
    )
    return [
      ...recentlyUsed.map((name) => travelCountries?.find((c) => c.label.toLowerCase() === name.toLowerCase())!).filter(Boolean),
      ...rest,
    ]
  }, [travelCountries, existingTransactions])

  // Whether to show country/city fields.
  // Defaults to true if the travel has no settings yet (backward compatible).
  const trackLocation = travelSettings?.trackLocation ?? true

  // Solo travel: only 1 member — splits are auto-set, no UI shown
  const isSolo = members.length === 1

  // Derive previously used values once — memoized so it doesn't recompute
  // on every keystroke. Depends on existingTransactions which changes rarely.
  const previousCities = useMemo(
    () => getPreviousValues(existingTransactions, 'city'),
    [existingTransactions],
  )

  // Pre-fill city from the most recent transaction
  const lastCity = existingTransactions[0]?.city ?? ''

  // --- Field state --------------------------------------------------------
  // In edit mode, initial values come from initialValues.
  // In create mode, smart defaults apply (last used currency/country/city, today's date).

  const lastCountry = existingTransactions[0]?.country ?? ''

  const [date, setDate] = useState<string>(
    isEdit ? initialValues!.date : getTodayDDMMYYYY()
  )
  const [name, setName] = useState<string>(
    isEdit ? initialValues!.name : ''
  )
  // Pre-filled to '0' so the mobile numeric keyboard shows 0.00 immediately.
  const [amountStr, setAmountStr] = useState<string>(
    isEdit ? String(initialValues!.totalAmount) : '0'
  )
  const [currency, setCurrency] = useState<string>(
    isEdit ? initialValues!.currency : lastUsedCurrency
  )
  const [category, setCategory] = useState<string>(
    isEdit ? (initialValues!.category ?? '') : ''
  )
  const [paymentMethod, setPaymentMethod] = useState<string>(
    isEdit ? (initialValues!.paymentMethod ?? '') : ''
  )
  const [country, setCountry] = useState<string>(
    isEdit ? (initialValues!.country ?? '') : (trackLocation ? lastCountry : '')
  )
  const [city, setCity] = useState<string>(
    isEdit ? (initialValues!.city ?? '') : (trackLocation ? lastCity : '')
  )
  const [notes, setNotes] = useState<string>(
    isEdit ? (initialValues!.notes ?? '') : ''
  )

  // --- Split state --------------------------------------------------------

  const totalAmount = parseFloat(amountStr) || 0

  // In edit mode, restore the saved splits and detect whether they were equal or custom.
  // In create mode, default to the current user paying/benefiting the full amount.
  const [paidBy, setPaidBy] = useState<Split[]>(
    isEdit ? initialValues!.paidBy : [{ uid: currentUser.uid, amount: totalAmount }]
  )
  const [paidByMode, setPaidByMode] = useState<'equal' | 'custom'>(
    isEdit ? detectSplitMode(initialValues!.paidBy) : 'equal'
  )

  const [beneficiaries, setBeneficiaries] = useState<Split[]>(
    isEdit ? initialValues!.beneficiaries : [{ uid: currentUser.uid, amount: totalAmount }]
  )
  const [beneficiaryMode, setBeneficiaryMode] = useState<'equal' | 'custom'>(
    isEdit ? detectSplitMode(initialValues!.beneficiaries) : 'equal'
  )

  // Drawer open state
  const [paidByDrawerOpen, setPaidByDrawerOpen] = useState(false)
  const [beneficiaryDrawerOpen, setBeneficiaryDrawerOpen] = useState(false)

  // --- Solo travel: keep splits silently in sync with totalAmount ----------
  // When there is only one member, we never show the split UI. Instead we
  // keep both splits up to date whenever totalAmount changes.
  useEffect(() => {
    if (!isSolo) return
    const soloSplit: Split[] = [{ uid: currentUser.uid, amount: totalAmount }]
    setPaidBy(soloSplit)
    setBeneficiaries(soloSplit)
  }, [isSolo, currentUser.uid, totalAmount])

  // --- Multi-user equal mode: keep amounts in sync with totalAmount --------
  // The SplitEditor inside each Drawer has the same sync logic, but shadcn/vaul
  // renders Drawer content lazily (only on first open). This means the SplitEditor's
  // useEffect never runs until the user opens the drawer — leaving amounts at 0
  // and causing validation to fail. These effects mirror that logic directly in the
  // form so the splits are always valid in equal mode, even if the drawer is never opened.
  // The functional updater form (prev =>) reads current state, not the stale closure.
  useEffect(() => {
    if (isSolo) return
    if (paidByMode === 'equal') {
      setPaidBy((prev) =>
        prev.length === 0 ? prev : distributeEqually(totalAmount, prev.map((s) => s.uid))
      )
    }
  }, [totalAmount, paidByMode, isSolo])

  useEffect(() => {
    if (isSolo) return
    if (beneficiaryMode === 'equal') {
      setBeneficiaries((prev) =>
        prev.length === 0 ? prev : distributeEqually(totalAmount, prev.map((s) => s.uid))
      )
    }
  }, [totalAmount, beneficiaryMode, isSolo])

  // --- Validation ---------------------------------------------------------

  // Validity rounds both sides to 2dp — absorbs 3dp drift (e.g. 33.333×3 = 99.999 → 100.00)
  const r2 = (x: number) => Math.round(x * 100) / 100
  const paidByValid =
    isSolo || Math.abs(r2(paidBy.reduce((a, s) => a + s.amount, 0)) - r2(totalAmount)) < 0.01
  const beneficiaryValid =
    isSolo || Math.abs(r2(beneficiaries.reduce((a, s) => a + s.amount, 0)) - r2(totalAmount)) < 0.01

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState<boolean>(false)
  // Briefly true after a failed save attempt — drives the red flash on the Save button
  const [saveFlash, setSaveFlash] = useState<boolean>(false)

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!date) errs.date = 'Date is required.'
    if (!name.trim()) errs.name = 'Name is required.'
    const amount = parseFloat(amountStr)
    // Allow 0 as a valid amount (e.g. free entry, comped meals).
    // Only reject empty or non-numeric input.
    if (amountStr === '' || isNaN(amount)) {
      errs.amount = 'Enter a valid amount.'
    }
    if (!paidByValid) errs.paidBy = 'Paid by amounts must equal the total.'
    if (!beneficiaryValid) errs.beneficiaries = 'Split amounts must equal the total.'
    return errs
  }

  // --- Submit handler -----------------------------------------------------

  function handleSave() {
    setSubmitted(true)
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) {
      // Flash the Save button red for 600ms to signal the problem
      setSaveFlash(true)
      setTimeout(() => setSaveFlash(false), 600)
      return
    }

    const user = currentUser!
    const profile = userProfile!

    const total = parseFloat(amountStr)
    const exchangeRate = getExchangeRate(currency, profile.mainCurrency)
    const totalAmountMain = Math.round(total * exchangeRate * 100) / 100

    // Sync country/city to travel document so dropdowns update immediately
    const countryToSync = trackLocation && country ? country : undefined
    const cityToSync = trackLocation && city ? city : undefined
    if (countryToSync || cityToSync) {
      syncTransactionLocation(
        travelId,
        countryToSync,
        cityToSync,
        travelCountries ?? [],
        travelCities ?? [],
      ).then(({ newCountry, newCity }) => {
        if (onLocationAdded && (newCountry || newCity)) {
          onLocationAdded(newCountry, newCity)
        }
      }).catch(console.error)
    }

    // Shared data fields for both create and update.
    // Optional fields set to undefined are handled appropriately in each service call.
    const sharedData = {
      date,
      name: name.trim(),
      totalAmount: total,
      currency,
      exchangeRate,
      totalAmountMain,
      // Optional fields: use undefined so each service can decide how to handle them
      category: category || undefined,
      paymentMethod: paymentMethod || undefined,
      country: (trackLocation && country) ? country : undefined,
      city: (trackLocation && city) ? city : undefined,
      paidBy,
      beneficiaries,
      lastModifiedBy: user.uid,
      notes: notes.trim() || undefined,
    }

    if (isEdit) {
      // updateTransaction uses deleteField() internally for undefined optional fields,
      // so clearing category/city/notes actually removes them from Firestore.
      updateTransaction(travelId, initialValues!.txId, sharedData)
      onSuccess(initialValues!.txId)
    } else {
      const newTxId = createTransaction(travelId, {
        ...sharedData,
        createdBy: { type: 'user' as const, uid: user.uid },
      })
      onSuccess(newTxId)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-4">

      {/* Date — plain <input> (not shadcn Input) so the native OS date picker
          opens correctly on mobile. shadcn's Input can intercept touch events
          and prevent the calendar from appearing on iOS/Android. */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Date</label>
        <input
          type="date"
          value={toInputFormat(date)}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDate(fromInputFormat(e.target.value))}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
          // colorScheme tells the browser to adapt the date picker's internal
          // colours to the current theme — prevents invisible text in dark mode
          style={{ colorScheme: 'light dark' }}
        />
        {submitted && errors.date && (
          <p className="text-xs text-destructive">{errors.date}</p>
        )}
      </div>

      {/* Name */}
      <FieldWrapper label="Name" error={submitted ? errors.name : undefined}>
        <Input
          type="text"
          placeholder="e.g. Dinner, Taxi, Hotel night"
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
        />
      </FieldWrapper>

      {/* Amount + Currency */}
      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Amount</label>
            <Input
              type="number"
              inputMode="decimal"
              step={0.01}
              min={0}
              placeholder="0.00"
              value={amountStr}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmountStr(e.target.value)}
            />
            {submitted && errors.amount && (
              <p className="text-xs text-destructive">{errors.amount}</p>
            )}
          </div>
        </div>
        <div className="w-28">
          <SmartCurrencySelect
            value={currency}
            onChange={setCurrency}
            travelId={travelId}
            orderedCurrencies={orderedCurrencies}
            onCurrencyAdded={(code) => {
              // Persist new currency to travel list, then set it as selected
              const next = [...(travelCurrencies ?? []), code]
              updateTravelCurrencies(travelId, next).catch(console.error)
            }}
          />
        </div>
      </div>

      {/* Country + City — only shown when travel.settings.trackLocation is true */}
      {trackLocation && (
        <>
          <SmartCountrySelect
            value={country}
            onChange={setCountry}
            travelId={travelId}
            orderedCountries={orderedCountries}
            onCountryAdded={(name, flag) => {
              // Persist new country to travel list (use timestamp as id — nanoid not available here)
              const next = [...(travelCountries ?? []), { id: `country-${Date.now()}`, label: name, emoji: flag }]
              updateTravelList(travelId, 'countries', next).catch(console.error)
            }}
          />
          <LocationSelect
            label="City"
            value={city}
            onChange={setCity}
            previousValues={previousCities}
            placeholder="— optional —"
          />
        </>
      )}

      {/* Category — "+ Add new…" creates a new LabeledItem in the travel list */}
      <SmartLabeledItemSelect
        label="Category"
        value={category}
        onChange={setCategory}
        items={effectiveCategories}
        onAddNew={(label) => {
          // Build a new LabeledItem and persist it to the travel's categories list
          const newItem: LabeledItem = { id: `cat-${Date.now()}`, label }
          const updatedList = [...(travelCategories ?? []), newItem]
          updateTravelList(travelId, 'categories', updatedList).catch(console.error)
          // Notify parent so TravelDetailPage updates local travel state immediately
          onCategoryAdded?.(newItem)
        }}
      />

      {/* Payment Method — same "+ Add new…" pattern */}
      <SmartLabeledItemSelect
        label="Payment Method"
        value={paymentMethod}
        onChange={setPaymentMethod}
        items={effectivePaymentMethods}
        onAddNew={(label) => {
          const newItem: LabeledItem = { id: `pm-${Date.now()}`, label }
          const updatedList = [...(travelPaymentMethods ?? []), newItem]
          updateTravelList(travelId, 'paymentMethods', updatedList).catch(console.error)
          onPaymentMethodAdded?.(newItem)
        }}
      />

      {/* Notes */}
      <FieldWrapper label="Notes">
        <Textarea
          placeholder="Any additional details…"
          maxLength={300}
          rows={2}
          value={notes}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
        />
      </FieldWrapper>

      {/* Split rows — hidden entirely for solo travel (1 member) */}
      {!isSolo && (
        <>
          <SplitSummaryRow
            label="Paid by"
            splits={paidBy}
            members={members}
            mode={paidByMode}
            isValid={paidByValid}
            currentUserUid={currentUser.uid}
            onClick={() => setPaidByDrawerOpen(true)}
          />
          {submitted && errors.paidBy && (
            <p className="text-xs text-destructive">{errors.paidBy}</p>
          )}

          <SplitSummaryRow
            label="Split"
            splits={beneficiaries}
            members={members}
            mode={beneficiaryMode}
            isValid={beneficiaryValid}
            currentUserUid={currentUser.uid}
            onClick={() => setBeneficiaryDrawerOpen(true)}
          />
          {submitted && errors.beneficiaries && (
            <p className="text-xs text-destructive">{errors.beneficiaries}</p>
          )}
        </>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-2">
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          {/* saveFlash briefly applies destructive colours to signal invalid fields */}
          <Button
            type="button"
            className={`flex-1 transition-colors ${saveFlash ? 'bg-destructive text-destructive-foreground hover:bg-destructive' : ''}`}
            onClick={handleSave}
          >
            Save
          </Button>
        </div>
        {/* After a failed save attempt, list which fields need attention */}
        {submitted && Object.keys(errors).length > 0 && (
          <p className="text-center text-xs text-destructive">
            {'Please fix: ' + Object.keys(errors).map((k) =>
              ({ date: 'Date', name: 'Name', amount: 'Amount', paidBy: 'Paid by', beneficiaries: 'Split' } as Record<string, string>)[k] ?? k
            ).join(', ')}
          </p>
        )}
      </div>

      {/* Paid By bottom sheet */}
      <Drawer open={paidByDrawerOpen} onOpenChange={setPaidByDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Paid by</DrawerTitle>
          </DrawerHeader>
          <SplitEditor
            members={members}
            totalAmount={totalAmount}
            value={paidBy}
            onChange={setPaidBy}
            mode={paidByMode}
            onModeChange={setPaidByMode}
            label="Paid by"
          />
          <div className="px-4 pb-6 pt-2">
            <Button
              type="button"
              className="w-full"
              onClick={() => setPaidByDrawerOpen(false)}
            >
              Done
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Beneficiaries bottom sheet */}
      <Drawer open={beneficiaryDrawerOpen} onOpenChange={setBeneficiaryDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Split between</DrawerTitle>
          </DrawerHeader>
          <SplitEditor
            members={members}
            totalAmount={totalAmount}
            value={beneficiaries}
            onChange={setBeneficiaries}
            mode={beneficiaryMode}
            onModeChange={setBeneficiaryMode}
            label="Split between"
          />
          <div className="px-4 pb-6 pt-2">
            <Button
              type="button"
              className="w-full"
              onClick={() => setBeneficiaryDrawerOpen(false)}
            >
              Done
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

    </div>
  )
}