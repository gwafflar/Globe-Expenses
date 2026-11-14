import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { buildCustomPayload, enabledCustomFields, getSpaceConfig, mergeCustomPayload, normaliseSpaceConfig, resolveOptionLabel } from '@/spaces/config'
import type { CustomFieldDef, Space, SpaceConfig } from '@/spaces/types'

function makeSpace(overrides: Partial<Space> = {}): Space {
  return {
    spaceId: 'space1',
    name: 'Test Space',
    members: [],
    memberUids: [],
    createdBy: 'uid1',
    createdAt: Timestamp.now(),
    currencies: ['EUR'],
    categories: [],
    paymentMethods: [],
    countries: [],
    cities: [],
    archivedByUids: [],
    ...overrides,
  }
}

describe('getSpaceConfig', () => {
  it('resolves legacy space (no config, no settings) to full travel-mode defaults', () => {
    const config = getSpaceConfig(makeSpace())
    expect(config.builtInFields).toEqual({ country: true, city: true, category: true, paymentMethod: true, notes: true })
    expect(config.features).toEqual({ wallets: true, multiCurrency: true })
    expect(config.customFields).toEqual([])
  })

  it('resolves legacy space with settings.trackLocation === false', () => {
    const config = getSpaceConfig(makeSpace({ settings: { trackLocation: false } }))
    expect(config.builtInFields.country).toBe(false)
    expect(config.builtInFields.city).toBe(false)
    expect(config.builtInFields.category).toBe(true)
    expect(config.builtInFields.paymentMethod).toBe(true)
    expect(config.builtInFields.notes).toBe(true)
  })

  it('returns a complete config as-is (after normalisation)', () => {
    const complete: SpaceConfig = {
      builtInFields: { country: false, city: false, category: true, paymentMethod: false, notes: true },
      features: { wallets: false, multiCurrency: false },
      customFields: [],
    }
    const config = getSpaceConfig(makeSpace({ config: complete }))
    expect(config).toEqual(complete)
  })

  it('falls back per-key on a partial config', () => {
    const partial = {
      features: { wallets: false, multiCurrency: false },
    } as SpaceConfig
    const config = getSpaceConfig(makeSpace({ config: partial }))
    expect(config.builtInFields).toEqual({ country: true, city: true, category: true, paymentMethod: true, notes: true })
    expect(config.features.wallets).toBe(false)
  })

  it('does not return a reference into the space document', () => {
    const original: SpaceConfig = {
      builtInFields: { country: true, city: true, category: true, paymentMethod: true, notes: true },
      features: { wallets: true, multiCurrency: true },
      customFields: [],
    }
    const space = makeSpace({ config: original })
    const resolved = getSpaceConfig(space)
    resolved.builtInFields.country = false
    resolved.customFields.push({ id: 'x', label: 'x', type: 'text', enabled: true })
    expect(space.config!.builtInFields.country).toBe(true)
    expect(space.config!.customFields).toEqual([])
  })
})

describe('normaliseSpaceConfig', () => {
  it('forces paymentMethod on when wallets is true', () => {
    const config: SpaceConfig = {
      builtInFields: { country: false, city: false, category: true, paymentMethod: false, notes: true },
      features: { wallets: true, multiCurrency: false },
      customFields: [],
    }
    expect(normaliseSpaceConfig(config).builtInFields.paymentMethod).toBe(true)
  })

  it('leaves paymentMethod false when wallets is false', () => {
    const config: SpaceConfig = {
      builtInFields: { country: false, city: false, category: true, paymentMethod: false, notes: true },
      features: { wallets: false, multiCurrency: false },
      customFields: [],
    }
    expect(normaliseSpaceConfig(config).builtInFields.paymentMethod).toBe(false)
  })
})

describe('enabledCustomFields', () => {
  it('returns only enabled fields in definition order', () => {
    const fields: CustomFieldDef[] = [
      { id: 'a', label: 'A', type: 'text', enabled: true },
      { id: 'b', label: 'B', type: 'text', enabled: false },
      { id: 'c', label: 'C', type: 'boolean', enabled: true },
    ]
    const config: SpaceConfig = {
      builtInFields: { country: true, city: true, category: true, paymentMethod: true, notes: true },
      features: { wallets: true, multiCurrency: true },
      customFields: fields,
    }
    expect(enabledCustomFields(config).map((f) => f.id)).toEqual(['a', 'c'])
  })
})

describe('resolveOptionLabel', () => {
  const def: CustomFieldDef = {
    id: 'mood',
    label: 'Mood',
    type: 'select',
    enabled: true,
    options: [{ id: 'opt1', label: 'Happy' }],
  }

  it('resolves a known option id to its label', () => {
    expect(resolveOptionLabel(def, 'opt1')).toBe('Happy')
  })

  it('falls back to the raw value when the option was deleted', () => {
    expect(resolveOptionLabel(def, 'opt2')).toBe('opt2')
  })
})

describe('buildCustomPayload', () => {
  const defs: CustomFieldDef[] = [
    { id: 'mood', label: 'Mood', type: 'select', enabled: true, options: [{ id: 'happy', label: 'Happy' }] },
    { id: 'notes2', label: 'Notes 2', type: 'text', enabled: true },
    { id: 'reimbursable', label: 'Reimbursable', type: 'boolean', enabled: true },
  ]

  it('omits empty strings for select/text and false for boolean', () => {
    expect(buildCustomPayload({ mood: '', notes2: '', reimbursable: false }, defs)).toBeUndefined()
  })

  it('returns undefined when everything is empty', () => {
    expect(buildCustomPayload({}, defs)).toBeUndefined()
  })

  it('keeps true and non-empty strings', () => {
    const payload = buildCustomPayload({ mood: 'happy', notes2: 'hello', reimbursable: true }, defs)
    expect(payload).toEqual({ mood: 'happy', notes2: 'hello', reimbursable: true })
  })

  it('includes only definitions passed in (the enabled set)', () => {
    const enabledOnly = defs.filter((d) => d.id !== 'notes2')
    const payload = buildCustomPayload({ mood: 'happy', notes2: 'should be ignored', reimbursable: true }, enabledOnly)
    expect(payload).toEqual({ mood: 'happy', reimbursable: true })
  })
})

describe('mergeCustomPayload', () => {
  const defs: CustomFieldDef[] = [
    { id: 'mood', label: 'Mood', type: 'select', enabled: true, options: [{ id: 'happy', label: 'Happy' }] },
  ]

  it('a value for a now-disabled field survives an edit that touches other fields', () => {
    // Simulates: transaction was saved with `region` filled while it was enabled;
    // `region` was then disabled, so it is absent from `enabledDefs` and never
    // rendered — but editing the transaction (changing `mood`) must not drop it.
    const existing = { region: 'north', mood: 'happy' }
    const merged = mergeCustomPayload(existing, { mood: 'happy' }, defs)
    expect(merged).toEqual({ region: 'north', mood: 'happy' })
  })

  it('clears an enabled field whose value was removed in the form', () => {
    const existing = { mood: 'happy' }
    const merged = mergeCustomPayload(existing, { mood: '' }, defs)
    expect(merged).toBeUndefined()
  })

  it('returns undefined for a brand new transaction with no custom values', () => {
    expect(mergeCustomPayload(undefined, {}, defs)).toBeUndefined()
  })
})
