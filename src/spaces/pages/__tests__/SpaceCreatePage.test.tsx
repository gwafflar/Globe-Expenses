// src/spaces/pages/__tests__/SpaceCreatePage.test.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SpaceCreatePage } from '../SpaceCreatePage'
import { createSpace } from '@/spaces/services/spaceService'

vi.mock('@/services/firebase', () => ({ db: {}, auth: {} }))

// Both are fire-and-forget in the real implementation — synchronous, not
// Promise-returning (see spaceService.ts / friendService.ts). Mocking them as
// resolved promises here would silently hide a Promise-vs-string regression.
vi.mock('@/spaces/services/spaceService', () => ({
  createSpace: vi.fn().mockReturnValue('new-space-id'),
}))

vi.mock('@/friends/services/friendService', () => ({
  createShareableInvite: vi.fn().mockReturnValue('invite-id'),
}))

vi.mock('@/auth/store/useAuthStore', () => ({
  useAuthStore: () => ({
    currentUser: { uid: 'u1', displayName: 'Alice', email: 'alice@example.com' },
    userProfile: { uid: 'u1', displayName: 'Alice', mainCurrency: 'EUR' },
  }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/spaces/new']}>
      <SpaceCreatePage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(createSpace).mockClear()
  mockNavigate.mockClear()
})

describe('SpaceCreatePage — preset step', () => {
  it('picking a preset advances to essentials and pre-fills the emoji', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /solo budget/i }))

    expect(screen.getByPlaceholderText('My budget')).toBeInTheDocument()
    expect(screen.getByLabelText('Space emoji')).toHaveValue('👤')
  })
})

describe('SpaceCreatePage — essentials step', () => {
  it('disables Create with an empty or whitespace-only name, enables once typed', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /travel/i }))

    const createButton = screen.getByRole('button', { name: /create space/i })
    expect(createButton).toBeDisabled()

    const nameInput = screen.getByPlaceholderText('Japan 2026')
    fireEvent.change(nameInput, { target: { value: '   ' } })
    expect(createButton).toBeDisabled()

    fireEvent.change(nameInput, { target: { value: 'Japan trip' } })
    expect(createButton).not.toBeDisabled()
  })

  it('opens the accordion expanded for custom, collapsed for other presets', () => {
    const { unmount } = renderPage()
    fireEvent.click(screen.getByRole('button', { name: /custom/i }))
    // Content only present in the DOM when CollapsibleCard is expanded
    expect(screen.getByText(/turning a field off hides it/i)).toBeInTheDocument()
    unmount()

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /travel/i }))
    expect(screen.queryByText(/turning a field off hides it/i)).not.toBeInTheDocument()
  })

  it('shows extra currencies and dates controls for travel, not for solo', () => {
    const { unmount } = renderPage()
    fireEvent.click(screen.getByRole('button', { name: /travel/i }))
    expect(screen.getByText(/set trip dates/i)).toBeInTheDocument()
    expect(screen.getByText(/other currencies/i)).toBeInTheDocument()
    unmount()

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /solo budget/i }))
    expect(screen.queryByText(/set trip dates/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/other currencies/i)).not.toBeInTheDocument()
  })
})

describe('SpaceCreatePage — back and re-pick', () => {
  it('preserves the typed name and resets the config when picking a different preset', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /travel/i }))
    fireEvent.change(screen.getByPlaceholderText('Japan 2026'), { target: { value: 'My trip' } })

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: /solo budget/i }))

    // Name preserved even though the placeholder (and preset) changed
    expect(screen.getByDisplayValue('My trip')).toBeInTheDocument()
    // Config reset to solo preset: wallets is off, so Cash wallet switch is unchecked
    fireEvent.click(screen.getByRole('button', { name: /customize fields/i }))
    expect(screen.getByRole('switch', { name: 'Cash wallet' })).toHaveAttribute('aria-checked', 'false')
  })
})

describe('SpaceCreatePage — creating the space', () => {
  it('calls createSpace with the preset config when the accordion was not used', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /solo budget/i }))
    fireEvent.change(screen.getByPlaceholderText('My budget'), { target: { value: 'My budget' } })
    fireEvent.click(screen.getByRole('button', { name: /create space/i }))

    await vi.waitFor(() => expect(createSpace).toHaveBeenCalledTimes(1))
    const arg = vi.mocked(createSpace).mock.calls[0][0]
    expect(arg.presetId).toBe('solo')
    expect(arg.config?.features.wallets).toBe(false)
  })

  it('calls createSpace with the edited config when the accordion was used', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /solo budget/i }))
    fireEvent.change(screen.getByPlaceholderText('My budget'), { target: { value: 'My budget' } })

    // Flip a built-in toggle inside the (collapsed-by-default) accordion — expand it first
    fireEvent.click(screen.getByRole('button', { name: /customize fields/i }))
    fireEvent.click(screen.getByRole('switch', { name: 'Country' }))

    fireEvent.click(screen.getByRole('button', { name: /create space/i }))

    await vi.waitFor(() => expect(createSpace).toHaveBeenCalledTimes(1))
    const arg = vi.mocked(createSpace).mock.calls[0][0]
    expect(arg.config?.builtInFields.country).toBe(true)
  })

  it('navigates immediately using the synchronously-returned id (createSpace is fire-and-forget, not awaited)', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /solo budget/i }))
    fireEvent.change(screen.getByPlaceholderText('My budget'), { target: { value: 'My budget' } })
    fireEvent.click(screen.getByRole('button', { name: /create space/i }))

    // No await/waitFor here on purpose: if createSpace were awaited (or the
    // mock returned a Promise), this assertion would fail synchronously.
    expect(mockNavigate).toHaveBeenCalledWith('/spaces/new-space-id')
  })
})
