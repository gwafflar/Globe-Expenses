// presets.ts — pure data + pure functions for space creation presets.
// No React, no Firestore imports — must stay unit-testable in isolation.
// See docs/SPACE_REFACTOR_SPEC.md §5.

import type { PresetId, SpaceConfig } from '@/spaces/types'

export const PRESETS: Record<PresetId, {
  id: PresetId
  emoji: string
  titleKey: string
  description: string
  chips: string[]
  namePlaceholder: string
  builtInFields: SpaceConfig['builtInFields']
  features: SpaceConfig['features']
}> = {
  travel: {
    id: 'travel',
    emoji: '🌍',
    titleKey: 'Travel',
    description: 'Trip abroad, solo or with friends',
    chips: ['Countries', 'Cities', 'Multi-currency', 'Cash wallet'],
    namePlaceholder: 'Japan 2026',
    builtInFields: { country: true, city: true, category: true, paymentMethod: true, notes: true },
    features: { wallets: true, multiCurrency: true },
  },
  solo: {
    id: 'solo',
    emoji: '👤',
    titleKey: 'Solo budget',
    description: 'Track your own spending',
    chips: ['Categories', 'Payment methods'],
    namePlaceholder: 'My budget',
    builtInFields: { country: false, city: false, category: true, paymentMethod: true, notes: true },
    features: { wallets: false, multiCurrency: false },
  },
  group: {
    id: 'group',
    emoji: '👥',
    titleKey: 'Group',
    description: 'Flatmates, colleagues, couple',
    chips: ['Categories', 'Split & balance'],
    namePlaceholder: 'Colocation',
    builtInFields: { country: false, city: false, category: true, paymentMethod: false, notes: true },
    features: { wallets: false, multiCurrency: false },
  },
  custom: {
    id: 'custom',
    emoji: '⚙️',
    titleKey: 'Custom',
    description: 'Start from scratch',
    chips: ['Pick your own fields'],
    namePlaceholder: 'My space',
    builtInFields: { country: false, city: false, category: true, paymentMethod: false, notes: true },
    features: { wallets: false, multiCurrency: false },
  },
}

/** Builds a fresh config from a preset. customFields always starts empty. */
export function configFromPreset(id: PresetId): SpaceConfig {
  const preset = PRESETS[id]
  return {
    builtInFields: { ...preset.builtInFields },
    features: { ...preset.features },
    customFields: [],
  }
}

/** True when the config's toggles match the preset exactly.
 *  Compares builtInFields + features ONLY — never customFields. */
export function matchesPreset(config: SpaceConfig, id: PresetId): boolean {
  const preset = PRESETS[id]
  return (
    shallowEqual(config.builtInFields, preset.builtInFields) &&
    shallowEqual(config.features, preset.features)
  )
}

/** Re-applies a preset's TOGGLES ONLY — builtInFields and features — leaving
 *  every other part of the config alone.
 *  See SPEC §5.1 — never touches categories, paymentMethods, members, etc.
 *
 *  ⚠️ Spread `config` first rather than listing the keys to keep. Listing them
 *  by hand is what silently destroyed `dashboardCards`: an omitted optional key
 *  type-checks, serialiseSpaceConfig() drops undefined keys, and
 *  updateSpaceConfig() writes the whole config map — so "Reset to preset"
 *  deleted every dashboard card for every member. Any key added to SpaceConfig
 *  later is preserved for free. */
export function applyPreset(config: SpaceConfig, id: PresetId): SpaceConfig {
  const preset = PRESETS[id]
  return {
    ...config,
    builtInFields: { ...preset.builtInFields },
    features: { ...preset.features },
  }
}

function shallowEqual<T extends Record<string, unknown>>(a: T, b: T): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => a[key] === b[key])
}
