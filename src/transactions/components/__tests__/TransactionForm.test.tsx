// TransactionForm.test.tsx — component tests for the config-driven form
// (Space refactor Phase 5). Mocks the service layer; no Firestore involved.

import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { TransactionForm } from '../TransactionForm'
import { getSpaceConfig } from '@/spaces/config'
import type { Space, SpaceConfig, SpaceMember } from '@/spaces/types'
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
