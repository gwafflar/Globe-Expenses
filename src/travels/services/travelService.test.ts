// travelService.test.ts — unit tests for mergeMembers().
//
// mergeMembers is not a pure function (it calls Firestore), so 'firebase/firestore'
// is mocked. We keep the real Timestamp class (via importActual) since it's just a
// plain data class with no network behavior, but replace every Firestore call that
// would otherwise try to talk to a live project (getDocs, writeBatch, doc, collection).
//
// What we're actually testing is the split-rewriting logic inside mergeMembers:
// given a set of fake transactions, does it correctly rename/merge travelMemberId
// references and update the travel document? This is the exact logic that
// backs the "merge duplicate members" tool in ParametersTab.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { TravelMember } from './../types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/services/firebase', () => ({ db: {} }))

// vi.mock() factories are hoisted above imports/const declarations, so the mock
// functions referenced inside them must be created via vi.hoisted() to survive
// that hoist.
const { mockBatchUpdate, mockBatchCommit, mockGetDocs } = vi.hoisted(() => ({
  mockBatchUpdate: vi.fn(),
  mockBatchCommit: vi.fn(() => Promise.resolve()),
  mockGetDocs: vi.fn(),
}))

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore')
  return {
    ...actual,
    // doc()/collection() just need to return a stable, inspectable reference —
    // the real Firestore SDK would build a path-addressed object here.
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({ __ref: 'doc', path: segments.join('/') })),
    collection: vi.fn((_db: unknown, ...segments: string[]) => ({ __ref: 'collection', path: segments.join('/') })),
    getDocs: mockGetDocs,
    writeBatch: vi.fn(() => ({ update: mockBatchUpdate, commit: mockBatchCommit })),
  }
})

// Imported AFTER the mocks so travelService.ts picks up the mocked module.
const { mergeMembers } = await import('./travelService')

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMember(travelMemberId: string, userId: string | null = null): TravelMember {
  return {
    travelMemberId,
    displayName: travelMemberId,
    userId,
    allowRename: true,
    joinedAt: Timestamp.now(),
  }
}

// Fakes a Firestore QuerySnapshot with the given transaction docs.
function fakeSnapshot(txs: { id: string; paidBy?: unknown[]; beneficiaries?: unknown[] }[]) {
  return {
    docs: txs.map((tx) => ({
      ref: { __ref: 'txDoc', id: tx.id },
      data: () => ({ paidBy: tx.paidBy, beneficiaries: tx.beneficiaries }),
    })),
  }
}

beforeEach(() => {
  mockBatchUpdate.mockClear()
  mockBatchCommit.mockClear()
  mockGetDocs.mockReset()
})

// ---------------------------------------------------------------------------
// Split rewriting
// ---------------------------------------------------------------------------

describe('mergeMembers — split rewriting', () => {
  it('renames deleteId to keepId when only deleteId is present in a split', async () => {
    mockGetDocs.mockResolvedValue(
      fakeSnapshot([
        { id: 'tx1', paidBy: [{ travelMemberId: 'marc-old', amount: 50 }], beneficiaries: [{ travelMemberId: 'marc-old', amount: 50 }] },
      ]),
    )

    await mergeMembers('travel1', 'marcus', 'marc-old', [makeMember('marcus'), makeMember('marc-old')], 'marcus')

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tx1' }),
      {
        paidBy: [{ travelMemberId: 'marcus', amount: 50 }],
        beneficiaries: [{ travelMemberId: 'marcus', amount: 50 }],
      },
    )
  })

  it('sums amounts onto keepId when both keepId and deleteId appear in the same split', async () => {
    mockGetDocs.mockResolvedValue(
      fakeSnapshot([
        {
          id: 'tx1',
          paidBy: [
            { travelMemberId: 'marcus', amount: 30 },
            { travelMemberId: 'marc-old', amount: 20 },
          ],
        },
      ]),
    )

    await mergeMembers('travel1', 'marcus', 'marc-old', [makeMember('marcus'), makeMember('marc-old')], 'marcus')

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tx1' }),
      { paidBy: [{ travelMemberId: 'marcus', amount: 50 }] },
    )
  })

  it('preserves other members untouched in a merged split', async () => {
    mockGetDocs.mockResolvedValue(
      fakeSnapshot([
        {
          id: 'tx1',
          beneficiaries: [
            { travelMemberId: 'marcus', amount: 10 },
            { travelMemberId: 'marc-old', amount: 10 },
            { travelMemberId: 'alice', amount: 30 },
          ],
        },
      ]),
    )

    await mergeMembers('travel1', 'marcus', 'marc-old', [makeMember('marcus'), makeMember('marc-old'), makeMember('alice')], 'marcus')

    const [, payload] = mockBatchUpdate.mock.calls[0]
    expect(payload.beneficiaries).toEqual(
      expect.arrayContaining([
        { travelMemberId: 'alice', amount: 30 },
        { travelMemberId: 'marcus', amount: 20 },
      ]),
    )
    expect(payload.beneficiaries).toHaveLength(2)
  })

  it('does not touch transactions that reference neither keepId nor deleteId', async () => {
    mockGetDocs.mockResolvedValue(
      fakeSnapshot([
        { id: 'tx1', paidBy: [{ travelMemberId: 'alice', amount: 10 }], beneficiaries: [{ travelMemberId: 'alice', amount: 10 }] },
      ]),
    )

    await mergeMembers('travel1', 'marcus', 'marc-old', [makeMember('marcus'), makeMember('marc-old'), makeMember('alice')], 'marcus')

    // Only the final travel-doc update should have been batched — no transaction update.
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1)
    expect(mockBatchUpdate.mock.calls[0][0]).toEqual(expect.objectContaining({ path: 'travels/travel1' }))
  })

  it('only rewrites the side (paidBy or beneficiaries) that actually contains deleteId', async () => {
    mockGetDocs.mockResolvedValue(
      fakeSnapshot([
        {
          id: 'tx1',
          paidBy: [{ travelMemberId: 'marc-old', amount: 40 }],
          beneficiaries: [{ travelMemberId: 'alice', amount: 40 }],
        },
      ]),
    )

    await mergeMembers('travel1', 'marcus', 'marc-old', [makeMember('marcus'), makeMember('marc-old'), makeMember('alice')], 'marcus')

    const [, payload] = mockBatchUpdate.mock.calls[0]
    expect(payload).toEqual({ paidBy: [{ travelMemberId: 'marcus', amount: 40 }] })
    expect(payload.beneficiaries).toBeUndefined()
  })

  it('processes multiple affected transactions independently', async () => {
    mockGetDocs.mockResolvedValue(
      fakeSnapshot([
        { id: 'tx1', paidBy: [{ travelMemberId: 'marc-old', amount: 10 }] },
        { id: 'tx2', paidBy: [{ travelMemberId: 'alice', amount: 20 }] }, // untouched
        { id: 'tx3', beneficiaries: [{ travelMemberId: 'marc-old', amount: 30 }] },
      ]),
    )

    await mergeMembers('travel1', 'marcus', 'marc-old', [makeMember('marcus'), makeMember('marc-old'), makeMember('alice')], 'marcus')

    // 2 transaction updates (tx1, tx3) + 1 travel-doc update = 3
    expect(mockBatchUpdate).toHaveBeenCalledTimes(3)
  })
})

// ---------------------------------------------------------------------------
// Travel document update
// ---------------------------------------------------------------------------

describe('mergeMembers — travel document update', () => {
  it('removes the deleted member slot from travel.members', async () => {
    mockGetDocs.mockResolvedValue(fakeSnapshot([]))
    const members = [makeMember('marcus'), makeMember('marc-old')]

    await mergeMembers('travel1', 'marcus', 'marc-old', members, 'marcus')

    const travelUpdateCall = mockBatchUpdate.mock.calls.find(
      (call) => call[0].path === 'travels/travel1',
    )
    expect(travelUpdateCall).toBeDefined()
    const payload = travelUpdateCall![1] as { members: TravelMember[] }
    expect(payload.members.map((m) => m.travelMemberId)).toEqual(['marcus'])
  })

  it('reassigns createdBy to keepId when the deleted member was the creator', async () => {
    mockGetDocs.mockResolvedValue(fakeSnapshot([]))
    const members = [makeMember('marcus'), makeMember('marc-old')]

    await mergeMembers('travel1', 'marcus', 'marc-old', members, 'marc-old')

    const [, payload] = mockBatchUpdate.mock.calls[0]
    expect(payload.createdBy).toBe('marcus')
  })

  it('leaves createdBy untouched when the deleted member was not the creator', async () => {
    mockGetDocs.mockResolvedValue(fakeSnapshot([]))
    const members = [makeMember('marcus'), makeMember('marc-old')]

    await mergeMembers('travel1', 'marcus', 'marc-old', members, 'marcus')

    const [, payload] = mockBatchUpdate.mock.calls[0]
    expect(payload.createdBy).toBeUndefined()
  })

  it('commits the batch exactly once', async () => {
    mockGetDocs.mockResolvedValue(fakeSnapshot([]))
    await mergeMembers('travel1', 'marcus', 'marc-old', [makeMember('marcus'), makeMember('marc-old')], 'marcus')
    expect(mockBatchCommit).toHaveBeenCalledTimes(1)
  })
})
