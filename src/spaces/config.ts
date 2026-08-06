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
    // ⚠️ undefined is preserved deliberately: "never edited" (→ legacy default
    // card set) is a different state from [] ("the user deleted every card").
    // See resolveDashboardCards() in spaces/utils/dashboardCards.ts.
    dashboardCards: raw?.dashboardCards ? [...raw.dashboardCards] : undefined,
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
    dashboardCards: config.dashboardCards,
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

// ---------------------------------------------------------------------------
// Custom field value builders — Space refactor Phase 5, §4.
// ---------------------------------------------------------------------------

/** Builds the Transaction.custom map from raw form state.
 *  Omits empty values entirely: '' for select/text, and false for boolean.
 *  So `custom` contains only meaningful entries, and consumers must treat an
 *  absent boolean key as false. Returns undefined when nothing is set, so the
 *  field is absent from the document rather than an empty object.
 *  `defs` should be the currently ENABLED definitions only — a disabled
 *  field's value is never rebuilt from form state (it isn't rendered, so it
 *  isn't in `values`); see mergeCustomPayload() for how it survives an edit. */
export function buildCustomPayload(
  values: Record<string, CustomValue>,
  defs: CustomFieldDef[],
): Record<string, CustomValue> | undefined {
  const result: Record<string, CustomValue> = {}
  for (const def of defs) {
    const v = values[def.id]
    if (v === undefined) continue
    if (def.type === 'boolean') {
      if (v === true) result[def.id] = true
    } else if (typeof v === 'string' && v !== '') {
      result[def.id] = v
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

/** Merges freshly-built values for the ENABLED fields into a transaction's
 *  existing `custom` map, leaving every other key untouched. This is the
 *  write-path half of "disabling a field never deletes its stored value":
 *  a field disabled after a transaction was saved isn't in `enabledDefs` (so
 *  it isn't rendered and isn't in `values`), and this function never touches
 *  a key it didn't itself just (re)compute. */
export function mergeCustomPayload(
  existingCustom: Record<string, CustomValue> | undefined,
  values: Record<string, CustomValue>,
  enabledDefs: CustomFieldDef[],
): Record<string, CustomValue> | undefined {
  const merged: Record<string, CustomValue> = { ...(existingCustom ?? {}) }
  const built = buildCustomPayload(values, enabledDefs) ?? {}
  for (const def of enabledDefs) {
    if (built[def.id] !== undefined) merged[def.id] = built[def.id]
    else delete merged[def.id]
  }
  return Object.keys(merged).length > 0 ? merged : undefined
}
