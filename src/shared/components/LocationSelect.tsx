// LocationSelect.tsx — generic dropdown for a free-text location field (currently: city).
// Extracted from TransactionForm.tsx (Space refactor Phase 5, §0.1) so the form
// file can be rewritten without dragging shared inputs along for the ride.

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import { useT } from '@/i18n'

// Stored value (Firestore data) — stays English in every language; only the
// option text shown for it is translated (t.parameters.pickers.other).
export const OTHER_VALUE = 'Other'

/** Distinct previous values for a free-text field, most recent first. */
export function getPreviousValues(
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

interface LocationSelectProps {
  label: string
  value: string
  onChange: (val: string) => void
  previousValues: string[]
  placeholder: string
}

export function LocationSelect({ label, value, onChange, previousValues, placeholder }: LocationSelectProps) {
  // translation hook — re-renders when the language changes
  const t = useT()
  const tp = t.parameters.pickers
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
            placeholder={tp.enterValue(label)}
            value={newInput}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewInput(e.target.value)}
            onKeyDown={handleNewInputKeyDown}
          />
          <Button type="button" size="sm" onClick={handleNewInputConfirm}>{t.common.ok}</Button>
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
          <option value={OTHER_VALUE}>{tp.other}</option>
          <option value="__add_new__">{tp.addNew}</option>
        </select>
      )}
      {value === OTHER_VALUE && !addingNew && (
        <p className="text-xs text-muted-foreground">{tp.savedAsOther}</p>
      )}
    </div>
  )
}
