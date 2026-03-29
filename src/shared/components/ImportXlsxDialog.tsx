// ImportXlsxDialog.tsx — 3-step wizard for importing a GlobeExpenses xlsx file.
//
// Step 1 — Upload:  drag-and-drop or file picker, calls parseSheetFile()
// Step 2 — Mapping: table matching sheet member slots to travel member UIDs
// Step 3 — Result:  shows imported/skipped counts and any errors
//
// The dialog is controlled (open prop) so the parent can close it cleanly.

import { useCallback, useMemo, useRef, useState } from 'react'
import { arrayUnion, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { Travel, LabeledItem } from '@/travels/types'
import type { ParsedSheetRow } from '@/shared/utils/sheetImport'
import { CollapsibleCard } from '@/travels/components/CollapsibleCard'
import { getFlagForCountry } from '@/shared/data/pickerData'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  parseSheetFile,
  importParsedRows,
  type ParseResult,
  type ImportResult,
} from '@/shared/utils/sheetImport'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ImportXlsxDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  travel: Travel
  currentUserUid: string
}

// ---------------------------------------------------------------------------
// Step 1 — Upload / parse
// ---------------------------------------------------------------------------

function UploadStep({
  onParsed,
}: {
  onParsed: (result: ParseResult) => void
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [isParsing, setIsParsing]   = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.name.endsWith('.xlsx')) {
      setError('Please upload a .xlsx file.')
      return
    }
    setError(null)
    setIsParsing(true)
    try {
      const result = await parseSheetFile(file)
      onParsed(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse the file.')
    } finally {
      setIsParsing(false)
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset input so the same file can be re-uploaded after an error
    e.target.value = ''
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Format notice */}
      <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
        Only files exported from GlobeExpenses are supported. Files in any other format
        (manual spreadsheets, bank exports, etc.) will not parse correctly.
      </div>

      {/* Drop zone */}
      <div
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-input hover:border-primary/50'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <span className="text-3xl">📂</span>
        <div className="text-center">
          <p className="text-sm font-medium">Click to browse or drag and drop</p>
          <p className="text-xs text-muted-foreground">GlobeExpenses .xlsx file</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={onFileInput}
        />
      </div>

      {isParsing && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Parsing file…
        </div>
      )}

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — Member mapping
// ---------------------------------------------------------------------------

function MappingStep({
  parseResult,
  travel,
  slotToTravelMemberId,
  onChange,
}: {
  parseResult: ParseResult
  travel: Travel
  slotToTravelMemberId: Record<number, string | undefined>
  onChange: (updated: Record<number, string | undefined>) => void
}) {
  const { slots, nMembersInSheet } = parseResult
  const members = travel.members

  // Check for duplicate mappings (two slots → same non-undefined travelMemberId)
  const assignedIds = Object.values(slotToTravelMemberId).filter((id): id is string => id !== undefined)
  const hasDuplicates = assignedIds.length !== new Set(assignedIds).size

  // Count how many slots are mapped to "skip"
  const skippedCount = slots.filter((s) => slotToTravelMemberId[s.slotIndex] === undefined).length

  function setMapping(slotIndex: number, id: string | undefined) {
    onChange({ ...slotToTravelMemberId, [slotIndex]: id })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Found <strong>{parseResult.rows.length}</strong> transactions across{' '}
        <strong>{slots.length}</strong> active member slot{slots.length !== 1 ? 's' : ''}.
        Match each sheet member to a travel member below.
      </p>

      {/* Member count mismatch warning */}
      {nMembersInSheet !== members.length && (
        <div className="rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
          The sheet has {nMembersInSheet} member slot{nMembersInSheet !== 1 ? 's' : ''} but this
          travel has {members.length} member{members.length !== 1 ? 's' : ''}. Check your mapping
          carefully.
        </div>
      )}

      {/* Duplicate mapping error */}
      {hasDuplicates && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Two sheet members are mapped to the same person. Please fix before continuing.
        </div>
      )}

      {/* Skipped member warning */}
      {skippedCount > 0 && !hasDuplicates && (
        <div className="rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
          Transactions involving skipped members will not be imported.
        </div>
      )}

      {/* Mapping table */}
      <div className="flex flex-col divide-y rounded-lg border">
        {slots.map((slot) => (
          <div key={slot.slotIndex} className="flex items-center justify-between gap-3 px-4 py-3">
            {/* Left: slot info */}
            <div className="min-w-0">
              <p className="text-sm font-medium">{slot.nameInSheet || `Slot ${slot.slotIndex + 1}`}</p>
              <p className="text-xs text-muted-foreground">
                {slot.rowCount} transaction{slot.rowCount !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Right: dropdown */}
            <select
              className="min-w-0 flex-1 max-w-[180px] rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={slotToTravelMemberId[slot.slotIndex] ?? '__skip__'}
              onChange={(e) =>
                setMapping(slot.slotIndex, e.target.value === '__skip__' ? undefined : e.target.value)
              }
            >
              <option value="__skip__">— Skip this member's transactions —</option>
              {members.map((m) => (
                <option key={m.travelMemberId} value={m.travelMemberId}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {hasDuplicates && (
        <p className="text-xs text-destructive">
          Fix duplicate mappings before proceeding.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3 — Progress / result
// ---------------------------------------------------------------------------

function ResultStep({
  importResult,
  isImporting,
  progress,
}: {
  importResult: ImportResult | null
  isImporting: boolean
  progress: { committed: number; total: number }
}) {
  const [errorsExpanded, setErrorsExpanded] = useState(false)

  if (isImporting) {
    // Percentage for the progress bar (0–100). Avoid division by zero.
    const pct = progress.total > 0 ? Math.round((progress.committed / progress.total) * 100) : 0

    return (
      <div className="flex flex-col items-center gap-4 py-8">
        {/* Progress bar */}
        <div className="w-full max-w-xs">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {progress.committed} / {progress.total} transactions committed
        </p>
      </div>
    )
  }

  if (!importResult) return null

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base font-semibold text-green-600">
        {importResult.imported > 0 && (
          <>{importResult.imported} new transaction{importResult.imported !== 1 ? 's' : ''} imported</>
        )}
        {importResult.imported > 0 && importResult.updated > 0 && ', '}
        {importResult.updated > 0 && (
          <>{importResult.updated} transaction{importResult.updated !== 1 ? 's' : ''} updated</>
        )}
        {importResult.imported === 0 && importResult.updated === 0 && 'No transactions imported'}
      </p>

      {importResult.skipped > 0 && (
        <p className="text-sm text-muted-foreground">
          {importResult.skipped} row{importResult.skipped !== 1 ? 's' : ''} skipped (empty)
        </p>
      )}

      {importResult.errors.length > 0 && (
        <div className="rounded-md bg-yellow-50 px-3 py-2 dark:bg-yellow-900/30">
          <button
            type="button"
            className="flex w-full items-center justify-between text-sm font-medium text-yellow-800 dark:text-yellow-300"
            onClick={() => setErrorsExpanded((v) => !v)}
          >
            <span>{importResult.errors.length} row{importResult.errors.length !== 1 ? 's' : ''} had errors</span>
            <span>{errorsExpanded ? '▲' : '▼'}</span>
          </button>
          {errorsExpanded && (
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {importResult.errors.map((e, i) => (
                <li key={i} className="text-xs text-yellow-700 dark:text-yellow-400">
                  {e}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        The transaction list updates automatically.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2.5 — Data preview (read-only)
// ---------------------------------------------------------------------------

/** Check whether a value matches any entry in a LabeledItem list (case-insensitive). */
function matchesLabeledList(value: string, list: LabeledItem[]): boolean {
  const lower = value.toLowerCase()
  return list.some((item) => {
    if (item.label.toLowerCase() === lower) return true
    // Also match the "emoji label" concatenation (e.g. "🚆 Transit")
    if (item.emoji && `${item.emoji} ${item.label}`.toLowerCase() === lower) return true
    return false
  })
}

/** Extract unique non-empty values from a specific field across all rows. */
function uniqueValues(rows: ParsedSheetRow[], key: 'country' | 'city' | 'category' | 'paymentMethod'): string[] {
  const set = new Set<string>()
  for (const row of rows) {
    const v = row[key]
    if (v) set.add(v)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

interface PreviewSection {
  label: string
  values: string[]
  travelList: LabeledItem[]
}

function PreviewStep({ rows, travel }: { rows: ParsedSheetRow[]; travel: Travel }) {
  // Build the four sections with their corresponding travel lists
  const sections: PreviewSection[] = useMemo(() => [
    { label: 'Countries',       values: uniqueValues(rows, 'country'),       travelList: travel.countries      ?? [] },
    { label: 'Cities',          values: uniqueValues(rows, 'city'),          travelList: travel.cities         ?? [] },
    { label: 'Categories',      values: uniqueValues(rows, 'category'),      travelList: travel.categories     ?? [] },
    { label: 'Payment methods', values: uniqueValues(rows, 'paymentMethod'), travelList: travel.paymentMethods ?? [] },
  ], [rows, travel])

  const totalUnmatched = sections.reduce(
    (sum, s) => sum + s.values.filter((v) => !matchesLabeledList(v, s.travelList)).length,
    0,
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Summary line */}
      <p className="text-sm text-muted-foreground">
        {rows.length} transactions · {sections[0].values.length} countries · {sections[1].values.length} cities · {sections[2].values.length} categories · {sections[3].values.length} payment methods
      </p>

      {/* Match status banner */}
      {totalUnmatched === 0 ? (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-300">
          All values match the travel configuration.
        </div>
      ) : (
        <div className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          Some values don't match the travel configuration. They will be imported as-is.
        </div>
      )}

      {/* Collapsible sections — each collapsed by default */}
      {sections.map((section) => (
        <CollapsibleCard
          key={section.label}
          title={section.label}
          summary={`${section.values.length}`}
          defaultOpen={false}
        >
          {section.values.length === 0 ? (
            <p className="text-xs text-muted-foreground">No values found.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {section.values.map((value) => {
                const matched = matchesLabeledList(value, section.travelList)
                return (
                  <span
                    key={value}
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      matched
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                    }`}
                  >
                    {value}
                  </span>
                )
              })}
            </div>
          )}
        </CollapsibleCard>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Auto-matching helper — run once on parseResult to pre-select obvious matches
// ---------------------------------------------------------------------------

function buildInitialMapping(
  slots: ParseResult['slots'],
  members: Travel['members'],
): Record<number, string | undefined> {
  const mapping: Record<number, string | undefined> = {}
  // Track which travelMemberIds have already been auto-matched
  const claimed = new Set<string>()

  slots.forEach((slot) => {
    const match = members.find(
      (m) =>
        m.displayName.toLowerCase() === slot.nameInSheet.toLowerCase() &&
        !claimed.has(m.travelMemberId),
    )
    if (match) {
      mapping[slot.slotIndex] = match.travelMemberId
      claimed.add(match.travelMemberId)
    } else {
      mapping[slot.slotIndex] = undefined
    }
  })

  return mapping
}

// ---------------------------------------------------------------------------
// Main dialog component
// ---------------------------------------------------------------------------

export function ImportXlsxDialog({
  open,
  onOpenChange,
  travel,
  currentUserUid,
}: ImportXlsxDialogProps) {
  type Step = 'upload' | 'mapping' | 'preview' | 'result'
  const [step, setStep]                 = useState<Step>('upload')
  const [parseResult, setParseResult]   = useState<ParseResult | null>(null)
  // Maps sheet slot index → travelMemberId (the stable ID used in Split[])
  const [slotToTravelMemberId, setSlotToTravelMemberId] = useState<Record<number, string | undefined>>({})
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isImporting, setIsImporting]   = useState(false)
  // Progress tracking: [committed, total] updated after each batch commit
  const [importProgress, setImportProgress] = useState<{ committed: number; total: number }>({ committed: 0, total: 0 })

  // Reset all state when the dialog closes
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep('upload')
      setParseResult(null)
      setSlotToTravelMemberId({})
      setImportResult(null)
      setIsImporting(false)
      setImportProgress({ committed: 0, total: 0 })
    }
    onOpenChange(nextOpen)
  }

  // Step 1 → 2
  const handleParsed = useCallback(
    (result: ParseResult) => {
      setParseResult(result)
      // Auto-match slot names to travel member display names
      const autoMapping = buildInitialMapping(result.slots, travel.members)
      setSlotToTravelMemberId(autoMapping)
      setStep('mapping')
    },
    [travel.members],
  )

  // Step 2 (mapping) → preview
  function handlePreview() {
    setStep('preview')
  }

  // Step preview → result (runs the actual import + syncs travel lists)
  async function handleImport() {
    if (!parseResult) return

    setIsImporting(true)
    setStep('result')

    const mainCurrency = travel.currencies[0] ?? 'EUR'
    const result = await importParsedRows(
      travel.travelId,
      parseResult.rows,
      slotToTravelMemberId,
      currentUserUid,
      mainCurrency,
      (committed, total) => setImportProgress({ committed, total }),
    )

    // ── Sync travel lists ───────────────────────────────────────────────────
    // Reuse the same uniqueValues / matchesLabeledList helpers from PreviewStep
    // to find values not already in the travel and write them via arrayUnion.
    const travelRef = doc(db, 'travels', travel.travelId)
    const listUpdates: Record<string, unknown> = {}

    const listFields = [
      { key: 'country'       as const, field: 'countries',      existing: travel.countries      ?? [], prefix: 'country' },
      { key: 'city'          as const, field: 'cities',         existing: travel.cities         ?? [], prefix: 'city' },
      { key: 'category'      as const, field: 'categories',     existing: travel.categories     ?? [], prefix: 'cat' },
      { key: 'paymentMethod' as const, field: 'paymentMethods', existing: travel.paymentMethods ?? [], prefix: 'pm' },
    ] as const

    for (const { key, field, existing, prefix } of listFields) {
      // Reuse uniqueValues + matchesLabeledList (same logic as PreviewStep)
      const newValues = uniqueValues(parseResult.rows, key)
        .filter((v) => !matchesLabeledList(v, existing))

      if (newValues.length > 0) {
        const items: LabeledItem[] = newValues.map((label) => {
          const item: LabeledItem = { id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label }
          if (key === 'country') item.emoji = getFlagForCountry(label)
          return item
        })
        listUpdates[field] = arrayUnion(...items)
      }
    }

    // Currencies are plain string[], not LabeledItem[]
    const existingCurrencySet = new Set((travel.currencies ?? []).map((c) => c.toUpperCase()))
    const sheetCurrencies = new Set<string>()
    for (const row of parseResult.rows) {
      if (row.currency) sheetCurrencies.add(row.currency)
    }
    const newCurrencies = [...sheetCurrencies].filter((c) => !existingCurrencySet.has(c.toUpperCase()))
    if (newCurrencies.length > 0) listUpdates.currencies = arrayUnion(...newCurrencies)

    if (Object.keys(listUpdates).length > 0) {
      console.log('[ImportXlsxDialog] syncing travel lists:', Object.keys(listUpdates))
      try {
        await updateDoc(travelRef, listUpdates)
      } catch (err) {
        console.error('[ImportXlsxDialog] travel list sync failed:', err)
      }
    }

    setImportResult(result)
    setIsImporting(false)
  }

  // Derive duplicate-mapping status for the import button
  const assignedIds = Object.values(slotToTravelMemberId).filter((id): id is string => id !== undefined)
  const hasDuplicates = assignedIds.length !== new Set(assignedIds).size

  const stepLabel: Record<Step, string> = {
    upload:  'Step 1 of 4 — Upload',
    mapping: 'Step 2 of 4 — Member mapping',
    preview: 'Step 3 of 4 — Data preview',
    result:  'Step 4 of 4 — Done',
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import from xlsx</DialogTitle>
          <p className="text-xs text-muted-foreground">{stepLabel[step]}</p>
        </DialogHeader>

        {/* Step content */}
        {step === 'upload' && <UploadStep onParsed={handleParsed} />}

        {step === 'mapping' && parseResult && (
          <MappingStep
            parseResult={parseResult}
            travel={travel}
            slotToTravelMemberId={slotToTravelMemberId}
            onChange={setSlotToTravelMemberId}
          />
        )}

        {step === 'preview' && parseResult && (
          <PreviewStep rows={parseResult.rows} travel={travel} />
        )}

        {step === 'result' && (
          <ResultStep importResult={importResult} isImporting={isImporting} progress={importProgress} />
        )}

        {/* Footer buttons */}
        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
          )}
          {step === 'mapping' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button onClick={handlePreview} disabled={hasDuplicates}>
                Next
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('mapping')}>
                Back
              </Button>
              <Button onClick={handleImport}>
                Import
              </Button>
            </>
          )}
          {step === 'result' && !isImporting && (
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
