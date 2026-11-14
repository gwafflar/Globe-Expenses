// src/spaces/components/__tests__/FieldsEditor.test.tsx

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FieldsEditor } from '../FieldsEditor'
import { configFromPreset } from '@/spaces/presets'
import type { SpaceConfig } from '@/spaces/types'

function baseConfig(): SpaceConfig {
  return configFromPreset('travel')
}

describe('FieldsEditor — built-in field toggles', () => {
  it('toggling a built-in field emits a config with only that key changed', () => {
    const config = baseConfig()
    const onConfigChange = vi.fn()
    render(<FieldsEditor config={config} onConfigChange={onConfigChange} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Notes' }))

    expect(onConfigChange).toHaveBeenCalledTimes(1)
    const next = onConfigChange.mock.calls[0][0] as SpaceConfig
    expect(next.builtInFields).toEqual({ ...config.builtInFields, notes: false })
    expect(next.features).toEqual(config.features)
    expect(next.customFields).toEqual(config.customFields)
  })

  it('disables the payment-method toggle while wallets is on', () => {
    const config = baseConfig() // travel preset: wallets true
    render(<FieldsEditor config={config} onConfigChange={vi.fn()} />)
    expect(screen.getByRole('switch', { name: 'Payment method' })).toBeDisabled()
  })

  it('turning on wallets while paymentMethod is off emits both true (normalisation applied)', () => {
    const config: SpaceConfig = {
      ...configFromPreset('solo'), // wallets: false, paymentMethod: true
      builtInFields: { ...configFromPreset('solo').builtInFields, paymentMethod: false },
    }
    const onConfigChange = vi.fn()
    render(<FieldsEditor config={config} onConfigChange={onConfigChange} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Cash wallet' }))

    const next = onConfigChange.mock.calls[0][0] as SpaceConfig
    expect(next.features.wallets).toBe(true)
    expect(next.builtInFields.paymentMethod).toBe(true)
  })
})

describe('FieldsEditor — custom fields', () => {
  it('adding a field and typing a label emits a config containing it', () => {
    const config = baseConfig()
    const onConfigChange = vi.fn()
    render(<FieldsEditor config={config} onConfigChange={onConfigChange} />)

    fireEvent.click(screen.getByRole('button', { name: /add/i }))
    const labelInput = screen.getByLabelText('Field label')
    fireEvent.change(labelInput, { target: { value: 'Project' } })

    expect(onConfigChange).toHaveBeenCalledTimes(1)
    const next = onConfigChange.mock.calls[0][0] as SpaceConfig
    expect(next.customFields).toHaveLength(1)
    expect(next.customFields[0].label).toBe('Project')
  })

  it('adding a field and leaving the label empty emits nothing', () => {
    const config = baseConfig()
    const onConfigChange = vi.fn()
    render(<FieldsEditor config={config} onConfigChange={onConfigChange} />)

    fireEvent.click(screen.getByRole('button', { name: /add/i }))
    // Provisional field shown, collapse without typing a label
    fireEvent.click(screen.getByText('Untitled field'))

    expect(onConfigChange).not.toHaveBeenCalled()
    expect(screen.queryByText('Untitled field')).not.toBeInTheDocument()
  })
})

describe('FieldsEditor — multi-currency gating', () => {
  it('disables the multi-currency toggle when canDisableMultiCurrency is false', () => {
    const config = baseConfig() // multiCurrency: true
    render(
      <FieldsEditor
        config={config}
        onConfigChange={vi.fn()}
        canDisableMultiCurrency={false}
        foreignCurrencyTxCount={3}
      />,
    )
    expect(screen.getByRole('switch', { name: 'Multiple currencies' })).toBeDisabled()
    expect(screen.getByText('3 transactions use another currency.')).toBeInTheDocument()
  })
})

describe('FieldsEditor — preset reset', () => {
  it('reset is disabled when the config matches the preset, enabled after a toggle flip', () => {
    const config = baseConfig()
    const { rerender } = render(
      <FieldsEditor config={config} onConfigChange={vi.fn()} presetOrigin="travel" showPresetSection />,
    )
    expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled()

    const flipped: SpaceConfig = { ...config, builtInFields: { ...config.builtInFields, notes: false } }
    rerender(<FieldsEditor config={flipped} onConfigChange={vi.fn()} presetOrigin="travel" showPresetSection />)
    expect(screen.getByRole('button', { name: /reset/i })).not.toBeDisabled()
  })
})
