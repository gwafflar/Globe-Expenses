// src/spaces/components/FieldsEditor.tsx
//
// Standalone, self-contained field/feature editor for a SpaceConfig.
// Mounted twice: Parameters → Fields (this phase) and the creation flow
// (Phase 4, not yet built). It never writes to Firestore itself — the parent
// owns persistence via onConfigChange. See docs/SPACE_REFACTOR_SPEC.md §Phase 3.
//
// ⚠️ Do not add Parameters-specific logic here (or creation-flow-specific
// logic later) — anything that only makes sense in one mount point belongs
// in that parent instead.

import { useState } from 'react'
import { nanoid } from 'nanoid'
import {
  MapPin, Building2, Tag, CreditCard, FileText, RotateCcw, Info,
  Wallet, Coins, ChevronDown, ChevronRight, Plus, Trash2, X,
} from 'lucide-react'
import type { CustomFieldDef, CustomFieldType, LabeledItem, PresetId, SpaceConfig } from '@/spaces/types'
import { normaliseSpaceConfig } from '@/spaces/config'
import { PRESETS, matchesPreset, applyPreset } from '@/spaces/presets'
import { Switch } from '@/shared/components/Switch'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// ---------------------------------------------------------------------------
// Static metadata for built-in fields / features (display only — never behaviour)
// ---------------------------------------------------------------------------

const BUILT_IN_META: Record<keyof SpaceConfig['builtInFields'], { label: string; icon: typeof MapPin; hint: string }> = {
  country: { label: 'Country', icon: MapPin, hint: 'Picker with flags' },
  city: { label: 'City', icon: Building2, hint: 'Auto-filled from your entries' },
  category: { label: 'Category', icon: Tag, hint: 'Used by the dashboard breakdown' },
  paymentMethod: { label: 'Payment method', icon: CreditCard, hint: 'Required for cash wallets' },
  notes: { label: 'Notes', icon: FileText, hint: 'Free text on each transaction' },
}

const FEATURE_META: Record<keyof SpaceConfig['features'], { label: string; icon: typeof Wallet; hint: string }> = {
  wallets: { label: 'Cash wallet', icon: Wallet, hint: 'Withdrawals, adjustments, balance tracking' },
  multiCurrency: { label: 'Multiple currencies', icon: Coins, hint: 'Turns on by itself the first time you use another currency' },
}

const CUSTOM_TYPES: { id: CustomFieldType; label: string }[] = [
  { id: 'select', label: 'Choice' },
  { id: 'text', label: 'Text' },
  { id: 'boolean', label: 'Yes-no' },
]

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function ToggleRow({
  icon: Icon, label, hint, checked, onChange, disabled, note,
}: {
  icon: typeof MapPin
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  note?: string
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</div>}
        {note && (
          <div className="mt-1 flex items-start gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{note}</span>
          </div>
        )}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </div>
  )
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-1 mt-5 flex items-center justify-between">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>
      {action}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CustomFieldCard — one user-defined field, collapsed row + expanded editor.
//
// A field with an empty trimmed label is "provisional": held in the parent's
// local state, never emitted via onChange, so navigating away with an empty
// label discards it instead of persisting an "Untitled field" (see SPEC §1.5).
// ---------------------------------------------------------------------------

function CustomFieldCard({
  field, expanded, onToggleExpand, onChange, onRemove,
}: {
  field: CustomFieldDef
  expanded: boolean
  onToggleExpand: () => void
  onChange: (patch: Partial<CustomFieldDef>) => void
  onRemove: () => void
}) {
  const [newOption, setNewOption] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isProvisional = field.label.trim() === ''

  function addOption() {
    const label = newOption.trim()
    if (!label) return
    onChange({ options: [...(field.options ?? []), { id: nanoid(8), label }] })
    setNewOption('')
  }

  return (
    <div className={`rounded-lg border ${expanded ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={onToggleExpand} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="text-base">{field.emoji || '🏷️'}</span>
          <span className={`truncate text-sm font-medium ${field.label ? '' : 'text-muted-foreground'}`}>
            {field.label || 'Untitled field'}
          </span>
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {CUSTOM_TYPES.find((t) => t.id === field.type)?.label}
          </span>
        </button>
        <Switch checked={field.enabled} onChange={(v) => onChange({ enabled: v })} label={`Enable ${field.label || 'field'}`} />
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-primary/20 px-3 py-3">
          <div className="flex gap-2">
            <input
              value={field.emoji ?? ''}
              onChange={(e) => onChange({ emoji: e.target.value })}
              placeholder="🏷️"
              aria-label="Field emoji"
              className="w-12 rounded-md border bg-background px-2 py-1.5 text-center text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              value={field.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="Field name"
              aria-label="Field label"
              className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Type</div>
            <div className="flex gap-1.5">
              {CUSTOM_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChange({ type: t.id })}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium ${
                    field.type === t.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {field.type === 'select' && (
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Choices</div>
              <div className="space-y-1.5">
                {(field.options ?? []).map((o: LabeledItem) => (
                  <div key={o.id} className="flex items-center gap-2 rounded-md bg-background px-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm">{o.label}</span>
                    <button
                      type="button"
                      onClick={() => onChange({ options: (field.options ?? []).filter((x) => x.id !== o.id) })}
                      aria-label={`Remove ${o.label}`}
                      className="text-muted-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <input
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption() } }}
                    placeholder="Add a choice…"
                    aria-label="Add a choice"
                    className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button type="button" onClick={addOption} className="rounded-md bg-foreground px-2.5 text-background">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Renaming a choice updates it everywhere, past transactions included.
              </p>
            </div>
          )}

          {field.type === 'text' && (
            <p className="text-xs text-muted-foreground">
              Free text. Searchable, but not summed or charted.
            </p>
          )}

          {field.type === 'boolean' && (
            <p className="text-xs text-muted-foreground">
              A yes/no switch. You can filter on it and total the amounts marked yes.
            </p>
          )}

          {!isProvisional && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete this field
            </button>
          )}

          <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{field.label}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  Values already recorded in this field will no longer be visible. You can instead
                  use the switch above to hide the field without losing anything.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onRemove}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FieldsEditor — the shared component
// ---------------------------------------------------------------------------

export interface FieldsEditorProps {
  config: SpaceConfig
  /** Called on every change with the full new config, already normalised.
   *  The parent owns persistence — this component never writes to Firestore. */
  onConfigChange: (next: SpaceConfig) => void
  /** Display only — drives the preset badge and the reset action. Never branch behaviour on this. */
  presetOrigin?: PresetId
  /** Parameters mounts this with true; the creation flow (Phase 4) with false. */
  showPresetSection?: boolean
  /** False when at least one transaction uses a non-main currency — disables turning multiCurrency off. */
  canDisableMultiCurrency?: boolean
  /** Count shown in the blocking hint when the above is false. */
  foreignCurrencyTxCount?: number
}

export function FieldsEditor({
  config,
  onConfigChange,
  presetOrigin,
  showPresetSection,
  canDisableMultiCurrency = true,
  foreignCurrencyTxCount = 0,
}: FieldsEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  // Provisional custom fields — held here, never emitted until they get a label.
  // Keyed by id, merged into the displayed list alongside config.customFields.
  const [provisional, setProvisional] = useState<CustomFieldDef[]>([])

  function emit(next: SpaceConfig) {
    onConfigChange(normaliseSpaceConfig(next))
  }

  function setBuiltIn(key: keyof SpaceConfig['builtInFields'], value: boolean) {
    emit({ ...config, builtInFields: { ...config.builtInFields, [key]: value } })
  }

  function setFeature(key: keyof SpaceConfig['features'], value: boolean) {
    emit({ ...config, features: { ...config.features, [key]: value } })
  }

  function addCustomField() {
    const id = nanoid(8)
    setProvisional((prev) => [...prev, { id, label: '', emoji: '', type: 'select', options: [], enabled: true }])
    setEditingId(id)
  }

  // Applies a patch to a field, whether it's provisional or already committed.
  // A provisional field is promoted (emitted) the moment its label becomes non-empty;
  // a committed field going empty stays committed (label just becomes '').
  function updateCustomField(id: string, patch: Partial<CustomFieldDef>) {
    const provisionalField = provisional.find((f) => f.id === id)
    if (provisionalField) {
      const updated = { ...provisionalField, ...patch }
      if (updated.label.trim() !== '') {
        setProvisional((prev) => prev.filter((f) => f.id !== id))
        emit({ ...config, customFields: [...config.customFields, updated] })
      } else {
        setProvisional((prev) => prev.map((f) => (f.id === id ? updated : f)))
      }
      return
    }
    emit({
      ...config,
      customFields: config.customFields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    })
  }

  function removeCustomField(id: string) {
    setProvisional((prev) => prev.filter((f) => f.id !== id))
    emit({ ...config, customFields: config.customFields.filter((f) => f.id !== id) })
  }

  // Collapsing (or leaving) a provisional field with an empty label discards it.
  function toggleExpand(id: string) {
    if (editingId === id) {
      const stillProvisional = provisional.find((f) => f.id === id)
      if (stillProvisional && stillProvisional.label.trim() === '') {
        setProvisional((prev) => prev.filter((f) => f.id !== id))
      }
      setEditingId(null)
    } else {
      setEditingId(id)
    }
  }

  const allCustomFields = [...config.customFields, ...provisional]

  const drifted = presetOrigin ? !matchesPreset(config, presetOrigin) : false

  const walletNeedsPm = config.features.wallets && !config.builtInFields.paymentMethod

  // Diff against the preset for the reset confirmation dialog.
  const resetDiff: { label: string; next: boolean }[] = presetOrigin
    ? [
        ...(Object.keys(PRESETS[presetOrigin].builtInFields) as (keyof SpaceConfig['builtInFields'])[])
          .filter((k) => config.builtInFields[k] !== PRESETS[presetOrigin].builtInFields[k])
          .map((k) => ({ label: BUILT_IN_META[k].label, next: PRESETS[presetOrigin].builtInFields[k] })),
        ...(Object.keys(PRESETS[presetOrigin].features) as (keyof SpaceConfig['features'])[])
          .filter((k) => config.features[k] !== PRESETS[presetOrigin].features[k])
          .map((k) => ({ label: FEATURE_META[k].label, next: PRESETS[presetOrigin].features[k] })),
      ]
    : []

  function handleReset() {
    if (!presetOrigin) return
    emit(applyPreset(config, presetOrigin))
    setConfirmReset(false)
  }

  return (
    <div>
      {showPresetSection && presetOrigin && (
        <>
          <SectionTitle>Preset</SectionTitle>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">{PRESETS[presetOrigin].emoji}</span>
                <div>
                  <div className="text-sm font-medium">
                    {PRESETS[presetOrigin].titleKey}
                    {drifted && <span className="text-muted-foreground"> (modified)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {drifted ? 'Your settings differ from the preset' : 'Matches the preset'}
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmReset(true)}
                disabled={!drifted}
                className="gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </Button>
            </div>
          </div>

          <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset to {PRESETS[presetOrigin].titleKey}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your own fields, categories and members are not affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <ul className="-mt-2 space-y-0.5 text-left">
                {resetDiff.map(({ label, next }) => (
                  <li key={label} className="text-xs text-muted-foreground">
                    {label} → <strong className="text-foreground">{next ? 'on' : 'off'}</strong>
                  </li>
                ))}
              </ul>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep mine</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset}>Reset toggles</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}

      <SectionTitle>Fields on each transaction</SectionTitle>
      <div className="divide-y divide-border rounded-lg border px-3">
        {(Object.keys(BUILT_IN_META) as (keyof SpaceConfig['builtInFields'])[]).map((key) => {
          const meta = BUILT_IN_META[key]
          return (
            <ToggleRow
              key={key}
              icon={meta.icon}
              label={meta.label}
              hint={meta.hint}
              checked={config.builtInFields[key]}
              onChange={(v) => setBuiltIn(key, v)}
              disabled={key === 'paymentMethod' && config.features.wallets}
              note={key === 'paymentMethod' && walletNeedsPm ? 'The cash wallet needs this field.' : undefined}
            />
          )
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Turning a field off hides it. Nothing you already entered is deleted.
      </p>

      <SectionTitle>Features</SectionTitle>
      <div className="divide-y divide-border rounded-lg border px-3">
        {(Object.keys(FEATURE_META) as (keyof SpaceConfig['features'])[]).map((key) => {
          const meta = FEATURE_META[key]
          const isMultiCurrency = key === 'multiCurrency'
          const blocked = isMultiCurrency && config.features.multiCurrency && !canDisableMultiCurrency
          return (
            <ToggleRow
              key={key}
              icon={meta.icon}
              label={meta.label}
              hint={meta.hint}
              checked={config.features[key]}
              onChange={(v) => setFeature(key, v)}
              disabled={blocked}
              note={blocked ? `${foreignCurrencyTxCount} transaction${foreignCurrencyTxCount === 1 ? '' : 's'} use another currency.` : undefined}
            />
          )
        })}
      </div>

      <SectionTitle
        action={
          <Button type="button" variant="outline" size="sm" onClick={addCustomField} className="gap-1">
            <Plus className="h-3 w-3" />
            Add
          </Button>
        }
      >
        Your own fields
      </SectionTitle>

      {allCustomFields.length === 0 ? (
        <div className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          Add a field of your own — a project, a shop, a "reimbursable?" flag.
        </div>
      ) : (
        <div className="space-y-2">
          {allCustomFields.map((f) => (
            <CustomFieldCard
              key={f.id}
              field={f}
              expanded={editingId === f.id}
              onToggleExpand={() => toggleExpand(f.id)}
              onChange={(patch) => updateCustomField(f.id, patch)}
              onRemove={() => removeCustomField(f.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
