// CurrencySelect.tsx — prominent pill-style currency selector.
// Extracted from TransactionForm.tsx (Space refactor Phase 5, §0.1) so the form
// file can be rewritten without dragging shared inputs along for the ride.
// Also used by SpaceCreatePage's "Set trip dates" currency picker.

import { useState, useEffect, useRef } from 'react'
import { ALL_CURRENCIES, localizedCurrencyName } from '@/shared/data/pickerData'
import { useLocale, useT } from '@/i18n'

/**
 * Currencies matching a search query, as [code, symbol, display name] with the
 * name in the UI language. The query matches the code, the localised name or
 * the English name (so "dollar" and "yen" work in both languages).
 */
function searchCurrencies(search: string, locale: string): [string, string, string][] {
  const q = search.toLowerCase()
  return ALL_CURRENCIES.map(([code, symbol, english]): [string, string, string, string] =>
    [code, symbol, localizedCurrencyName(code, locale), english],
  )
    .filter(([code, , name, english]) =>
      code.toLowerCase().includes(q) || name.toLowerCase().includes(q) || english.toLowerCase().includes(q),
    )
    .map(([code, symbol, name]) => [code, symbol, name])
}

interface SmartCurrencySelectProps {
  value: string
  onChange: (code: string) => void
  spaceId: string
  orderedCurrencies: string[]
  onCurrencyAdded: (code: string) => void
}

export function SmartCurrencySelect({ value, onChange, onCurrencyAdded }: SmartCurrencySelectProps) {
  // translation hook — re-renders when the language changes
  const t = useT()
  const locale = useLocale() // for the currency names shown in the list
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (pickerOpen && searchRef.current) searchRef.current.focus()
  }, [pickerOpen])

  const filtered = searchCurrencies(search, locale)

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
            placeholder={t.parameters.pickers.search}
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
            {t.common.cancel}
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
// InlineCurrencyControl — discreet single-currency-mode replacement for the pill.
// Space refactor Phase 5, §3 (SPEC §6.2). Shown when features.multiCurrency is
// false: "in EUR · + other currency". Tapping it opens the same search picker;
// picking a foreign currency is the caller's cue to call ensureMultiCurrency()
// and flip to the full pill UI (the caller owns that, not this component).
// ---------------------------------------------------------------------------

interface InlineCurrencyControlProps {
  mainCurrency: string
  onChange: (code: string) => void
}

export function InlineCurrencyControl({ mainCurrency, onChange }: InlineCurrencyControlProps) {
  // translation hook — re-renders when the language changes
  const t = useT()
  const locale = useLocale() // for the currency names shown in the list
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (pickerOpen && searchRef.current) searchRef.current.focus()
  }, [pickerOpen])

  const filtered = searchCurrencies(search, locale)

  if (pickerOpen) {
    return (
      <div className="flex flex-col gap-1 rounded-md border bg-background p-2 shadow-md">
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.parameters.pickers.search}
          className="rounded border px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="max-h-40 overflow-y-auto">
          {filtered.map(([code, symbol, name]) => (
            <button
              key={code}
              type="button"
              onClick={() => {
                onChange(code)
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
          {t.common.cancel}
        </button>
      </div>
    )
  }

  return (
    <span className="text-xs text-muted-foreground">
      {/* One message for the whole "in EUR · + other currency" line; the
          tappable link is passed in as a JSX parameter. */}
      {t.parameters.pickers.inCurrency({
        currency: mainCurrency,
        other: (
          <button type="button" onClick={() => setPickerOpen(true)} className="text-primary hover:underline">
            {t.parameters.pickers.otherCurrency}
          </button>
        ),
      })}
    </span>
  )
}
