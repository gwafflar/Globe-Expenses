// src/transactions/hooks/__tests__/useTransactions.test.ts
//
// Regression tests for the Prompt 04.2 fix: a freshly created space can
// briefly deny reads on its transactions subcollection because createSpace()
// is fire-and-forget (spaceService.ts) and the subcollection security rule
// get()s the not-yet-synced parent doc. useTransactions() retries
// 'permission-denied' a bounded number of times before surfacing an error;
// every other error code surfaces immediately.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTransactions } from '../useTransactions'

vi.mock('@/services/firebase', () => ({ db: {} }))

type NextCb = (snapshot: { docs: unknown[] }) => void
type ErrorCb = (err: { code: string; message: string }) => void

const { mockOnSnapshot, subscriptions } = vi.hoisted(() => {
  const subscriptions: { onNext: NextCb; onError: ErrorCb; unsubscribe: ReturnType<typeof vi.fn> }[] = []
  const mockOnSnapshot = vi.fn(
    (_q: unknown, _opts: unknown, onNext: NextCb, onError: ErrorCb) => {
      const unsubscribe = vi.fn()
      subscriptions.push({ onNext, onError, unsubscribe })
      return unsubscribe
    },
  )
  return { mockOnSnapshot, subscriptions }
})

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore')
  return {
    ...actual,
    collection: vi.fn(() => ({ __ref: 'collection' })),
    query: vi.fn((ref: unknown) => ref),
    orderBy: vi.fn(),
    onSnapshot: mockOnSnapshot,
  }
})

function emptySnapshot() {
  return { docs: [] }
}

function current() {
  return subscriptions[subscriptions.length - 1]
}

beforeEach(() => {
  subscriptions.length = 0
  mockOnSnapshot.mockClear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useTransactions — permission-denied retry', () => {
  it('retries once on permission-denied then succeeds, without surfacing an error', async () => {
    const { result } = renderHook(() => useTransactions('space1'))

    expect(mockOnSnapshot).toHaveBeenCalledTimes(1)
    act(() => {
      current().onError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' })
    })

    // No error surfaced during the backoff window — still loading.
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(true)

    await act(async () => { await vi.advanceTimersByTimeAsync(250) })

    // A fresh onSnapshot subscription was attached for the retry.
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2)
    act(() => {
      current().onNext(emptySnapshot())
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('surfaces a different error code immediately, with no retry', () => {
    const { result } = renderHook(() => useTransactions('space1'))

    act(() => {
      current().onError({ code: 'unavailable', message: 'Network unreachable.' })
    })

    expect(result.current.error).toContain('unavailable')
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1) // no retry attempt
  })

  it('surfaces an error after exhausting the retry budget (3 attempts)', async () => {
    const { result } = renderHook(() => useTransactions('space1'))

    // Attempt 1 fails → retry scheduled at 250ms
    act(() => { current().onError({ code: 'permission-denied', message: 'denied' }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2)

    // Attempt 2 fails → retry scheduled at 1000ms
    act(() => { current().onError({ code: 'permission-denied', message: 'denied' }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(mockOnSnapshot).toHaveBeenCalledTimes(3)

    // Attempt 3 fails → retry scheduled at 2000ms
    act(() => { current().onError({ code: 'permission-denied', message: 'denied' }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(mockOnSnapshot).toHaveBeenCalledTimes(4)

    // Attempt 4 fails → budget exhausted, surfaces as a real error
    act(() => { current().onError({ code: 'permission-denied', message: 'denied' }) })

    expect(result.current.error).toContain('permission-denied')
    expect(mockOnSnapshot).toHaveBeenCalledTimes(4) // no further retry
  })

  it('unmounting mid-backoff clears the timer, detaches the listener, and updates no state', async () => {
    const { result, unmount } = renderHook(() => useTransactions('space1'))

    act(() => { current().onError({ code: 'permission-denied', message: 'denied' }) })
    const sub = current()
    unmount()

    // The listener that was live at unmount time must be detached.
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1)

    // Let the backoff timer elapse — subscribe() must not run again, and no
    // state update should reach the (now unmounted) hook instance.
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1) // never re-attached
    expect(result.current.loading).toBe(true) // frozen at its last value, untouched
  })

  it('resets the attempt counter when spaceId changes', async () => {
    const { rerender } = renderHook(({ spaceId }) => useTransactions(spaceId), {
      initialProps: { spaceId: 'space1' },
    })

    // Exhaust space1's retry budget.
    act(() => { current().onError({ code: 'permission-denied', message: 'denied' }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    act(() => { current().onError({ code: 'permission-denied', message: 'denied' }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    act(() => { current().onError({ code: 'permission-denied', message: 'denied' }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(mockOnSnapshot).toHaveBeenCalledTimes(4)

    // Switch to a new space — a fresh effect run, fresh attempt budget.
    rerender({ spaceId: 'space2' })
    expect(mockOnSnapshot).toHaveBeenCalledTimes(5)

    act(() => { current().onError({ code: 'permission-denied', message: 'denied' }) })
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    // space2's first retry attaches a 6th subscription — proof the counter reset,
    // rather than space2 immediately hitting the exhausted budget from space1.
    expect(mockOnSnapshot).toHaveBeenCalledTimes(6)
  })
})
