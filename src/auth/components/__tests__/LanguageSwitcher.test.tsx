// LanguageSwitcher.test.tsx — the signed-out language pill (Welcome page).

import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { LanguageSwitcher } from '../LanguageSwitcher'
import { useLanguageStore } from '@/i18n'

describe('LanguageSwitcher', () => {
  // Tests run with an English browser; put the device back to 'auto' after each.
  afterEach(() => useLanguageStore.getState().setPreference('auto'))

  it('shows the current language and offers every language with its flag', () => {
    render(<LanguageSwitcher />)
    expect(screen.getByText('en')).toBeInTheDocument() // shown uppercase via CSS
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['🇬🇧 English', '🇫🇷 Français'])
  })

  it('switching sets an explicit device preference (kept for sign-up)', () => {
    render(<LanguageSwitcher />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fr' } })

    const state = useLanguageStore.getState()
    expect(state.preference).toBe('fr') // explicit, so a new account stores it
    expect(state.language).toBe('fr')
    expect(localStorage.getItem('globeexpenses.language')).toBe('fr') // survives login/register navigation
    // The pill re-rendered, and its label is now French.
    expect(screen.getByText('fr')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Langue' })).toBeInTheDocument()
  })

  it('keeps a positioning class from the caller (absolute, not relative)', () => {
    render(<LanguageSwitcher className="absolute right-4 top-4" />)
    const pill = screen.getByRole('combobox').closest('label')!
    expect(pill.className).toContain('absolute')
    expect(pill.className).not.toMatch(/\brelative\b/)
  })
})
