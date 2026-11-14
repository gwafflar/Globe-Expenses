// src/spaces/components/SettlementCurrencyDrawer.tsx
// Dialog for selecting a settlement currency and exchange rate.
// The rate means: 1 mainCurrency = rate settlementCurrency.

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ALL_CURRENCIES, localizedCurrencyName } from '@/shared/data/pickerData'
import { getExchangeRate } from '@/shared/utils/exchangeRates'
import { useLocale, useT } from '@/i18n'

// Trump banner gif — place the file at public/images/trump-usd.gif
const TRUMP_GIF = '/images/trump-usd.gif'

interface SettlementCurrencyDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mainCurrency: string
  currentCurrency: string
  currentRate: number
  onApply: (currency: string, rate: number) => void
  /** Per-space default exchange rates. Used to pre-fill rates for known currencies. */
  defaultRates?: Record<string, number>
}

export function SettlementCurrencyDrawer({
  open,
  onOpenChange,
  mainCurrency,
  currentCurrency,
  currentRate,
  onApply,
  defaultRates,
}: SettlementCurrencyDrawerProps) {
  // translation hook — re-renders when the language changes
  const t = useT()
  // Intl locale tag (e.g. 'fr-BE') used to show currency names in the UI language
  const locale = useLocale()
  const [selectedCurrency, setSelectedCurrency] = useState(currentCurrency)
  const [rateInput, setRateInput] = useState(currentRate.toString())
  const [search, setSearch] = useState('')

  // Reset internal state each time the dialog opens
  useEffect(() => {
    if (open) {
      setSelectedCurrency(currentCurrency)
      setRateInput(currentRate.toString())
      setSearch('')
    }
  }, [open, currentCurrency, currentRate])

  function handleCurrencySelect(code: string) {
    setSelectedCurrency(code)
    if (code === mainCurrency) {
      setRateInput('1')
    } else {
      // For settlement we need: 1 mainCurrency = X code.
      // defaultRates stores: 1 code = X mainCurrency. So we invert it.
      const storedRate = defaultRates?.[code]
      const rate = storedRate !== undefined && storedRate > 0
        ? parseFloat((1 / storedRate).toPrecision(6))
        : getExchangeRate(mainCurrency, code)
      // If rate is 1 and it's not the same currency, the pair is unknown → force manual entry
      if (rate === 1) {
        setRateInput('')
      } else {
        setRateInput(rate.toString())
      }
    }
  }

  const parsedRate = parseFloat(rateInput)
  const canApply = rateInput !== '' && !isNaN(parsedRate) && parsedRate > 0

  function handleApply() {
    if (!canApply) return
    onApply(selectedCurrency, parsedRate)
    onOpenChange(false)
  }

  function handleReset() {
    onApply(mainCurrency, 1)
    onOpenChange(false)
  }

  // Currency list with names in the UI language: [code, localised name, English name]
  const currencies = ALL_CURRENCIES.map(
    ([code, , englishName]) => [code, localizedCurrencyName(code, locale), englishName] as const,
  )

  // Filter currencies by search term — matches the code, the localised name
  // or the English name (so "dollar" still works in a French UI).
  const query = search.toLowerCase()
  const filtered = search
    ? currencies.filter(
        ([code, name, englishName]) =>
          code.toLowerCase().includes(query) ||
          name.toLowerCase().includes(query) ||
          englishName.toLowerCase().includes(query),
      )
    : currencies

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.balance.drawer.title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* ── Currency picker ── */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t.balance.drawer.currency}
            </label>
            <Input
              placeholder={t.balance.drawer.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-40 overflow-y-auto rounded-md border">
              {filtered.map(([code, name]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleCurrencySelect(code)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                    code === selectedCurrency ? 'bg-accent font-medium' : ''
                  }`}
                >
                  <span className="font-mono text-xs">{code}</span>
                  <span className="text-muted-foreground">—</span>
                  <span>{name}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">{t.balance.drawer.noResults}</p>
              )}
            </div>
          </div>

          {/* ── Rate field ── */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t.balance.drawer.exchangeRate}
            </label>
            <p className="mb-1 text-xs text-muted-foreground">
              1 {mainCurrency} = ? {selectedCurrency}
            </p>
            <Input
              inputMode="decimal"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              placeholder={t.balance.drawer.ratePlaceholder}
            />
          </div>

          {/* ── Trump banner — ALWAYS VISIBLE ── */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
            <img
              src={TRUMP_GIF}
              alt={t.balance.drawer.trumpAlt}
              className="mb-2 h-20 rounded"
            />
            <p className="text-sm font-bold">
              {t.balance.drawer.trumpTitle}
            </p>
            <p className="mt-1 text-sm">
              {t.balance.drawer.trumpBody}
            </p>
            <a
              href="https://en.wikipedia.org/wiki/Extraterritorial_jurisdiction_of_the_United_States"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block text-sm underline"
            >
              {t.balance.drawer.learnMore}
            </a>
          </div>

          {/* ── Strait of Hormuz tip — ALWAYS VISIBLE ── */}
          <div className="pt-4 text-sm text-muted-foreground">
            {t.balance.drawer.hormuz}
            <p className="mt-1 text-xs text-muted-foreground">
              {t.balance.drawer.freeCountry}
            </p>
          </div>

          {/* ── Apply / Reset buttons ── */}
          <div className="flex justify-between pt-4">
            <Button variant="ghost" size="sm" onClick={handleReset}>
              {t.balance.drawer.reset}
            </Button>
            <Button size="sm" disabled={!canApply} onClick={handleApply}>
              {t.balance.drawer.apply}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
