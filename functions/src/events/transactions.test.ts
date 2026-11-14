import { describe, expect, it } from 'vitest'
import { ALICE, makeSpace, makeTx, split } from '../testing/fixtures'
import {
  buildTransactionEvents,
  diffTransaction,
  involvedMemberIds,
  resolveRecipients,
  shareOf,
} from './transactions'

const space = makeSpace()
const recipients = (drafts: { recipientUid: string }[]) => drafts.map((d) => d.recipientUid).sort()

describe('involvedMemberIds', () => {
  it('lists payers and beneficiaries with a non-zero amount', () => {
    expect([...involvedMemberIds(makeTx())].sort()).toEqual(['mA', 'mB'])
  })

  it('ignores a member listed with amount 0', () => {
    const tx = makeTx({ beneficiaries: [split('mA', 84), split('mC', 0)] })
    expect([...involvedMemberIds(tx)]).toEqual(['mA'])
  })

  it('counts listed members on a zero-total transaction', () => {
    const tx = makeTx({ totalAmount: 0, paidBy: [split('mA', 0)], beneficiaries: [split('mB', 0)] })
    expect([...involvedMemberIds(tx)].sort()).toEqual(['mA', 'mB'])
  })
})

describe('shareOf', () => {
  it("sums what the member's slots paid and owe", () => {
    expect(shareOf(makeTx(), new Set(['mA']))).toEqual({ paid: 84, owed: 42 })
    expect(shareOf(makeTx(), new Set(['mB']))).toEqual({ paid: 0, owed: 42 })
  })

  it('rounds to cents', () => {
    const tx = makeTx({ totalAmount: 100, beneficiaries: [split('mA', 33.333), split('mB', 33.333), split('mC', 33.334)] })
    expect(shareOf(tx, new Set(['mB'])).owed).toBe(33.33)
  })
})

describe('resolveRecipients', () => {
  const all = new Set(['mA', 'mB', 'mC', 'mD'])

  it('never includes the actor (§5 rule 1)', () => {
    expect([...resolveRecipients(space, all, 'uA').keys()].sort()).toEqual(['uB', 'uC'])
  })

  it('skips unclaimed slots (§5 rule 2)', () => {
    expect(resolveRecipients(space, new Set(['mD']), 'uA').size).toBe(0)
  })

  it('skips a user who no longer has access to the space', () => {
    const noCarol = makeSpace({ memberUids: ['uA', 'uB'] })
    expect([...resolveRecipients(noCarol, all, 'uA').keys()]).toEqual(['uB'])
  })

  it('maps legacy-shaped members, whose slot id is their uid', () => {
    const legacy = makeSpace({
      members: [
        { travelMemberId: 'uA', displayName: 'Alice', userId: 'uA' },
        { travelMemberId: 'uB', displayName: 'Bob', userId: 'uB' },
      ],
    })
    expect([...resolveRecipients(legacy, new Set(['uB']), 'uA').keys()]).toEqual(['uB'])
  })
})

describe('diffTransaction (§5 rule 3)', () => {
  it('reports nothing when only bookkeeping changed', () => {
    const d = diffTransaction(makeTx(), makeTx({ lastModifiedBy: 'uB', importBatchId: 'b1' }))
    expect(d).toEqual({ changedFields: [], material: false, before: {} })
  })

  it.each([
    ['totalAmount', { totalAmount: 90 }, { totalAmount: 84 }],
    ['currency', { currency: 'USD' }, { currency: 'EUR' }],
    ['exchangeRate', { exchangeRate: 1.1 }, { exchangeRate: 1 }],
    ['type', { type: 'transfer' as const }, { type: 'expense' }],
  ])('%s is material and keeps the previous value', (field, change, previous) => {
    const d = diffTransaction(makeTx(), makeTx(change))
    expect(d.changedFields).toEqual([field])
    expect(d.material).toBe(true)
    expect(d.before).toEqual(previous)
  })

  it('a payer or split change is material', () => {
    expect(diffTransaction(makeTx(), makeTx({ paidBy: [split('mB', 84)] })).changedFields).toEqual(['paidBy'])
    const resplit = makeTx({ beneficiaries: [split('mA', 20), split('mB', 64)] })
    expect(diffTransaction(makeTx(), resplit)).toMatchObject({ changedFields: ['beneficiaries'], material: true })
  })

  it('ignores split order and sub-cent drift', () => {
    const same = makeTx({ beneficiaries: [split('mB', 42.001), split('mA', 41.999)] })
    expect(diffTransaction(makeTx(), same).changedFields).toEqual([])
  })

  it('name, category, notes… are cosmetic', () => {
    const after = makeTx({ cosmetic: { name: 'Sushi', date: '14-11-2026', category: '🍽️ Food', notes: 'great' } })
    expect(diffTransaction(makeTx(), after)).toEqual({ changedFields: ['name', 'notes'], material: false, before: {} })
  })

  it('compares custom field maps by value', () => {
    const a = makeTx({ cosmetic: { custom: { f1: 'x', f2: true } } })
    const same = makeTx({ cosmetic: { custom: { f1: 'x', f2: true } } })
    const changed = makeTx({ cosmetic: { custom: { f1: 'y', f2: true } } })
    expect(diffTransaction(a, same).changedFields).toEqual([])
    expect(diffTransaction(a, changed).changedFields).toEqual(['custom'])
  })

  it('lists material fields before cosmetic ones', () => {
    const after = makeTx({ totalAmount: 90, cosmetic: { name: 'Sushi', date: '14-11-2026', category: '🍽️ Food' } })
    expect(diffTransaction(makeTx(), after)).toMatchObject({ changedFields: ['totalAmount', 'name'], material: true })
  })
})

describe('buildTransactionEvents — create', () => {
  it('T1: notifies involved members except the actor, with their own share', () => {
    const drafts = buildTransactionEvents({ type: 'create', after: makeTx() }, space, ALICE)
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      recipientUid: 'uB',
      body: {
        kind: 'tx_created',
        actor: ALICE,
        space: { id: 'space1', name: 'Japan', emoji: '🇯🇵' },
        tx: { id: 'tx1', name: 'Dinner', type: 'expense', totalAmount: 84, currency: 'EUR' },
        myShare: { paid: 0, owed: 42 },
      },
      push: { throttleKey: 'space1', muteSpaceId: 'space1' },
    })
  })

  it('T7: a transaction that involves nobody else produces nothing', () => {
    const solo = makeTx({ beneficiaries: [split('mA', 84)] })
    expect(buildTransactionEvents({ type: 'create', after: solo }, space, ALICE)).toEqual([])
  })

  it('notifies the payer when someone else records what they paid', () => {
    // Bob records a dinner Alice paid for.
    const drafts = buildTransactionEvents({ type: 'create', after: makeTx() }, space, { uid: 'uB', name: 'Bob' })
    expect(recipients(drafts)).toEqual(['uA'])
    expect(drafts[0].body.myShare).toEqual({ paid: 84, owed: 42 })
  })

  it('T6: the receiver of a transfer gets transfer_received', () => {
    const transfer = makeTx({ type: 'transfer', totalAmount: 50, paidBy: [split('mA', 50)], beneficiaries: [split('mB', 50)] })
    const [draft] = buildTransactionEvents({ type: 'create', after: transfer }, space, ALICE)
    expect(draft.body).toMatchObject({ kind: 'transfer_received', transferFrom: 'Alice', myShare: { paid: 0, owed: 50 } })
    expect(draft.push).not.toBeNull()
  })

  it('the sender of a transfer recorded by someone else gets tx_created', () => {
    const transfer = makeTx({ type: 'transfer', totalAmount: 50, paidBy: [split('mA', 50)], beneficiaries: [split('mB', 50)] })
    const [draft] = buildTransactionEvents({ type: 'create', after: transfer }, space, { uid: 'uB', name: 'Bob' })
    expect(draft).toMatchObject({ recipientUid: 'uA', body: { kind: 'tx_created' } })
  })

  it('§7: an imported row gets a feed entry but no push', () => {
    const [draft] = buildTransactionEvents({ type: 'create', after: makeTx({ importBatchId: 'b1' }) }, space, ALICE)
    expect(draft.body).toMatchObject({ kind: 'tx_created', importBatchId: 'b1' })
    expect(draft.push).toBeNull()
  })
})

describe('buildTransactionEvents — update', () => {
  it('T2: a material edit pushes, with the share before and after', () => {
    const after = makeTx({ totalAmount: 100, paidBy: [split('mA', 100)], beneficiaries: [split('mA', 50), split('mB', 50)] })
    const [draft] = buildTransactionEvents({ type: 'update', before: makeTx(), after }, space, ALICE)
    expect(draft.body).toMatchObject({
      kind: 'tx_edited',
      material: true,
      myShareBefore: { paid: 0, owed: 42 },
      myShare: { paid: 0, owed: 50 },
      before: { totalAmount: 84 },
    })
    expect(draft.body.changedFields).toEqual(['totalAmount', 'paidBy', 'beneficiaries'])
    expect(draft.push).not.toBeNull()
  })

  it('T3: a cosmetic edit is feed only', () => {
    const after = makeTx({ cosmetic: { name: 'Sushi', date: '14-11-2026', category: '🍽️ Food' } })
    const [draft] = buildTransactionEvents({ type: 'update', before: makeTx(), after }, space, ALICE)
    expect(draft.body).toMatchObject({ kind: 'tx_edited', material: false, changedFields: ['name'] })
    expect(draft.push).toBeNull()
  })

  it('T5: a member dropped from the split is told (recipients = before ∪ after)', () => {
    // Bob is replaced by Carol.
    const after = makeTx({ beneficiaries: [split('mA', 42), split('mC', 42)] })
    const drafts = buildTransactionEvents({ type: 'update', before: makeTx(), after }, space, ALICE)
    expect(recipients(drafts)).toEqual(['uB', 'uC'])

    const bob = drafts.find((d) => d.recipientUid === 'uB')!
    expect(bob.body).toMatchObject({ kind: 'tx_removed_from_split', myShareBefore: { owed: 42 }, myShare: { paid: 0, owed: 0 } })
    expect(bob.push).not.toBeNull()

    const carol = drafts.find((d) => d.recipientUid === 'uC')!
    expect(carol.body).toMatchObject({ kind: 'tx_edited', material: true, myShareBefore: { paid: 0, owed: 0 }, myShare: { owed: 42 } })
    expect(carol.push).not.toBeNull()
  })

  it('writes nothing when no visible field changed', () => {
    const drafts = buildTransactionEvents(
      { type: 'update', before: makeTx(), after: makeTx({ lastModifiedBy: 'uA' }) },
      space,
      ALICE,
    )
    expect(drafts).toEqual([])
  })

  it('§7: a re-import that rewrites a row (new importBatchId) does not push', () => {
    const after = makeTx({ totalAmount: 90, importBatchId: 'b2' })
    const [draft] = buildTransactionEvents({ type: 'update', before: makeTx({ importBatchId: 'b1' }), after }, space, ALICE)
    expect(draft.body).toMatchObject({ kind: 'tx_edited', material: true, importBatchId: 'b2' })
    expect(draft.push).toBeNull()
  })

  it('§7: a later manual edit of an imported row notifies normally', () => {
    const before = makeTx({ importBatchId: 'b1' })
    const after = makeTx({ totalAmount: 90, importBatchId: 'b1' })
    const [draft] = buildTransactionEvents({ type: 'update', before, after }, space, ALICE)
    expect(draft.push).not.toBeNull()
  })
})

describe('buildTransactionEvents — delete', () => {
  it('T4: involved members are told, with the share they had', () => {
    const [draft] = buildTransactionEvents({ type: 'delete', before: makeTx() }, space, ALICE)
    expect(draft).toMatchObject({
      recipientUid: 'uB',
      body: { kind: 'tx_deleted', tx: { name: 'Dinner' }, myShareBefore: { paid: 0, owed: 42 }, myShare: { paid: 0, owed: 0 } },
    })
    expect(draft.push).not.toBeNull()
  })

  it('never notifies the person who deleted it', () => {
    const drafts = buildTransactionEvents({ type: 'delete', before: makeTx() }, space, { uid: 'uB', name: 'Bob' })
    expect(recipients(drafts)).toEqual(['uA'])
  })
})
