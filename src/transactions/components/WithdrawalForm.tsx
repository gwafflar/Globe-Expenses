// WithdrawalForm.tsx — simplified form for recording a wallet top-up (cash
// withdrawal, Grab Pay reload, etc.).
//
// Much simpler than TransactionForm: no category, no country/city, no
// beneficiaries split editor, no formula bar. Payment method is required
// because it identifies which wallet the money goes into.
//
// On submit, creates a transaction with type: 'withdrawal'. The paidBy and
// beneficiaries are both set to the current user only (withdrawals are
// self-directed — no multi-payer splits).

import { useState, useMemo, useEffect, useRef } from 'react'
import { useAuthStore } from '@/auth/store/useAuthStore'
import { createTransaction, updateTransaction } from '@/transactions/services/transactionService'
import { getExchangeRate } from '@/shared/utils/exchangeRates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { LabeledItem, TravelMember } from '@/travels/types'
import { updateTravelList, updateTravelCurrencies } from '@/travels/services/travelService'
import { ALL_CURRENCIES } from '@/shared/data/pickerData'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import { isWithdrawal } from '@/transactions/utils/walletHelpers'

// ---------------------------------------------------------------------------
// Date helpers (same as TransactionForm — small, not worth extracting)
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
// FieldWrapper — label + optional error (same as TransactionForm)
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
// SmartCurrencySelect (duplicated from TransactionForm — lightweight inline)
// ---------------------------------------------------------------------------

interface SmartCurrencySelectProps {
  value: string
  onChange: (code: string) => void
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
// SmartLabeledItemSelect (same pattern as TransactionForm)
// ---------------------------------------------------------------------------

interface SmartLabeledItemSelectProps {
  label: string
  value: string
  onChange: (val: string) => void
  items: string[]
  onAddNew: (label: string) => void
  required?: boolean
}

function SmartLabeledItemSelect({
  label,
  value,
  onChange,
  items,
  onAddNew,
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

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">{label}</label>
      {addingNew ? (
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
          <Button type="button" size="sm" variant="outline" onClick={() => setAddingNew(false)}>✕</Button>
        </div>
      ) : (
        <select
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
          value={value}
          onChange={handleSelectChange}
        >
          {!required && <option value="">— select —</option>}
          {required && !value && <option value="">— select —</option>}
          {items.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
          <option value="__add_new__">+ Add new…</option>
        </select>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WithdrawalFormProps {
  travelId: string
  members: TravelMember[]
  travelPaymentMethods?: LabeledItem[]
  travelCurrencies?: string[]
  existingTransactions: TransactionWithStatus[]
  // When set, opens in edit mode pre-filled from this withdrawal.
  initialValues?: TransactionWithStatus
  onSuccess: (txId: string) => void
  onCancel: () => void
  // Called when user creates a new payment method — parent updates travel.paymentMethods
  onPaymentMethodAdded?: (item: LabeledItem) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WithdrawalForm({
  travelId,
  members,
  travelPaymentMethods,
  travelCurrencies,
  existingTransactions,
  initialValues,
  onSuccess,
  onCancel,
  onPaymentMethodAdded,
}: WithdrawalFormProps) {
  const isEdit = !!initialValues
  const { currentUser, userProfile } = useAuthStore()

  if (!currentUser || !userProfile) {
    return (
      <p className="py-4 text-center text-sm text-destructive">
        User profile unavailable. Please sign out and sign in again.
      </p>
    )
  }

  // Resolve current user's travelMemberId
  const myMember = members.find((m) => m.userId === currentUser.uid)
  const myTravelMemberId = myMember?.travelMemberId ?? ''

  // Effective payment method list (per-travel or global fallback)
  const effectivePaymentMethods: string[] =
    travelPaymentMethods && travelPaymentMethods.length > 0
      ? travelPaymentMethods.map((p) => p.emoji ? `${p.emoji} ${p.label}` : p.label)
      : userProfile.paymentMethods

  // Ordered currencies: travel currencies first, ordered by most recent use in withdrawals
  const lastUsedCurrency = existingTransactions.filter(isWithdrawal)[0]?.currency
    ?? existingTransactions[0]?.currency
    ?? userProfile.mainCurrency

  const orderedCurrencies = useMemo(() => {
    const travelSet = new Set(travelCurrencies ?? [])
    const recentlyUsed = [...new Set(existingTransactions.map((tx) => tx.currency))].filter(
      (c) => travelSet.has(c),
    )
    const rest = (travelCurrencies ?? []).filter((c) => !recentlyUsed.includes(c))
    return [...recentlyUsed, ...rest]
  }, [travelCurrencies, existingTransactions])

  // ---------------------------------------------------------------------------
  // Field state
  // ---------------------------------------------------------------------------

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
  const [feesStr, setFeesStr] = useState<string>(
    isEdit && initialValues!.fees != null ? String(initialValues!.fees) : ''
  )
  const [paymentMethod, setPaymentMethod] = useState<string>(
    isEdit ? (initialValues!.paymentMethod ?? '') : ''
  )
  const [notes, setNotes] = useState<string>(
    isEdit ? (initialValues!.notes ?? '') : ''
  )

  // Validation state
  const [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saveFlash, setSaveFlash] = useState(false)

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!date) errs.date = 'Date is required'
    const total = parseFloat(amountStr)
    if (isNaN(total) || total <= 0) errs.amount = 'Enter a positive amount'
    if (!paymentMethod) errs.paymentMethod = 'Select or add a payment method to top up'

    // Validate fees if provided
    const feesVal = feesStr.trim() ? parseFloat(feesStr) : 0
    if (feesStr.trim() && (isNaN(feesVal) || feesVal < 0)) {
      errs.fees = 'Fees must be 0 or positive'
    }
    if (feesVal >= total) {
      errs.fees = 'Fees must be less than the withdrawal amount'
    }

    return errs
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

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
    const profile = userProfile!

    const total = parseFloat(amountStr)
    const fees = feesStr.trim() ? parseFloat(feesStr) : undefined
    const exchangeRate = getExchangeRate(currency, profile.mainCurrency)
    const totalAmountMain = Math.round(total * exchangeRate * 100) / 100

    // Auto-generate name if blank
    const txName = name.trim() || `Top-up ${paymentMethod}`

    // Withdrawal: paidBy = current user, beneficiaries = current user (self-directed)
    const selfSplit = [{ travelMemberId: myTravelMemberId, amount: total }]

    const sharedData = {
      date,
      name: txName,
      totalAmount: total,
      currency,
      exchangeRate,
      totalAmountMain,
      paymentMethod: paymentMethod || undefined,
      paidBy: selfSplit,
      beneficiaries: selfSplit,
      lastModifiedBy: user.uid,
      notes: notes.trim() || undefined,
      type: 'withdrawal' as const,
      fees,
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4">

      {/* Date */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Date</label>
        <input
          type="date"
          value={toInputFormat(date)}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDate(fromInputFormat(e.target.value))}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
          style={{ colorScheme: 'light dark' }}
        />
        {submitted && errors.date && (
          <p className="text-xs text-destructive">{errors.date}</p>
        )}
      </div>

      {/* Name (optional — auto-generated if blank) */}
      <FieldWrapper label="Name (optional)">
        <Input
          type="text"
          placeholder="e.g. ATM Bangkok, Top-up Grab"
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
        />
      </FieldWrapper>

      {/* Amount + Currency (side by side) */}
      <div className="flex gap-2">
        <div className="flex-1">
          <FieldWrapper label="Amount withdrawn" error={submitted ? errors.amount : undefined}>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amountStr}
              onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
                if (e.target.value === '0') setAmountStr('')
              }}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmountStr(e.target.value)}
            />
          </FieldWrapper>
        </div>
        <div className="w-28">
          <SmartCurrencySelect
            value={currency}
            onChange={setCurrency}
            orderedCurrencies={orderedCurrencies}
            onCurrencyAdded={(code) => {
              const next = [...(travelCurrencies ?? []), code]
              updateTravelCurrencies(travelId, next).catch(console.error)
            }}
          />
        </div>
      </div>

      {/* Fees (optional) */}
      <FieldWrapper label="Fees (optional)" error={submitted ? errors.fees : undefined}>
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="0.00"
          value={feesStr}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFeesStr(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Deducted from wallet balance (you received amount minus fees)
        </p>
      </FieldWrapper>

      {/* Top-up payment method (required) — which wallet receives the money */}
      <FieldWrapper label="" error={submitted ? errors.paymentMethod : undefined}>
        <SmartLabeledItemSelect
          label="Top up"
          value={paymentMethod}
          onChange={setPaymentMethod}
          items={effectivePaymentMethods}
          required
          onAddNew={(label) => {
            const newItem: LabeledItem = { id: `pm-${Date.now()}`, label }
            const updatedList = [...(travelPaymentMethods ?? []), newItem]
            updateTravelList(travelId, 'paymentMethods', updatedList).catch(console.error)
            onPaymentMethodAdded?.(newItem)
          }}
        />
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

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className={`flex-1 ${saveFlash ? 'bg-destructive hover:bg-destructive' : ''}`}
          onClick={handleSave}
        >
          {isEdit ? 'Update' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
