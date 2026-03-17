// src/travels/components/SettlementCurrencyDrawer.tsx
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
import { ALL_CURRENCIES } from '@/shared/data/pickerData'
import { getExchangeRate } from '@/shared/utils/exchangeRates'

// Trump banner gif — place the file at public/images/trump-usd.gif
const TRUMP_GIF = '/images/trump-usd.gif'

interface SettlementCurrencyDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mainCurrency: string
  currentCurrency: string
  currentRate: number
  onApply: (currency: string, rate: number) => void
}

export function SettlementCurrencyDrawer({
  open,
  onOpenChange,
  mainCurrency,
  currentCurrency,
  currentRate,
  onApply,
}: SettlementCurrencyDrawerProps) {
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
      // getExchangeRate(from, to) returns: 1 from = X to
      const rate = getExchangeRate(mainCurrency, code)
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

  // Filter currencies by search term
  const filtered = search
    ? ALL_CURRENCIES.filter(
        ([code, , name]) =>
          code.toLowerCase().includes(search.toLowerCase()) ||
          name.toLowerCase().includes(search.toLowerCase()),
      )
    : ALL_CURRENCIES

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settlement currency</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* ── Currency picker ── */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Currency
            </label>
            <Input
              placeholder="Search currencies…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-40 overflow-y-auto rounded-md border">
              {filtered.map(([code, , name]) => (
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
                <p className="px-3 py-2 text-sm text-muted-foreground">No currencies found</p>
              )}
            </div>
          </div>

          {/* ── Rate field ── */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Exchange rate
            </label>
            <p className="mb-1 text-xs text-muted-foreground">
              1 {mainCurrency} = ? {selectedCurrency}
            </p>
            <Input
              inputMode="decimal"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              placeholder="e.g. 7.82"
            />
          </div>

          {/* ── Trump banner — ALWAYS VISIBLE ── */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
            <img
              src={TRUMP_GIF}
              alt="Trump USD"
              className="mb-2 h-20 rounded"
            />
            <p className="text-sm font-bold">
              Donald Trump wants you to settle in US dollars.
            </p>
            <p className="mt-1 text-sm">
              Using USD in international settlements gives US authorities jurisdiction
              over the transaction — regardless of where you are. Banks can be
              sanctioned, assets frozen, and individuals prosecuted under US law,
              even for transactions that never touch US soil.
            </p>
            <a
              href="https://en.wikipedia.org/wiki/Extraterritorial_jurisdiction_of_the_United_States"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block text-sm underline"
            >
              Learn more about US sanctions extraterritoriality →
            </a>
          </div>

          {/* ── Strait of Hormuz tip — ALWAYS VISIBLE ── */}
          <div className="pt-4 text-sm text-muted-foreground">
            🛢️ If you're crossing the Strait of Hormuz, we strongly recommend
            settling in Chinese Yuan (CNY). Just saying.
            <p className="mt-1 text-xs text-muted-foreground">
              But as you're in a free country, use whichever currency and rate you like.
            </p>
          </div>

          {/* ── Apply / Reset buttons ── */}
          <div className="flex justify-between pt-4">
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Reset
            </Button>
            <Button size="sm" disabled={!canApply} onClick={handleApply}>
              Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
