/**
 * Pins the second Firestore mapping (see the note at the top of mapping.ts).
 * The member cases mirror `normaliseMember()` in src/spaces/types.ts — if that
 * function's handling of legacy documents changes, these must change with it.
 */
import { describe, expect, it } from 'vitest'
import { mapInviteForEvents, mapMember, mapSpaceForEvents, mapTxForEvents } from './mapping'

describe('mapMember — parity with normaliseMember()', () => {
  it('current shape: explicit travelMemberId and userId', () => {
    expect(mapMember({ travelMemberId: 'm1', displayName: 'Bob', userId: 'u1', allowRename: true })).toEqual({
      travelMemberId: 'm1',
      displayName: 'Bob',
      userId: 'u1',
    })
  })

  it('an unclaimed slot keeps userId null (not replaced by a fallback)', () => {
    expect(mapMember({ travelMemberId: 'm1', displayName: 'Bob', userId: null }).userId).toBeNull()
  })

  it('legacy shape { uid, displayName }: the uid is both the slot key and the user', () => {
    expect(mapMember({ uid: 'u1', displayName: 'Bob' })).toEqual({
      travelMemberId: 'u1',
      displayName: 'Bob',
      userId: 'u1',
    })
  })

  it('nothing usable: empty key, no user', () => {
    expect(mapMember({})).toEqual({ travelMemberId: '', displayName: '', userId: null })
  })
})

describe('mapSpaceForEvents', () => {
  it('defaults the arrays an old document may lack', () => {
    expect(mapSpaceForEvents('s1', { name: 'Japan' })).toEqual({
      id: 's1',
      name: 'Japan',
      emoji: undefined,
      members: [],
      memberUids: [],
      pendingInviteId: undefined,
    })
  })
})

describe('mapTxForEvents', () => {
  it('an absent type is an expense', () => {
    expect(mapTxForEvents('t1', { name: 'x' }).type).toBe('expense')
  })

  it('maps legacy splits keyed by uid', () => {
    const tx = mapTxForEvents('t1', { paidBy: [{ uid: 'u1', amount: 10 }], beneficiaries: [{ travelMemberId: 'm2', amount: 10 }] })
    expect(tx.paidBy).toEqual([{ travelMemberId: 'u1', amount: 10 }])
    expect(tx.beneficiaries).toEqual([{ travelMemberId: 'm2', amount: 10 }])
  })

  it('keeps falsy cosmetic values as they are', () => {
    const tx = mapTxForEvents('t1', { notes: '', fees: 0, custom: { f: false } })
    expect(tx.cosmetic).toMatchObject({ notes: '', fees: 0, custom: { f: false } })
  })
})

describe('mapInviteForEvents', () => {
  it("keeps the frozen 'travel_member' type and defaults usedBy", () => {
    expect(mapInviteForEvents('i1', { type: 'travel_member', fromUid: 'u1', travelId: 's1', status: 'active' })).toMatchObject({
      id: 'i1',
      type: 'travel_member',
      travelId: 's1',
      usedBy: [],
    })
  })
})
