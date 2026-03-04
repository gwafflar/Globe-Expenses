// TransactionForm.tsx — form for creating a new transaction.
//
// Data flow:
// - User profile (mainCurrency, categories, paymentMethods) from Zustand auth store.
// - Travel members and settings from props (fetched by TravelDetailPage).
// - Existing transactions from props — used to derive previously used
//   country/city values for the dropdown, and to pre-fill the last used value.
// - On submit, calls createTransaction() (fire-and-forget): form closes immediately,
//   transaction appears in list with isPending=true until server confirms.

import { useState, useMemo } from 'react'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { createTransaction } from '@/transactions/services/transactionService'
import { getExchangeRate, SUPPORTED_CURRENCIES } from '@/shared/utils/exchangeRates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { MemberRef, TravelSettings } from '@/travels/types'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import { ChevronDown } from 'lucide-react'

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
// Props
// ---------------------------------------------------------------------------
interface TransactionFormProps {
  travelId: string
  members: MemberRef[]
  travelSettings?: TravelSettings          // undefined = treat as default (trackLocation: true)
  existingTransactions: TransactionWithStatus[]  // used to derive previous country/city values
  onSuccess: (newTxId: string) => void
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TransactionForm({
  travelId,
  members: _members,
  travelSettings,
  existingTransactions,
  onSuccess,
  onCancel,
}: TransactionFormProps) {
  const { currentUser, userProfile } = useAuthStore()

  if (!currentUser || !userProfile) {
    return (
      <p className="py-4 text-center text-sm text-destructive">
        User profile unavailable. Please sign out and sign in again.
      </p>
    )
  }

  // Whether to show country/city fields.
  // Defaults to true if the travel has no settings yet (backward compatible).
  const trackLocation = travelSettings?.trackLocation ?? true

  // Derive previously used values once — memoized so it doesn't recompute
  // on every keystroke. Depends on existingTransactions which changes rarely.
  const previousCountries = useMemo(
    () => getPreviousValues(existingTransactions, 'country'),
    [existingTransactions],
  )
  const previousCities = useMemo(
    () => getPreviousValues(existingTransactions, 'city'),
    [existingTransactions],
  )

  // Pre-fill country/city from the most recent transaction (first in list,
  // since useTransactions orders by date desc).
  const lastCountry = existingTransactions[0]?.country ?? ''
  const lastCity = existingTransactions[0]?.city ?? ''

  // --- Field state --------------------------------------------------------

  const [date, setDate] = useState<string>(getTodayDDMMYYYY())
  const [name, setName] = useState<string>('')
  // Pre-filled to '0' so the mobile numeric keyboard shows 0.00 immediately.
  const [amountStr, setAmountStr] = useState<string>('0')
  const [currency, setCurrency] = useState<string>(userProfile.mainCurrency)
  const [category, setCategory] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<string>('')
  const [country, setCountry] = useState<string>(trackLocation ? lastCountry : '')
  const [city, setCity] = useState<string>(trackLocation ? lastCity : '')
  const [notes, setNotes] = useState<string>('')

  // --- UI state -----------------------------------------------------------

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState<boolean>(false)

  // --- Validation ---------------------------------------------------------

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
    return errs
  }

  // --- Submit handler -----------------------------------------------------

  function handleSave() {
    setSubmitted(true)
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    const user = currentUser!
    const profile = userProfile!

    const totalAmount = parseFloat(amountStr)
    const exchangeRate = getExchangeRate(currency, profile.mainCurrency)
    const totalAmountMain = Math.round(totalAmount * exchangeRate * 100) / 100

    // TODO (Prompt C): replace hardcoded splits with SplitEditor values.
    const paidBy = [{ uid: user.uid, amount: totalAmount }]
    const beneficiaries = [{ uid: user.uid, amount: totalAmount }]

    const newTxId = createTransaction(travelId, {
      date,
      name: name.trim(),
      totalAmount,
      currency,
      exchangeRate,
      totalAmountMain,
      ...(category && { category }),
      ...(paymentMethod && { paymentMethod }),
      // Only include location fields if tracking is enabled and a value was set
      ...(trackLocation && country && { country }),
      ...(trackLocation && city && { city }),
      paidBy,
      beneficiaries,
      createdBy: { type: 'user' as const, uid: user.uid },
      lastModifiedBy: user.uid,
      ...(notes.trim() && { notes: notes.trim() }),
    })

    onSuccess(newTxId)
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
            {/* inputMode="decimal" tells the mobile OS to open the numeric keyboard.
                type="number" alone is not always sufficient on iOS/Android. */}
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
          <FieldWrapper label="Currency">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              value={currency}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCurrency(e.target.value)}
            >
              {SUPPORTED_CURRENCIES.map((code: string) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </FieldWrapper>
        </div>
      </div>

      {/* Country + City — only shown when travel.settings.trackLocation is true */}
      {trackLocation && (
        <>
          <LocationSelect
            label="Country"
            value={country}
            onChange={setCountry}
            previousValues={previousCountries}
            placeholder="— optional —"
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

      {/* Category */}
      <FieldWrapper label="Category">
        {userProfile.categories.length === 0 ? (
          <select disabled className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-muted-foreground shadow-sm opacity-60">
            <option>No categories yet — add them in Settings</option>
          </select>
        ) : (
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            value={category}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCategory(e.target.value)}
          >
            <option value="">— optional —</option>
            {userProfile.categories.map((cat: string) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}
      </FieldWrapper>

      {/* Payment Method */}
      <FieldWrapper label="Payment Method">
        {userProfile.paymentMethods.length === 0 ? (
          <select disabled className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-muted-foreground shadow-sm opacity-60">
            <option>No payment methods yet — add them in Settings</option>
          </select>
        ) : (
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            value={paymentMethod}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPaymentMethod(e.target.value)}
          >
            <option value="">— optional —</option>
            {userProfile.paymentMethods.map((pm: string) => (
              <option key={pm} value={pm}>{pm}</option>
            ))}
          </select>
        )}
      </FieldWrapper>

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

      {/* Split placeholder rows — TODO (Prompt C): replace with SplitEditor */}
      <button
        type="button"
        onClick={() => console.log('TODO: open paidBy split editor (Prompt C)')}
        className="flex items-center justify-between rounded-md border border-input px-3 py-2 text-sm transition-colors hover:bg-accent/30"
      >
        <span className="font-medium text-muted-foreground">Paid by</span>
        <span className="flex items-center gap-1">
          <span>{currentUser.displayName ?? 'You'}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </span>
      </button>

      <button
        type="button"
        onClick={() => console.log('TODO: open beneficiaries split editor (Prompt C)')}
        className="flex items-center justify-between rounded-md border border-input px-3 py-2 text-sm transition-colors hover:bg-accent/30"
      >
        <span className="font-medium text-muted-foreground">Split</span>
        <span className="flex items-center gap-1">
          <span>Equal</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </span>
      </button>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" className="flex-1" onClick={handleSave}>
          Save
        </Button>
      </div>

    </div>
  )
}