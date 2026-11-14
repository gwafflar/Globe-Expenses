/** Limiter decision and notification text (limiter.ts, text.ts), plus event ids. */
import { describe, expect, it } from 'vitest'
import { assignEventIds } from '../activity/publish'
import { buildTransactionEvents } from '../events/transactions'
import { SOCIAL_THROTTLE_KEY, type ActivityBody } from '../model'
import { ALICE, makeSpace, makeTx, split } from '../testing/fixtures'
import { PUSH_LIMIT_N, PUSH_WINDOW_MS, decidePush, type ThrottleState } from './limiter'
import { buildFinalPushMessage, buildPushMessage, formatAmount } from './text'

describe('decidePush (§6.1)', () => {
  const T0 = 1_700_000_000_000

  it('first event ever: normal push, counter starts at 1', () => {
    expect(decidePush(null, T0)).toEqual({ decision: 'normal', next: { count: 1, lastEventAtMs: T0 } })
  })

  it('a burst: N normal pushes, one "more changes" push, then silence', () => {
    let state: ThrottleState | null = null
    const decisions: string[] = []
    for (let i = 0; i < 6; i++) {
      const r = decidePush(state, T0 + i * 1000) // one event per second
      decisions.push(r.decision)
      state = r.next
    }
    expect(PUSH_LIMIT_N).toBe(2)
    expect(decisions).toEqual(['normal', 'normal', 'final', 'none', 'none', 'none'])
  })

  it('the window is quiet-based: a continuous stream stays silent', () => {
    // An event every 50 s, each inside the window of the previous one.
    let state: ThrottleState | null = { count: 5, lastEventAtMs: T0 }
    for (let i = 1; i <= 4; i++) {
      const r = decidePush(state, T0 + i * 50_000)
      expect(r.decision).toBe('none')
      state = r.next
    }
  })

  it('lazy reset: after WINDOW with no event, the next one pushes normally', () => {
    const r = decidePush({ count: 9, lastEventAtMs: T0 }, T0 + PUSH_WINDOW_MS + 1)
    expect(r).toEqual({ decision: 'normal', next: { count: 1, lastEventAtMs: T0 + PUSH_WINDOW_MS + 1 } })
  })

  it('exactly at the window edge the burst is still on', () => {
    expect(decidePush({ count: 9, lastEventAtMs: T0 }, T0 + PUSH_WINDOW_MS).decision).toBe('none')
  })

  it('reset on open: the client wrote count 0, so the next event pushes normally', () => {
    // merge write: lastEventAt is kept, count is back to 0
    expect(decidePush({ count: 0, lastEventAtMs: T0 }, T0 + 1000).decision).toBe('normal')
    // document created by the reset itself: no lastEventAt at all
    expect(decidePush({ count: 0, lastEventAtMs: null }, T0).decision).toBe('normal')
  })
})

describe('formatAmount', () => {
  it('drops the decimals of a round amount', () => {
    expect(formatAmount(84, 'EUR')).toBe('€84')
    expect(formatAmount(41.5, 'EUR')).toBe('€41.50')
    expect(formatAmount(33.333, 'USD')).toBe('$33.33')
  })

  it('falls back to "amount CODE" for a code Intl rejects', () => {
    expect(formatAmount(12, 'not-a-code')).toBe('12 not-a-code')
    expect(formatAmount(12, '')).toBe('12')
  })
})

describe('buildPushMessage', () => {
  const space = makeSpace()
  const bodyFor = (drafts: { body: ActivityBody }[]) => buildPushMessage(drafts[0].body)

  it('tx_created: who, what, how much, and my share; opens the transaction', () => {
    const msg = bodyFor(buildTransactionEvents({ type: 'create', after: makeTx() }, space, ALICE))
    expect(msg).toEqual({
      title: '🇯🇵 Japan',
      body: 'Alice added Dinner (€84) · your share €42',
      url: '/spaces/space1?tx=tx1',
    })
  })

  it('tx_created for the payer mentions what they paid', () => {
    const msg = bodyFor(buildTransactionEvents({ type: 'create', after: makeTx() }, space, { uid: 'uB', name: 'Bob' }))
    expect(msg.body).toBe('Bob added Dinner (€84) · you paid €84, your share €42')
  })

  it('transfer_received, recorded by the sender or by a third party', () => {
    const transfer = makeTx({ type: 'transfer', totalAmount: 50, paidBy: [split('mA', 50)], beneficiaries: [split('mB', 50)] })
    expect(bodyFor(buildTransactionEvents({ type: 'create', after: transfer }, space, ALICE)).body).toBe(
      'Alice recorded a payment of €50 to you',
    )
    const byCarol = buildTransactionEvents({ type: 'create', after: transfer }, space, { uid: 'uC', name: 'Carol' })
    const toBob = byCarol.find((d) => d.recipientUid === 'uB')!
    expect(buildPushMessage(toBob.body).body).toBe('Carol recorded a payment of €50 from Alice to you')
  })

  it('tx_edited shows the share before → after', () => {
    const after = makeTx({ totalAmount: 100, paidBy: [split('mA', 100)], beneficiaries: [split('mA', 50), split('mB', 50)] })
    const msg = bodyFor(buildTransactionEvents({ type: 'update', before: makeTx(), after }, space, ALICE))
    expect(msg.body).toBe('Alice edited Dinner · your share €42 → €50')
  })

  it('tx_edited with an unchanged share shows the total before → after', () => {
    // Total goes up but Bob's part stays 42.
    const after = makeTx({ totalAmount: 100, paidBy: [split('mA', 100)], beneficiaries: [split('mA', 58), split('mB', 42)] })
    const msg = bodyFor(buildTransactionEvents({ type: 'update', before: makeTx(), after }, space, ALICE))
    expect(msg.body).toBe('Alice edited Dinner (€84 → €100)')
  })

  it('tx_edited that brings the reader into the split reads as "added you"', () => {
    const after = makeTx({ beneficiaries: [split('mA', 28), split('mB', 28), split('mC', 28)] })
    const drafts = buildTransactionEvents({ type: 'update', before: makeTx(), after }, space, ALICE)
    const carol = drafts.find((d) => d.recipientUid === 'uC')!
    expect(buildPushMessage(carol.body).body).toBe('Alice added you to Dinner (€84) · your share €28')
  })

  it('tx_removed_from_split', () => {
    const after = makeTx({ beneficiaries: [split('mA', 84)] })
    const msg = bodyFor(buildTransactionEvents({ type: 'update', before: makeTx(), after }, space, ALICE))
    expect(msg.body).toBe('Alice removed you from Dinner (€84)')
  })

  it('tx_deleted opens the space, not the dead transaction', () => {
    const msg = bodyFor(buildTransactionEvents({ type: 'delete', before: makeTx() }, space, ALICE))
    expect(msg).toEqual({
      title: '🇯🇵 Japan',
      body: 'Alice deleted Dinner (€84) · your share was €42',
      url: '/spaces/space1',
    })
  })

  it('space and social kinds', () => {
    const sp = { id: 'space1', name: 'Japan', emoji: '🇯🇵' }
    expect(buildPushMessage({ kind: 'member_joined', actor: { uid: 'uE', name: 'Erin' }, space: sp })).toEqual({
      title: '🇯🇵 Japan',
      body: 'Erin joined this space',
      url: '/spaces/space1',
    })
    expect(buildPushMessage({ kind: 'space_deleted', actor: ALICE, space: sp })).toEqual({
      title: 'GlobeExpenses',
      body: 'Alice deleted 🇯🇵 Japan',
      url: '/spaces',
    })
    expect(buildPushMessage({ kind: 'space_invite', actor: ALICE, space: sp, inviteId: 'inv1' })).toEqual({
      title: 'GlobeExpenses',
      body: 'Alice invited you to 🇯🇵 Japan',
      url: '/invite/inv1',
    })
    expect(buildPushMessage({ kind: 'friend_request', actor: ALICE, inviteId: 'inv1' })).toEqual({
      title: 'GlobeExpenses',
      body: 'Alice sent you a friend request',
      url: '/profile',
    })
  })

  it('import_completed: one line for the whole import (§7)', () => {
    const msg = buildPushMessage({
      kind: 'import_completed',
      actor: ALICE,
      space: { id: 'space1', name: 'Japan', emoji: '🇯🇵' },
      import: { rowCount: 120, involvingMe: 35 },
    })
    expect(msg.body).toBe('Alice imported 120 transactions, 35 involve you')
    expect(msg.url).toBe('/spaces/space1')
  })
})

describe('buildFinalPushMessage (§6.1)', () => {
  it('names the actor and the space, and opens the space', () => {
    const [draft] = buildTransactionEvents({ type: 'create', after: makeTx() }, makeSpace(), ALICE)
    expect(buildFinalPushMessage(draft.body, 'space1')).toEqual({
      title: '🇯🇵 Japan',
      body: 'Alice: more changes in 🇯🇵 Japan. Open the app to see them.',
      url: '/spaces/space1',
    })
  })

  it('social events get a generic message', () => {
    const msg = buildFinalPushMessage({ kind: 'friend_request', actor: ALICE }, SOCIAL_THROTTLE_KEY)
    expect(msg.url).toBe('/profile')
    expect(msg.body).toContain('invitations and requests')
  })
})

describe('assignEventIds (§3.2 idempotency)', () => {
  const draft = (recipientUid: string) => ({ recipientUid, body: { kind: 'tx_created' as const, actor: ALICE }, push: null })

  it('uses the trigger event id, so a redelivered trigger overwrites', () => {
    expect(assignEventIds('evt', [draft('uB'), draft('uC')])).toEqual(['evt', 'evt'])
  })

  it('suffixes extra entries for the same recipient', () => {
    expect(assignEventIds('evt', [draft('uB'), draft('uB'), draft('uC'), draft('uB')])).toEqual([
      'evt',
      'evt_2',
      'evt',
      'evt_3',
    ])
  })
})
