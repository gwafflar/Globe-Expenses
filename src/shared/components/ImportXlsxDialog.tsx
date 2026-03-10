// ImportXlsxDialog.tsx — 3-step wizard for importing a GlobeExpenses xlsx file.
//
// Step 1 — Upload:  drag-and-drop or file picker, calls parseSheetFile()
// Step 2 — Mapping: table matching sheet member slots to travel member UIDs
// Step 3 — Result:  shows imported/skipped counts and any errors
//
// The dialog is controlled (open prop) so the parent can close it cleanly.

import { useCallback, useRef, useState } from 'react'
import type { Travel } from '@/travels/types'
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
}: {
  importResult: ImportResult | null
  isImporting: boolean
}) {
  const [errorsExpanded, setErrorsExpanded] = useState(false)

  if (isImporting) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Importing transactions…</p>
      </div>
    )
  }

  if (!importResult) return null

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base font-semibold text-green-600">
        Imported {importResult.imported} transaction{importResult.imported !== 1 ? 's' : ''}
      </p>

      {importResult.skipped > 0 && (
        <p className="text-sm text-muted-foreground">
          {importResult.skipped} row{importResult.skipped !== 1 ? 's' : ''} skipped (empty or
          zero-amount)
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
  const [step, setStep]                 = useState<1 | 2 | 3>(1)
  const [parseResult, setParseResult]   = useState<ParseResult | null>(null)
  // Maps sheet slot index → travelMemberId (the stable ID used in Split[])
  const [slotToTravelMemberId, setSlotToTravelMemberId] = useState<Record<number, string | undefined>>({})
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isImporting, setIsImporting]   = useState(false)

  // Reset all state when the dialog closes
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep(1)
      setParseResult(null)
      setSlotToTravelMemberId({})
      setImportResult(null)
      setIsImporting(false)
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
      setStep(2)
    },
    [travel.members],
  )

  // Step 2 → 3
  async function handleImport() {
    if (!parseResult) return

    setIsImporting(true)
    setStep(3)

    const mainCurrency = travel.currencies[0] ?? 'EUR'
    const result = await importParsedRows(
      travel.travelId,
      parseResult.rows,
      slotToTravelMemberId,
      currentUserUid,
      mainCurrency,
    )

    setImportResult(result)
    setIsImporting(false)
  }

  // Derive duplicate-mapping status for the import button
  const assignedIds = Object.values(slotToTravelMemberId).filter((id): id is string => id !== undefined)
  const hasDuplicates = assignedIds.length !== new Set(assignedIds).size

  const stepLabel = { 1: 'Step 1 of 3 — Upload', 2: 'Step 2 of 3 — Member mapping', 3: 'Step 3 of 3 — Done' }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import from xlsx</DialogTitle>
          <p className="text-xs text-muted-foreground">{stepLabel[step]}</p>
        </DialogHeader>

        {/* Step content */}
        {step === 1 && <UploadStep onParsed={handleParsed} />}

        {step === 2 && parseResult && (
          <MappingStep
            parseResult={parseResult}
            travel={travel}
            slotToTravelMemberId={slotToTravelMemberId}
            onChange={setSlotToTravelMemberId}
          />
        )}

        {step === 3 && (
          <ResultStep importResult={importResult} isImporting={isImporting} />
        )}

        {/* Footer buttons */}
        <DialogFooter>
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={hasDuplicates}>
                Import
              </Button>
            </>
          )}
          {step === 3 && !isImporting && (
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          )}
          {step === 1 && (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
