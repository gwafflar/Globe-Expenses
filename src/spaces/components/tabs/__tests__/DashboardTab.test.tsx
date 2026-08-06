// DashboardTab.test.tsx — Space refactor Phase 7a.
//
// Component-level coverage for: card gating, the global controls, the generic
// breakdown card, the card builder, and the drill-down payload. Firestore is
// mocked away — nothing here touches the network.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DashboardTab } from '../DashboardTab'
import { configFromPreset } from '@/spaces/presets'
import type { CustomFieldDef, DashboardCardDef, Space, SpaceConfig } from '@/spaces/types'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'

vi.mock('@/services/firebase', () => ({ db: {} }))

// The card list is written fire-and-forget; the tests assert on the call.
const updateSpaceDashboardCards = vi.fn()
vi.mock('@/spaces/services/spaceService', () => ({
  updateSpaceDashboardCards: (...args: unknown[]) => updateSpaceDashboardCards(...args),
}))

// The reconciliation dialog pulls in Firestore write helpers we don't need here.
vi.mock('@/transactions/components/ReconciliationDialog', () => ({
  ReconciliationDialog: () => null,
}))

beforeEach(() => {
  updateSpaceDashboardCards.mockClear()
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSpace(config?: SpaceConfig, soloMembers = false): Space {
  return {
    spaceId: 's1',
    name: 'Japan 2026',
    members: soloMembers
      ? [{ travelMemberId: 'm1', displayName: 'Alice', userId: 'u1', allowRename: true, joinedAt: null as never }]
      : [
          { travelMemberId: 'm1', displayName: 'Alice', userId: 'u1', allowRename: true, joinedAt: null as never },
          { travelMemberId: 'm2', displayName: 'Bob', userId: 'u2', allowRename: true, joinedAt: null as never },
        ],
    memberUids: soloMembers ? ['u1'] : ['u1', 'u2'],
    createdBy: 'u1',
    createdAt: null as never,
    currencies: ['EUR'],
    mainCurrency: 'EUR',
    categories: [],
    paymentMethods: [{ id: 'p1', label: 'Cash' }],
    countries: [],
    cities: [],
    archivedByUids: [],
    ...(config ? { config } : {}),
  }
}

/** A transaction split 50/50 between Alice and Bob unless overridden. */
function makeTx(txId: string, overrides: Partial<TransactionWithStatus> = {}): TransactionWithStatus {
  const total = overrides.totalAmountMain ?? 100
  return {
    txId,
    date: '10-06-2026',
    name: `Tx ${txId}`,
    totalAmount: total,
    currency: 'EUR',
    exchangeRate: 1,
    totalAmountMain: total,
    category: 'Food',
    country: '🇯🇵 Japan',
    paymentMethod: 'Cash',
    paidBy: [{ travelMemberId: 'm1', amount: total }],
    beneficiaries: [
      { travelMemberId: 'm1', amount: total / 2 },
      { travelMemberId: 'm2', amount: total / 2 },
    ],
    createdBy: { type: 'user', uid: 'u1' },
    createdAt: null as never,
    lastModifiedAt: null as never,
    lastModifiedBy: 'u1',
    isPending: false,
    ...overrides,
  } as TransactionWithStatus
}

function renderDashboard(
  space: Space,
  transactions: TransactionWithStatus[],
  extra: Partial<React.ComponentProps<typeof DashboardTab>> = {},
) {
  const props = {
    space,
    transactions,
    currentUserUid: 'u1',
    isSolo: space.members.length === 1,
    mainCurrency: 'EUR',
    onEditTransaction: vi.fn(),
    ...extra,
  }
  return { ...render(<DashboardTab {...props} />), props }
}

/** The card whose header carries this title. */
function card(title: string): HTMLElement {
  const heading = screen.getByText(title)
  // CollapsibleCard: <div card> > <div header row> > <button> > <span title>
  return heading.closest('div.rounded-xl') as HTMLElement
}

/** Titles of every collapsible card currently rendered. */
function cardTitles(): string[] {
  return Array.from(document.querySelectorAll('div.rounded-xl > div > button[aria-expanded]'))
    .map((btn) => btn.querySelector('span')?.textContent ?? '')
}

/** The hero card's headline figure. Scoped, because the same amount also
 *  appears in card summaries and would otherwise match several elements. */
function heroTotal(): string {
  return document.querySelector('.text-3xl')?.textContent ?? ''
}

/** The hero card's heading ("Total spent" / "Your share" / "Bob's share"). */
function heroLabel(): string {
  return document.querySelector('.uppercase')?.textContent ?? ''
}

/** Open the member scope sheet and pick a row by its accessible name.
 *
 *  `hidden: true` because vaul's Drawer close is animated and jsdom runs no
 *  animation frames: after one selection the sheet stays mounted and keeps
 *  aria-hidden on the content behind it, so a second call in the same test
 *  would find nothing. Widening the query is harmless — only one node carries
 *  each of these accessible names. */
function selectScope(rowName: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Whose spending', hidden: true }))
  fireEvent.click(screen.getByRole('button', { name: rowName, hidden: true }))
}

// ---------------------------------------------------------------------------
// Legacy regression (§ acceptance criterion)
// ---------------------------------------------------------------------------

describe('DashboardTab — legacy space (no config)', () => {
  it('shows the wallet and currency cards, and defaults to All time / All', () => {
    renderDashboard(makeSpace(), [makeTx('t1'), makeTx('t2')])

    expect(cardTitles()).toContain('Wallet balances')
    expect(cardTitles()).toContain('Currencies')
    // Range defaults to all time — today's behaviour for a travel-shaped space.
    expect(screen.getByRole('button', { name: 'All time' })).toHaveAttribute('aria-pressed', 'true')
    // Member scope defaults to all members.
    expect(screen.getByRole('button', { name: 'Whose spending' })).toHaveTextContent('All')
  })

  it('shows the same total as before: the sum of totalAmountMain', () => {
    renderDashboard(makeSpace(), [makeTx('t1', { totalAmountMain: 100 }), makeTx('t2', { totalAmountMain: 42.5 })])
    expect(heroTotal()).toBe('€ 142.50')
    expect(screen.getByText(/2 transactions/)).toBeInTheDocument()
  })

  it('excludes transfers and withdrawals from the total', () => {
    renderDashboard(makeSpace(), [
      makeTx('t1', { totalAmountMain: 100 }),
      makeTx('t2', { totalAmountMain: 500, type: 'transfer' }),
      makeTx('t3', { totalAmountMain: 900, type: 'withdrawal' }),
    ])
    expect(heroTotal()).toBe('€ 100.00')
    expect(screen.getByText(/1 transaction[^s]/)).toBeInTheDocument()
  })

  it('renders the legacy default card set: category and country', () => {
    renderDashboard(makeSpace(), [makeTx('t1')])
    expect(cardTitles()).toContain('By category')
    expect(cardTitles()).toContain('By country')
  })
})

// ---------------------------------------------------------------------------
// The three cards that read scopedTxs without going through computeBreakdown.
//
// These had no assertions until now — their legacy parity rested on the
// argument that they consume the same transaction set they always did. Sound,
// but that is exactly the kind of by-construction reasoning that has already
// failed twice here (a mapping that type-checked while dropping `config`; a
// branch called dead that was live). The member-scope patch changed the
// attribution parameter every one of them reads, so they get assertions.
// ---------------------------------------------------------------------------

describe('DashboardTab — per-person and the two day cards', () => {
  /** Two days, two members, deliberately uneven splits so no two figures in
   *  the expected set coincide:
   *
   *    10-06  100  →  Alice 60, Bob 40
   *    11-06   50  →  Alice 20, Bob 30
   *    ─────────────────────────────────
   *    total  150  →  Alice 80, Bob 70
   *
   *  Alice pays for both, so the paid/consumed legs are distinguishable too. */
  const TXS = [
    makeTx('t1', {
      date: '10-06-2026',
      totalAmountMain: 100,
      beneficiaries: [
        { travelMemberId: 'm1', amount: 60 },
        { travelMemberId: 'm2', amount: 40 },
      ],
    }),
    makeTx('t2', {
      date: '11-06-2026',
      totalAmountMain: 50,
      beneficiaries: [
        { travelMemberId: 'm1', amount: 20 },
        { travelMemberId: 'm2', amount: 30 },
      ],
    }),
  ]

  it('Per person: the members\' shares sum to the hero total', () => {
    renderDashboard(makeSpace(), TXS)

    const perPerson = card('Per person')
    expect(perPerson.textContent).toContain('€ 80.00') // Alice consumed
    expect(perPerson.textContent).toContain('€ 70.00') // Bob consumed
    // The partition holds: 80 + 70 = 150, the figure in the hero.
    expect(heroTotal()).toBe('€ 150.00')
    // …and the paid leg is unchanged by any of this — Alice paid for both.
    expect(perPerson.textContent).toContain('paid € 150.00')
    expect(perPerson.textContent).toContain('paid € 0.00')
  })

  it('Per person: each row equals what that member\'s own scope selection shows', () => {
    // THE invariant tying the picker to the cards. Per person is computed from
    // scopedTxs via computeMemberStats; the hero comes from attributedAmount().
    // Two independent paths that must agree, for every member — if the member
    // -scope patch broke anything, it broke between these two numbers.
    renderDashboard(makeSpace(), TXS)

    expect(card('Per person').textContent).toContain('€ 80.00')
    selectScope('You')
    expect(heroTotal()).toBe('€ 80.00')
    expect(heroLabel()).toBe('Your share')

    selectScope('Bob')
    expect(heroTotal()).toBe('€ 70.00')
    expect(heroLabel()).toBe("Bob's share")
  })

  it('Spending over time: the card total matches the hero', () => {
    renderDashboard(makeSpace(), TXS)
    // Its summary is formatAmount(totalSpent) — the same figure as the hero,
    // which is what makes the bar chart trustworthy at a glance.
    expect(card('Spending over time').textContent).toContain('€ 150.00')
    expect(heroTotal()).toBe('€ 150.00')
  })

  it('Day by day: one row per day in range, newest first, totalling the hero', () => {
    // ⚠️ Pinning NEW behaviour, not legacy parity. This is the one card whose
    // numbers legitimately changed in Phase 7a: it used to own a "3 / 7 / 15
    // days" look-back pill, which §2 required lifting to the global control.
    // Being the only changed card makes it the likeliest to drift unnoticed.
    renderDashboard(makeSpace(), TXS)

    const dayCard = card('Day by day')
    expect(dayCard.textContent).toContain('2 days')

    const text = dayCard.textContent ?? ''
    expect(text).toContain('€ 100.00')
    expect(text).toContain('€ 50.00')
    // Newest first: 11-06 (50) is rendered above 10-06 (100).
    expect(text.indexOf('€ 50.00')).toBeLessThan(text.indexOf('€ 100.00'))
  })

  it('Day by day: follows the GLOBAL range rather than a per-card period', () => {
    // The regression this guards: reintroducing any card-local look-back window.
    vi.setSystemTime(new Date(2026, 5, 20)) // 20 June 2026
    try {
      renderDashboard(makeSpace(), [
        ...TXS,
        makeTx('old', { date: '10-05-2026', totalAmountMain: 900 }),
      ])
      expect(card('Day by day').textContent).toContain('3 days')

      fireEvent.click(screen.getByRole('button', { name: 'This month' }))
      // May drops out of the range, so its row disappears with it.
      expect(card('Day by day').textContent).toContain('2 days')
      expect(card('Day by day').textContent).not.toContain('€ 900.00')
      expect(heroTotal()).toBe('€ 150.00')
    } finally {
      vi.useRealTimers()
    }
  })
})

// ---------------------------------------------------------------------------
// Card gating (§3)
// ---------------------------------------------------------------------------

describe('DashboardTab — card gating', () => {
  it('hides the wallet card when features.wallets is off', () => {
    const config = configFromPreset('solo') // wallets: false
    renderDashboard(makeSpace(config, true), [makeTx('t1')])
    expect(cardTitles()).not.toContain('Wallet balances')
  })

  it('hides the currencies card when features.multiCurrency is off', () => {
    renderDashboard(makeSpace(configFromPreset('solo'), true), [makeTx('t1')])
    expect(cardTitles()).not.toContain('Currencies')
  })

  it('renders no member picker in a single-member space', () => {
    renderDashboard(makeSpace(configFromPreset('solo'), true), [makeTx('t1')])
    expect(screen.queryByRole('button', { name: 'Whose spending' })).toBeNull()
  })

  it('hides the country card and shows no "Uncategorized" fallback when the field is off', () => {
    // group preset: country off, category on.
    renderDashboard(makeSpace(configFromPreset('group')), [makeTx('t1')])
    expect(cardTitles()).toContain('By category')
    expect(cardTitles()).not.toContain('By country')
  })

  it('defaults a budget-shaped space to this month', () => {
    renderDashboard(makeSpace(configFromPreset('group')), [makeTx('t1')])
    expect(screen.getByRole('button', { name: 'This month' })).toHaveAttribute('aria-pressed', 'true')
  })
})

// ---------------------------------------------------------------------------
// Breakdown card behaviour (§4)
// ---------------------------------------------------------------------------

describe('DashboardTab — breakdown cards', () => {
  it('sorts rows by amount and shows a total in the header', () => {
    renderDashboard(makeSpace(), [
      makeTx('t1', { category: 'Food', totalAmountMain: 20 }),
      makeTx('t2', { category: 'Transport', totalAmountMain: 80 }),
    ])
    const categoryCard = card('By category')
    const rows = within(categoryCard).getAllByRole('button', { name: /^Show transactions for/ })
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Transport'),
      expect.stringContaining('Food'),
    ])
    expect(within(categoryCard).getByText('€ 100.00')).toBeInTheDocument()
  })

  it('collapses the tail into an Other row and pins the missing row last', () => {
    const txs = ['A', 'B', 'C', 'D', 'E', 'F'].map((c, i) =>
      makeTx(`t${i}`, { category: c, totalAmountMain: 100 - i }),
    )
    txs.push(makeTx('t-none', { category: undefined, totalAmountMain: 1 }))

    renderDashboard(makeSpace(), txs)
    const rows = within(card('By category')).getAllByRole('button', { name: /^Show transactions for/ })
    expect(rows[rows.length - 2].textContent).toContain('Other · 1 value')
    expect(rows[rows.length - 1].textContent).toContain('No category')
  })

  it('hides a card whose dimension is disabled, without deleting it', () => {
    const stored: DashboardCardDef[] = [{ id: 'c1', dimensions: ['country'], title: 'Where' }]
    const config: SpaceConfig = { ...configFromPreset('travel'), dashboardCards: stored }

    const { unmount } = renderDashboard(makeSpace(config), [makeTx('t1')])
    expect(cardTitles()).toContain('Where')
    unmount()

    const off: SpaceConfig = {
      ...config,
      builtInFields: { ...config.builtInFields, country: false },
    }
    const { unmount: unmount2 } = renderDashboard(makeSpace(off), [makeTx('t1')])
    expect(cardTitles()).not.toContain('Where')
    // Nothing was written — the card is still in the stored config.
    expect(updateSpaceDashboardCards).not.toHaveBeenCalled()
    expect(off.dashboardCards).toHaveLength(1)
    unmount2()

    // Re-enabling brings it back with its title intact.
    renderDashboard(makeSpace(config), [makeTx('t1')])
    expect(cardTitles()).toContain('Where')
  })

  it('breaks down on a custom select field, resolving option labels', () => {
    const field: CustomFieldDef = {
      id: 'f_leg',
      label: 'Trip leg',
      type: 'select',
      enabled: true,
      options: [{ id: 'o_n', label: 'North' }, { id: 'o_s', label: 'South' }],
    }
    const config: SpaceConfig = {
      ...configFromPreset('travel'),
      customFields: [field],
      dashboardCards: [{ id: 'c1', dimensions: ['f_leg'] }],
    }
    renderDashboard(makeSpace(config), [
      makeTx('t1', { custom: { f_leg: 'o_n' }, totalAmountMain: 10 }),
      makeTx('t2', { custom: { f_leg: 'o_s' }, totalAmountMain: 30 }),
    ])
    const legCard = card('By trip leg')
    expect(within(legCard).getByText('South')).toBeInTheDocument()
    expect(within(legCard).getByText('North')).toBeInTheDocument()
    // Stored as option ids, displayed as labels.
    expect(within(legCard).queryByText('o_n')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Controls (§2)
// ---------------------------------------------------------------------------

describe('DashboardTab — global controls', () => {
  it('selecting You changes every card total consistently', () => {
    // Alice (the current user) consumes half of each transaction.
    renderDashboard(makeSpace(), [
      makeTx('t1', { category: 'Food', totalAmountMain: 100 }),
      makeTx('t2', { category: 'Transport', totalAmountMain: 60 }),
    ])

    expect(heroTotal()).toBe('€ 160.00') // all members

    selectScope('You')

    // Hero halves…
    expect(heroTotal()).toBe('€ 80.00')
    expect(heroLabel()).toBe('Your share')
    // …and so does the breakdown card, whose rows still sum to the header.
    const categoryCard = card('By category')
    expect(within(categoryCard).getByText('€ 50.00')).toBeInTheDocument() // Food
    expect(within(categoryCard).getByText('€ 30.00')).toBeInTheDocument() // Transport
  })

  it('selecting another member scopes every card to that member', () => {
    // Bob is NOT the logged-in user. He consumes 30 of Food and 45 of Transport.
    renderDashboard(makeSpace(), [
      makeTx('t1', {
        category: 'Food',
        totalAmountMain: 100,
        beneficiaries: [
          { travelMemberId: 'm1', amount: 70 },
          { travelMemberId: 'm2', amount: 30 },
        ],
      }),
      makeTx('t2', {
        category: 'Transport',
        totalAmountMain: 60,
        beneficiaries: [
          { travelMemberId: 'm1', amount: 15 },
          { travelMemberId: 'm2', amount: 45 },
        ],
      }),
    ])

    selectScope('Bob')

    expect(heroTotal()).toBe('€ 75.00')
    expect(heroLabel()).toBe("Bob's share")
    const categoryCard = card('By category')
    expect(within(categoryCard).getByText('€ 45.00')).toBeInTheDocument() // Transport
    expect(within(categoryCard).getByText('€ 30.00')).toBeInTheDocument() // Food
    // Header total matches the rows.
    expect(within(categoryCard).getByText('€ 75.00')).toBeInTheDocument()
  })

  it('offers unclaimed members in the picker', () => {
    const space = makeSpace()
    space.members = [
      ...space.members,
      { travelMemberId: 'm3', displayName: 'Ghost', userId: null, allowRename: true, joinedAt: null as never },
    ]
    renderDashboard(space, [
      makeTx('t1', {
        totalAmountMain: 90,
        beneficiaries: [
          { travelMemberId: 'm1', amount: 30 },
          { travelMemberId: 'm3', amount: 60 },
        ],
      }),
    ])

    selectScope('Ghost')
    expect(heroTotal()).toBe('€ 60.00')
  })

  it('falls back to all members when the selected member is removed', () => {
    const withBob = makeSpace()
    const { rerender } = renderDashboard(withBob, [makeTx('t1', { totalAmountMain: 100 })])

    selectScope('Bob')
    expect(heroTotal()).toBe('€ 50.00')

    // Bob is removed by another member; the change arrives over onSnapshot.
    const withoutBob = makeSpace()
    withoutBob.members = withoutBob.members.filter((m) => m.travelMemberId !== 'm2')
    rerender(
      <DashboardTab
        space={withoutBob}
        transactions={[makeTx('t1', { totalAmountMain: 100 })]}
        currentUserUid="u1"
        isSolo={false}
        mainCurrency="EUR"
        onEditTransaction={vi.fn()}
      />,
    )

    expect(heroTotal()).toBe('€ 100.00')
    expect(heroLabel()).toBe('Total spent')
  })

  it('restricting the range excludes out-of-range transactions', () => {
    // "This month" relative to a fixed clock.
    vi.setSystemTime(new Date(2026, 5, 20))
    try {
      renderDashboard(makeSpace(), [
        makeTx('in', { date: '10-06-2026', totalAmountMain: 100 }),
        makeTx('out', { date: '10-05-2026', totalAmountMain: 900 }),
      ])
      expect(heroTotal()).toBe('€ 1000.00') // all time

      fireEvent.click(screen.getByRole('button', { name: 'This month' }))
      expect(heroTotal()).toBe('€ 100.00')
    } finally {
      vi.useRealTimers()
    }
  })
})

// ---------------------------------------------------------------------------
// Drill-down (§5)
// ---------------------------------------------------------------------------

describe('DashboardTab — drill-down', () => {
  it('carries the dimension key, the value AND the date range', () => {
    vi.setSystemTime(new Date(2026, 5, 20))
    try {
      const onDrillDown = vi.fn()
      renderDashboard(makeSpace(), [makeTx('t1', { category: 'Food' })], { onDrillDown })

      fireEvent.click(screen.getByRole('button', { name: 'This month' }))
      fireEvent.click(
        within(card('By category')).getByRole('button', { name: 'Show transactions for Food' }),
      )

      expect(onDrillDown).toHaveBeenCalledTimes(1)
      const payload = onDrillDown.mock.calls[0][0]
      expect(payload.dimensionKey).toBe('category')
      expect(payload.values).toEqual(['Food'])
      // Without the range, the filtered list would not sum to the tapped number.
      expect(payload.range.preset).toBe('month')
      expect(payload.range.from).toEqual(new Date(2026, 5, 1))
    } finally {
      vi.useRealTimers()
    }
  })

  it('deliberately does NOT carry the member selection', () => {
    // Intentional asymmetry: the transactions list has its own Paid-by / For
    // filters, and a row tapped under "Bob" should show every transaction
    // behind the number — Bob's share of a group dinner is not a transaction
    // of its own, so pre-filtering to him would hide the rows it came from.
    const onDrillDown = vi.fn()
    renderDashboard(makeSpace(), [makeTx('t1', { category: 'Food' })], { onDrillDown })

    selectScope('Bob')
    // `hidden: true` because the picker Drawer's close is animated and jsdom
    // runs no animation frames, so it is still mounted here and vaul keeps
    // aria-hidden on the page content behind it. Real browsers unmount it.
    fireEvent.click(
      within(card('By category')).getByRole('button', {
        name: 'Show transactions for Food',
        hidden: true,
      }),
    )

    const payload = onDrillDown.mock.calls[0][0]
    expect(Object.keys(payload).sort()).toEqual(['dimensionKey', 'range', 'values'])
    expect(payload.dimensionKey).toBe('category')
  })

  it('an Other row drills into every collapsed value at once', () => {
    const onDrillDown = vi.fn()
    const txs = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c, i) =>
      makeTx(`t${i}`, { category: c, totalAmountMain: 100 - i }),
    )
    renderDashboard(makeSpace(), txs, { onDrillDown })

    fireEvent.click(
      within(card('By category')).getByRole('button', { name: /Show transactions for Other/ }),
    )
    expect(onDrillDown.mock.calls[0][0].values.sort()).toEqual(['F', 'G'])
  })
})

// ---------------------------------------------------------------------------
// Card builder (§6)
// ---------------------------------------------------------------------------

describe('DashboardTab — card builder', () => {
  it('persists a new card to the shared space config', () => {
    const onSpaceChange = vi.fn()
    renderDashboard(makeSpace(), [makeTx('t1')], { onSpaceChange })

    fireEvent.click(screen.getByRole('button', { name: '+ Add card' }))
    fireEvent.click(screen.getByRole('button', { name: 'Payment' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add card' }))

    expect(updateSpaceDashboardCards).toHaveBeenCalledTimes(1)
    const [spaceId, cards] = updateSpaceDashboardCards.mock.calls[0]
    expect(spaceId).toBe('s1')
    // The legacy defaults are materialised alongside the new card, so a second
    // member sees exactly the same three cards.
    expect(cards.map((c: DashboardCardDef) => c.dimensions[0])).toEqual([
      'category',
      'country',
      'paymentMethod',
    ])
    // …and the local Space is updated optimistically.
    expect(onSpaceChange).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ dashboardCards: cards }) }),
    )
  })

  it('deletes a card without confirmation', () => {
    renderDashboard(makeSpace(), [makeTx('t1')])
    fireEvent.click(screen.getByRole('button', { name: 'Edit cards' }))

    const categoryCard = card('By category')
    fireEvent.click(within(categoryCard).getByRole('button', { name: 'Delete card' }))

    const cards = updateSpaceDashboardCards.mock.calls[0][1]
    expect(cards.map((c: DashboardCardDef) => c.dimensions[0])).toEqual(['country'])
  })

  it('reorders cards', () => {
    renderDashboard(makeSpace(), [makeTx('t1')])
    fireEvent.click(screen.getByRole('button', { name: 'Edit cards' }))

    fireEvent.click(within(card('By country')).getByRole('button', { name: 'Move card up' }))

    const cards = updateSpaceDashboardCards.mock.calls[0][1]
    expect(cards.map((c: DashboardCardDef) => c.dimensions[0])).toEqual(['country', 'category'])
  })

  it('offers only breakdownable dimensions — no members, no text fields', () => {
    const config: SpaceConfig = {
      ...configFromPreset('travel'),
      customFields: [{ id: 'f_ref', label: 'Reference', type: 'text', enabled: true }],
    }
    renderDashboard(makeSpace(config), [makeTx('t1')])
    fireEvent.click(screen.getByRole('button', { name: '+ Add card' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Category' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Reference' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Paid by' })).toBeNull()
  })
})
