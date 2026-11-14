// sheetMeta.ts — the hidden `_globeexpenses` metadata sheet (Phase 8a, SPEC §9bis).
//
// This sheet is what makes a GlobeExpenses round-trip lossless BY CONSTRUCTION.
// It carries the space's resolved SpaceConfig — including custom field ids and
// option ids — so the importer maps values by id and never has to guess from a
// label. Label matching survives only for foreign spreadsheets (Phase 8b).
//
// ⚠️ SECURITY: this sheet must stay safe to hand to anyone already allowed to
// see the transactions. NO uids, NO invite ids, NO emails. The member list is
// projected explicitly (see projectMembers) rather than spread, so a new field
// added to SpaceMember can never leak into an export by accident.

import type * as XLSXTypes from 'xlsx'
import type {
  CustomFieldDef,
  DashboardCardDef,
  PresetId,
  Space,
  SpaceConfig,
} from '@/spaces/types'
// getT() reads the current UI language at call time — used only for the
// `reason` sentences of parseMetaSheet(), which the import dialog displays.
import { getT } from '@/i18n'

/** Sheet name. Leading underscore keeps it visually last in Excel's tab list
 *  on the rare occasion a user unhides it. */
export const SHEET_META = '_globeexpenses'

/** Bumped only on a BREAKING payload change. A reader that understands version
 *  V accepts anything ≤ V; anything higher falls back to the foreign-file path
 *  rather than misreading a format it does not know. */
export const META_FORMAT_VERSION = 1

/** Cell holding the JSON payload. Everything above it is human-readable prose
 *  telling the user not to edit — a grid of config would invite "fixing". */
const PAYLOAD_CELL = 'B5'

// ---------------------------------------------------------------------------
// Payload shape
// ---------------------------------------------------------------------------

/** The space identity fields worth restoring on import. Deliberately NOT the
 *  whole Space: members, lists and rates are carried by the visible sheets, and
 *  spaceId / createdBy / memberUids have no business in a shared file. */
export interface MetaSpaceInfo {
  name: string
  emoji?: string
  mainCurrency: string
  currencies: string[]
  presetOrigin?: PresetId
  /** ISO "YYYY-MM-DD" — ⚠️ NOT the "DD-MM-YYYY" of Transaction.date. Never
   *  compare the two as raw strings (SPEC §10bis). */
  startDate?: string
  endDate?: string
}

/** A member slot, reduced to exactly what the importer needs to re-key splits.
 *  travelMemberId is a nanoid, not an Auth uid — safe to share. */
export interface MetaMember {
  travelMemberId: string
  displayName: string
}

export interface MetaPayload {
  version: number
  app: string
  /** ISO 8601 instant. Display only — nothing branches on it. */
  exportedAt: string
  space: MetaSpaceInfo
  /** The FULL resolved config, so a re-import restores field definitions,
   *  option ids and dashboard cards without inference. */
  config: SpaceConfig
  members: MetaMember[]
  /** Field keys ('country', … or a CustomFieldDef.id) that are DISABLED but
   *  were exported anyway at the user's request. Their columns exist in the
   *  Expenses sheet while `config` still marks them disabled, so re-import
   *  restores both the values and the disabled state. */
  includedDisabledFields: string[]
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/** Strip members down to the two shareable fields. Explicit projection, not a
 *  spread — see the security note at the top of this file. */
function projectMembers(space: Space): MetaMember[] {
  return space.members.map((m) => ({
    travelMemberId: m.travelMemberId,
    displayName: m.displayName,
  }))
}

/** Drop undefined-valued optional keys so the JSON round-trips to a deep-equal
 *  object. `{ emoji: undefined }` serialises to `{}`, which then parses back
 *  WITHOUT the key — so building the payload with the key present would make
 *  build→parse→build non-idempotent and break the round-trip test. */
function compact<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v
  }
  return out as T
}

/** Normalise a custom field definition for serialisation: option lists keep
 *  their ids (the whole point), and absent optionals stay absent. */
function projectCustomField(def: CustomFieldDef): CustomFieldDef {
  return compact({
    id: def.id,
    label: def.label,
    emoji: def.emoji,
    type: def.type,
    options: def.options?.map((o) => compact({ id: o.id, label: o.label, emoji: o.emoji })),
    enabled: def.enabled,
  })
}

function projectCard(card: DashboardCardDef): DashboardCardDef {
  return compact({
    id: card.id,
    dimensions: [...card.dimensions] as DashboardCardDef['dimensions'],
    title: card.title,
  })
}

/** Serialise the config into a plain, key-stable object.
 *  ⚠️ `dashboardCards: undefined` is PRESERVED as absent, not coerced to []:
 *  "never edited" (→ legacy default card set) and "user deleted every card"
 *  are different states downstream of resolveDashboardCards(). */
function projectConfig(config: SpaceConfig): SpaceConfig {
  return compact({
    builtInFields: { ...config.builtInFields },
    features: { ...config.features },
    customFields: config.customFields.map(projectCustomField),
    dashboardCards: config.dashboardCards?.map(projectCard),
  })
}

export interface BuildMetaOptions {
  /** Disabled fields the user chose to export anyway. */
  includedDisabledFields?: string[]
  /** Injectable for deterministic tests. */
  now?: Date
}

/** The payload as it will be serialised. Exported separately from the worksheet
 *  so tests can assert on the object without going through a cell. */
export function buildMetaPayload(
  space: Space,
  config: SpaceConfig,
  mainCurrency: string,
  options: BuildMetaOptions = {},
): MetaPayload {
  return {
    version: META_FORMAT_VERSION,
    app: 'GlobeExpenses',
    exportedAt: (options.now ?? new Date()).toISOString(),
    space: compact({
      name: space.name,
      emoji: space.emoji,
      mainCurrency,
      currencies: [...space.currencies],
      presetOrigin: space.presetOrigin,
      startDate: space.startDate,
      endDate: space.endDate,
    }),
    config: projectConfig(config),
    members: projectMembers(space),
    includedDisabledFields: [...(options.includedDisabledFields ?? [])],
  }
}

type MetaWS = Record<string, { t: string; v?: unknown } | unknown>

/** Build the hidden worksheet. Rows 1–3 are prose for a human who unhides the
 *  sheet; row 5 col B is the machine payload. */
export function buildMetaSheet(
  space: Space,
  config: SpaceConfig,
  mainCurrency: string,
  options: BuildMetaOptions = {},
): XLSXTypes.WorkSheet {
  const payload = buildMetaPayload(space, config, mainCurrency, options)
  const ws: MetaWS = {}

  ws['A1'] = { t: 's', v: 'GlobeExpenses — export metadata' }
  ws['A2'] = { t: 's', v: 'Do not edit this sheet. It lets GlobeExpenses re-import this file without losing anything.' }
  ws['A3'] = { t: 's', v: 'Deleting it is safe: the file still imports, but custom field values are matched by label instead of by id.' }
  ws['A5'] = { t: 's', v: 'payload' }
  ws[PAYLOAD_CELL] = { t: 's', v: JSON.stringify(payload) }

  ;(ws as Record<string, unknown>)['!ref'] = `A1:${PAYLOAD_CELL}`
  // A narrow payload column: the JSON is not meant to be read in the grid.
  ;(ws as Record<string, unknown>)['!cols'] = [{ wch: 60 }, { wch: 12 }]

  return ws as XLSXTypes.WorkSheet
}

/** Mark a sheet hidden in the workbook's sheet properties.
 *  SheetJS stores visibility in `wb.Workbook.Sheets[i].Hidden` (1 = hidden,
 *  2 = very hidden), positionally matched to `wb.SheetNames`. The array is
 *  created lazily by book_append_sheet only in some paths, so it is built here
 *  defensively and padded to the full sheet count — a short array silently
 *  hides the WRONG tab. */
export function hideSheet(wb: XLSXTypes.WorkBook, sheetName: string): void {
  const index = wb.SheetNames.indexOf(sheetName)
  if (index < 0) return

  wb.Workbook ??= {}
  wb.Workbook.Sheets ??= []
  const sheets = wb.Workbook.Sheets
  for (let i = 0; i < wb.SheetNames.length; i++) {
    sheets[i] ??= {}
  }
  sheets[index].Hidden = 1
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

export type MetaParseResult =
  | { status: 'absent' }
  /** Present but unusable: newer format, or corrupted JSON. The caller falls
   *  back to the foreign-file path rather than failing the import. */
  | { status: 'unsupported'; reason: string }
  | { status: 'ok'; payload: MetaPayload }

/** Read and validate the metadata sheet from a parsed workbook.
 *
 *  Never throws: a damaged metadata sheet must degrade to label matching, not
 *  block the user from importing a file whose visible sheets are perfectly
 *  fine. */
export function parseMetaSheet(wb: XLSXTypes.WorkBook): MetaParseResult {
  const ws = wb.Sheets?.[SHEET_META]
  if (!ws) return { status: 'absent' }

  // `reason` is shown in the import dialog, so it is in the UI language.
  const t = getT().importExport.meta

  const raw = (ws as Record<string, { v?: unknown } | undefined>)[PAYLOAD_CELL]?.v
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { status: 'unsupported', reason: t.empty }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { status: 'unsupported', reason: t.unreadable }
  }

  if (!isRecord(parsed)) {
    return { status: 'unsupported', reason: t.unexpectedShape }
  }

  const version = parsed.version
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    return { status: 'unsupported', reason: t.noVersion }
  }
  if (version > META_FORMAT_VERSION) {
    return {
      status: 'unsupported',
      reason: t.newerVersion(version),
    }
  }

  const config = parsed.config
  if (!isRecord(config) || !isRecord(config.builtInFields) || !Array.isArray(config.customFields)) {
    return { status: 'unsupported', reason: t.missingConfig }
  }

  return { status: 'ok', payload: parsed as unknown as MetaPayload }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
