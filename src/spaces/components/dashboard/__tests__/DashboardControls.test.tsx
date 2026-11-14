// DashboardControls.test.tsx — the member scope picker (Phase 7a patch).
//
// The one contract worth pinning down here: the UI's "You" row is a display
// convenience only. It must resolve to the current user's travelMemberId
// BEFORE the value leaves this component, so scopeTransactions() only ever
// sees ALL_MEMBERS or a member id and stays independent of who is logged in.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DashboardControls } from '../DashboardControls'
import { ALL_MEMBERS } from '@/spaces/utils/dashboardScope'
import { ALL_TIME } from '@/shared/utils/dateRange'
import type { SpaceMember } from '@/spaces/types'

const MEMBERS: SpaceMember[] = [
  { travelMemberId: 'm1', displayName: 'Alice', userId: 'u1', allowRename: true, joinedAt: null as never },
  { travelMemberId: 'm2', displayName: 'Bob', userId: 'u2', allowRename: true, joinedAt: null as never },
  { travelMemberId: 'm3', displayName: 'Ghost', userId: null, allowRename: true, joinedAt: null as never },
]

function renderControls(overrides: Partial<React.ComponentProps<typeof DashboardControls>> = {}) {
  const onModeChange = vi.fn()
  render(
    <DashboardControls
      range={ALL_TIME}
      onRangeChange={vi.fn()}
      mode={ALL_MEMBERS}
      onModeChange={onModeChange}
      members={MEMBERS}
      currentMemberId="m1"
      isSolo={false}
      {...overrides}
    />,
  )
  return { onModeChange }
}

function openPicker() {
  fireEvent.click(screen.getByRole('button', { name: 'Whose spending' }))
}

describe('DashboardControls — member scope picker', () => {
  it('resolves "You" to the current user member id, never the string "you"', () => {
    const { onModeChange } = renderControls()
    openPicker()
    fireEvent.click(screen.getByRole('button', { name: 'You' }))

    expect(onModeChange).toHaveBeenCalledWith('m1')
    expect(onModeChange).not.toHaveBeenCalledWith('you')
  })

  it('passes ALL_MEMBERS for the All row', () => {
    const { onModeChange } = renderControls({ mode: 'm2' })
    openPicker()
    fireEvent.click(screen.getByRole('button', { name: 'All members' }))
    expect(onModeChange).toHaveBeenCalledWith(ALL_MEMBERS)
  })

  it('lists All and You pinned first, then the other members in space order', () => {
    renderControls()
    openPicker()
    const names = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))
      .filter((n): n is string => n !== null && n !== 'Whose spending')
    expect(names).toEqual(['All members', 'You', 'Bob', 'Ghost'])
  })

  it('offers unclaimed member slots — they hold splits like anyone else', () => {
    const { onModeChange } = renderControls()
    openPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Ghost' }))
    expect(onModeChange).toHaveBeenCalledWith('m3')
  })

  it('renders no picker at all in a single-member space', () => {
    renderControls({ isSolo: true, members: [MEMBERS[0]] })
    expect(screen.queryByRole('button', { name: 'Whose spending' })).toBeNull()
  })

  it('omits the You row when the user holds no member slot', () => {
    renderControls({ currentMemberId: '' })
    openPicker()
    expect(screen.queryByRole('button', { name: 'You' })).toBeNull()
    // …and every real member is still selectable.
    expect(screen.getByRole('button', { name: 'Alice' })).toBeInTheDocument()
  })

  it('shows the selected member name on the trigger', () => {
    renderControls({ mode: 'm2' })
    expect(screen.getByRole('button', { name: 'Whose spending' })).toHaveTextContent('Bob')
  })
})
