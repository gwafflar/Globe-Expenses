// ImportXlsxDialog.tsx — 3-step wizard for importing a GlobeExpenses xlsx file.
//
// Step 1 — Upload:  drag-and-drop or file picker, calls parseSheetFile()
// Step 2 — Mapping: table matching sheet member slots to space member UIDs
// Step 3 — Result:  shows imported/skipped counts and any errors
//
// The dialog is controlled (open prop) so the parent can close it cleanly.

import { useCallback, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { arrayUnion, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { Space, LabeledItem } from '@/spaces/types'
import { getSpaceMainCurrency } from '@/spaces/types'
import { updateSpaceConfig } from '@/spaces/services/spaceService'
import {
  autoMatchColumns,
  buildForeignRows,
  collectPendingOptions,
  readForeignSheet,
  summariseSelectColumn,
  validateMapping,
  withCreatedListItems,
  withCreatedOptions,
  type ColumnMapping,
  type ForeignSheet,
  type SelectDecisions,
} from '@/shared/utils/foreignSheet'
import { ColumnMappingStep } from '@/shared/components/import/ColumnMappingStep'
import { ValueDecisionStep, type SelectColumnInfo } from '@/shared/components/import/ValueDecisionStep'
import type { ParsedSheetRow } from '@/shared/utils/sheetImport'
import { CollapsibleCard } from '@/spaces/components/CollapsibleCard'
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
  importForeignRows,
  selectImportPath,
  type ImportPath,
  type ParseResult,
  type ImportResult,
} from '@/shared/utils/sheetImport'
import { getSpaceConfig } from '@/spaces/config'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ImportXlsxDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  space: Space
  currentUserUid: string
}

// ---------------------------------------------------------------------------
// Step 1 — Upload / parse
// ---------------------------------------------------------------------------

function UploadStep({
  onParsed,
  onForeign,
}: {
  onParsed: (result: ParseResult) => void
  /** The file has no GlobeExpenses structure at all — column mapping instead. */
  onForeign: (sheet: ForeignSheet) => void
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
      // Try the GlobeExpenses layout first. It is the only path that can read
      // the hidden txId column, which is what makes a re-import update rows
      // in place rather than duplicating them — worth preferring even for a
      // pre-Phase-8 file that has no metadata sheet.
      const result = await parseSheetFile(file)
      onParsed(result)
    } catch {
      // No Parameters/Expenses sheet: a spreadsheet from somewhere else.
      // Fall back to reading it as an arbitrary grid and mapping the columns.
      try {
        const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false })
        onForeign(readForeignSheet(wb))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to read the file.')
      }
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
        A GlobeExpenses export imports in one tap. Any other spreadsheet works too — you'll
        be asked to match its columns to fields.
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
  space,
  slotToTravelMemberId,
  onChange,
}: {
  parseResult: ParseResult
  space: Space
  slotToTravelMemberId: Record<number, string | undefined>
  onChange: (updated: Record<number, string | undefined>) => void
}) {
  const { slots, nMembersInSheet } = parseResult
  const members = space.members

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
        Match each sheet member to a space member below.
      </p>

      {/* Member count mismatch warning */}
      {nMembersInSheet !== members.length && (
        <div className="rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
          The sheet has {nMembersInSheet} member slot{nMembersInSheet !== 1 ? 's' : ''} but this
          space has {members.length} member{members.length !== 1 ? 's' : ''}. Check your mapping
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
// Lossless path — confirmation instead of a wizard
// ---------------------------------------------------------------------------

/** What the file turned out to be, shown before a one-tap import.
 *  Deliberately short: on this path there is nothing to decide, so the screen
 *  exists to confirm the file is the one the user meant, not to gather input. */
function LosslessConfirmStep({
  parseResult,
  space,
}: {
  parseResult: ParseResult
  space: Space
}) {
  const meta = parseResult.meta!
  const fieldCount = meta.config.customFields.filter((f) => f.enabled).length
  const sameName = meta.space.name === space.name

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-300">
        This is a GlobeExpenses export of this space. Everything maps
        automatically — no matching needed.
      </div>

      <dl className="flex flex-col divide-y rounded-lg border text-sm">
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <dt className="text-muted-foreground">Space</dt>
          <dd className="min-w-0 truncate font-medium">
            {meta.space.emoji ? `${meta.space.emoji} ` : ''}{meta.space.name}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <dt className="text-muted-foreground">Transactions</dt>
          <dd className="font-medium">{parseResult.rows.length}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <dt className="text-muted-foreground">Members</dt>
          <dd className="font-medium">{parseResult.slots.length}</dd>
        </div>
        {fieldCount > 0 && (
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <dt className="text-muted-foreground">Custom fields</dt>
            <dd className="font-medium">{fieldCount}</dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <dt className="text-muted-foreground">Exported</dt>
          <dd className="font-medium">
            {new Date(meta.exportedAt).toLocaleDateString()}
          </dd>
        </div>
      </dl>

      {/* The space was renamed since the export. Ids still match, so the import
          is still lossless — but say so rather than letting it look wrong. */}
      {!sameName && (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          The space was called “{meta.space.name}” when this file was exported.
          It is the same space, so the import is unaffected.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Rows that came from this space are updated in place rather than
        duplicated.
      </p>
    </div>
  )
}

/** Shown when the file is one of ours but belongs to a different space. */
function ForeignSpaceNotice({ parseResult }: { parseResult: ParseResult }) {
  return (
    <div className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
      This file was exported from <strong>{parseResult.meta?.space.name}</strong>, a
      different space. Its members and field values don’t have matching ids here,
      so you’ll be asked to match them below.
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
  spaceList: LabeledItem[]
}

function PreviewStep({ rows, space }: { rows: ParsedSheetRow[]; space: Space }) {
  // Build the four sections with their corresponding space lists
  const sections: PreviewSection[] = useMemo(() => [
    { label: 'Countries',       values: uniqueValues(rows, 'country'),       spaceList: space.countries      ?? [] },
    { label: 'Cities',          values: uniqueValues(rows, 'city'),          spaceList: space.cities         ?? [] },
    { label: 'Categories',      values: uniqueValues(rows, 'category'),      spaceList: space.categories     ?? [] },
    { label: 'Payment methods', values: uniqueValues(rows, 'paymentMethod'), spaceList: space.paymentMethods ?? [] },
  ], [rows, space])

  const totalUnmatched = sections.reduce(
    (sum, s) => sum + s.values.filter((v) => !matchesLabeledList(v, s.spaceList)).length,
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
          All values match the space configuration.
        </div>
      ) : (
        <div className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          Some values don't match the space configuration. They will be imported as-is.
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
                const matched = matchesLabeledList(value, section.spaceList)
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
  members: Space['members'],
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

/** The member slot belonging to the signed-in user, used as the default owner
 *  of every row when the sheet carries no per-member split columns. Falls back
 *  to the first slot so a personal import into an unclaimed space still lands
 *  somewhere rather than silently producing split-less transactions. */
function currentUserMemberId(space: Space, uid: string): string | undefined {
  return space.members.find((m) => m.userId === uid)?.travelMemberId
    ?? space.members[0]?.travelMemberId
}

// ---------------------------------------------------------------------------
// Main dialog component
// ---------------------------------------------------------------------------

export function ImportXlsxDialog({
  open,
  onOpenChange,
  space,
  currentUserUid,
}: ImportXlsxDialogProps) {
  // Three routes through this dialog:
  //   lossless      upload → confirm → result
  //   foreignSpace  upload → mapping → preview → result   (member slots)
  //   foreignFile   upload → columns → values  → result   (arbitrary grid)
  type Step = 'upload' | 'confirm' | 'mapping' | 'preview' | 'columns' | 'values' | 'result'
  const [step, setStep]                 = useState<Step>('upload')
  const [parseResult, setParseResult]   = useState<ParseResult | null>(null)
  const [importPath, setImportPath]     = useState<ImportPath | null>(null)

  // Foreign-file state
  const [foreignSheet, setForeignSheet] = useState<ForeignSheet | null>(null)
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({})
  const [selectDecisions, setSelectDecisions] = useState<SelectDecisions>({})

  const config = useMemo(() => getSpaceConfig(space), [space])
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
      setImportPath(null)
      setSlotToTravelMemberId({})
      setForeignSheet(null)
      setColumnMapping({})
      setSelectDecisions({})
      setImportResult(null)
      setIsImporting(false)
      setImportProgress({ committed: 0, total: 0 })
    }
    onOpenChange(nextOpen)
  }

  // Step 1 → columns, for a file with no GlobeExpenses structure.
  const handleForeign = useCallback(
    (sheet: ForeignSheet) => {
      setForeignSheet(sheet)
      setColumnMapping(autoMatchColumns(sheet.columns, space, config))
      setStep('columns')
    },
    [space, config],
  )

  // Step 1 → 2. The file itself decides which path we take.
  const handleParsed = useCallback(
    (result: ParseResult) => {
      setParseResult(result)
      const path = selectImportPath(result, space)
      setImportPath(path)

      if (path.kind === 'lossless') {
        // Ids match: slots are already resolved, so there is nothing to ask.
        setSlotToTravelMemberId(path.slotToTravelMemberId)
        setStep('confirm')
        return
      }

      // Auto-match slot names to space member display names; the user corrects.
      setSlotToTravelMemberId(buildInitialMapping(result.slots, space.members))
      setStep('mapping')
    },
    [space],
  )

  // Step 2 (mapping) → preview
  function handlePreview() {
    setStep('preview')
  }

  // Step preview → result (runs the actual import + syncs space lists)
  async function handleImport() {
    if (!parseResult) return

    setIsImporting(true)
    setStep('result')

    const mainCurrency = getSpaceMainCurrency(space)
    const result = await importParsedRows(
      space.spaceId,
      parseResult.rows,
      slotToTravelMemberId,
      currentUserUid,
      mainCurrency,
      (committed, total) => setImportProgress({ committed, total }),
      getSpaceConfig(space).customFields,
    )

    // ── Sync space lists ───────────────────────────────────────────────────
    // Reuse the same uniqueValues / matchesLabeledList helpers from PreviewStep
    // to find values not already in the space and write them via arrayUnion.
    const spaceRef = doc(db, 'travels', space.spaceId)
    const listUpdates: Record<string, unknown> = {}

    const listFields = [
      { key: 'country'       as const, field: 'countries',      existing: space.countries      ?? [], prefix: 'country' },
      { key: 'city'          as const, field: 'cities',         existing: space.cities         ?? [], prefix: 'city' },
      { key: 'category'      as const, field: 'categories',     existing: space.categories     ?? [], prefix: 'cat' },
      { key: 'paymentMethod' as const, field: 'paymentMethods', existing: space.paymentMethods ?? [], prefix: 'pm' },
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
    const existingCurrencySet = new Set((space.currencies ?? []).map((c) => c.toUpperCase()))
    const sheetCurrencies = new Set<string>()
    for (const row of parseResult.rows) {
      if (row.currency) sheetCurrencies.add(row.currency)
    }
    const newCurrencies = [...sheetCurrencies].filter((c) => !existingCurrencySet.has(c.toUpperCase()))
    if (newCurrencies.length > 0) listUpdates.currencies = arrayUnion(...newCurrencies)

    if (Object.keys(listUpdates).length > 0) {
      try {
        await updateDoc(spaceRef, listUpdates)
      } catch (err) {
        console.error('[ImportXlsxDialog] space list sync failed:', err)
      }
    }

    setImportResult(result)
    setIsImporting(false)
  }

  // ── Foreign-file derived state ───────────────────────────────────────────

  const mappingErrors = useMemo(
    () => (foreignSheet ? validateMapping(columnMapping) : []),
    [foreignSheet, columnMapping],
  )

  /** Built-in list options, for value matching and creation. */
  const builtInOptions = useMemo(() => ({
    country:       space.countries      ?? [],
    city:          space.cities         ?? [],
    category:      space.categories     ?? [],
    paymentMethod: space.paymentMethods ?? [],
  }), [space])

  /** The columns that need a per-column decision: those mapped to something
   *  with a closed option list where at least one value is unmatched. */
  const selectColumns = useMemo<SelectColumnInfo[]>(() => {
    if (!foreignSheet) return []
    const out: SelectColumnInfo[] = []

    for (const col of foreignSheet.columns) {
      const target = columnMapping[col.index]
      if (!target) continue

      let options: LabeledItem[] | null = null
      let fieldLabel = ''

      if (target.kind === 'custom') {
        const def = config.customFields.find((f) => f.id === target.fieldId)
        // text fields have no option list, booleans have a fixed one.
        if (!def || def.type !== 'select') continue
        options = def.options ?? []
        fieldLabel = def.label
      } else if (target.kind === 'builtIn' && target.field !== 'notes') {
        options = builtInOptions[target.field as keyof typeof builtInOptions] ?? []
        fieldLabel = target.field
      }

      if (options === null) continue
      const summary = summariseSelectColumn(col, options)
      if (summary.unmatched.length === 0) continue
      out.push({ ...summary, fieldLabel, existingOptions: options })
    }
    return out
  }, [foreignSheet, columnMapping, config, builtInOptions])

  /** Foreign import: create any opted-in options, then write the rows. */
  async function handleForeignImport() {
    if (!foreignSheet) return
    setIsImporting(true)
    setStep('result')

    try {
      const pending = collectPendingOptions(
        foreignSheet, columnMapping, selectDecisions, config.customFields, builtInOptions,
      )

      // Custom field options go through updateSpaceConfig — the importer must
      // never write config itself, so field definitions have one owner.
      const updatedFields = withCreatedOptions(config.customFields, pending)
      if (Object.keys(pending.custom).length > 0) {
        await updateSpaceConfig(space.spaceId, { ...config, customFields: updatedFields })
      }

      // Built-in lists are plain space arrays.
      const listUpdates: Record<string, unknown> = {}
      const listFields = [
        ['country', 'countries', space.countries, 'country'],
        ['city', 'cities', space.cities, 'city'],
        ['category', 'categories', space.categories, 'cat'],
        ['paymentMethod', 'paymentMethods', space.paymentMethods, 'pm'],
      ] as const
      for (const [key, field, existing, prefix] of listFields) {
        const labels = pending.builtIn[key]
        if (!labels?.length) continue
        listUpdates[field] = withCreatedListItems(existing ?? [], labels, prefix)
      }
      if (Object.keys(listUpdates).length > 0) {
        await updateDoc(doc(db, 'travels', space.spaceId), listUpdates)
      }

      const mergedBuiltIns = {
        country:       (listUpdates.countries      as LabeledItem[]) ?? space.countries      ?? [],
        city:          (listUpdates.cities         as LabeledItem[]) ?? space.cities         ?? [],
        category:      (listUpdates.categories     as LabeledItem[]) ?? space.categories     ?? [],
        paymentMethod: (listUpdates.paymentMethods as LabeledItem[]) ?? space.paymentMethods ?? [],
      }

      const { rows } = buildForeignRows({
        sheet: foreignSheet,
        mapping: columnMapping,
        decisions: selectDecisions,
        customFields: updatedFields,
        builtInOptions: mergedBuiltIns,
        defaultMemberId: currentUserMemberId(space, currentUserUid),
        mainCurrency: getSpaceMainCurrency(space),
      })

      const result = await importForeignRows(
        space.spaceId, rows, currentUserUid, getSpaceMainCurrency(space),
        (committed, total) => setImportProgress({ committed, total }),
      )
      setImportResult(result)
    } catch (err) {
      console.error('[ImportXlsxDialog] foreign import failed:', err)
      setImportResult({
        imported: 0, updated: 0, skipped: 0,
        errors: [err instanceof Error ? err.message : 'The import failed.'],
      })
    } finally {
      setIsImporting(false)
    }
  }

  // Derive duplicate-mapping status for the import button
  const assignedIds = Object.values(slotToTravelMemberId).filter((id): id is string => id !== undefined)
  const hasDuplicates = assignedIds.length !== new Set(assignedIds).size

  // The lossless path is two steps, not four — labelling it "Step 2 of 4" would
  // promise work that never comes.
  const stepLabel: Record<Step, string> = {
    upload:  'Step 1 — Upload',
    confirm: 'Step 2 of 2 — Confirm',
    mapping: 'Step 2 of 4 — Member mapping',
    preview: 'Step 3 of 4 — Data preview',
    columns: 'Step 2 of 3 — Match columns',
    values:  'Step 3 of 3 — New values',
    result:  'Done',
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import from xlsx</DialogTitle>
          <p className="text-xs text-muted-foreground">{stepLabel[step]}</p>
        </DialogHeader>

        {/* Step content */}
        {step === 'upload' && <UploadStep onParsed={handleParsed} onForeign={handleForeign} />}

        {step === 'columns' && foreignSheet && (
          <ColumnMappingStep
            columns={foreignSheet.columns}
            mapping={columnMapping}
            onChange={setColumnMapping}
            space={space}
            config={config}
            rowCount={foreignSheet.rows.length}
            errors={mappingErrors}
            canCreateFields={false}
          />
        )}

        {step === 'values' && (
          <ValueDecisionStep
            columns={selectColumns}
            decisions={selectDecisions}
            onChange={setSelectDecisions}
          />
        )}

        {step === 'confirm' && parseResult && (
          <LosslessConfirmStep parseResult={parseResult} space={space} />
        )}

        {step === 'mapping' && parseResult && (
          <div className="flex flex-col gap-4">
            {/* Say plainly why matching is being asked for, rather than
                dropping the user into a table with no explanation. */}
            {importPath?.kind === 'foreignSpace' && (
              <ForeignSpaceNotice parseResult={parseResult} />
            )}
            {importPath?.kind === 'foreignFile' && importPath.reason && (
              <div className="rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                {importPath.reason} Values will be matched by name instead.
              </div>
            )}
            <MappingStep
              parseResult={parseResult}
              space={space}
              slotToTravelMemberId={slotToTravelMemberId}
              onChange={setSlotToTravelMemberId}
            />
          </div>
        )}

        {step === 'preview' && parseResult && (
          <PreviewStep rows={parseResult.rows} space={space} />
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
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button onClick={handleImport}>Import</Button>
            </>
          )}
          {step === 'columns' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button
                onClick={() => setStep('values')}
                disabled={mappingErrors.length > 0}
              >
                Next
              </Button>
            </>
          )}
          {step === 'values' && (
            <>
              <Button variant="outline" onClick={() => setStep('columns')}>
                Back
              </Button>
              <Button onClick={handleForeignImport}>Import</Button>
            </>
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
