// config.ts — resolves and validates a space's SpaceConfig.
// See docs/SPACE_REFACTOR_SPEC.md §4.4.

import type { CustomFieldDef, CustomValue, Space, SpaceConfig } from '@/spaces/types'

/** THE single entry point for reading a space's configuration.
 *  Every consumer uses this — never `space.config` directly.
 *
 *  Legacy documents (no `config` field) resolve to full travel-mode defaults,
 *  so every existing space behaves exactly as it did before this refactor.
 *  Same pattern as the existing getSpaceMainCurrency(). Partial configs
 *  (written by an older app version) resolve missing keys the same way. */
export function getSpaceConfig(space: Space): SpaceConfig {
  const trackLocation = space.settings?.trackLocation ?? true
  const raw = space.config

  const resolved: SpaceConfig = {
    builtInFields: {
      country: raw?.builtInFields?.country ?? trackLocation,
      city: raw?.builtInFields?.city ?? trackLocation,
      category: raw?.builtInFields?.category ?? true,
      paymentMethod: raw?.builtInFields?.paymentMethod ?? true,
      notes: raw?.builtInFields?.notes ?? true,
    },
    features: {
      wallets: raw?.features?.wallets ?? true,
      multiCurrency: raw?.features?.multiCurrency ?? true,
    },
    customFields: raw?.customFields ? [...raw.customFields] : [],
  }

  return normaliseSpaceConfig(resolved)
}

/** Enforces cross-field invariants. Called on every write path, and applied to
 *  the result of getSpaceConfig() so consumers never see an invalid combination.
 *
 *  Invariant 1: wallets require a payment method. Wallet balances are keyed on
 *  (paymentMethod, currency) pairs, so `wallets: true` with
 *  `paymentMethod: false` is not a representable state — paymentMethod is
 *  forced back on. The Phase 3 UI will reflect this by disabling the
 *  paymentMethod toggle while wallets is on. */
export function normaliseSpaceConfig(config: SpaceConfig): SpaceConfig {
  const builtInFields = { ...config.builtInFields }
  if (config.features.wallets) {
    builtInFields.paymentMethod = true
  }
  return {
    builtInFields,
    features: { ...config.features },
    customFields: config.customFields,
  }
}

/** Enabled custom fields only, in definition order. */
export function enabledCustomFields(config: SpaceConfig): CustomFieldDef[] {
  return config.customFields.filter((f) => f.enabled)
}

/** Resolves a stored 'select' value (an option id) to its display label.
 *  Falls back to returning the raw value when the option no longer exists,
 *  so deleting an option never blanks out old transactions. */
export function resolveOptionLabel(def: CustomFieldDef, value: CustomValue): string {
  const option = def.options?.find((o) => o.id === value)
  return option?.label ?? String(value)
}
