/** Space/member, invite and import events (spaces.ts, invites.ts, imports.ts). */
import { describe, expect, it } from 'vitest'
import { SOCIAL_THROTTLE_KEY, type InviteForEvents } from '../model'
import { ALICE, makeSpace, makeTx, split } from '../testing/fixtures'
import { buildImportEvents } from './imports'
import { buildInviteAcceptedEvents, buildInviteCreatedEvents } from './invites'
import { buildSpaceDeletedEvents, buildSpaceUpdateEvents } from './spaces'

const recipients = (drafts: { recipientUid: string }[]) => drafts.map((d) => d.recipientUid).sort()

describe('buildSpaceUpdateEvents', () => {
  // Erin accepts an invite: a new claimed slot and a new entry in memberUids.
  const before = makeSpace()
  const afterJoin = makeSpace({
    members: [...before.members, { travelMemberId: 'mE', displayName: 'Erin', userId: 'uE' }],
    memberUids: ['uA', 'uB', 'uC', 'uE'],
    pendingInviteId: 'inv1',
  })

  it('S4: a settings change produces nothing', () => {
    expect(buildSpaceUpdateEvents(before, makeSpace({ name: 'Japan 2026' }), null)).toEqual([])
  })

  it('claiming or renaming a slot is not an event', () => {
    const claimed = makeSpace({
      members: before.members.map((m) => (m.travelMemberId === 'mD' ? { ...m, userId: 'uC' } : m)),
    })
    expect(buildSpaceUpdateEvents(before, claimed, null)).toEqual([])
  })

  it('S1: the other members get member_joined in the feed, never the joiner', () => {
    const drafts = buildSpaceUpdateEvents(before, afterJoin, null)
    expect(recipients(drafts)).toEqual(['uA', 'uB', 'uC'])
    expect(drafts.every((d) => d.body.kind === 'member_joined' && d.body.actor.name === 'Erin')).toBe(true)
    expect(drafts.every((d) => d.push === null)).toBe(true)
  })

  it('F3a: only the inviter is pushed', () => {
    const drafts = buildSpaceUpdateEvents(before, afterJoin, 'uB')
    expect(drafts.filter((d) => d.push !== null).map((d) => d.recipientUid)).toEqual(['uB'])
  })

  it('S2: leaving unclaims the slot, so the name comes from the previous version', () => {
    const afterLeave = makeSpace({
      members: before.members.map((m) => (m.userId === 'uC' ? { ...m, userId: null } : m)),
      memberUids: ['uA', 'uB'],
    })
    const drafts = buildSpaceUpdateEvents(before, afterLeave, null)
    expect(recipients(drafts)).toEqual(['uA', 'uB'])
    expect(drafts[0]).toMatchObject({ body: { kind: 'member_left', actor: { uid: 'uC', name: 'Carol' } }, push: null })
  })

  it('falls back to the profile name for a subject without a slot', () => {
    const noSlot = makeSpace({ memberUids: ['uA', 'uB', 'uC', 'uZ'] })
    const [draft] = buildSpaceUpdateEvents(before, noSlot, null, { uZ: 'Zoe' })
    expect(draft.body.actor).toEqual({ uid: 'uZ', name: 'Zoe' })
  })
})

describe('buildSpaceDeletedEvents', () => {
  it('S3: one event per former member, not the actor', () => {
    const drafts = buildSpaceDeletedEvents(makeSpace(), ALICE)
    expect(recipients(drafts)).toEqual(['uB', 'uC'])
    expect(drafts[0]).toMatchObject({ body: { kind: 'space_deleted', space: { name: 'Japan' } } })
    expect(drafts.every((d) => d.push !== null)).toBe(true)
  })
})

describe('invite events', () => {
  const invite = (overrides: Partial<InviteForEvents> = {}): InviteForEvents => ({
    id: 'inv1',
    type: 'friend',
    fromUid: 'uA',
    fromDisplayName: 'Alice Martin',
    toUid: 'uB',
    status: 'active',
    usedBy: [],
    ...overrides,
  })

  it('F2: a targeted friend request notifies the target, with the profile name', () => {
    const [draft] = buildInviteCreatedEvents(invite())
    expect(draft).toMatchObject({
      recipientUid: 'uB',
      body: { kind: 'friend_request', actor: { uid: 'uA', name: 'Alice Martin' }, inviteId: 'inv1' },
      push: { throttleKey: SOCIAL_THROTTLE_KEY },
    })
    // No mute check: the recipient is not in any space for this event.
    expect(draft.push?.muteSpaceId).toBeUndefined()
  })

  it('F1: a targeted space invite carries the space and uses the social limiter key', () => {
    const [draft] = buildInviteCreatedEvents(
      invite({ type: 'travel_member', travelId: 'space1', travelName: 'Japan' }),
      '🇯🇵',
    )
    expect(draft).toMatchObject({
      recipientUid: 'uB',
      body: { kind: 'space_invite', space: { id: 'space1', name: 'Japan', emoji: '🇯🇵' }, inviteId: 'inv1' },
      push: { throttleKey: SOCIAL_THROTTLE_KEY },
    })
  })

  it('a shareable link (no target) notifies nobody', () => {
    expect(buildInviteCreatedEvents(invite({ toUid: undefined }))).toEqual([])
  })

  it('F3b: accepting a friend invite tells the sender, feed only', () => {
    const drafts = buildInviteAcceptedEvents(invite(), invite({ status: 'accepted', usedBy: ['uB'] }), { uB: 'Bob Stone' })
    expect(drafts).toEqual([
      {
        recipientUid: 'uA',
        body: { kind: 'friend_request_accepted', actor: { uid: 'uB', name: 'Bob Stone' }, inviteId: 'inv1' },
        push: null,
      },
    ])
  })

  it('F3b: only NEW accepters of a multi-use link count', () => {
    const before = invite({ toUid: undefined, usedBy: ['uB'] })
    const after = invite({ toUid: undefined, usedBy: ['uB', 'uC'] })
    const drafts = buildInviteAcceptedEvents(before, after, { uC: 'Carol' })
    expect(drafts.map((d) => d.body.actor.uid)).toEqual(['uC'])
  })

  it('a declined request or an accepted SPACE invite produces nothing here', () => {
    expect(buildInviteAcceptedEvents(invite(), invite({ status: 'declined' }), {})).toEqual([])
    const spaceInvite = invite({ type: 'travel_member', travelId: 'space1' })
    expect(buildInviteAcceptedEvents(spaceInvite, { ...spaceInvite, usedBy: ['uB'] }, { uB: 'Bob' })).toEqual([])
  })
})

describe('buildImportEvents (§7)', () => {
  const rows = [
    makeTx({ id: 't1', importBatchId: 'b1' }), // Alice + Bob
    makeTx({ id: 't2', importBatchId: 'b1', beneficiaries: [split('mA', 42), split('mC', 42)] }), // Alice + Carol
    makeTx({ id: 't3', importBatchId: 'b1' }), // Alice + Bob
    makeTx({ id: 't4', importBatchId: 'b1', beneficiaries: [split('mD', 84)] }), // Alice + unclaimed Dave
  ]

  it('one summary per involved member, with their own count, never the importer', () => {
    const drafts = buildImportEvents('b1', rows, makeSpace(), ALICE)
    expect(recipients(drafts)).toEqual(['uB', 'uC'])
    const bob = drafts.find((d) => d.recipientUid === 'uB')!
    expect(bob.body).toMatchObject({
      kind: 'import_completed',
      importBatchId: 'b1',
      import: { rowCount: 4, involvingMe: 2 },
    })
    expect(bob.push).toEqual({ throttleKey: 'space1', muteSpaceId: 'space1' })
    expect(drafts.find((d) => d.recipientUid === 'uC')!.body.import).toEqual({ rowCount: 4, involvingMe: 1 })
  })

  it('an import that involves nobody else notifies nobody', () => {
    const own = [makeTx({ beneficiaries: [split('mA', 84)] })]
    expect(buildImportEvents('b1', own, makeSpace(), ALICE)).toEqual([])
  })
})
