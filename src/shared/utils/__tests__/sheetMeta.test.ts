// sheetMeta.test.ts — the hidden metadata sheet (Phase 8a, SPEC §9bis).

import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { getSpaceConfig } from '@/spaces/config'
import { getSpaceMainCurrency } from '@/spaces/types'
import {
  SHEET_META,
  META_FORMAT_VERSION,
  buildMetaPayload,
  buildMetaSheet,
  hideSheet,
  parseMetaSheet,
} from '../sheetMeta'
import { buildSpaceWorkbook } from '../sheetExport'
import {
  legacySpace,
  travelSpace,
  customFieldsSpace,
  disabledFieldSpace,
  soloSpace,
} from './sheetFixtures'

/** Build a workbook, serialise it, and read it back — the only honest way to
 *  test the round-trip, since a workbook object in memory can carry state that
 *  does not survive the xlsx encoding. */
function roundTripWorkbook(wb: XLSX.WorkBook): XLSX.WorkBook {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return XLSX.read(buf, { cellDates: true })
}

const FIXTURES = [
  ['legacy', legacySpace],
  ['travel', travelSpace],
  ['custom fields', customFieldsSpace],
  ['disabled field', disabledFieldSpace],
  ['solo', soloSpace],
] as const

describe('buildMetaPayload', () => {
  it('carries the format version and app name', () => {
    const { space } = travelSpace()
    const payload = buildMetaPayload(space, getSpaceConfig(space), 'EUR')
    expect(payload.version).toBe(META_FORMAT_VERSION)
    expect(payload.app).toBe('GlobeExpenses')
    expect(() => new Date(payload.exportedAt).toISOString()).not.toThrow()
  })

  it('carries the space identity fields', () => {
    const { space } = travelSpace()
    const payload = buildMetaPayload(space, getSpaceConfig(space), 'EUR')
    expect(payload.space).toMatchObject({
      name: 'Portugal 2026',
      emoji: '🌍',
      mainCurrency: 'EUR',
      currencies: ['EUR', 'GBP'],
      presetOrigin: 'travel',
      startDate: '2026-04-01',
      endDate: '2026-04-14',
    })
  })

  it('carries members as travelMemberId + displayName only', () => {
    const { space } = travelSpace()
    const payload = buildMetaPayload(space, getSpaceConfig(space), 'EUR')
    expect(payload.members).toEqual([
      { travelMemberId: 'm1', displayName: 'Alice' },
      { travelMemberId: 'm2', displayName: 'Bob' },
      { travelMemberId: 'm3', displayName: 'Carla' },
    ])
  })

  // ⚠️ The security invariant. A shared export must be safe to hand to anyone
  // already allowed to see the transactions.
  it('leaks no uids, emails or invite ids', () => {
    const { space } = travelSpace()
    space.memberUids = ['auth-uid-secret']
    space.members[0] = { ...space.members[0], userId: 'auth-uid-secret' }
    space.createdBy = 'auth-uid-secret'

    const json = JSON.stringify(buildMetaPayload(space, getSpaceConfig(space), 'EUR'))
    expect(json).not.toContain('auth-uid-secret')
    expect(json).not.toContain('memberUids')
    expect(json).not.toContain('userId')
    expect(json).not.toContain('@')
  })

  it('records the disabled fields the user chose to include', () => {
    const { space } = disabledFieldSpace()
    const payload = buildMetaPayload(space, getSpaceConfig(space), 'EUR', {
      includedDisabledFields: ['city', 'cf-old'],
    })
    expect(payload.includedDisabledFields).toEqual(['city', 'cf-old'])
    // The config still marks them disabled, which is what restores the state.
    expect(payload.config.builtInFields.city).toBe(false)
    expect(payload.config.customFields.find((f) => f.id === 'cf-old')?.enabled).toBe(false)
  })
})

describe('parseMetaSheet', () => {
  it.each(FIXTURES)('round-trips %s space config to a deep-equal object', (_name, fixture) => {
    const { space } = fixture()
    const config = getSpaceConfig(space)

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      buildMetaSheet(space, config, getSpaceMainCurrency(space)),
      SHEET_META,
    )

    const result = parseMetaSheet(roundTripWorkbook(wb))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    // The deep-equality that makes the whole import path safe.
    expect(result.payload.config).toEqual(config)
  })

  it('preserves custom field option ids, not just labels', () => {
    const { space } = customFieldsSpace()
    const config = getSpaceConfig(space)

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, buildMetaSheet(space, config, 'EUR'), SHEET_META)
    const result = parseMetaSheet(roundTripWorkbook(wb))

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    const select = result.payload.config.customFields.find((f) => f.id === 'cf-trip')
    expect(select?.options?.map((o) => o.id)).toEqual(['opt-north', 'opt-south'])
  })

  // `dashboardCards: undefined` and `[]` are DIFFERENT states downstream of
  // resolveDashboardCards(), so the serialisation must not conflate them.
  it('preserves an absent dashboardCards as absent', () => {
    const { space } = legacySpace()
    const config = getSpaceConfig(space)
    expect(config.dashboardCards).toBeUndefined()

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, buildMetaSheet(space, config, 'EUR'), SHEET_META)
    const result = parseMetaSheet(roundTripWorkbook(wb))

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect('dashboardCards' in result.payload.config).toBe(false)
  })

  it('preserves an empty dashboardCards array as empty', () => {
    const { space } = travelSpace()
    space.config = { ...space.config!, dashboardCards: [] }
    const config = getSpaceConfig(space)

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, buildMetaSheet(space, config, 'EUR'), SHEET_META)
    const result = parseMetaSheet(roundTripWorkbook(wb))

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.payload.config.dashboardCards).toEqual([])
  })

  it('reports absent when the sheet is missing', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a']]), 'Sheet1')
    expect(parseMetaSheet(wb).status).toBe('absent')
  })

  // Degrade, never throw: the visible sheets are still perfectly importable.
  it('reports unsupported rather than throwing on corrupt JSON', () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([[], [], [], [], ['payload', '{not json']])
    XLSX.utils.book_append_sheet(wb, ws, SHEET_META)
    const result = parseMetaSheet(wb)
    expect(result.status).toBe('unsupported')
  })

  it('reports unsupported for a newer format version', () => {
    const wb = XLSX.utils.book_new()
    const payload = JSON.stringify({ version: META_FORMAT_VERSION + 1, config: {} })
    const ws = XLSX.utils.aoa_to_sheet([[], [], [], [], ['payload', payload]])
    XLSX.utils.book_append_sheet(wb, ws, SHEET_META)
    const result = parseMetaSheet(wb)
    expect(result.status).toBe('unsupported')
    if (result.status !== 'unsupported') return
    expect(result.reason).toContain('newer version')
  })
})

describe('hideSheet', () => {
  it('marks the metadata sheet hidden and leaves the others visible', () => {
    const { space, transactions } = travelSpace()
    const wb = buildSpaceWorkbook(space, transactions)

    const metaIndex = wb.SheetNames.indexOf(SHEET_META)
    expect(metaIndex).toBeGreaterThanOrEqual(0)
    expect(wb.Workbook?.Sheets?.[metaIndex]?.Hidden).toBe(1)

    wb.SheetNames.forEach((_name, i) => {
      if (i !== metaIndex) expect(wb.Workbook?.Sheets?.[i]?.Hidden).toBeFalsy()
    })
  })

  it('is a no-op for a sheet that is not in the workbook', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a']]), 'Sheet1')
    expect(() => hideSheet(wb, 'nope')).not.toThrow()
  })
})

describe('buildSpaceWorkbook', () => {
  it.each(FIXTURES)('embeds a readable metadata sheet for the %s space', (_name, fixture) => {
    const { space, transactions } = fixture()
    const wb = roundTripWorkbook(buildSpaceWorkbook(space, transactions))

    const result = parseMetaSheet(wb)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.payload.space.name).toBe(space.name)
    expect(result.payload.config).toEqual(getSpaceConfig(space))
  })
})
