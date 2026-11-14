// spaceService.test.ts — unit tests for mergeMembers().
//
// mergeMembers is not a pure function (it calls Firestore), so 'firebase/firestore'
// is mocked. We keep the real Timestamp class (via importActual) since it's just a
// plain data class with no network behavior, but replace every Firestore call that
// would otherwise try to talk to a live project (getDocs, writeBatch, doc, collection).
//
// What we're actually testing is the split-rewriting logic inside mergeMembers:
// given a set of fake transactions, does it correctly rename/merge travelMemberId
// references and update the space document? This is the exact logic that
// backs the "merge duplicate members" tool in ParametersTab.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { SpaceMember } from './../types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/services/firebase', () => ({ db: {} }))

// vi.mock() factories are hoisted above imports/const declarations, so the mock
// functions referenced inside them must be created via vi.hoisted() to survive
// that hoist.
const { mockBatchUpdate, mockBatchCommit, mockGetDocs, mockSetDoc } = vi.hoisted(() => ({
  mockBatchUpdate: vi.fn(),
  mockBatchCommit: vi.fn(() => Promise.resolve()),
  mockGetDocs: vi.fn(),
  mockSetDoc: vi.fn(() => Promise.resolve()),
}))

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore')
  let autoIdCounter = 0
  return {
    ...actual,
    // doc()/collection() just need to return a stable, inspectable reference —
    // the real Firestore SDK would build a path-addressed object here.
    // Two call shapes are exercised: doc(db, ...segments) (existing update paths)
    // and doc(collectionRef) with no segments — the id-generating form used by
    // createSpace()'s fire-and-forget write, which needs a synchronous .id.
    doc: vi.fn((first: unknown, ...segments: string[]) => {
      const firstRef = first as { __ref?: string; path?: string } | undefined
      if (firstRef?.__ref === 'collection' && segments.length === 0) {
        const id = `auto-${++autoIdCounter}`
        return { __ref: 'doc', path: `${firstRef.path}/${id}`, id }
      }
      const path = segments.join('/')
      return { __ref: 'doc', path, id: segments[segments.length - 1] }
    }),
    collection: vi.fn((_db: unknown, ...segments: string[]) => ({ __ref: 'collection', path: segments.join('/') })),
    getDocs: mockGetDocs,
    setDoc: mockSetDoc,
    writeBatch: vi.fn(() => ({ update: mockBatchUpdate, commit: mockBatchCommit })),
  }
})

// Imported AFTER the mocks so spaceService.ts picks up the mocked module.
const { mergeMembers, createSpace, mapSpaceDoc } = await import('./spaceService')

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMember(travelMemberId: string, userId: string | null = null): SpaceMember {
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
  mockSetDoc.mockClear()
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

    // Only the final space-doc update should have been batched — no transaction update.
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

    // 2 transaction updates (tx1, tx3) + 1 space-doc update = 3
    expect(mockBatchUpdate).toHaveBeenCalledTimes(3)
  })
})

// ---------------------------------------------------------------------------
// Space document update
// ---------------------------------------------------------------------------

describe('mergeMembers — space document update', () => {
  it('removes the deleted member slot from space.members', async () => {
    mockGetDocs.mockResolvedValue(fakeSnapshot([]))
    const members = [makeMember('marcus'), makeMember('marc-old')]

    await mergeMembers('travel1', 'marcus', 'marc-old', members, 'marcus')

    const spaceUpdateCall = mockBatchUpdate.mock.calls.find(
      (call) => call[0].path === 'travels/travel1',
    )
    expect(spaceUpdateCall).toBeDefined()
    const payload = spaceUpdateCall![1] as { members: SpaceMember[] }
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

// ---------------------------------------------------------------------------
// createSpace — regression tests for two Phase 4.1 bugs:
//  1. `false` toggles in the preset config were dropped before/around the
//     Firestore write, so a partial config resolved back to travel-mode
//     defaults everywhere it mattered (see docs/SPACE_REFACTOR_SPEC.md).
//  2. createSpace() awaited the write, which never settles offline.
// ---------------------------------------------------------------------------

describe('createSpace', () => {
  const baseInput = {
    uid: 'u1',
    displayName: 'Alice',
    name: 'My budget',
    mainCurrency: 'EUR',
  }

  it('returns the new id synchronously — not a Promise (fire-and-forget, decision #25)', () => {
    const result = createSpace({ ...baseInput, presetId: 'solo' })
    expect(typeof result).toBe('string')
    expect(result).not.toBeInstanceOf(Promise)
  })

  it('writes every solo-preset toggle explicitly, including false values', () => {
    createSpace({ ...baseInput, presetId: 'solo' })

    expect(mockSetDoc).toHaveBeenCalledTimes(1)
    const [, docData] = mockSetDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    const config = docData.config as { builtInFields: Record<string, boolean>; features: Record<string, boolean> }

    // Asserted with toBe(false), not truthiness — a `.filter(([, v]) => v)`
    // style bug would silently drop these keys instead of writing `false`.
    expect(config.builtInFields).toHaveProperty('country', false)
    expect(config.builtInFields).toHaveProperty('city', false)
    expect(config.builtInFields).toHaveProperty('category', true)
    expect(config.builtInFields).toHaveProperty('paymentMethod', true)
    expect(config.builtInFields).toHaveProperty('notes', true)
    expect(config.features).toHaveProperty('wallets', false)
    expect(config.features).toHaveProperty('multiCurrency', false)
  })

  it('preserves a custom field with enabled: false rather than stripping it', () => {
    createSpace({
      ...baseInput,
      presetId: 'custom',
      config: {
        builtInFields: { country: false, city: false, category: true, paymentMethod: false, notes: true },
        features: { wallets: false, multiCurrency: false },
        customFields: [{ id: 'f1', label: 'Reimbursable', type: 'boolean', enabled: false }],
      },
    })

    const [, docData] = mockSetDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    const config = docData.config as { customFields: { id: string; enabled: boolean }[] }
    expect(config.customFields).toHaveLength(1)
    expect(config.customFields[0]).toHaveProperty('enabled', false)
  })

  it('does not await the Firestore write — id is available before the write promise resolves', async () => {
    let resolveWrite: () => void = () => {}
    mockSetDoc.mockReturnValueOnce(new Promise<void>((resolve) => { resolveWrite = resolve }))

    const id = createSpace({ ...baseInput, presetId: 'travel' })
    expect(id).toBeTruthy() // available immediately, before the write settles

    resolveWrite()
  })
})

// ---------------------------------------------------------------------------
// mapSpaceDoc — the single snapshot→Space mapping shared by useSpaces.ts and
// SpaceDetailPage.tsx (Prompt 04.3). Locks in every field, including the two
// (config, presetOrigin) that were dropped from one of the two hand-rolled
// mappings this replaced (see Session 022 Bug 1).
// ---------------------------------------------------------------------------

describe('mapSpaceDoc', () => {
  const storedConfig = {
    builtInFields: { country: false, city: false, category: true, paymentMethod: true, notes: true },
    features: { wallets: false, multiCurrency: false },
    customFields: [],
  }
  const createdAt = Timestamp.now()

  const fullDoc = {
    name: 'Trip to Japan',
    emoji: '🗾',
    description: 'April trip',
    members: [{ travelMemberId: 'm1', displayName: 'Alice', userId: 'u1', allowRename: true, joinedAt: createdAt }],
    memberUids: ['u1'],
    createdBy: 'u1',
    createdAt,
    currencies: ['EUR', 'JPY'],
    mainCurrency: 'EUR',
    defaultRates: { JPY: 160 },
    settings: { trackLocation: true },
    config: storedConfig,
    presetOrigin: 'travel',
    startDate: '2026-04-01',
    endDate: '2026-04-10',
    categories: [{ id: 'c1', label: 'Food' }],
    paymentMethods: [{ id: 'p1', label: 'Cash' }],
    countries: [{ id: 'co1', label: 'Japan' }],
    cities: [{ id: 'ci1', label: 'Tokyo' }],
    archivedByUids: ['u2'],
  }

  it('maps every field of a fully-populated document, including config and presetOrigin', () => {
    const space = mapSpaceDoc('space1', fullDoc)
    expect(space).toEqual({ spaceId: 'space1', ...fullDoc })
  })

  it('maps a legacy document with no config to config: undefined', () => {
    const legacyDoc = {
      name: 'Old trip',
      members: [],
      memberUids: ['u1'],
      createdBy: 'u1',
      createdAt,
      currencies: ['EUR'],
    }
    const space = mapSpaceDoc('space2', legacyDoc)
    expect(space.config).toBeUndefined()
    expect(space.presetOrigin).toBeUndefined()
    expect(space.startDate).toBeUndefined()
    expect(space.endDate).toBeUndefined()
    expect(space.categories).toEqual([])
    expect(space.paymentMethods).toEqual([])
    expect(space.countries).toEqual([])
    expect(space.cities).toEqual([])
    expect(space.archivedByUids).toEqual([])
  })
})
