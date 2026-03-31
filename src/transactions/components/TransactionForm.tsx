// TransactionForm.tsx — unified form for all transaction types.
//
// Handles: expense, transfer, withdrawal, adjustment.
// Replaces the old TransactionForm (expense-only) + WithdrawalForm.
//
// UI: full-screen overlay (not a Drawer). Sticky top bar with ✕ / title / Save.
// Close triggers unsaved-changes confirmation dialog.
//
// Field visibility is declarative: each field declares which types it appears for,
// plus optional travelSettings gates. This makes future per-travel field
// customisation (Parameters tab) easy to layer on without restructuring.

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { createTransaction, updateTransaction } from '@/transactions/services/transactionService'
import { getExchangeRate } from '@/shared/utils/exchangeRates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { LabeledItem, TravelMember, TravelSettings } from '@/travels/types'
import { updateTravelCurrencies, updateTravelList, updateTravelDefaultRate, syncTransactionLocation } from '@/travels/services/travelService'
import { ALL_CURRENCIES, ALL_COUNTRIES } from '@/shared/data/pickerData'
import type { Split, TransactionType } from '@/transactions/types'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import { getTransactionType } from '@/transactions/utils/walletHelpers'
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
import { FormulaBar } from './FormulaBar'
import { SplitEditor } from '@/transactions/components/SplitEditor'
import { SplitSummaryRow } from '@/transactions/components/SplitSummaryRow'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'

// ---------------------------------------------------------------------------
// Date conversion helpers
// ---------------------------------------------------------------------------

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
// Field visibility — declarative config
// ---------------------------------------------------------------------------
// Each form field declares which transaction types show it.
// travelSettings gates are layered on top (e.g. trackLocation for country/city).
// Future: per-travel user overrides can be added to this structure.

type FieldName =
  | 'date' | 'name' | 'amount' | 'formula' | 'fees'
  | 'category' | 'paymentMethod' | 'country' | 'city'
  | 'notes' | 'split' | 'adjustmentMode'

const FIELD_TYPES: Record<FieldName, TransactionType[]> = {
  date:           ['expense', 'transfer', 'withdrawal', 'adjustment'],
  name:           ['expense', 'transfer', 'withdrawal', 'adjustment'],
  amount:         ['expense', 'transfer', 'withdrawal', 'adjustment'],
  formula:        ['expense', 'transfer', 'withdrawal', 'adjustment'],
  fees:           ['withdrawal'],
  category:       ['expense'],
  paymentMethod:  ['expense', 'withdrawal', 'adjustment'],
  country:        ['expense'],
  city:           ['expense'],
  notes:          ['expense', 'transfer', 'withdrawal', 'adjustment'],
  split:          ['expense', 'transfer'],
  adjustmentMode: ['adjustment'],
}

// ---------------------------------------------------------------------------
// Location dropdown helpers
// ---------------------------------------------------------------------------

const OTHER_VALUE = 'Other'

function getPreviousValues(
  transactions: TransactionWithStatus[],
  field: 'country' | 'city',
): string[] {
  const seen = new Map<string, number>()
  transactions.forEach((tx, index) => {
    const val = tx[field]
    if (val && val !== OTHER_VALUE && !seen.has(val)) {
      seen.set(val, index)
    }
  })
  return [...seen.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([val]) => val)
}

// ---------------------------------------------------------------------------
// LocationSelect — dropdown for country or city
// ---------------------------------------------------------------------------

interface LocationSelectProps {
  label: string
  value: string
  onChange: (val: string) => void
  previousValues: string[]
  placeholder: string
}

function LocationSelect({ label, value, onChange, previousValues, placeholder }: LocationSelectProps) {
  const [addingNew, setAddingNew] = useState(false)
  const [newInput, setNewInput] = useState('')

  const isCustomValue = value !== '' && value !== OTHER_VALUE && !previousValues.includes(value)

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const selected = e.target.value
    if (selected === '__add_new__') {
      setAddingNew(true)
      setNewInput('')
    } else {
      setAddingNew(false)
      onChange(selected)
    }
  }

  function handleNewInputConfirm() {
    const trimmed = newInput.trim()
    if (trimmed) onChange(trimmed)
    setAddingNew(false)
  }

  function handleNewInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleNewInputConfirm()
    if (e.key === 'Escape') setAddingNew(false)
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {addingNew ? (
        <div className="flex gap-2">
          <Input
            autoFocus
            type="text"
            placeholder={`Enter ${label.toLowerCase()}…`}
            value={newInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewInput(e.target.value)}
            onKeyDown={handleNewInputKeyDown}
          />
          <Button type="button" size="sm" onClick={handleNewInputConfirm}>OK</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAddingNew(false)}>✕</Button>
        </div>
      ) : (
        <select
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
          value={isCustomValue ? value : value}
          onChange={handleSelectChange}
        >
          <option value="">{placeholder}</option>
          {isCustomValue && <option value={value}>{value}</option>}
          {previousValues.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
          <option value={OTHER_VALUE}>Other</option>
          <option value="__add_new__">+ Add new…</option>
        </select>
      )}
      {value === OTHER_VALUE && !addingNew && (
        <p className="text-xs text-muted-foreground">Saved as "Other". Use "Add new…" to enter a specific name.</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SmartCurrencySelect — prominent pill-style selector
// ---------------------------------------------------------------------------

interface SmartCurrencySelectProps {
  value: string
  onChange: (code: string) => void
  travelId: string
  orderedCurrencies: string[]
  onCurrencyAdded: (code: string) => void
}

function SmartCurrencySelect({ value, onChange, onCurrencyAdded }: SmartCurrencySelectProps) {
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

  // Resolve the currency symbol for the current value
  const currencySymbol = ALL_CURRENCIES.find(([code]) => code === value)?.[1] ?? value

  if (pickerOpen) {
    return (
      <div className="flex flex-col gap-1">
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
    // Prominent pill button — shows code + symbol, tapping opens the picker.
    // Visually distinct from a standard dropdown so users notice it immediately.
    <button
      type="button"
      onClick={() => setPickerOpen(true)}
      className="flex h-9 items-center gap-1.5 rounded-full border-2 border-primary/30 bg-primary/5 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
    >
      <span>{value}</span>
      <span className="text-primary/60">{currencySymbol}</span>
      <span className="text-xs text-primary/40">▾</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// SmartCountrySelect
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
    ...(value && !orderedCountries.find((c) => c.label === value)
      ? [{ id: 'current', label: value, emoji: '🌍' }]
      : []),
  ]

  if (pickerOpen) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Country</label>
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
      <label className="text-xs font-medium text-muted-foreground">Country</label>
      <select
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
        value={value}
        onChange={(e) => {
          if (e.target.value === '__add__') setPickerOpen(true)
          else onChange(e.target.value)
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

interface SmartLabeledItemSelectProps {
  label: string
  value: string
  onChange: (val: string) => void
  items: string[]
  onAddNew: (label: string) => void
  placeholder?: string
  required?: boolean
}

function SmartLabeledItemSelect({
  label,
  value,
  onChange,
  items,
  onAddNew,
  placeholder = '— optional —',
  required,
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
      onAddNew(trimmed)
      onChange(trimmed)
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
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
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
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
        value={value}
        onChange={handleSelectChange}
      >
        {!required && <option value="">{placeholder}</option>}
        {required && !value && <option value="">— select —</option>}
        {items.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
        <option value="__add_new__">+ Add new…</option>
      </select>
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

function distributeEqually(total: number, ids: string[]): Split[] {
  if (ids.length === 0) return []
  const amount = round(total / ids.length, 3)
  return ids.map((travelMemberId) => ({ travelMemberId, amount }))
}

function detectSplitMode(splits: Split[]): 'equal' | 'custom' {
  if (splits.length <= 1) return 'equal'
  const first = splits[0].amount
  return splits.every((s) => Math.abs(s.amount - first) < 0.01) ? 'equal' : 'custom'
}

// ---------------------------------------------------------------------------
// Type selector pill button
// ---------------------------------------------------------------------------

const TYPE_CONFIG: { type: TransactionType; label: string; emoji: string }[] = [
  { type: 'expense',    label: 'Expense',    emoji: '💸' },
  { type: 'transfer',   label: 'Transfer',   emoji: '🤝' },
  { type: 'withdrawal', label: 'Withdrawal', emoji: '🏧' },
  { type: 'adjustment', label: 'Adjustment', emoji: '⚖️' },
]

function TypeSelector({
  value,
  onChange,
}: {
  value: TransactionType
  onChange: (t: TransactionType) => void
}) {
  return (
    <div className="flex gap-1">
      {TYPE_CONFIG.map(({ type, label, emoji }) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={`
            flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors
            ${value === type
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }
          `}
        >
          {emoji} {label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TransferSenderPicker — single-person dropdown for the "From" field
// ---------------------------------------------------------------------------

function TransferSenderPicker({
  members,
  selectedId,
  onChange,
  currentUserTravelMemberId,
}: {
  members: TravelMember[]
  selectedId: string
  onChange: (travelMemberId: string) => void
  currentUserTravelMemberId: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">From</label>
      <select
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
      >
        {members.map((m) => (
          <option key={m.travelMemberId} value={m.travelMemberId}>
            {m.displayName}{m.travelMemberId === currentUserTravelMemberId ? ' (you)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TransactionFormProps {
  travelId: string
  members: TravelMember[]
  travelSettings?: TravelSettings
  travelCategories?: LabeledItem[]
  travelPaymentMethods?: LabeledItem[]
  travelCurrencies?: string[]
  // The travel's reference currency for exchange rate computation.
  mainCurrency: string
  // Per-travel default exchange rates (relative to mainCurrency). Falls back to hardcoded rates.
  defaultRates?: Record<string, number>
  /** Called when user saves a custom rate as the new travel default. */
  onDefaultRateChanged?: (code: string, rate: number) => void
  travelCountries?: LabeledItem[]
  travelCities?: LabeledItem[]
  existingTransactions: TransactionWithStatus[]
  initialValues?: TransactionWithStatus
  /** Pre-set the type when opening for a new transaction (e.g. 'withdrawal' from DashboardTab). */
  initialType?: TransactionType
  onSuccess: (txId: string) => void
  onCancel: () => void
  /** Called when user taps Delete in edit mode. */
  onDelete?: (txId: string) => void
  onLocationAdded?: (newCountry: LabeledItem | null, newCity: LabeledItem | null) => void
  onCategoryAdded?: (item: LabeledItem) => void
  onPaymentMethodAdded?: (item: LabeledItem) => void
  /** Called when user taps "Add" in solo-travel CTA — saves tx then navigates to Parameters. */
  onNavigateToParameters?: () => void
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
  mainCurrency,
  defaultRates,
  onDefaultRateChanged,
  travelCountries,
  travelCities,
  existingTransactions,
  initialValues,
  initialType,
  onSuccess,
  onCancel,
  onDelete,
  onLocationAdded,
  onCategoryAdded,
  onPaymentMethodAdded,
  onNavigateToParameters,
}: TransactionFormProps) {
  const isEdit = !!initialValues
  const { currentUser, userProfile } = useAuthStore()

  if (!currentUser || !userProfile) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <p className="text-sm text-destructive">
          User profile unavailable. Please sign out and sign in again.
        </p>
      </div>
    )
  }

  // --- Current user's travel member slot ---
  const myMember = members.find((m) => m.userId === currentUser.uid)
  const myTravelMemberId = myMember?.travelMemberId ?? ''
  const isSolo = members.length === 1

  // --- Transaction type ---
  const [txType, setTxType] = useState<TransactionType>(
    isEdit ? getTransactionType(initialValues!) : (initialType ?? 'expense')
  )

  // Helper: check if a field is visible for the current transaction type + settings
  const fieldVisible = useCallback((field: FieldName): boolean => {
    if (!FIELD_TYPES[field].includes(txType)) return false
    // TravelSettings gates
    const trackLocation = travelSettings?.trackLocation ?? true
    if (field === 'country' || field === 'city') return trackLocation
    return true
  }, [txType, travelSettings])

  // --- Formula mode ---
  const [formulaMode, setFormulaMode] = useState(isEdit && !!initialValues?.amountFormula)
  const [formulaStr, setFormulaStr] = useState(isEdit ? (initialValues?.amountFormula ?? '') : '')

  // --- Effective lists ---
  const effectiveCategories: string[] =
    travelCategories && travelCategories.length > 0
      ? travelCategories.map((c) => c.emoji ? `${c.emoji} ${c.label}` : c.label)
      : userProfile.categories

  const effectivePaymentMethods: string[] =
    travelPaymentMethods && travelPaymentMethods.length > 0
      ? travelPaymentMethods.map((p) => p.emoji ? `${p.emoji} ${p.label}` : p.label)
      : userProfile.paymentMethods

  // --- Currency list ---
  // Default currency for new transactions — most recent transaction's currency, or the travel's main.
  const lastUsedCurrency = existingTransactions[0]?.currency ?? mainCurrency

  const orderedCurrencies = useMemo(() => {
    const travelSet = new Set(travelCurrencies ?? [])
    const recentlyUsed = [...new Set(existingTransactions.map((tx) => tx.currency))].filter(
      (c) => travelSet.has(c),
    )
    const rest = (travelCurrencies ?? []).filter((c) => !recentlyUsed.includes(c))
    return [...recentlyUsed, ...rest]
  }, [travelCurrencies, existingTransactions])

  // --- Country list ---
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

  const trackLocation = travelSettings?.trackLocation ?? true
  const previousCities = useMemo(
    () => getPreviousValues(existingTransactions, 'city'),
    [existingTransactions],
  )
  const lastCity = existingTransactions[0]?.city ?? ''
  const lastCountry = existingTransactions[0]?.country ?? ''

  // --- Field state ---
  const [date, setDate] = useState<string>(
    isEdit ? initialValues!.date : getTodayDDMMYYYY()
  )
  const [name, setName] = useState<string>(
    isEdit ? initialValues!.name : ''
  )
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
  const [feesStr, setFeesStr] = useState<string>(
    isEdit && initialValues!.fees != null ? String(initialValues!.fees) : ''
  )
  const [adjustmentMode, setAdjustmentMode] = useState<'expense' | 'balance_only'>(
    isEdit ? (initialValues!.adjustmentMode ?? 'balance_only') : 'balance_only'
  )

  // --- Exchange rate override ---
  // null = use the default rate; a number = user has manually set this transaction's rate.
  const [rateOverride, setRateOverride] = useState<number | null>(
    // When editing, if the stored rate differs from the current default, treat it as an override
    isEdit ? initialValues!.exchangeRate : null
  )
  // Controls whether the rate editing row is expanded
  const [rateExpanded, setRateExpanded] = useState(false)

  // The effective exchange rate for this transaction
  const effectiveRate = useMemo(() => {
    if (currency === mainCurrency) return 1.0
    if (rateOverride !== null) return rateOverride
    return getExchangeRate(currency, mainCurrency, defaultRates)
  }, [currency, mainCurrency, rateOverride, defaultRates])

  // --- Split state ---
  const totalAmount = parseFloat(amountStr) || 0

  const [paidBy, setPaidBy] = useState<Split[]>(
    isEdit ? initialValues!.paidBy : [{ travelMemberId: myTravelMemberId, amount: totalAmount }]
  )
  const [paidByMode, setPaidByMode] = useState<'equal' | 'custom'>(
    isEdit ? detectSplitMode(initialValues!.paidBy) : 'equal'
  )
  const [beneficiaries, setBeneficiaries] = useState<Split[]>(
    isEdit ? initialValues!.beneficiaries : [{ travelMemberId: myTravelMemberId, amount: totalAmount }]
  )
  const [beneficiaryMode, setBeneficiaryMode] = useState<'equal' | 'custom'>(
    isEdit ? detectSplitMode(initialValues!.beneficiaries) : 'equal'
  )

  // Transfer: sender is a single member (paidBy[0])
  const [transferSenderId, setTransferSenderId] = useState<string>(
    isEdit && getTransactionType(initialValues!) === 'transfer'
      ? (initialValues!.paidBy[0]?.travelMemberId ?? myTravelMemberId)
      : myTravelMemberId
  )

  // Drawer open state for split editors
  const [paidByDrawerOpen, setPaidByDrawerOpen] = useState(false)
  const [beneficiaryDrawerOpen, setBeneficiaryDrawerOpen] = useState(false)

  // --- Close confirmation ---
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  // Track if the user has changed anything (dirty flag)
  const [isDirty, setIsDirty] = useState(false)
  // Mark dirty on any field change. We wrap setters for key fields.
  const markDirty = useCallback(() => { if (!isDirty) setIsDirty(true) }, [isDirty])

  // --- Solo travel: keep splits silently in sync with totalAmount ---
  useEffect(() => {
    if (!isSolo) return
    const soloSplit: Split[] = [{ travelMemberId: myTravelMemberId, amount: totalAmount }]
    setPaidBy(soloSplit)
    setBeneficiaries(soloSplit)
  }, [isSolo, myTravelMemberId, totalAmount])

  // --- Withdrawal / Adjustment: auto-set splits to current user ---
  useEffect(() => {
    if (txType !== 'withdrawal' && txType !== 'adjustment') return
    const selfSplit: Split[] = [{ travelMemberId: myTravelMemberId, amount: totalAmount }]
    setPaidBy(selfSplit)
    setBeneficiaries(selfSplit)
  }, [txType, myTravelMemberId, totalAmount])

  // --- Transfer: keep paidBy in sync with sender + amount ---
  useEffect(() => {
    if (txType !== 'transfer') return
    setPaidBy([{ travelMemberId: transferSenderId, amount: totalAmount }])
  }, [txType, transferSenderId, totalAmount])

  // --- Transfer: when switching to transfer, set default beneficiaries to all OTHER members ---
  useEffect(() => {
    if (txType !== 'transfer') return
    // Only set default beneficiaries if not editing (edit mode preserves saved splits)
    if (isEdit) return
    const otherIds = members
      .filter((m) => m.travelMemberId !== transferSenderId)
      .map((m) => m.travelMemberId)
    if (otherIds.length > 0) {
      setBeneficiaries(distributeEqually(totalAmount, otherIds))
      setBeneficiaryMode('equal')
    }
    // Only run when transferSenderId changes (not on every totalAmount change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txType, transferSenderId, members, isEdit])

  // --- Transfer: keep beneficiary amounts in sync with totalAmount when equal mode ---
  useEffect(() => {
    if (txType !== 'transfer') return
    if (beneficiaryMode === 'equal') {
      setBeneficiaries((prev) =>
        prev.length === 0 ? prev : distributeEqually(totalAmount, prev.map((s) => s.travelMemberId))
      )
    }
  }, [txType, totalAmount, beneficiaryMode])

  // --- Multi-user equal mode: keep amounts in sync ---
  useEffect(() => {
    if (isSolo || txType === 'withdrawal' || txType === 'adjustment' || txType === 'transfer') return
    if (paidByMode === 'equal') {
      setPaidBy((prev) =>
        prev.length === 0 ? prev : distributeEqually(totalAmount, prev.map((s) => s.travelMemberId))
      )
    }
  }, [totalAmount, paidByMode, isSolo, txType])

  useEffect(() => {
    if (isSolo || txType === 'withdrawal' || txType === 'adjustment' || txType === 'transfer') return
    if (beneficiaryMode === 'equal') {
      setBeneficiaries((prev) =>
        prev.length === 0 ? prev : distributeEqually(totalAmount, prev.map((s) => s.travelMemberId))
      )
    }
  }, [totalAmount, beneficiaryMode, isSolo, txType])

  // --- Validation ---
  const r2 = (x: number) => Math.round(x * 100) / 100
  const paidByValid =
    isSolo || txType === 'withdrawal' || txType === 'adjustment'
    || Math.abs(r2(paidBy.reduce((a, s) => a + s.amount, 0)) - r2(totalAmount)) < 0.01
  const beneficiaryValid =
    isSolo || txType === 'withdrawal' || txType === 'adjustment'
    || Math.abs(r2(beneficiaries.reduce((a, s) => a + s.amount, 0)) - r2(totalAmount)) < 0.01

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState<boolean>(false)
  const [saveFlash, setSaveFlash] = useState<boolean>(false)

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!date) errs.date = 'Date is required.'

    // Name: required for expense and transfer, optional for withdrawal/adjustment
    if ((txType === 'expense' || txType === 'transfer') && !name.trim()) {
      errs.name = 'Name is required.'
    }

    const amount = parseFloat(amountStr)
    if (amountStr === '' || isNaN(amount)) {
      errs.amount = 'Enter a valid amount.'
    }
    // Withdrawals require a positive amount
    if (txType === 'withdrawal' && (isNaN(amount) || amount <= 0)) {
      errs.amount = 'Enter a positive amount.'
    }

    // Payment method: required for withdrawal and adjustment
    if ((txType === 'withdrawal' || txType === 'adjustment') && !paymentMethod) {
      errs.paymentMethod = 'Payment method is required.'
    }

    // Fees validation (withdrawal only)
    if (txType === 'withdrawal' && feesStr.trim()) {
      const feesVal = parseFloat(feesStr)
      if (isNaN(feesVal) || feesVal < 0) errs.fees = 'Fees must be 0 or positive.'
      else if (feesVal >= amount) errs.fees = 'Fees must be less than the withdrawal amount.'
    }

    // Split validation (expense and transfer only)
    if (fieldVisible('split') && !isSolo) {
      if (!paidByValid) errs.paidBy = 'Paid by amounts must equal the total.'
      if (!beneficiaryValid) errs.beneficiaries = 'Split amounts must equal the total.'
    }

    return errs
  }

  // --- Submit handler ---
  function handleSave() {
    setSubmitted(true)
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) {
      setSaveFlash(true)
      setTimeout(() => setSaveFlash(false), 600)
      return
    }

    const user = currentUser!


    const total = parseFloat(amountStr)
    // Exchange rate: use user override if set, otherwise travel default, otherwise hardcoded fallback.
    const exchangeRate = effectiveRate
    const totalAmountMain = Math.round(total * exchangeRate * 100) / 100

    // Auto-generate name for withdrawal/adjustment if blank
    let txName = name.trim()
    if (!txName) {
      if (txType === 'withdrawal') txName = `Top-up ${paymentMethod}`
      else if (txType === 'adjustment') txName = `Adjustment — ${paymentMethod}`
      else txName = 'Transaction'
    }

    // Sync country/city to travel document (expense only)
    if (txType === 'expense') {
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
    }

    // Build the data payload — fields not relevant to the type are set to undefined
    // (updateTransaction uses deleteField() for undefined optional fields).
    const sharedData = {
      date,
      name: txName,
      totalAmount: total,
      currency,
      exchangeRate,
      totalAmountMain,
      category: fieldVisible('category') ? (category || undefined) : undefined,
      paymentMethod: fieldVisible('paymentMethod') ? (paymentMethod || undefined) : undefined,
      country: fieldVisible('country') && country ? country : undefined,
      city: fieldVisible('city') && city ? city : undefined,
      paidBy,
      beneficiaries,
      lastModifiedBy: user.uid,
      notes: fieldVisible('notes') ? (notes.trim() || undefined) : undefined,
      amountFormula: fieldVisible('formula') ? (formulaStr.trim() || undefined) : undefined,
      // Type: undefined for 'expense' (backward compat), explicit for others
      type: txType === 'expense' ? undefined : txType,
      fees: txType === 'withdrawal' ? (feesStr.trim() ? parseFloat(feesStr) : undefined) : undefined,
      adjustmentMode: txType === 'adjustment' ? adjustmentMode : undefined,
    }

    if (isEdit) {
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

  // --- Close with confirmation ---
  function handleClose() {
    if (isDirty) {
      setCloseDialogOpen(true)
    } else {
      onCancel()
    }
  }

  // --- Amount label adapts to type ---
  const amountLabel = txType === 'transfer' ? 'Transfer amount'
    : txType === 'withdrawal' ? 'Withdraw amount'
    : 'Amount'

  // Solo + transfer: the form only shows the type selector + CTA.
  // All other fields and action buttons are hidden.
  const soloTransfer = isSolo && txType === 'transfer'

  // --- Form title ---
  const formTitle = isEdit
    ? `Edit ${txType === 'expense' ? 'expense' : txType}`
    : `New ${txType === 'expense' ? 'expense' : txType}`

  // ---------------------------------------------------------------------------
  // Render — full-screen overlay
  // ---------------------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">

      {/* Sticky top bar */}
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <button
          type="button"
          onClick={handleClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          ✕
        </button>
        <h2 className="text-sm font-semibold">{formTitle}</h2>
        <Button
          type="button"
          size="sm"
          disabled={soloTransfer}
          className={`min-w-[60px] transition-colors ${saveFlash ? 'bg-destructive text-destructive-foreground hover:bg-destructive' : ''}`}
          onClick={handleSave}
        >
          Save
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-lg flex-col gap-4">

          {/* ── Type selector ── */}
          <TypeSelector value={txType} onChange={(t) => { setTxType(t); markDirty() }} />

          {/* ── Name ── */}
          {!soloTransfer && fieldVisible('name') && (
            <div className="flex flex-col gap-1">
              <Input
                type="text"
                placeholder={
                  txType === 'withdrawal' ? 'e.g. ATM Bangkok (optional)'
                  : txType === 'adjustment' ? 'e.g. Cash reconciliation (optional)'
                  : txType === 'transfer' ? 'e.g. Settlement, Loan to Bob'
                  : 'e.g. Dinner, Taxi, Hotel night'
                }
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setName(e.target.value); markDirty() }}
              />
              {submitted && errors.name && (
                <p className="text-xs text-destructive">{errors.name}</p>
              )}
            </div>
          )}

          {/* ── Date ── */}
          {!soloTransfer && fieldVisible('date') && (
            <div className="flex flex-col gap-1">
              <input
                type="date"
                value={toInputFormat(date)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setDate(fromInputFormat(e.target.value)); markDirty() }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                style={{ colorScheme: 'light dark' }}
              />
              {submitted && errors.date && (
                <p className="text-xs text-destructive">{errors.date}</p>
              )}
            </div>
          )}

          {/* ── Amount + Currency row ── */}
          {!soloTransfer && fieldVisible('amount') && (
            <div className="flex flex-col gap-2">

              {/* Formula bar (when active) */}
              {fieldVisible('formula') && formulaMode && (
                <FormulaBar
                  value={formulaStr}
                  onChange={(v) => { setFormulaStr(v); markDirty() }}
                  onEvaluated={(result) => {
                    if (result !== null) setAmountStr(result.toFixed(2))
                  }}
                />
              )}

              {/* [🧮] [Amount input] [Currency pill] */}
              <div className="flex items-end gap-2">

                {/* Formula toggle button */}
                {fieldVisible('formula') && (
                  <button
                    type="button"
                    onClick={() => {
                      if (formulaMode) {
                        setFormulaMode(false)
                      } else {
                        if (amountStr && parseFloat(amountStr) > 0) setFormulaStr(amountStr)
                        setFormulaMode(true)
                      }
                    }}
                    title={formulaMode ? 'Close formula mode' : 'Enter formula mode'}
                    aria-pressed={formulaMode}
                    className={[
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-base transition-colors',
                      formulaMode
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    ].join(' ')}
                  >
                    🧮
                  </button>
                )}

                {/* Amount input */}
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {amountLabel}
                  </label>
                  {formulaMode ? (
                    <div className="flex h-9 items-center rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground">
                      {amountStr || <span className="italic">enter formula above</span>}
                    </div>
                  ) : (
                    <Input
                      type="number"
                      inputMode="decimal"
                      step={0.01}
                      min={0}
                      placeholder="0.00"
                      value={amountStr}
                      onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
                        if (e.target.value === '0') setAmountStr('')
                      }}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setAmountStr(e.target.value); markDirty() }}
                    />
                  )}
                  {submitted && errors.amount && (
                    <p className="mt-1 text-xs text-destructive">{errors.amount}</p>
                  )}
                </div>

                {/* Currency pill */}
                <SmartCurrencySelect
                  value={currency}
                  onChange={(c) => { setCurrency(c); markDirty() }}
                  travelId={travelId}
                  orderedCurrencies={orderedCurrencies}
                  onCurrencyAdded={(code) => {
                    const next = [...(travelCurrencies ?? []), code]
                    updateTravelCurrencies(travelId, next).catch(console.error)
                  }}
                />
              </div>

              {/* Cost in main currency — shown when currency differs from mainCurrency */}
              {currency !== mainCurrency && totalAmount > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  = {(totalAmount * effectiveRate).toFixed(2)} {mainCurrency}
                </p>
              )}

              {/* Exchange rate hint — shown when currency differs from mainCurrency */}
              {currency !== mainCurrency && (
                <div className="mt-1">
                  {!rateExpanded ? (
                    // Collapsed: two-line rate display, tap to expand
                    <button
                      type="button"
                      onClick={() => setRateExpanded(true)}
                      className="flex flex-col items-start text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span>
                        1 {currency} = {effectiveRate.toPrecision(6)} {mainCurrency}
                        {rateOverride !== null && ' (custom)'}
                      </span>
                      <span>
                        1 {mainCurrency} = {effectiveRate > 0 ? parseFloat((1 / effectiveRate).toPrecision(6)) : '—'} {currency}
                        <span className="ml-1 text-[10px]">✎</span>
                      </span>
                    </button>
                  ) : (
                    // Expanded: editable rate in both directions with save-as-default option
                    <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-2">
                      {/* Direction 1: 1 local = X main (stored format) */}
                      <div className="flex items-center gap-2 text-xs">
                        <span className="shrink-0 text-muted-foreground">1 {currency} =</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          value={rateOverride !== null ? rateOverride : effectiveRate}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value)
                            if (!isNaN(val) && val > 0) {
                              setRateOverride(val)
                              markDirty()
                            }
                          }}
                          className="w-28 rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <span className="shrink-0 text-muted-foreground">{mainCurrency}</span>
                      </div>
                      {/* Direction 2: 1 main = X local (inverse, for convenience) */}
                      <div className="flex items-center gap-2 text-xs">
                        <span className="shrink-0 text-muted-foreground">1 {mainCurrency} =</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          value={effectiveRate > 0 ? parseFloat((1 / effectiveRate).toPrecision(6)) : ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value)
                            if (!isNaN(val) && val > 0) {
                              // Invert to get the stored format (1 local = X main)
                              setRateOverride(parseFloat((1 / val).toPrecision(6)))
                              markDirty()
                            }
                          }}
                          className="w-28 rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <span className="shrink-0 text-muted-foreground">{currency}</span>
                      </div>
                      {totalAmount > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          {totalAmount} {currency} = {(totalAmount * effectiveRate).toFixed(2)} {mainCurrency}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        {/* Save as new travel default */}
                        {rateOverride !== null && rateOverride !== getExchangeRate(currency, mainCurrency, defaultRates) && (
                          <button
                            type="button"
                            onClick={() => {
                              updateTravelDefaultRate(travelId, currency, rateOverride).catch(console.error)
                              onDefaultRateChanged?.(currency, rateOverride)
                            }}
                            className="text-[10px] text-primary hover:underline"
                          >
                            Save as default rate
                          </button>
                        )}
                        {/* Reset to default */}
                        {rateOverride !== null && (
                          <button
                            type="button"
                            onClick={() => { setRateOverride(null); markDirty() }}
                            className="text-[10px] text-muted-foreground hover:underline"
                          >
                            Reset
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setRateExpanded(false)}
                          className="ml-auto text-[10px] text-muted-foreground hover:underline"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Fees (withdrawal only) ── */}
          {!soloTransfer && fieldVisible('fees') && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Fees (optional)</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={feesStr}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setFeesStr(e.target.value); markDirty() }}
              />
              <p className="text-xs text-muted-foreground">
                Deducted from wallet balance (you received amount minus fees)
              </p>
              {submitted && errors.fees && (
                <p className="text-xs text-destructive">{errors.fees}</p>
              )}
            </div>
          )}

          {/* ── Adjustment mode ── */}
          {!soloTransfer && fieldVisible('adjustmentMode') && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Adjustment mode</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setAdjustmentMode('balance_only'); markDirty() }}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    adjustmentMode === 'balance_only'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input bg-background text-muted-foreground hover:bg-accent'
                  }`}
                >
                  Balance only
                </button>
                <button
                  type="button"
                  onClick={() => { setAdjustmentMode('expense'); markDirty() }}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    adjustmentMode === 'expense'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input bg-background text-muted-foreground hover:bg-accent'
                  }`}
                >
                  Count as expense
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {adjustmentMode === 'balance_only'
                  ? 'Only corrects the wallet balance. Does not appear in spending stats or category breakdowns.'
                  : 'Corrects the wallet balance and counts toward spending analytics (totals, categories, charts).'}
              </p>
            </div>
          )}

          {/* ── Paid by / Split section ── */}
          {fieldVisible('split') && (
            <>
              {isSolo ? (
                /* Solo travel CTA — saves the transaction first, then navigates to Parameters */
                <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    👥 Share this expense with your friends? Add them to this travel.
                  </p>
                  {onNavigateToParameters && (
                    <button
                      type="button"
                      onClick={() => {
                        // Save first, then navigate. handleSave calls onSuccess which
                        // closes the form; onNavigateToParameters switches to the tab.
                        handleSave()
                        // Only navigate if save didn't produce validation errors
                        if (Object.keys(validate()).length === 0) {
                          onNavigateToParameters()
                        }
                      }}
                      className="mt-2 text-xs font-medium text-primary hover:underline"
                    >
                      Save & add friends →
                    </button>
                  )}
                </div>
              ) : txType === 'transfer' ? (
                /* Transfer: From (single person) + To (split editor) */
                <div className="flex flex-col gap-3">
                  <TransferSenderPicker
                    members={members}
                    selectedId={transferSenderId}
                    onChange={(id) => { setTransferSenderId(id); markDirty() }}
                    currentUserTravelMemberId={myTravelMemberId}
                  />
                  <SplitSummaryRow
                    label="To"
                    splits={beneficiaries}
                    members={members}
                    mode={beneficiaryMode}
                    isValid={beneficiaryValid}
                    currentUserTravelMemberId={myTravelMemberId}
                    onClick={() => setBeneficiaryDrawerOpen(true)}
                  />
                  {submitted && errors.beneficiaries && (
                    <p className="text-xs text-destructive">{errors.beneficiaries}</p>
                  )}
                </div>
              ) : (
                /* Expense: standard Paid by + Split rows */
                <div className="flex flex-col gap-2">
                  <SplitSummaryRow
                    label="Paid by"
                    splits={paidBy}
                    members={members}
                    mode={paidByMode}
                    isValid={paidByValid}
                    currentUserTravelMemberId={myTravelMemberId}
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
                    currentUserTravelMemberId={myTravelMemberId}
                    onClick={() => setBeneficiaryDrawerOpen(true)}
                  />
                  {submitted && errors.beneficiaries && (
                    <p className="text-xs text-destructive">{errors.beneficiaries}</p>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Optional fields in 2-column grid ── */}
          {/* Hidden entirely when solo + transfer (only the CTA matters) */}

          {/* Row 1: Country + City */}
          {!soloTransfer &&(fieldVisible('country') || fieldVisible('city')) && (
            <div className="grid grid-cols-2 gap-3">
              {fieldVisible('country') && (
                <div className={!fieldVisible('city') ? 'col-span-2' : ''}>
                  <SmartCountrySelect
                    value={country}
                    onChange={(v) => { setCountry(v); markDirty() }}
                    travelId={travelId}
                    orderedCountries={orderedCountries}
                    onCountryAdded={(name, flag) => {
                      const next = [...(travelCountries ?? []), { id: `country-${Date.now()}`, label: name, emoji: flag }]
                      updateTravelList(travelId, 'countries', next).catch(console.error)
                    }}
                  />
                </div>
              )}
              {fieldVisible('city') && (
                <div className={!fieldVisible('country') ? 'col-span-2' : ''}>
                  <LocationSelect
                    label="City"
                    value={city}
                    onChange={(v) => { setCity(v); markDirty() }}
                    previousValues={previousCities}
                    placeholder="— optional —"
                  />
                </div>
              )}
            </div>
          )}

          {/* Row 2: Category + Payment Method */}
          {!soloTransfer &&(fieldVisible('category') || fieldVisible('paymentMethod')) && (
            <div className="grid grid-cols-2 gap-3">
              {fieldVisible('category') && (
                <div className={!fieldVisible('paymentMethod') ? 'col-span-2' : ''}>
                  <SmartLabeledItemSelect
                    label="Category"
                    value={category}
                    onChange={(v) => { setCategory(v); markDirty() }}
                    items={effectiveCategories}
                    onAddNew={(label) => {
                      const newItem: LabeledItem = { id: `cat-${Date.now()}`, label }
                      const updatedList = [...(travelCategories ?? []), newItem]
                      updateTravelList(travelId, 'categories', updatedList).catch(console.error)
                      onCategoryAdded?.(newItem)
                    }}
                  />
                </div>
              )}
              {fieldVisible('paymentMethod') && (
                <div className={!fieldVisible('category') ? 'col-span-2' : ''}>
                  <SmartLabeledItemSelect
                    label={txType === 'withdrawal' ? 'Top up' : 'Payment Method'}
                    value={paymentMethod}
                    onChange={(v) => { setPaymentMethod(v); markDirty() }}
                    items={effectivePaymentMethods}
                    required={txType === 'withdrawal' || txType === 'adjustment'}
                    onAddNew={(label) => {
                      const newItem: LabeledItem = { id: `pm-${Date.now()}`, label }
                      const updatedList = [...(travelPaymentMethods ?? []), newItem]
                      updateTravelList(travelId, 'paymentMethods', updatedList).catch(console.error)
                      onPaymentMethodAdded?.(newItem)
                    }}
                  />
                  {submitted && errors.paymentMethod && (
                    <p className="text-xs text-destructive">{errors.paymentMethod}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Notes (full width) ── */}
          {!soloTransfer &&fieldVisible('notes') && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea
                placeholder="Any additional details…"
                maxLength={300}
                rows={2}
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => { setNotes(e.target.value); markDirty() }}
              />
            </div>
          )}

          {/* After-save error summary */}
          {submitted && Object.keys(errors).length > 0 && (
            <p className="text-center text-xs text-destructive">
              {'Please fix: ' + Object.keys(errors).map((k) =>
                ({
                  date: 'Date', name: 'Name', amount: 'Amount',
                  paidBy: 'Paid by', beneficiaries: 'Split',
                  paymentMethod: 'Payment method', fees: 'Fees',
                } as Record<string, string>)[k] ?? k
              ).join(', ')}
            </p>
          )}

          {/* Bottom action bar — duplicates top Save for easy thumb reach */}
          {!soloTransfer && (
            <div className="flex flex-col gap-2 pt-2">
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>
                  Close
                </Button>
                <Button
                  type="button"
                  className={`flex-1 transition-colors ${saveFlash ? 'bg-destructive text-destructive-foreground hover:bg-destructive' : ''}`}
                  onClick={handleSave}
                >
                  Save
                </Button>
              </div>
              {/* Delete button — only in edit mode */}
              {isEdit && onDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={() => onDelete(initialValues!.txId)}
                >
                  Delete
                </Button>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Paid By drawer (expense only, multi-user) ── */}
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
            <Button type="button" className="w-full" onClick={() => setPaidByDrawerOpen(false)}>
              Done
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── Beneficiaries drawer (expense + transfer, multi-user) ── */}
      <Drawer open={beneficiaryDrawerOpen} onOpenChange={setBeneficiaryDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{txType === 'transfer' ? 'Transfer to' : 'Split between'}</DrawerTitle>
          </DrawerHeader>
          <SplitEditor
            members={members}
            totalAmount={totalAmount}
            value={beneficiaries}
            onChange={setBeneficiaries}
            mode={beneficiaryMode}
            onModeChange={setBeneficiaryMode}
            label={txType === 'transfer' ? 'Transfer to' : 'Split between'}
          />
          <div className="px-4 pb-6 pt-2">
            <Button type="button" className="w-full" onClick={() => setBeneficiaryDrawerOpen(false)}>
              Done
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── Close confirmation dialog ── */}
      <AlertDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isEdit ? 'Discard changes?' : 'Discard transaction?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {isEdit
                ? 'The changes are not saved and will be lost.'
                : 'The transaction is not saved and will be lost.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onCancel} className="bg-destructive text-white hover:bg-destructive/90">
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
