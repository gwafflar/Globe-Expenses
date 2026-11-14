// src/spaces/pages/__tests__/SpaceDetailPage.test.tsx
//
// Prompt 04.3: SpaceDetailPage's space read moved from a one-shot getDoc()
// (server-first while online — misses a just-created, not-yet-synced doc) to
// an onSnapshot listener (cache-first — serves the local write immediately).
// These tests lock in the resulting exists()/fromCache decision table and
// the bounded offline guard, without a live Firestore.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { SpaceDetailPage } from '../SpaceDetailPage'

vi.mock('@/services/firebase', () => ({ db: {} }))

type NextCb = (snapshot: { exists: () => boolean; id: string; data: () => Record<string, unknown>; metadata: { fromCache: boolean } }) => void
type ErrorCb = (err: { code: string; message: string }) => void

const { mockOnSnapshot, subscriptions } = vi.hoisted(() => {
  const subscriptions: { onNext: NextCb; onError: ErrorCb; unsubscribe: ReturnType<typeof vi.fn> }[] = []
  const mockOnSnapshot = vi.fn((_ref: unknown, onNext: NextCb, onError: ErrorCb) => {
    const unsubscribe = vi.fn()
    subscriptions.push({ onNext, onError, unsubscribe })
    return unsubscribe
  })
  return { mockOnSnapshot, subscriptions }
})

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore')
  return {
    ...actual,
    doc: vi.fn(() => ({ __ref: 'space-doc' })),
    onSnapshot: mockOnSnapshot,
  }
})

vi.mock('@/spaces/services/spaceService', async () => {
  const actual = await vi.importActual<typeof import('@/spaces/services/spaceService')>('@/spaces/services/spaceService')
  return {
    ...actual,
    unarchiveSpace: vi.fn(),
    updateSpaceDefaultRate: vi.fn(),
  }
})

vi.mock('@/auth/store/useAuthStore', () => ({
  useAuthStore: () => ({
    currentUser: { uid: 'u1', email: 'alice@example.com' },
    userProfile: { displayName: 'Alice' },
  }),
}))

vi.mock('@/friends/hooks/usePendingInvites', () => ({
  usePendingInvites: () => ({ count: 0 }),
}))

vi.mock('@/transactions/hooks/useTransactions', () => ({
  useTransactions: () => ({ transactions: [], loading: false, error: null }),
}))

vi.mock('@/transactions/services/transactionService', () => ({
  deleteTransaction: vi.fn(),
}))

vi.mock('@/shared/components/InstallPromptBanner', () => ({
  InstallPromptBanner: () => null,
}))

vi.mock('@/transactions/components/TransactionForm', () => ({
  TransactionForm: () => null,
}))

vi.mock('@/spaces/components/SpaceTabs', () => ({
  SpaceTabs: ({ space }: { space: { name: string } }) => <div data-testid="space-tabs">{space.name}</div>,
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ spaceId: 'space1' }),
    useNavigate: () => mockNavigate,
  }
})

function current() {
  return subscriptions[subscriptions.length - 1]
}

function fakeExistingSnapshot(data: Record<string, unknown>) {
  return { exists: () => true, id: 'space1', data: () => data, metadata: { fromCache: false } }
}

function fakeMissingSnapshot(fromCache: boolean) {
  return { exists: () => false, id: 'space1', data: () => ({}), metadata: { fromCache } }
}

const minimalSpaceDoc = {
  name: 'Weekend trip',
  members: [],
  memberUids: ['u1'],
  createdBy: 'u1',
  createdAt: null,
  currencies: ['EUR'],
  categories: [],
  paymentMethods: [],
  countries: [],
  cities: [],
  archivedByUids: [],
}

beforeEach(() => {
  subscriptions.length = 0
  mockOnSnapshot.mockClear()
  mockNavigate.mockClear()
})

describe('SpaceDetailPage — space listener', () => {
  it('keeps the loading state when the cache has no document yet (fromCache: true)', () => {
    render(<SpaceDetailPage />)
    expect(subscriptions).toHaveLength(1)

    act(() => { current().onNext(fakeMissingSnapshot(true)) })

    expect(screen.getByText('Loading space…')).toBeInTheDocument()
    expect(screen.queryByText('Space not found')).not.toBeInTheDocument()
  })

  it('renders not-found once the server confirms the document is missing (fromCache: false)', () => {
    render(<SpaceDetailPage />)
    act(() => { current().onNext(fakeMissingSnapshot(false)) })

    expect(screen.getByText('Space not found')).toBeInTheDocument()
  })

  it('renders the space once the snapshot resolves to an existing document', () => {
    render(<SpaceDetailPage />)
    act(() => { current().onNext(fakeExistingSnapshot(minimalSpaceDoc)) })

    expect(screen.getByTestId('space-tabs')).toHaveTextContent('Weekend trip')
  })

  it('re-renders when a second snapshot carries updated fields (reactivity)', () => {
    render(<SpaceDetailPage />)
    act(() => { current().onNext(fakeExistingSnapshot(minimalSpaceDoc)) })
    expect(screen.getByTestId('space-tabs')).toHaveTextContent('Weekend trip')

    act(() => { current().onNext(fakeExistingSnapshot({ ...minimalSpaceDoc, name: 'Renamed by another member' })) })

    expect(screen.getByTestId('space-tabs')).toHaveTextContent('Renamed by another member')
  })

  it('detaches the listener on unmount and updates no state afterwards', () => {
    const { unmount } = render(<SpaceDetailPage />)
    const sub = current()
    unmount()

    expect(sub.unsubscribe).toHaveBeenCalledTimes(1)

    // A late-arriving snapshot after unmount must not throw — the `cancelled`
    // guard swallows it instead of setting state on an unmounted component.
    expect(() => sub.onNext(fakeExistingSnapshot(minimalSpaceDoc))).not.toThrow()
  })
})

describe('SpaceDetailPage — offline guard (fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the offline-aware not-found state after the 5s bound when stuck on a cache miss', async () => {
    render(<SpaceDetailPage />)
    act(() => { current().onNext(fakeMissingSnapshot(true)) })
    expect(screen.getByText('Loading space…')).toBeInTheDocument()

    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })

    expect(screen.getByText("Can't confirm this space")).toBeInTheDocument()
    expect(screen.queryByText('Space not found')).not.toBeInTheDocument()
  })

  it('does not fire the offline guard once the document is found before the timeout', async () => {
    render(<SpaceDetailPage />)
    act(() => { current().onNext(fakeExistingSnapshot(minimalSpaceDoc)) })
    expect(screen.getByTestId('space-tabs')).toBeInTheDocument()

    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })

    expect(screen.getByTestId('space-tabs')).toBeInTheDocument()
    expect(screen.queryByText("Can't confirm this space")).not.toBeInTheDocument()
  })
})
