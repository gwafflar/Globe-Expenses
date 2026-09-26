// TransactionForm.test.tsx — component tests for the config-driven form
// (Space refactor Phase 5). Mocks the service layer; no Firestore involved.

import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { TransactionForm } from '../TransactionForm'
import { getSpaceConfig } from '@/spaces/config'
import type { Space, SpaceConfig, SpaceMember } from '@/spaces/types'
import type { TransactionWithStatus } from '@/transactions/hooks/useTransactions'
import { createTransaction, updateTransaction } from '@/transactions/services/transactionService'
import { ensureMultiCurrency } from '@/spaces/services/spaceService'

vi.mock('@/services/firebase', () => ({ db: {}, auth: {} }))

vi.mock('@/transactions/services/transactionService', () => ({
  createTransaction: vi.fn().mockReturnValue('new-tx-id'),
  updateTransaction: vi.fn(),
}))

vi.mock('@/spaces/services/spaceService', () => ({
  updateSpaceCurrencies: vi.fn().mockResolvedValue(undefined),
  updateSpaceList: vi.fn().mockResolvedValue(undefined),
  updateSpaceDefaultRate: vi.fn().mockResolvedValue(undefined),
  syncTransactionLocation: vi.fn().mockResolvedValue({ newCountry: null, newCity: null }),
  ensureMultiCurrency: vi.fn(),
}))

vi.mock('@/auth/store/useAuthStore', () => ({
  useAuthStore: () => ({
    currentUser: { uid: 'u1' },
    userProfile: { uid: 'u1', categories: ['Food'], paymentMethods: ['Cash'], mainCurrency: 'EUR' },
  }),
}))

function makeMember(overrides: Partial<SpaceMember> = {}): SpaceMember {
  return {
    travelMemberId: 'm1',
    displayName: 'Alice',
    userId: 'u1',
    allowRename: true,
    joinedAt: Timestamp.now(),
    ...overrides,
  }
}

function makeSpace(overrides: Partial<Space> = {}): Space {
  return {
    spaceId: 'space1',
    name: 'Test Space',
    members: [makeMember()],
    memberUids: ['u1'],
    createdBy: 'u1',
    createdAt: Timestamp.now(),
    currencies: ['EUR'],
    mainCurrency: 'EUR',
    categories: [],
    paymentMethods: [],
    countries: [],
    cities: [],
    archivedByUids: [],
    ...overrides,
  }
}

type FormProps = React.ComponentProps<typeof TransactionForm>

function renderForm(overrides: Partial<FormProps> = {}) {
  const space = overrides.space ?? makeSpace()
  const onSuccess = overrides.onSuccess ?? vi.fn()
  const onCancel = overrides.onCancel ?? vi.fn()
  return render(
    <TransactionForm
      spaceId={space.spaceId}
      space={space}
      members={space.members}
      mainCurrency={space.mainCurrency ?? 'EUR'}
      existingTransactions={[]}
      onSuccess={onSuccess}
      onCancel={onCancel}
      {...overrides}
    />,
  )
}

beforeEach(() => {
  vi.mocked(createTransaction).mockClear()
  vi.mocked(updateTransaction).mockClear()
  vi.mocked(ensureMultiCurrency).mockClear()
})

// ---------------------------------------------------------------------------
// Legacy space regression — no `config` at all
// ---------------------------------------------------------------------------

describe('TransactionForm — legacy space (no config)', () => {
  it('renders every field exactly as before (travel-mode defaults)', () => {
    const space = makeSpace({ members: [makeMember(), makeMember({ travelMemberId: 'm2', userId: 'u2', displayName: 'Bob' })] })
    renderForm({ space, members: space.members })

    expect(screen.getByPlaceholderText(/dinner, taxi, hotel night/i)).toBeInTheDocument()
    expect(screen.getByText('Country')).toBeInTheDocument()
    expect(screen.getByText('City')).toBeInTheDocument()
    expect(screen.getByText('Category')).toBeInTheDocument()
    expect(screen.getByText('Payment Method')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/any additional details/i)).toBeInTheDocument()
  })

  it('shows all four types in the selector once there are >= 2 members', () => {
    const space = makeSpace({ members: [makeMember(), makeMember({ travelMemberId: 'm2', userId: 'u2', displayName: 'Bob' })] })
    renderForm({ space, members: space.members })

    expect(screen.getByRole('button', { name: /💸 Expense/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /🤝 Transfer/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /🏧 Withdrawal/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /⚖️ Adjustment/ })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Solo space, wallets off
// ---------------------------------------------------------------------------

describe('TransactionForm — solo space, wallets off', () => {
  const soloConfig: SpaceConfig = {
    builtInFields: { country: false, city: false, category: true, paymentMethod: true, notes: true },
    features: { wallets: false, multiCurrency: false },
    customFields: [],
  }

  it('shows no type selector, no split section, no country/city', () => {
    const space = makeSpace({ config: soloConfig })
    renderForm({ space, members: space.members })

    // Only one type is available (expense) — the selector renders nothing.
    expect(screen.queryByRole('button', { name: /Expense/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Country')).not.toBeInTheDocument()
    expect(screen.queryByText('City')).not.toBeInTheDocument()
    // Solo CTA replaces the split editor — no "Paid by" row.
    expect(screen.queryByText('Paid by')).not.toBeInTheDocument()
    expect(screen.getByText(/share this expense with your friends/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Config-disabled built-ins keep their stored values (§4 invariant)
// ---------------------------------------------------------------------------

function makeTx(overrides: Partial<TransactionWithStatus> = {}): TransactionWithStatus {
  return {
    txId: 'tx1',
    isPending: false,
    date: '01-06-2026',
    name: 'Lunch',
    totalAmount: 10,
    currency: 'EUR',
    exchangeRate: 1,
    totalAmountMain: 10,
    paidBy: [{ travelMemberId: 'm1', amount: 10 }],
    beneficiaries: [{ travelMemberId: 'm1', amount: 10 }],
    createdBy: { type: 'user', uid: 'u1' },
    createdAt: Timestamp.now(),
    lastModifiedAt: Timestamp.now(),
    lastModifiedBy: 'u1',
    ...overrides,
  }
}

describe('TransactionForm — editing with built-in fields disabled in config', () => {
  // Every optional built-in turned OFF after the transactions were written.
  const strippedConfig: SpaceConfig = {
    builtInFields: { country: false, city: false, category: false, paymentMethod: false, notes: false },
    features: { wallets: false, multiCurrency: false },
    customFields: [],
  }

  it('preserves category / paymentMethod / country / city / notes instead of deleting them', () => {
    const space = makeSpace({ config: strippedConfig })
    const initialValues = makeTx({
      category: '🍔 Food',
      paymentMethod: '💵 Cash',
      country: 'Japan',
      city: 'Tokyo',
      notes: 'split with Bob',
    })
    renderForm({ space, members: space.members, initialValues })

    // Fix a typo in a field that IS still enabled, then save.
    fireEvent.change(screen.getByPlaceholderText(/dinner, taxi, hotel night/i), { target: { value: 'Dinner' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])

    expect(updateTransaction).toHaveBeenCalledTimes(1)
    const [, , payload] = vi.mocked(updateTransaction).mock.calls[0]
    expect(payload.name).toBe('Dinner')
    expect(payload.category).toBe('🍔 Food')
    expect(payload.paymentMethod).toBe('💵 Cash')
    expect(payload.country).toBe('Japan')
    expect(payload.city).toBe('Tokyo')
    expect(payload.notes).toBe('split with Bob')
  })

  it('still clears a field that does not apply to the transaction TYPE', () => {
    // Category is enabled here, but a withdrawal has no category (FIELD_TYPES),
    // so switching the type must clear it — this is the case the merge must NOT cover.
    const space = makeSpace({
      config: {
        builtInFields: { country: true, city: true, category: true, paymentMethod: true, notes: true },
        features: { wallets: true, multiCurrency: false },
        customFields: [],
      },
    })
    const initialValues = makeTx({ category: '🍔 Food', paymentMethod: '💵 Cash', type: 'withdrawal' })
    renderForm({ space, members: space.members, initialValues })

    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])

    const [, , payload] = vi.mocked(updateTransaction).mock.calls[0]
    expect(payload.category).toBeUndefined()
    // paymentMethod DOES apply to a withdrawal — untouched.
    expect(payload.paymentMethod).toBe('💵 Cash')
  })

  it('clears a value the user actually blanked while the field is enabled', () => {
    const space = makeSpace({
      config: {
        builtInFields: { country: true, city: true, category: true, paymentMethod: true, notes: true },
        features: { wallets: false, multiCurrency: false },
        customFields: [],
      },
    })
    const initialValues = makeTx({ notes: 'to be removed' })
    renderForm({ space, members: space.members, initialValues })

    fireEvent.change(screen.getByPlaceholderText(/any additional details/i), { target: { value: '' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])

    const [, , payload] = vi.mocked(updateTransaction).mock.calls[0]
    expect(payload.notes).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Custom fields
// ---------------------------------------------------------------------------

describe('TransactionForm — custom select field', () => {
  const configWithCustomField: SpaceConfig = {
    builtInFields: { country: true, city: true, category: true, paymentMethod: true, notes: true },
    features: { wallets: false, multiCurrency: true },
    customFields: [
      {
        id: 'mood-def',
        label: 'Mood',
        type: 'select',
        enabled: true,
        options: [{ id: 'happy-opt', label: 'Happy' }, { id: 'sad-opt', label: 'Sad' }],
      },
    ],
  }

  it('renders the field with its options and saves the option id, not the label', () => {
    const space = makeSpace({ config: configWithCustomField })
    const onSuccess = vi.fn()
    renderForm({ space, members: space.members, onSuccess })

    expect(screen.getByText('Mood')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Happy' })).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/dinner, taxi, hotel night/i), { target: { value: 'Lunch' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } })

    const moodSelect = screen.getByText('Mood').parentElement!.querySelector('select')!
    fireEvent.change(moodSelect, { target: { value: 'happy-opt' } })

    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])

    expect(createTransaction).toHaveBeenCalledTimes(1)
    const [, payload] = vi.mocked(createTransaction).mock.calls[0]
    expect(payload.custom).toEqual({ 'mood-def': 'happy-opt' })
  })

  it('pre-fills a new transaction from the most recent value for the field', () => {
    const space = makeSpace({ config: configWithCustomField })
    const recent = makeTx({ custom: { 'mood-def': 'sad-opt' } })
    renderForm({ space, members: space.members, existingTransactions: [recent] })

    const moodSelect = screen.getByText('Mood').parentElement!.querySelector('select')!
    expect(moodSelect.value).toBe('sad-opt')
  })

  it('does NOT pre-fill from an option deleted since that transaction was tagged', () => {
    const space = makeSpace({ config: configWithCustomField })
    // 'gone-opt' is no longer in the field definition.
    const stale = makeTx({ custom: { 'mood-def': 'gone-opt' } })
    renderForm({ space, members: space.members, existingTransactions: [stale] })

    // A dangling id would render the select blank AND be saved verbatim.
    const moodSelect = screen.getByText('Mood').parentElement!.querySelector('select')!
    expect(moodSelect.value).toBe('')

    fireEvent.change(screen.getByPlaceholderText(/dinner, taxi, hotel night/i), { target: { value: 'Lunch' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])

    const [, payload] = vi.mocked(createTransaction).mock.calls[0]
    expect(payload.custom).toBeUndefined()
  })

  it('falls back to the most recent transaction whose value still exists', () => {
    const space = makeSpace({ config: configWithCustomField })
    const stale = makeTx({ txId: 'tx-stale', custom: { 'mood-def': 'gone-opt' } })
    const valid = makeTx({ txId: 'tx-valid', custom: { 'mood-def': 'happy-opt' } })
    renderForm({ space, members: space.members, existingTransactions: [stale, valid] })

    const moodSelect = screen.getByText('Mood').parentElement!.querySelector('select')!
    expect(moodSelect.value).toBe('happy-opt')
  })
})

// ---------------------------------------------------------------------------
// Sticky multiCurrency upgrade
// ---------------------------------------------------------------------------

function ControlledForm({ initialSpace }: { initialSpace: Space }) {
  const [space, setSpace] = useState(initialSpace)
  return (
    <TransactionForm
      spaceId={space.spaceId}
      space={space}
      members={space.members}
      mainCurrency={space.mainCurrency ?? 'EUR'}
      existingTransactions={[]}
      onSuccess={() => {}}
      onCancel={() => {}}
      onMultiCurrencyUpgraded={() => setSpace((prev) => {
        const cfg = getSpaceConfig(prev)
        return { ...prev, config: { ...cfg, features: { ...cfg.features, multiCurrency: true } } }
      })}
    />
  )
}

describe('TransactionForm — single-currency space (multiCurrency off)', () => {
  const singleCurrencyConfig: SpaceConfig = {
    builtInFields: { country: true, city: true, category: true, paymentMethod: true, notes: true },
    features: { wallets: false, multiCurrency: false },
    customFields: [],
  }

  it('replaces the currency pill with the inline control', () => {
    const space = makeSpace({ config: singleCurrencyConfig })
    renderForm({ space, members: space.members })
    expect(screen.getByText(/\+ other currency/i)).toBeInTheDocument()
  })

  it('picking a foreign currency calls ensureMultiCurrency and reveals the full currency UI', () => {
    const space = makeSpace({ config: singleCurrencyConfig })
    render(<ControlledForm initialSpace={space} />)

    fireEvent.click(screen.getByText(/\+ other currency/i))
    fireEvent.click(screen.getByText('USD'))

    expect(ensureMultiCurrency).toHaveBeenCalledTimes(1)
    // The inline control is gone — the full pill UI has taken over.
    expect(screen.queryByText(/\+ other currency/i)).not.toBeInTheDocument()
  })

  it('still stores exchangeRate: 1 and totalAmountMain === totalAmount when saved in the main currency', () => {
    const space = makeSpace({ config: singleCurrencyConfig })
    renderForm({ space, members: space.members })

    fireEvent.change(screen.getByPlaceholderText(/dinner, taxi, hotel night/i), { target: { value: 'Lunch' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])

    expect(createTransaction).toHaveBeenCalledTimes(1)
    const [, payload] = vi.mocked(createTransaction).mock.calls[0]
    expect(payload.exchangeRate).toBe(1)
    expect(payload.totalAmountMain).toBe(payload.totalAmount)
  })
})
