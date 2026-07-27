import { describe, expect, it } from 'vitest'
import { PRESETS, applyPreset, configFromPreset, matchesPreset } from '@/spaces/presets'
import type { PresetId } from '@/spaces/types'

describe('configFromPreset', () => {
  it('matches the spec table for each preset', () => {
    const expected: Record<PresetId, { builtInFields: Record<string, boolean>; features: Record<string, boolean> }> = {
      travel: {
        builtInFields: { country: true, city: true, category: true, paymentMethod: true, notes: true },
        features: { wallets: true, multiCurrency: true },
      },
      solo: {
        builtInFields: { country: false, city: false, category: true, paymentMethod: true, notes: true },
        features: { wallets: false, multiCurrency: false },
      },
      group: {
        builtInFields: { country: false, city: false, category: true, paymentMethod: false, notes: true },
        features: { wallets: false, multiCurrency: false },
      },
      custom: {
        builtInFields: { country: false, city: false, category: true, paymentMethod: false, notes: true },
        features: { wallets: false, multiCurrency: false },
      },
    }

    for (const id of Object.keys(PRESETS) as PresetId[]) {
      const config = configFromPreset(id)
      expect(config.builtInFields).toEqual(expected[id].builtInFields)
      expect(config.features).toEqual(expected[id].features)
      expect(config.customFields).toEqual([])
    }
  })
})

describe('matchesPreset', () => {
  it('is true right after configFromPreset', () => {
    for (const id of Object.keys(PRESETS) as PresetId[]) {
      expect(matchesPreset(configFromPreset(id), id)).toBe(true)
    }
  })

  it('is false after flipping any single toggle', () => {
    const config = configFromPreset('travel')
    expect(matchesPreset({ ...config, builtInFields: { ...config.builtInFields, country: false } }, 'travel')).toBe(false)
    expect(matchesPreset({ ...config, features: { ...config.features, wallets: false } }, 'travel')).toBe(false)
  })

  it('stays true after adding a custom field (customFields excluded from comparison)', () => {
    const config = configFromPreset('solo')
    const withCustomField = {
      ...config,
      customFields: [{ id: 'f1', label: 'Mood', type: 'text' as const, enabled: true }],
    }
    expect(matchesPreset(withCustomField, 'solo')).toBe(true)
  })
})

describe('applyPreset', () => {
  it('restores the toggles and leaves customFields byte-identical', () => {
    const config = configFromPreset('travel')
    const customFields = [{ id: 'f1', label: 'Mood', type: 'text' as const, enabled: true }]
    const modified = {
      builtInFields: { ...config.builtInFields, country: false },
      features: { ...config.features, wallets: false },
      customFields,
    }

    const result = applyPreset(modified, 'travel')

    expect(result.builtInFields).toEqual(PRESETS.travel.builtInFields)
    expect(result.features).toEqual(PRESETS.travel.features)
    expect(result.customFields).toBe(customFields)
  })
})
