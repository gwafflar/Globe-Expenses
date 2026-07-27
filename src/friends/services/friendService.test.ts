// friendService.test.ts — unit tests for acceptSpaceInvite()'s "already a member"
// detection (the dedup fix: don't create a duplicate SpaceMember slot when the
// accepter is already in space.memberUids).
//
// acceptSpaceInvite is not a pure function (it calls Firestore), so 'firebase/firestore'
// is mocked. The key behavior under test is the branch on the pre-read of the space doc:
//   - read throws (permission-denied, simulating a genuinely new member) -> creates a slot
//   - read succeeds and memberUids already contains the uid -> skips slot creation
//   - read succeeds but memberUids does NOT contain the uid -> still creates a slot
//     (defensive: the branch must key off actual membership, not read success alone)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { Invite } from './../types'
import type { UserProfile } from '@/auth/services/userService'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/services/firebase', () => ({ db: {} }))

// vi.mock() factories are hoisted above imports/const declarations, so the mock
// functions referenced inside them must be created via vi.hoisted() to survive
// that hoist.
const { mockBatchUpdate, mockBatchCommit, mockGetDoc, mockSetDoc } = vi.hoisted(() => ({
  mockBatchUpdate: vi.fn(),
  mockBatchCommit: vi.fn(() => Promise.resolve()),
  mockGetDoc: vi.fn(),
  mockSetDoc: vi.fn(() => Promise.resolve()),
}))

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore')
  return {
    ...actual,
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({ __ref: 'doc', path: segments.join('/') })),
    getDoc: mockGetDoc,
    setDoc: mockSetDoc,
    writeBatch: vi.fn(() => ({ update: mockBatchUpdate, commit: mockBatchCommit })),
    // arrayUnion just needs to be inspectable in assertions — wrap its args.
    arrayUnion: vi.fn((...items: unknown[]) => ({ __arrayUnion: items })),
  }
})

const { acceptSpaceInvite } = await import('./friendService')

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeInvite(overrides: Partial<Invite> = {}): Invite {
  return {
    inviteId: 'invite1',
    type: 'travel_member',
    fromUid: 'sender-uid',
    fromDisplayName: 'Alice',
    fromNametag: 'alice',
    travelId: 'travel1',
    travelName: 'Japan 2026',
    multiUse: true,
    status: 'active',
    usedBy: [],
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.now(),
    ...overrides,
  }
}

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: 'bob-uid',
    type: 'human',
    displayName: 'Bob',
    email: 'bob@example.com',
    nametag: 'bob',
    mainCurrency: 'EUR',
    categories: [],
    paymentMethods: [],
    createdAt: Timestamp.now(),
    ...overrides,
  }
}

beforeEach(() => {
  mockBatchUpdate.mockClear()
  mockBatchCommit.mockClear()
  mockGetDoc.mockReset()
  mockSetDoc.mockClear()
})

// ---------------------------------------------------------------------------
// New member (permission-denied pre-read)
// ---------------------------------------------------------------------------

describe('acceptSpaceInvite — new member', () => {
  it('creates a new SpaceMember slot when the pre-read is denied (genuinely new member)', async () => {
    mockGetDoc.mockRejectedValue(new Error('Missing or insufficient permissions'))

    const result = await acceptSpaceInvite(makeInvite(), makeUser())

    expect(result.alreadyMember).toBe(false)
    expect(result.spaceId).toBe('travel1')

    // Two batch.update calls: invite doc + space doc (with a new members entry).
    expect(mockBatchUpdate).toHaveBeenCalledTimes(2)
    const spaceUpdateCall = mockBatchUpdate.mock.calls.find((c) => c[0].path === 'travels/travel1')
    expect(spaceUpdateCall).toBeDefined()
    const [, spacePayload] = spaceUpdateCall!
    expect(spacePayload.memberUids).toEqual({ __arrayUnion: ['bob-uid'] })
    expect(spacePayload.pendingInviteId).toBe('invite1')
  })
})

// ---------------------------------------------------------------------------
// Already a member
// ---------------------------------------------------------------------------

describe('acceptSpaceInvite — already a member', () => {
  it('skips creating a new slot when the uid is already in memberUids', async () => {
    mockGetDoc.mockResolvedValue({
      data: () => ({ memberUids: ['bob-uid', 'sender-uid'] }),
    })

    const result = await acceptSpaceInvite(makeInvite(), makeUser({ uid: 'bob-uid' }))

    expect(result.alreadyMember).toBe(true)

    // Only the invite doc is updated (marks it used) — no space doc update at all.
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1)
    const [ref] = mockBatchUpdate.mock.calls[0]
    expect(ref.path).toBe('invites/invite1')
  })

  it('still marks the invite as used even when already a member', async () => {
    mockGetDoc.mockResolvedValue({ data: () => ({ memberUids: ['bob-uid'] }) })

    await acceptSpaceInvite(makeInvite({ multiUse: false }), makeUser({ uid: 'bob-uid' }))

    const [, invitePayload] = mockBatchUpdate.mock.calls[0]
    expect(invitePayload.status).toBe('accepted')
    expect(invitePayload.usedBy).toEqual({ __arrayUnion: ['bob-uid'] })
  })

  it('still fires the (idempotent) friendship writes when already a member', async () => {
    mockGetDoc.mockResolvedValue({ data: () => ({ memberUids: ['bob-uid'] }) })

    await acceptSpaceInvite(makeInvite(), makeUser({ uid: 'bob-uid' }))

    // Two fire-and-forget setDoc calls: sender's friend list + accepter's friend list.
    expect(mockSetDoc).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('acceptSpaceInvite — edge cases', () => {
  it('treats a successful read where the uid is absent from memberUids as NOT already a member', async () => {
    // Defensive case: read succeeded (shouldn't normally happen for a non-member per
    // the security rules) but memberUids doesn't actually contain this uid yet.
    mockGetDoc.mockResolvedValue({ data: () => ({ memberUids: ['someone-else'] }) })

    const result = await acceptSpaceInvite(makeInvite(), makeUser({ uid: 'bob-uid' }))

    expect(result.alreadyMember).toBe(false)
    const spaceUpdateCall = mockBatchUpdate.mock.calls.find((c) => c[0].path === 'travels/travel1')
    expect(spaceUpdateCall).toBeDefined()
  })

  it('throws when the invite has no travelId', async () => {
    await expect(
      acceptSpaceInvite(makeInvite({ travelId: undefined }), makeUser()),
    ).rejects.toThrow('Invite missing travelId')
  })

  it('commits the batch exactly once regardless of membership branch', async () => {
    mockGetDoc.mockRejectedValue(new Error('permission-denied'))
    await acceptSpaceInvite(makeInvite(), makeUser())
    expect(mockBatchCommit).toHaveBeenCalledTimes(1)
  })
})
