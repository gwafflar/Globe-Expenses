/**
 * Test fixtures: a small shared space with three people.
 *
 *   Alice  (slot mA, uid uA)   — usually the actor
 *   Bob    (slot mB, uid uB)
 *   Carol  (slot mC, uid uC)
 *   Dave   (slot mD, unclaimed: no account behind it)
 *
 * Excluded from the deployed build (see tsconfig.json).
 */
import type { ActorRef, SpaceForEvents, Split, TxForEvents } from '../model'

export const ALICE: ActorRef = { uid: 'uA', name: 'Alice' }

export function makeSpace(overrides: Partial<SpaceForEvents> = {}): SpaceForEvents {
  return {
    id: 'space1',
    name: 'Japan',
    emoji: '🇯🇵',
    members: [
      { travelMemberId: 'mA', displayName: 'Alice', userId: 'uA' },
      { travelMemberId: 'mB', displayName: 'Bob', userId: 'uB' },
      { travelMemberId: 'mC', displayName: 'Carol', userId: 'uC' },
      { travelMemberId: 'mD', displayName: 'Dave', userId: null },
    ],
    memberUids: ['uA', 'uB', 'uC'],
    ...overrides,
  }
}

export const split = (travelMemberId: string, amount: number): Split => ({ travelMemberId, amount })

/** Dinner, €84: Alice paid it all, Alice and Bob share it equally. */
export function makeTx(overrides: Partial<TxForEvents> = {}): TxForEvents {
  return {
    id: 'tx1',
    name: 'Dinner',
    type: 'expense',
    totalAmount: 84,
    currency: 'EUR',
    exchangeRate: 1,
    date: '14-11-2026',
    paidBy: [split('mA', 84)],
    beneficiaries: [split('mA', 42), split('mB', 42)],
    cosmetic: { name: 'Dinner', date: '14-11-2026', category: '🍽️ Food' },
    ...overrides,
  }
}
