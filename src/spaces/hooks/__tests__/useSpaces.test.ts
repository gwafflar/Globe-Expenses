// src/spaces/hooks/__tests__/useSpaces.test.ts
//
// Regression test for a Phase 4.1 bug: SpaceDetailPage's direct-fetch path
// reconstructed a Space without mapping `config`/`presetOrigin`, so the
// resolver silently fell back to travel-mode defaults for every preset that
// wasn't travel. useSpaces.ts (the spaces-list snapshot mapping) already
// mapped these fields correctly — this test locks that in so it can't regress
// the same way SpaceDetailPage's fetch did.

import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useSpaces } from '../useSpaces'

const { mockOnSnapshot } = vi.hoisted(() => ({ mockOnSnapshot: vi.fn() }))

vi.mock('@/services/firebase', () => ({ db: {} }))

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore')
  return {
    ...actual,
    collection: vi.fn(() => ({ __ref: 'collection' })),
    query: vi.fn((ref: unknown) => ref),
    where: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot: mockOnSnapshot,
  }
})

function fakeSnapshot(docs: { id: string; data: Record<string, unknown> }[]) {
  return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })) }
}

describe('useSpaces — snapshot mapping', () => {
  it('produces a Space whose config is deep-equal to the stored document config', async () => {
    const storedConfig = {
      builtInFields: { country: false, city: false, category: true, paymentMethod: true, notes: true },
      features: { wallets: false, multiCurrency: false },
      customFields: [],
    }

    mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
      onNext(fakeSnapshot([{
        id: 'space1',
        data: {
          name: 'My budget',
          members: [],
          memberUids: ['u1'],
          createdBy: 'u1',
          createdAt: null,
          currencies: ['EUR'],
          mainCurrency: 'EUR',
          config: storedConfig,
          presetOrigin: 'solo',
        },
      }]))
      return () => {}
    })

    const { result } = renderHook(() => useSpaces('u1'))

    await waitFor(() => expect(result.current.activeSpaces).toHaveLength(1))
    const space = result.current.activeSpaces[0]
    expect(space.config).toEqual(storedConfig)
    expect(space.presetOrigin).toBe('solo')
  })

  it('leaves config undefined for a legacy document that has none', async () => {
    mockOnSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
      onNext(fakeSnapshot([{
        id: 'space2',
        data: {
          name: 'Old trip',
          members: [],
          memberUids: ['u1'],
          createdBy: 'u1',
          createdAt: null,
          currencies: ['EUR'],
        },
      }]))
      return () => {}
    })

    const { result } = renderHook(() => useSpaces('u1'))

    await waitFor(() => expect(result.current.activeSpaces).toHaveLength(1))
    expect(result.current.activeSpaces[0].config).toBeUndefined()
  })
})
