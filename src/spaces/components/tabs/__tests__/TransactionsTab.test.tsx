// TransactionsTab.test.tsx — Space refactor Phase 6.
//
// Component-level coverage for the config-driven filter panel, the stale-filter
// behaviour and the "no match" empty state. Firestore is mocked away: nothing
// here touches the network, and the import/export dialogs are stubbed since
// they are irrelevant to filtering.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TransactionsTab } from '../TransactionsTab'
import { configFromPreset } from '@/spaces/presets'
import type { CustomFieldDef, Space, SpaceConfig } from '@/spaces/types'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'

vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('@/shared/components/ImportXlsxDialog', () => ({ ImportXlsxDialog: () => null }))
vi.mock('@/shared/utils/sheetExport', () => ({ exportSpaceToXlsx: vi.fn() }))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSpace(config?: SpaceConfig): Space {
  return {
    spaceId: 's1',
    name: 'Japan 2026',
    members: [
      { travelMemberId: 'm1', displayName: 'Alice', userId: 'u1', allowRename: true, joinedAt: null as never },
      { travelMemberId: 'm2', displayName: 'Bob', userId: 'u2', allowRename: true, joinedAt: null as never },
    ],
    memberUids: ['u1', 'u2'],
    createdBy: 'u1',
    createdAt: null as never,
    currencies: ['EUR', 'JPY'],
    mainCurrency: 'EUR',
    categories: [{ id: 'c1', label: 'Food', emoji: '🍽️' }],
    paymentMethods: [{ id: 'p1', label: 'Cash' }],
    countries: [],
    cities: [],
    archivedByUids: [],
    ...(config ? { config } : {}),
  }
}

function makeTx(txId: string, overrides: Partial<TransactionWithStatus> = {}): TransactionWithStatus {
  return {
    txId,
    date: '01-03-2026',
    name: `Tx ${txId}`,
    totalAmount: 10,
    currency: 'EUR',
    exchangeRate: 1,
    totalAmountMain: 10,
    category: 'Food',
    paymentMethod: 'Cash',
    country: '🇯🇵 Japan',
    city: 'Tokyo',
    paidBy: [{ travelMemberId: 'm1', amount: 10 }],
    beneficiaries: [{ travelMemberId: 'm1', amount: 10 }],
    createdBy: { type: 'user', uid: 'u1' },
    createdAt: null as never,
    lastModifiedAt: null as never,
    lastModifiedBy: 'u1',
    isPending: false,
    ...overrides,
  } as TransactionWithStatus
}

function renderTab(space: Space, transactions: TransactionWithStatus[], isSolo = false) {
  return render(
    <TransactionsTab
      space={space}
      transactions={transactions}
      loading={false}
      error={null}
      currentUserUid="u1"
      isSolo={isSolo}
      mainCurrency="EUR"
      onAddExpense={vi.fn()}
      onEditTransaction={vi.fn()}
      onDeleteTransaction={vi.fn()}
    />,
  )
}

/** Opens the filter panel (closed by default) and returns its chip buttons. */
function openFilters() {
  fireEvent.click(screen.getByRole('button', { name: /Filter/ }))
}

/** Names of the dimension chips currently offered. */
function chipNames(): string[] {
  return ['Type', 'Category', 'Currency', 'Country', 'City', 'Payment', 'Paid by', 'For', 'Project', 'Billable']
    .filter((name) => screen.queryByRole('button', { name }) !== null)
}

const selectField: CustomFieldDef = {
  id: 'f_project',
  label: 'Project',
  type: 'select',
  options: [
    { id: 'o_a', label: 'Alpha' },
    { id: 'o_b', label: 'Beta' },
  ],
  enabled: true,
}

const booleanField: CustomFieldDef = {
  id: 'f_billable',
  label: 'Billable',
  type: 'boolean',
  enabled: true,
}

// ---------------------------------------------------------------------------
// Legacy regression
// ---------------------------------------------------------------------------

describe('TransactionsTab — legacy space (no config)', () => {
  it('renders exactly the dimensions it did before the refactor', () => {
    renderTab(makeSpace(), [makeTx('t1'), makeTx('t2', { currency: 'JPY' })])
    openFilters()
    expect(chipNames()).toEqual(['Type', 'Category', 'Currency', 'Country', 'City', 'Payment', 'Paid by', 'For'])
  })

  it('shows the country flag in the day header', () => {
    renderTab(makeSpace(), [makeTx('t1')])
    expect(screen.getByText('🇯🇵')).toBeInTheDocument()
    expect(screen.getByText('Tokyo')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Config gating
// ---------------------------------------------------------------------------

describe('TransactionsTab — solo preset', () => {
  const soloSpace = makeSpace(configFromPreset('solo'))

  it('offers no country, city or currency filter', () => {
    renderTab(soloSpace, [makeTx('t1')], true)
    openFilters()
    expect(chipNames()).toEqual(['Type', 'Category', 'Payment'])
  })

  it('drops the flags and city from the day header', () => {
    renderTab(soloSpace, [makeTx('t1')], true)
    expect(screen.queryByText('🇯🇵')).not.toBeInTheDocument()
    expect(screen.queryByText('Tokyo')).not.toBeInTheDocument()
  })
})

describe('TransactionsTab — disabled built-in in the rows', () => {
  it('shows the category pill while the category field is on (positive control)', () => {
    renderTab(makeSpace(configFromPreset('group')), [makeTx('t1')])
    expect(screen.getByText('Food')).toBeInTheDocument()
  })

  it('hides the category pill when the category field is off', () => {
    const config: SpaceConfig = {
      ...configFromPreset('group'),
      builtInFields: { ...configFromPreset('group').builtInFields, category: false },
    }
    renderTab(makeSpace(config), [makeTx('t1')])
    expect(screen.queryByText('Food')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Custom fields as filter dimensions
// ---------------------------------------------------------------------------

describe('TransactionsTab — custom select filter', () => {
  const config: SpaceConfig = { ...configFromPreset('travel'), customFields: [selectField] }
  const txs = [
    makeTx('t1', { name: 'Alpha one', custom: { f_project: 'o_a' } }),
    makeTx('t2', { name: 'Alpha two', custom: { f_project: 'o_a' } }),
    makeTx('t3', { name: 'Beta one', custom: { f_project: 'o_b' } }),
    makeTx('t4', { name: 'Untagged' }),
  ]

  it('appears as a filter dimension and narrows the list to the tagged transactions', () => {
    renderTab(makeSpace(config), txs)
    openFilters()
    expect(chipNames()).toContain('Project')

    fireEvent.click(screen.getByRole('button', { name: 'Project' }))
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }))

    expect(screen.getByText('Alpha one')).toBeInTheDocument()
    expect(screen.getByText('Alpha two')).toBeInTheDocument()
    expect(screen.queryByText('Beta one')).not.toBeInTheDocument()
    expect(screen.queryByText('Untagged')).not.toBeInTheDocument()
  })

  it('filtering to an empty result shows the no-match state with a working clear action', () => {
    // Search for something no transaction matches, so the list empties out.
    renderTab(makeSpace(config), txs)
    openFilters()
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'zzzz' } })

    expect(screen.getByText(/No transactions match your filters/)).toBeInTheDocument()
    expect(screen.queryByText('Alpha one')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Clear all filters/ }))
    expect(screen.getByText('Alpha one')).toBeInTheDocument()
  })
})

describe('TransactionsTab — custom boolean filter (absent means false)', () => {
  const config: SpaceConfig = { ...configFromPreset('travel'), customFields: [booleanField] }
  const txs = [
    makeTx('t1', { name: 'Billed', custom: { f_billable: true } }),
    makeTx('t2', { name: 'Not billed', custom: { f_billable: false } }),
    makeTx('t3', { name: 'Legacy row' }), // saved before the field existed
  ]

  it('"Yes" shows only the explicitly-true transaction', () => {
    renderTab(makeSpace(config), txs)
    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Billable' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))

    expect(screen.getByText('Billed')).toBeInTheDocument()
    expect(screen.queryByText('Not billed')).not.toBeInTheDocument()
    expect(screen.queryByText('Legacy row')).not.toBeInTheDocument()
  })

  it('"No" shows explicit false AND rows saved before the field existed', () => {
    renderTab(makeSpace(config), txs)
    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Billable' }))
    fireEvent.click(screen.getByRole('button', { name: 'No' }))

    expect(screen.getByText('Not billed')).toBeInTheDocument()
    expect(screen.getByText('Legacy row')).toBeInTheDocument()
    expect(screen.queryByText('Billed')).not.toBeInTheDocument()
  })
})

describe('TransactionsTab — notes are searchable', () => {
  it('matches on the notes field', () => {
    renderTab(makeSpace(), [
      makeTx('t1', { name: 'Hotel', notes: 'paid by Bob at reception' }),
      makeTx('t2', { name: 'Taxi' }),
    ])
    openFilters()
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'reception' } })

    expect(screen.getByText('Hotel')).toBeInTheDocument()
    expect(screen.queryByText('Taxi')).not.toBeInTheDocument()
  })

  it('does not search notes while the notes field is disabled', () => {
    const config: SpaceConfig = {
      ...configFromPreset('group'),
      builtInFields: { ...configFromPreset('group').builtInFields, notes: false },
    }
    renderTab(makeSpace(config), [
      makeTx('t1', { name: 'Hotel', notes: 'paid by Bob at reception' }),
      makeTx('t2', { name: 'Taxi' }),
    ])
    openFilters()
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'reception' } })

    expect(screen.getByText(/No transactions match your filters/)).toBeInTheDocument()
  })
})

describe('TransactionsTab — custom text fields feed the search box', () => {
  const config: SpaceConfig = {
    ...configFromPreset('travel'),
    customFields: [{ id: 'f_ref', label: 'Reference', type: 'text', enabled: true }],
  }

  it('matches on a custom text value, not just the transaction name', () => {
    renderTab(makeSpace(config), [
      makeTx('t1', { name: 'Hotel', custom: { f_ref: 'INV-4711' } }),
      makeTx('t2', { name: 'Taxi' }),
    ])
    openFilters()
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'inv-47' } })

    expect(screen.getByText('Hotel')).toBeInTheDocument()
    expect(screen.queryByText('Taxi')).not.toBeInTheDocument()
  })

  it('does not offer a text field as a filter dimension', () => {
    renderTab(makeSpace(config), [makeTx('t1')])
    openFilters()
    expect(screen.queryByRole('button', { name: 'Reference' })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Stale filters (§3)
// ---------------------------------------------------------------------------

describe('TransactionsTab — stale filters', () => {
  const enabled: SpaceConfig = { ...configFromPreset('travel'), customFields: [selectField] }
  const disabled: SpaceConfig = {
    ...configFromPreset('travel'),
    customFields: [{ ...selectField, enabled: false }],
  }
  const txs = [
    makeTx('t1', { name: 'Alpha one', custom: { f_project: 'o_a' } }),
    makeTx('t2', { name: 'Untagged' }),
  ]

  it('disabling a field with an active filter clears its chip and widens the results', () => {
    const { rerender } = renderTab(makeSpace(enabled), txs)
    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Project' }))
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    expect(screen.queryByText('Untagged')).not.toBeInTheDocument()

    // Same space, config changed in Parameters meanwhile.
    rerender(
      <TransactionsTab
        space={makeSpace(disabled)}
        transactions={txs}
        loading={false}
        error={null}
        currentUserUid="u1"
        isSolo={false}
        mainCurrency="EUR"
        onAddExpense={vi.fn()}
        onEditTransaction={vi.fn()}
        onDeleteTransaction={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Project' })).not.toBeInTheDocument()
    // No phantom narrowing: both transactions are back.
    expect(screen.getByText('Alpha one')).toBeInTheDocument()
    expect(screen.getByText('Untagged')).toBeInTheDocument()
  })

  it('deleting a filtered option drops it while sibling selections survive', () => {
    const both = [
      makeTx('t1', { name: 'Alpha one', custom: { f_project: 'o_a' } }),
      makeTx('t2', { name: 'Beta one', custom: { f_project: 'o_b' } }),
      makeTx('t3', { name: 'Untagged' }),
    ]
    const { rerender } = renderTab(makeSpace(enabled), both)
    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Project' }))
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }))
    expect(screen.queryByText('Untagged')).not.toBeInTheDocument()

    // "Beta" deleted from the field definition.
    const shrunk: SpaceConfig = {
      ...configFromPreset('travel'),
      customFields: [{ ...selectField, options: [{ id: 'o_a', label: 'Alpha' }] }],
    }
    rerender(
      <TransactionsTab
        space={makeSpace(shrunk)}
        transactions={both}
        loading={false}
        error={null}
        currentUserUid="u1"
        isSolo={false}
        mainCurrency="EUR"
        onAddExpense={vi.fn()}
        onEditTransaction={vi.fn()}
        onDeleteTransaction={vi.fn()}
      />,
    )

    // Alpha survives as an active filter; Beta is gone from both list and chips.
    expect(screen.getByText('Alpha one')).toBeInTheDocument()
    expect(screen.queryByText('Beta one')).not.toBeInTheDocument()
    expect(screen.queryByText('Untagged')).not.toBeInTheDocument()
  })

  it('renaming an option keeps the filter working and shows the new label', () => {
    const { rerender } = renderTab(makeSpace(enabled), txs)
    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Project' }))
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }))

    const renamed: SpaceConfig = {
      ...configFromPreset('travel'),
      customFields: [{ ...selectField, options: [
        { id: 'o_a', label: 'Alpha renamed' },
        { id: 'o_b', label: 'Beta' },
      ] }],
    }
    rerender(
      <TransactionsTab
        space={makeSpace(renamed)}
        transactions={txs}
        loading={false}
        error={null}
        currentUserUid="u1"
        isSolo={false}
        mainCurrency="EUR"
        onAddExpense={vi.fn()}
        onEditTransaction={vi.fn()}
        onDeleteTransaction={vi.fn()}
      />,
    )

    // Still filtered to the tagged transaction, and the chip shows the new label.
    expect(screen.getByText('Alpha one')).toBeInTheDocument()
    expect(screen.queryByText('Untagged')).not.toBeInTheDocument()
    const badges = screen.getByRole('button', { name: /Remove filter Alpha renamed/ })
    expect(within(badges.parentElement!).getByText(/Alpha renamed/)).toBeInTheDocument()
  })
})
