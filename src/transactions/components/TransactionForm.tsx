// TransactionForm.tsx — unified form for all transaction types.
//
// Handles: expense, transfer, withdrawal, adjustment.
// Replaces the old TransactionForm (expense-only) + WithdrawalForm.
//
// UI: full-screen overlay (not a Drawer). Sticky top bar with ✕ / title / Save.
// Close triggers unsaved-changes confirmation dialog.
//
// Field visibility is declarative: each field declares which types it appears for,
// plus optional spaceSettings gates. This makes future per-space field
// customisation (Parameters tab) easy to layer on without restructuring.

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { createTransaction, updateTransaction } from '@/transactions/services/transactionService'
import { getExchangeRate, hasExchangeRate } from '@/shared/utils/exchangeRates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { CustomFieldDef, CustomValue, LabeledItem, Space, SpaceMember } from '@/spaces/types'
import { updateSpaceCurrencies, updateSpaceList, updateSpaceDefaultRate, syncTransactionLocation, ensureMultiCurrency } from '@/spaces/services/spaceService'
import { getSpaceConfig, enabledCustomFields, mergeCustomPayload } from '@/spaces/config'
import { ALL_COUNTRIES, displayCountryName, localizedCountryName } from '@/shared/data/pickerData'
import { useT, useLocale } from '@/i18n'
import type { Split, TransactionType } from '@/transactions/types'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import { getTransactionType, availableTransactionTypes } from '@/transactions/utils/walletHelpers'
import { LocationSelect, getPreviousValues } from '@/shared/components/LocationSelect'
import { SmartCurrencySelect, InlineCurrencyControl } from '@/shared/components/CurrencySelect'
import { Switch } from '@/shared/components/Switch'
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
// spaceSettings gates are layered on top (e.g. trackLocation for country/city).
// Future: per-space user overrides can be added to this structure.

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
// SmartCountrySelect
// ---------------------------------------------------------------------------

interface SmartCountrySelectProps {
  value: string
  onChange: (name: string) => void
  spaceId: string
  orderedCountries: LabeledItem[]
  onCountryAdded: (name: string, flag: string) => void
}

function SmartCountrySelect({ value, onChange, orderedCountries, onCountryAdded }: SmartCountrySelectProps) {
  // translation hook — re-renders when the language changes
  const t = useT()
  // Intl locale tag, used to show country names in the UI language
  const locale = useLocale()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (pickerOpen && searchRef.current) searchRef.current.focus()
  }, [pickerOpen])

  // Every country with its name in the UI language, sorted in that language.
  // The STORED value stays the English name (entry[2]) — only display changes.
  // useMemo: rebuilt only when the locale changes (≈250 Intl lookups).
  const localizedCountries = useMemo(
    () =>
      ALL_COUNTRIES
        .map(([code, flag, name]) => ({ code, flag, name, display: localizedCountryName(code, locale) }))
        .sort((a, b) => a.display.localeCompare(b.display, locale)),
    [locale],
  )

  // Search matches the localized name OR the English one ("Japon" and "Japan").
  const query = search.toLowerCase()
  const filtered = localizedCountries.filter(
    (c) => c.display.toLowerCase().includes(query) || c.name.toLowerCase().includes(query),
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
        <label className="text-xs font-medium text-muted-foreground">{t.transactionForm.fields.country}</label>
        <div className="flex flex-col gap-1 rounded-md border bg-background p-2 shadow-md">
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.transactionForm.select.searchCountry}
            className="rounded border px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="max-h-40 overflow-y-auto">
            {filtered.map(({ flag, name, display }) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  // Store the English name; the label shown was `display`.
                  onChange(name)
                  onCountryAdded(name, flag)
                  setPickerOpen(false)
                  setSearch('')
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent/40"
              >
                <span className="text-base">{flag}</span>
                <span>{display}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { setPickerOpen(false); setSearch('') }}
            className="text-xs text-muted-foreground hover:text-foreground text-right">
            {t.common.cancel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{t.transactionForm.fields.country}</label>
      <select
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
        value={value}
        onChange={(e) => {
          if (e.target.value === '__add__') setPickerOpen(true)
          else onChange(e.target.value)
        }}
      >
        <option value="">{t.transactionForm.select.optional}</option>
        {selectOptions.map((c) => {
          // option value = stored English name; visible text = UI-language name
          const shown = displayCountryName(c.label, locale)
          return (
            <option key={c.id} value={c.label}>
              {c.emoji ? `${c.emoji} ${shown}` : shown}
            </option>
          )
        })}
        <option value="__add__">{t.transactionForm.select.add}</option>
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
  /** Placeholder of the inline "new item" input, e.g. "New category…".
   *  Passed in (not built from `label`) because French needs gender agreement. */
  newItemPlaceholder: string
  placeholder?: string
  required?: boolean
}

function SmartLabeledItemSelect({
  label,
  value,
  onChange,
  items,
  onAddNew,
  newItemPlaceholder,
  placeholder,
  required,
}: SmartLabeledItemSelectProps) {
  // translation hook — re-renders when the language changes
  const t = useT()
  // Default placeholder resolved here (a default parameter can't use the hook)
  const emptyLabel = placeholder ?? t.transactionForm.select.optional
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
            placeholder={newItemPlaceholder}
            value={newInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Button type="button" size="sm" onClick={handleConfirm}>{t.common.ok}</Button>
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
        {!required && <option value="">{emptyLabel}</option>}
        {required && !value && <option value="">{t.transactionForm.select.required}</option>}
        {items.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
        <option value="__add_new__">{t.transactionForm.select.addNew}</option>
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

// Labels are NOT stored here: a module-level constant is evaluated once and
// would freeze the language. They are looked up at render (t.transactions.types).
const TYPE_CONFIG: { type: TransactionType; emoji: string }[] = [
  { type: 'expense',    emoji: '💸' },
  { type: 'transfer',   emoji: '🤝' },
  { type: 'withdrawal', emoji: '🏧' },
  { type: 'adjustment', emoji: '⚖️' },
]

function TypeSelector({
  value,
  onChange,
  availableTypes,
}: {
  value: TransactionType
  onChange: (t: TransactionType) => void
  availableTypes: TransactionType[]
}) {
  // translation hook — re-renders when the language changes (before the early return)
  const t = useT()

  // Hidden entirely when only one type is available (e.g. solo space, wallets off) —
  // a single dead pill would just be noise. See availableTransactionTypes().
  if (availableTypes.length <= 1) return null

  return (
    <div className="flex gap-1">
      {TYPE_CONFIG.filter(({ type }) => availableTypes.includes(type)).map(({ type, emoji }) => (
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
          {emoji} {t.transactions.types[type]}
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
  members: SpaceMember[]
  selectedId: string
  onChange: (travelMemberId: string) => void
  currentUserTravelMemberId: string
}) {
  // translation hook — re-renders when the language changes
  const t = useT()
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{t.transactionForm.fields.from}</label>
      <select
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
      >
        {members.map((m) => (
          <option key={m.travelMemberId} value={m.travelMemberId}>
            {m.travelMemberId === currentUserTravelMemberId
              ? t.transactionForm.select.you({ name: m.displayName })
              : m.displayName}
          </option>
        ))}
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CustomFieldRow — generic input for a Tier-3 custom field (Space refactor
// Phase 5, §4). Behaviour is generic by design — a field that needs bespoke
// logic gets promoted to a Tier-2 built-in instead (SPEC §3).
// ---------------------------------------------------------------------------

function CustomFieldRow({
  def,
  value,
  onChange,
}: {
  def: CustomFieldDef
  value: CustomValue | undefined
  onChange: (v: CustomValue) => void
}) {
  // translation hook — re-renders when the language changes (before any early return)
  const t = useT()
  const label = def.emoji ? `${def.emoji} ${def.label}` : def.label

  if (def.type === 'boolean') {
    const checked = value === true
    return (
      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <span className="text-sm font-medium">{label}</span>
        <Switch checked={checked} onChange={(v) => onChange(v)} label={label} />
      </div>
    )
  }

  if (def.type === 'select') {
    // No custom field is ever required in v1 — always include a clear/empty choice.
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t.transactionForm.select.optional}</option>
          {(def.options ?? []).map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.emoji ? `${opt.emoji} ${opt.label}` : opt.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  // 'text'
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input
        type="text"
        value={typeof value === 'string' ? value : ''}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Pre-fill data for opening the form as a new transfer (e.g. from BalanceTab settlements). */
export interface TransferPrefill {
  amount: number
  currency: string
  fromMemberId: string  // sender (paidBy)
  toMemberId: string    // receiver (beneficiary)
}

interface TransactionFormProps {
  spaceId: string
  // Full space document — read via getSpaceConfig() (resolved once, useMemo) for
  // field visibility, available transaction types and custom field definitions.
  // Legacy spaces (no space.config) resolve to travel-mode defaults, so this is
  // the ONLY thing that needs to change to make the form config-driven.
  space: Space
  members: SpaceMember[]
  // The space's reference currency for exchange rate computation.
  mainCurrency: string
  // Per-space default exchange rates (relative to mainCurrency). Falls back to hardcoded rates.
  defaultRates?: Record<string, number>
  /** Called when user saves a custom rate as the new space default. */
  onDefaultRateChanged?: (code: string, rate: number) => void
  /** Called when the sticky multiCurrency flag flips on — see §6.2. Lets the
   *  parent optimistically update local space state without waiting for the
   *  Firestore write to round-trip. */
  onMultiCurrencyUpgraded?: () => void
  existingTransactions: TransactionWithStatus[]
  initialValues?: TransactionWithStatus
  /** Pre-set the type when opening for a new transaction (e.g. 'withdrawal' from DashboardTab). */
  initialType?: TransactionType
  /** Pre-fill transfer fields for a new transaction (e.g. settlement from BalanceTab). */
  transferPrefill?: TransferPrefill
  onSuccess: (txId: string) => void
  onCancel: () => void
  /** Called when user taps Delete in edit mode. */
  onDelete?: (txId: string) => void
  onLocationAdded?: (newCountry: LabeledItem | null, newCity: LabeledItem | null) => void
  onCategoryAdded?: (item: LabeledItem) => void
  onPaymentMethodAdded?: (item: LabeledItem) => void
  /** Called when user taps "Add" in solo-space CTA — saves tx then navigates to Parameters. */
  onNavigateToParameters?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransactionForm({
  spaceId,
  space,
  members,
  mainCurrency,
  defaultRates,
  onDefaultRateChanged,
  onMultiCurrencyUpgraded,
  existingTransactions,
  initialValues,
  initialType,
  transferPrefill,
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
  // translation hook — re-renders when the language changes (before the early return below)
  const t = useT()
  const tf = t.transactionForm

  // Per-space lists, aliased for minimal churn against the rest of this file.
  const spaceCategories = space.categories
  const spacePaymentMethods = space.paymentMethods
  const spaceCurrencies = space.currencies
  const spaceCountries = space.countries
  const spaceCities = space.cities

  // Resolved once per space change — never call getSpaceConfig() in a nested
  // component, always read this. Legacy spaces (no space.config) resolve to
  // travel-mode defaults, so field visibility is unchanged for them.
  const config = useMemo(() => getSpaceConfig(space), [space])

  if (!currentUser || !userProfile) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <p className="text-sm text-destructive">
          {tf.profileUnavailable}
        </p>
      </div>
    )
  }

  // --- Current user's space member slot ---
  const myMember = members.find((m) => m.userId === currentUser.uid)
  const myTravelMemberId = myMember?.travelMemberId ?? ''
  const isSolo = members.length === 1

  // --- Transaction type ---
  const [txType, setTxType] = useState<TransactionType>(
    isEdit ? getTransactionType(initialValues!) : (initialType ?? 'expense')
  )

  // Which types can be created right now (config + member count). When editing,
  // the transaction's own type is always included even if config no longer
  // offers it for creation — see availableTransactionTypes() doc comment.
  const availableTypes = useMemo(
    () => availableTransactionTypes(config, members.length, isEdit ? getTransactionType(initialValues!) : undefined),
    [config, members.length, isEdit, initialValues],
  )

  // Helper: check if a field is visible for the current transaction type + config.
  // Visibility is the conjunction of FIELD_TYPES (which types show this field)
  // AND the space config gate (built-in fields are individually toggleable).
  const fieldVisible = useCallback((field: FieldName): boolean => {
    if (!FIELD_TYPES[field].includes(txType)) return false
    switch (field) {
      case 'country': return config.builtInFields.country
      case 'city': return config.builtInFields.city
      case 'category': return config.builtInFields.category
      case 'paymentMethod': return config.builtInFields.paymentMethod
      case 'notes': return config.builtInFields.notes
      default: return true
    }
  }, [txType, config])

  // Write-path counterpart of fieldVisible() for the OPTIONAL built-in fields.
  //
  // fieldVisible() conflates two different reasons a field is not rendered, but
  // the payload must treat them differently — the same invariant mergeCustomPayload()
  // implements for custom fields (§4, "disabling a field never deletes its data"):
  //
  //   - hidden because the field does not apply to this TYPE (a withdrawal has no
  //     category) → genuinely not applicable, clear the stored value;
  //   - hidden because the SPACE CONFIG disabled it → nothing rendered it, the form
  //     holds no value for it, so keep whatever the transaction already stored.
  //
  // Using fieldVisible() here sent `undefined` in the second case, and
  // updateTransaction() maps every undefined optional to deleteField() — so one
  // member editing a typo silently wiped the category and notes of that transaction
  // for everyone.
  type OptionalBuiltIn = 'category' | 'paymentMethod' | 'country' | 'city' | 'notes'
  const builtInValue = useCallback(
    (field: OptionalBuiltIn, formValue: string | undefined): string | undefined => {
      if (!FIELD_TYPES[field].includes(txType)) return undefined
      if (config.builtInFields[field]) return formValue
      return isEdit ? initialValues![field] : undefined
    },
    [txType, config, isEdit, initialValues],
  )

  // --- Formula mode ---
  const [formulaMode, setFormulaMode] = useState(isEdit && !!initialValues?.amountFormula)
  const [formulaStr, setFormulaStr] = useState(isEdit ? (initialValues?.amountFormula ?? '') : '')

  // --- Effective lists ---
  const effectiveCategories: string[] =
    spaceCategories && spaceCategories.length > 0
      ? spaceCategories.map((c) => c.emoji ? `${c.emoji} ${c.label}` : c.label)
      : userProfile.categories

  const effectivePaymentMethods: string[] =
    spacePaymentMethods && spacePaymentMethods.length > 0
      ? spacePaymentMethods.map((p) => p.emoji ? `${p.emoji} ${p.label}` : p.label)
      : userProfile.paymentMethods


  // --- Currency list ---
 
  const orderedCurrencies = useMemo(() => {
    const spaceSet = new Set(spaceCurrencies ?? [])
    const recentlyUsed = [...new Set(existingTransactions.map((tx) => tx.currency))].filter(
      (c) => spaceSet.has(c),
    )
    const rest = (spaceCurrencies ?? []).filter((c) => !recentlyUsed.includes(c))
    return [...recentlyUsed, ...rest]
  }, [spaceCurrencies, existingTransactions])

  // Default currency for new transactions — most recent transaction's currency, or the space's main.
  const lastUsedCurrency = orderedCurrencies[0] ?? mainCurrency

  // --- Country list ---
  const orderedCountries = useMemo(() => {
    const spaceCountryNames = new Set((spaceCountries ?? []).map((c) => c.label.toLowerCase()))
    const recentlyUsed = [...new Set(existingTransactions.map((tx) => tx.country).filter(Boolean) as string[])].filter(
      (name) => spaceCountryNames.has(name.toLowerCase()),
    )
    const rest = (spaceCountries ?? []).filter(
      (c) => !recentlyUsed.map((r) => r.toLowerCase()).includes(c.label.toLowerCase()),
    )
    return [
      ...recentlyUsed.map((name) => spaceCountries?.find((c) => c.label.toLowerCase() === name.toLowerCase())!).filter(Boolean),
      ...rest,
    ]
  }, [spaceCountries, existingTransactions])

  const previousCities = useMemo(
    () => getPreviousValues(existingTransactions, 'city'),
    [existingTransactions],
  )
  const lastCity = previousCities[0] ?? ''
  const lastCountry = existingTransactions[0]?.country ?? ''

  // --- Field state ---
  const [date, setDate] = useState<string>(
    isEdit ? initialValues!.date : getTodayDDMMYYYY()
  )
  const [name, setName] = useState<string>(
    isEdit ? initialValues!.name
      // Default name, saved to Firestore in the current language if left as is
      : transferPrefill ? tf.defaults.settlementName
      : ''
  )
  const [amountStr, setAmountStr] = useState<string>(
    isEdit ? String(initialValues!.totalAmount)
      : transferPrefill ? String(transferPrefill.amount)
      : '0'
  )
  const [currency, setCurrency] = useState<string>(
    isEdit ? initialValues!.currency
      : transferPrefill ? transferPrefill.currency
      : lastUsedCurrency
  )
  const [category, setCategory] = useState<string>(
    isEdit ? (initialValues!.category ?? '') : ''
  )
  const [paymentMethod, setPaymentMethod] = useState<string>(
    isEdit ? (initialValues!.paymentMethod ?? '') : ''
  )
  const [country, setCountry] = useState<string>(
    isEdit ? (initialValues!.country ?? '') : (config.builtInFields.country ? lastCountry : '')
  )
  const [city, setCity] = useState<string>(
    isEdit ? (initialValues!.city ?? '') : (config.builtInFields.city ? lastCity : '')
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

  // --- Custom fields (Tier 3, §4) ---
  // Enabled definitions only, in definition order — a disabled field is neither
  // rendered nor present in this list, so it's never rebuilt from form state.
  const customFieldDefs = useMemo(() => enabledCustomFields(config), [config])
  const [customValues, setCustomValues] = useState<Record<string, CustomValue>>(() => {
    const initial: Record<string, CustomValue> = {}
    for (const def of customFieldDefs) {
      if (isEdit) {
        const existing = initialValues!.custom?.[def.id]
        if (existing !== undefined) initial[def.id] = existing
        continue
      }
      // Pre-fill: 'select' from the most recent transaction with a value for
      // this field. 'text' and 'boolean' never pre-fill — see SPEC §4 (a
      // pre-filled boolean would silently mark transactions the user never chose).
      if (def.type === 'select') {
        // ⚠️ Validated against the CURRENT option list. A transaction can carry
        // the id of an option deleted since it was tagged; seeding that id
        // renders a blank <select> (no matching <option>), and saving without
        // touching it stores a dangling id that resolveOptionLabel() shows as a
        // raw nanoid and no filter can match.
        const recent = existingTransactions.find((tx) => {
          const v = tx.custom?.[def.id]
          return typeof v === 'string' && def.options?.some((o) => o.id === v)
        })
        if (recent) initial[def.id] = recent.custom![def.id]
      }
    }
    return initial
  })

  // --- Exchange rate override ---
  // null = use the default rate; a number = user has manually set this transaction's rate.
  const [rateOverride, setRateOverride] = useState<number | null>(
    // When editing, if the stored rate differs from the current default, treat it as an override
    isEdit ? initialValues!.exchangeRate : null
  )
  // Controls whether the rate editing row is expanded
  const [rateExpanded, setRateExpanded] = useState(false)

  // Track whether this is the first render — we skip the currency-change reset
  // on mount so that editing an existing transaction preserves its stored rate.
  const isMountedRef = useRef(false)

  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true
      return
    }
    // User changed the currency — reset the override so effectiveRate
    // derives from the space's defaultRates for the new currency.
    setRateOverride(null)
    setRateExpanded(false)
  }, [currency])

  // The effective exchange rate for this transaction
  const effectiveRate = useMemo(() => {
    if (currency === mainCurrency) return 1.0
    if (rateOverride !== null) return rateOverride
    return getExchangeRate(currency, mainCurrency, defaultRates)
  }, [currency, mainCurrency, rateOverride, defaultRates])

  // True when neither a per-transaction override, a space default, nor the
  // hardcoded table has a real rate for this pair — effectiveRate is a blind
  // 1.0 fallback and totalAmountMain will be wrong unless the user notices.
  const rateIsUnknown = rateOverride === null && !hasExchangeRate(currency, mainCurrency, defaultRates)

  // --- Split state ---
  const totalAmount = parseFloat(amountStr) || 0

  const [paidBy, setPaidBy] = useState<Split[]>(
    isEdit ? initialValues!.paidBy
      // When pre-filling a transfer (e.g. from settlement), set sender as sole payer
      : transferPrefill ? [{ travelMemberId: transferPrefill.fromMemberId, amount: transferPrefill.amount }]
      : [{ travelMemberId: myTravelMemberId, amount: totalAmount }]
  )
  const [paidByMode, setPaidByMode] = useState<'equal' | 'custom'>(
    isEdit ? detectSplitMode(initialValues!.paidBy) : 'equal'
  )
  const [beneficiaries, setBeneficiaries] = useState<Split[]>(
    isEdit ? initialValues!.beneficiaries
      // When pre-filling a transfer (e.g. settlement), set receiver as sole beneficiary
      : transferPrefill ? [{ travelMemberId: transferPrefill.toMemberId, amount: transferPrefill.amount }]
      : [{ travelMemberId: myTravelMemberId, amount: totalAmount }]
  )
  const [beneficiaryMode, setBeneficiaryMode] = useState<'equal' | 'custom'>(
    isEdit ? detectSplitMode(initialValues!.beneficiaries) : 'equal'
  )

  // Transfer: sender is a single member (paidBy[0])
  const [transferSenderId, setTransferSenderId] = useState<string>(
    isEdit && getTransactionType(initialValues!) === 'transfer'
      ? (initialValues!.paidBy[0]?.travelMemberId ?? myTravelMemberId)
      : transferPrefill ? transferPrefill.fromMemberId
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

  // --- Solo space: keep splits silently in sync with totalAmount ---
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
    // Preserve saved splits in edit mode, and pre-filled splits from settlement
    if (isEdit || transferPrefill) return
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
    // Messages are resolved at validation time, in the current language.
    const e = tf.errors
    if (!date) errs.date = e.dateRequired

    // Name: required for expense and transfer, optional for withdrawal/adjustment
    if ((txType === 'expense' || txType === 'transfer') && !name.trim()) {
      errs.name = e.nameRequired
    }

    const amount = parseFloat(amountStr)
    if (amountStr === '' || isNaN(amount)) {
      errs.amount = e.invalidAmount
    }
    // Withdrawals require a positive amount
    if (txType === 'withdrawal' && (isNaN(amount) || amount <= 0)) {
      errs.amount = e.positiveAmount
    }

    // Payment method: required for withdrawal and adjustment
    if ((txType === 'withdrawal' || txType === 'adjustment') && !paymentMethod) {
      errs.paymentMethod = e.paymentMethodRequired
    }

    // Fees validation (withdrawal only)
    if (txType === 'withdrawal' && feesStr.trim()) {
      const feesVal = parseFloat(feesStr)
      if (isNaN(feesVal) || feesVal < 0) errs.fees = e.feesNonNegative
      else if (feesVal >= amount) errs.fees = e.feesTooHigh
    }

    // Split validation (expense and transfer only)
    if (fieldVisible('split') && !isSolo) {
      if (!paidByValid) errs.paidBy = e.paidByTotal
      if (!beneficiaryValid) errs.beneficiaries = e.splitTotal
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
    // Exchange rate: use user override if set, otherwise space default, otherwise hardcoded fallback.
    const exchangeRate = effectiveRate
    const totalAmountMain = Math.round(total * exchangeRate * 100) / 100

    // Auto-generate name for withdrawal/adjustment if blank.
    // Stored in Firestore in the language in use at save time.
    let txName = name.trim()
    if (!txName) {
      if (txType === 'withdrawal') txName = tf.defaults.topUpName({ method: paymentMethod })
      else if (txType === 'adjustment') txName = tf.defaults.adjustmentName({ method: paymentMethod })
      else txName = tf.defaults.transactionName
    }

    // Sync country/city to space document (expense only)
    if (txType === 'expense') {
      const countryToSync = config.builtInFields.country && country ? country : undefined
      const cityToSync = config.builtInFields.city && city ? city : undefined
      if (countryToSync || cityToSync) {
        syncTransactionLocation(
          spaceId,
          countryToSync,
          cityToSync,
          spaceCountries ?? [],
          spaceCities ?? [],
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
      category: builtInValue('category', category || undefined),
      paymentMethod: builtInValue('paymentMethod', paymentMethod || undefined),
      country: builtInValue('country', country || undefined),
      city: builtInValue('city', city || undefined),
      paidBy,
      beneficiaries,
      lastModifiedBy: user.uid,
      notes: builtInValue('notes', notes.trim() || undefined),
      amountFormula: fieldVisible('formula') ? (formulaStr.trim() || undefined) : undefined,
      // Type: undefined for 'expense' (backward compat), explicit for others
      type: txType === 'expense' ? undefined : txType,
      fees: txType === 'withdrawal' ? (feesStr.trim() ? parseFloat(feesStr) : undefined) : undefined,
      adjustmentMode: txType === 'adjustment' ? adjustmentMode : undefined,
      // Merge onto the transaction's existing custom map — a field disabled after
      // this transaction was saved keeps its stored value untouched (§4).
      custom: mergeCustomPayload(isEdit ? initialValues!.custom : undefined, customValues, customFieldDefs),
    }

    if (isEdit) {
      updateTransaction(spaceId, initialValues!.txId, sharedData)
      onSuccess(initialValues!.txId)
    } else {
      const newTxId = createTransaction(spaceId, {
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
  const amountLabel = txType === 'transfer' ? tf.amount.transfer
    : txType === 'withdrawal' ? tf.amount.withdrawal
    : tf.amount.default

  // --- Form title ---
  // One string per type (not "New " + type): French nouns have genders.
  const formTitle = isEdit ? tf.title.edit[txType] : tf.title.new[txType]

  // Sticky multiCurrency upgrade (SPEC §6.2): the moment the user picks a
  // non-main currency while multiCurrency is off, flip the space's flag on
  // (fire-and-forget) and let the parent optimistically upgrade local state so
  // the full currency UI appears immediately, without waiting for the write.
  function handleCurrencyChange(code: string) {
    setCurrency(code)
    markDirty()
    if (code !== mainCurrency && !config.features.multiCurrency) {
      ensureMultiCurrency(spaceId, config)
      onMultiCurrencyUpgraded?.()
    }
  }

  // --- Optional built-in fields, flowed into the 2-column grid below ---
  const optionalFieldNodes: { key: string; node: React.ReactNode }[] = []
  if (fieldVisible('country')) {
    optionalFieldNodes.push({
      key: 'country',
      node: (
        <SmartCountrySelect
          value={country}
          onChange={(v) => { setCountry(v); markDirty() }}
          spaceId={spaceId}
          orderedCountries={orderedCountries}
          onCountryAdded={(name, flag) => {
            const next = [...(spaceCountries ?? []), { id: `country-${Date.now()}`, label: name, emoji: flag }]
            updateSpaceList(spaceId, 'countries', next).catch(console.error)
          }}
        />
      ),
    })
  }
  if (fieldVisible('city')) {
    optionalFieldNodes.push({
      key: 'city',
      node: (
        <LocationSelect
          label={tf.fields.city}
          value={city}
          onChange={(v) => { setCity(v); markDirty() }}
          previousValues={previousCities}
          placeholder={tf.select.optional}
        />
      ),
    })
  }
  if (fieldVisible('category')) {
    optionalFieldNodes.push({
      key: 'category',
      node: (
        <SmartLabeledItemSelect
          label={tf.fields.category}
          newItemPlaceholder={tf.select.newCategory}
          value={category}
          onChange={(v) => { setCategory(v); markDirty() }}
          items={effectiveCategories}
          onAddNew={(label) => {
            const newItem: LabeledItem = { id: `cat-${Date.now()}`, label }
            const updatedList = [...(spaceCategories ?? []), newItem]
            updateSpaceList(spaceId, 'categories', updatedList).catch(console.error)
            onCategoryAdded?.(newItem)
          }}
        />
      ),
    })
  }
  if (fieldVisible('paymentMethod')) {
    optionalFieldNodes.push({
      key: 'paymentMethod',
      node: (
        <>
          <SmartLabeledItemSelect
            label={txType === 'withdrawal' ? tf.fields.topUp : tf.fields.paymentMethod}
            newItemPlaceholder={txType === 'withdrawal' ? tf.select.newTopUp : tf.select.newPaymentMethod}
            value={paymentMethod}
            onChange={(v) => { setPaymentMethod(v); markDirty() }}
            items={effectivePaymentMethods}
            required={txType === 'withdrawal' || txType === 'adjustment'}
            onAddNew={(label) => {
              const newItem: LabeledItem = { id: `pm-${Date.now()}`, label }
              const updatedList = [...(spacePaymentMethods ?? []), newItem]
              updateSpaceList(spaceId, 'paymentMethods', updatedList).catch(console.error)
              onPaymentMethodAdded?.(newItem)
            }}
          />
          {submitted && errors.paymentMethod && (
            <p className="text-xs text-destructive">{errors.paymentMethod}</p>
          )}
        </>
      ),
    })
  }

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
          aria-label={t.common.close}
        >
          ✕
        </button>
        <h2 className="text-sm font-semibold">{formTitle}</h2>
        <Button
          type="button"
          size="sm"
          className={`min-w-[60px] transition-colors ${saveFlash ? 'bg-destructive text-destructive-foreground hover:bg-destructive' : ''}`}
          onClick={handleSave}
        >
          {t.common.save}
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-lg flex-col gap-4">

          {/* ── Type selector ── */}
          <TypeSelector value={txType} onChange={(t) => { setTxType(t); markDirty() }} availableTypes={availableTypes} />

          {/* ── Name ── */}
          {fieldVisible('name') && (
            <div className="flex flex-col gap-1">
              <Input
                type="text"
                placeholder={tf.namePlaceholder[txType]}
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setName(e.target.value); markDirty() }}
              />
              {submitted && errors.name && (
                <p className="text-xs text-destructive">{errors.name}</p>
              )}
            </div>
          )}

          {/* ── Date ── */}
          {fieldVisible('date') && (
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
          {fieldVisible('amount') && (
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
                    title={formulaMode ? tf.formula.close : tf.formula.open}
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
                      {amountStr || <span className="italic">{tf.formula.enterAbove}</span>}
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

                {/* Currency pill — full picker once multiCurrency is on, otherwise a
                    discreet inline control that upgrades the space on first foreign use. */}
                {config.features.multiCurrency ? (
                  <SmartCurrencySelect
                    value={currency}
                    onChange={handleCurrencyChange}
                    spaceId={spaceId}
                    orderedCurrencies={orderedCurrencies}
                    onCurrencyAdded={(code) => {
                      const next = [...(spaceCurrencies ?? []), code]
                      updateSpaceCurrencies(spaceId, next).catch(console.error)
                    }}
                  />
                ) : (
                  <div className="flex h-9 items-center">
                    <InlineCurrencyControl
                      mainCurrency={mainCurrency}
                      onChange={(code) => {
                        handleCurrencyChange(code)
                        if (!(spaceCurrencies ?? []).includes(code)) {
                          const next = [...(spaceCurrencies ?? []), code]
                          updateSpaceCurrencies(spaceId, next).catch(console.error)
                        }
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Cost in main currency — shown when currency differs from mainCurrency */}
              {currency !== mainCurrency && totalAmount > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  = {(totalAmount * effectiveRate).toFixed(2)} {mainCurrency}
                </p>
              )}

              {/* Unknown-rate warning — no space default or hardcoded rate exists for
                  this pair, so the amount below is not actually converted (1:1 fallback). */}
              {currency !== mainCurrency && rateIsUnknown && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  {tf.rate.unknown({ from: currency, to: mainCurrency })}
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
                        {rateOverride !== null && tf.rate.customSuffix}
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
                        {/* Save as new space default */}
                        {rateOverride !== null && rateOverride !== getExchangeRate(currency, mainCurrency, defaultRates) && (
                          <button
                            type="button"
                            onClick={() => {
                              updateSpaceDefaultRate(spaceId, currency, rateOverride).catch(console.error)
                              onDefaultRateChanged?.(currency, rateOverride)
                            }}
                            className="text-[10px] text-primary hover:underline"
                          >
                            {tf.rate.saveAsDefault}
                          </button>
                        )}
                        {/* Reset to default */}
                        {rateOverride !== null && (
                          <button
                            type="button"
                            onClick={() => { setRateOverride(null); markDirty() }}
                            className="text-[10px] text-muted-foreground hover:underline"
                          >
                            {tf.rate.reset}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setRateExpanded(false)}
                          className="ml-auto text-[10px] text-muted-foreground hover:underline"
                        >
                          {t.common.close}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Fees (withdrawal only) ── */}
          {fieldVisible('fees') && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{tf.fields.fees}</label>
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
                {tf.feesHint}
              </p>
              {submitted && errors.fees && (
                <p className="text-xs text-destructive">{errors.fees}</p>
              )}
            </div>
          )}

          {/* ── Adjustment mode ── */}
          {fieldVisible('adjustmentMode') && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{tf.fields.adjustmentMode}</label>
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
                  {tf.adjustment.balanceOnly}
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
                  {tf.adjustment.countAsExpense}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {adjustmentMode === 'balance_only'
                  ? tf.adjustment.balanceOnlyHint
                  : tf.adjustment.expenseHint}
              </p>
            </div>
          )}

          {/* ── Paid by / Split section ── */}
          {fieldVisible('split') && (
            <>
              {isSolo ? (
                /* Solo space CTA — saves the transaction first, then navigates to Parameters */
                <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    {tf.solo.prompt}
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
                      {tf.solo.cta}
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
                    label={tf.fields.to}
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
                    label={tf.fields.paidBy}
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
                    label={tf.fields.split}
                    splits={beneficiaries}
                    members={members}
                    mode={beneficiaryMode}
                    // Mode hint ("· Equal") — was inferred from the label text before i18n
                    showMode
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

          {/* ── Optional built-in fields, flowed into a 2-column grid ── */}
          {/* Any subset of country/city/category/paymentMethod can be enabled per
              space config, so fields are flowed rather than hard-coded into pairs —
              the last item in an odd-length list spans both columns. */}
          {optionalFieldNodes.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {optionalFieldNodes.map((f, i) => {
                const spansFull = i === optionalFieldNodes.length - 1 && optionalFieldNodes.length % 2 === 1
                return (
                  <div key={f.key} className={spansFull ? 'col-span-2' : ''}>
                    {f.node}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Custom fields (Tier 3), definition order, after built-ins before Notes ── */}
          {customFieldDefs.map((def) => (
            <CustomFieldRow
              key={def.id}
              def={def}
              value={customValues[def.id]}
              onChange={(v) => { setCustomValues((prev) => ({ ...prev, [def.id]: v })); markDirty() }}
            />
          ))}

          {/* ── Notes (full width) ── */}
          {fieldVisible('notes') && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{tf.fields.notes}</label>
              <Textarea
                placeholder={tf.notesPlaceholder}
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
              {tf.pleaseFix({
                fields: Object.keys(errors)
                  .map((k) => (tf.errorFields as Record<string, string>)[k] ?? k)
                  .join(', '),
              })}
            </p>
          )}

          {/* Bottom action bar — duplicates top Save for easy thumb reach */}
          <div className="flex flex-col gap-2 pt-2">
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>
                {t.common.close}
              </Button>
              <Button
                type="button"
                className={`flex-1 transition-colors ${saveFlash ? 'bg-destructive text-destructive-foreground hover:bg-destructive' : ''}`}
                onClick={handleSave}
              >
                {t.common.save}
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
                {t.common.delete}
              </Button>
            )}
          </div>

        </div>
      </div>

      {/* ── Paid By drawer (expense only, multi-user) ── */}
      <Drawer open={paidByDrawerOpen} onOpenChange={setPaidByDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{tf.drawer.paidBy}</DrawerTitle>
          </DrawerHeader>
          <SplitEditor
            members={members}
            totalAmount={totalAmount}
            value={paidBy}
            onChange={setPaidBy}
            mode={paidByMode}
            onModeChange={setPaidByMode}
            label={tf.drawer.paidBy}
          />
          <div className="px-4 pb-6 pt-2">
            <Button type="button" className="w-full" onClick={() => setPaidByDrawerOpen(false)}>
              {t.common.done}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── Beneficiaries drawer (expense + transfer, multi-user) ── */}
      <Drawer open={beneficiaryDrawerOpen} onOpenChange={setBeneficiaryDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{txType === 'transfer' ? tf.drawer.transferTo : tf.drawer.splitBetween}</DrawerTitle>
          </DrawerHeader>
          <SplitEditor
            members={members}
            totalAmount={totalAmount}
            value={beneficiaries}
            onChange={setBeneficiaries}
            mode={beneficiaryMode}
            onModeChange={setBeneficiaryMode}
            label={txType === 'transfer' ? tf.drawer.transferTo : tf.drawer.splitBetween}
          />
          <div className="px-4 pb-6 pt-2">
            <Button type="button" className="w-full" onClick={() => setBeneficiaryDrawerOpen(false)}>
              {t.common.done}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── Close confirmation dialog ── */}
      <AlertDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isEdit ? tf.discard.titleEdit : tf.discard.titleNew}</AlertDialogTitle>
            <AlertDialogDescription>
              {isEdit
                ? tf.discard.descriptionEdit
                : tf.discard.descriptionNew}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={onCancel} className="bg-destructive text-white hover:bg-destructive/90">
              {tf.discard.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
