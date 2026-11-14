/**
 * Import batch marker (docs/NOTIFICATIONS_SPEC.md §7): every row of one import
 * run carries the same importBatchId, and ONE marker document is written after
 * the last batch — that is what turns hundreds of row pushes into one summary.
 *
 * Firestore is mocked: these tests only look at WHAT is written and in which
 * order, not at Firestore itself.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Everything written, in order: ['batch.set', path, data] | ['batch.commit'] | ['setDoc', path, data]
const writes: unknown[][] = []

vi.mock('@/services/firebase', () => ({ db: {} }))

vi.mock('firebase/firestore', () => {
  let nextId = 0
  const collection = (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })
  // doc(collectionRef) → auto id ; doc(collectionRef, id) ; doc(db, ...segments)
  const doc = (first: { path?: string }, ...segments: string[]) => {
    if (first.path !== undefined) {
      const id = segments[0] ?? `auto${++nextId}`
      return { id, path: `${first.path}/${id}` }
    }
    return { id: segments[segments.length - 1], path: segments.join('/') }
  }
  return {
    collection,
    doc,
    serverTimestamp: () => 'SERVER_TIMESTAMP',
    setDoc: vi.fn(async (ref: { path: string }, data: unknown) => {
      writes.push(['setDoc', ref.path, data])
    }),
    writeBatch: () => ({
      set: (ref: { path: string }, data: unknown) => writes.push(['batch.set', ref.path, data]),
      commit: async () => {
        writes.push(['batch.commit'])
      },
    }),
  }
})

import type { ForeignParsedRow } from '../foreignSheet'
import { importForeignRows, importParsedRows, type ParsedSheetRow } from '../sheetImport'

const foreignRow = (name: string): ForeignParsedRow =>
  ({
    date: '14-11-2026',
    name,
    totalAmount: 10,
    currency: 'EUR',
    paid: [{ travelMemberId: 'mA', amount: 10 }],
    cost: [{ travelMemberId: 'mB', amount: 10 }],
  }) as ForeignParsedRow

const rowWrites = () => writes.filter((w) => w[0] === 'batch.set')
const markerWrites = () => writes.filter((w) => w[0] === 'setDoc')
const batchIdsOfRows = () => new Set(rowWrites().map((w) => (w[2] as { importBatchId?: string }).importBatchId))

beforeEach(() => {
  writes.length = 0
})

describe('importForeignRows', () => {
  it('stamps every row with the same importBatchId and writes one marker after the rows', async () => {
    await importForeignRows('space1', [foreignRow('a'), foreignRow('b'), foreignRow('c')], 'uA', 'EUR')

    const ids = batchIdsOfRows()
    expect(ids.size).toBe(1)
    const [importBatchId] = [...ids]
    expect(importBatchId).toBeTruthy()

    expect(markerWrites()).toEqual([
      [
        'setDoc',
        `travels/space1/importBatches/${importBatchId}`,
        { createdBy: 'uA', rowCount: 3, createdAt: 'SERVER_TIMESTAMP' },
      ],
    ])
    // The marker is the very last write: the server counts rows when it sees it.
    expect(writes[writes.length - 1][0]).toBe('setDoc')
  })

  it('more than 500 rows: several batches, still a single marker, written last', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => foreignRow(`row ${i}`))
    await importForeignRows('space1', rows, 'uA', 'EUR')

    expect(writes.filter((w) => w[0] === 'batch.commit')).toHaveLength(2)
    expect(markerWrites()).toHaveLength(1)
    expect((markerWrites()[0][2] as { rowCount: number }).rowCount).toBe(501)
    expect(writes[writes.length - 1][0]).toBe('setDoc')
    expect(batchIdsOfRows().size).toBe(1)
  })

  it('an import with no rows writes no marker', async () => {
    await importForeignRows('space1', [], 'uA', 'EUR')
    expect(markerWrites()).toEqual([])
  })

  it('two imports get different batch ids', async () => {
    await importForeignRows('space1', [foreignRow('a')], 'uA', 'EUR')
    const first = [...batchIdsOfRows()][0]
    writes.length = 0
    await importForeignRows('space1', [foreignRow('b')], 'uA', 'EUR')
    expect([...batchIdsOfRows()][0]).not.toBe(first)
  })
})

describe('importParsedRows', () => {
  const sheetRow = (name: string, txId?: string): ParsedSheetRow =>
    ({
      txId,
      date: '14-11-2026',
      name,
      totalAmount: 10,
      currency: 'EUR',
      costPerSlot: [0, 10],
      paidPerSlot: [10, 0],
    }) as unknown as ParsedSheetRow

  it('stamps new AND updated-in-place rows, and counts both in the marker', async () => {
    await importParsedRows('space1', [sheetRow('new'), sheetRow('existing', 'tx42')], { 0: 'mA', 1: 'mB' }, 'uA', 'EUR')

    expect(rowWrites()).toHaveLength(2)
    expect(batchIdsOfRows().size).toBe(1)
    // The re-imported row keeps its document id (update in place).
    expect(rowWrites().map((w) => w[1])).toContain('travels/space1/transactions/tx42')
    expect(markerWrites()).toHaveLength(1)
    expect((markerWrites()[0][2] as { rowCount: number }).rowCount).toBe(2)
  })
})
