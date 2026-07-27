// src/spaces/components/PresetPicker.tsx
//
// Step 1 of space creation: a 2×2 grid of preset cards, driven entirely by
// the PRESETS constant (Phase 2, src/spaces/presets.ts) — no preset content
// is hard-coded here. Tapping a card selects it and advances immediately,
// no separate Continue button (SPEC §7, Step 1).

import { PRESETS } from '@/spaces/presets'
import type { PresetId } from '@/spaces/types'

const PRESET_ORDER: PresetId[] = ['travel', 'solo', 'group', 'custom']

export function PresetPicker({ onPick }: { onPick: (id: PresetId) => void }) {
  return (
    <div className="px-4 py-5">
      <h1 className="text-xl font-bold">New space</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick a starting point. You can change everything later.
      </p>

      {/* 2×2 grid — must remain usable at 375px, the app's minimum target width */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {PRESET_ORDER.map((id) => {
          const preset = PRESETS[id]
          return (
            <button
              key={id}
              type="button"
              onClick={() => onPick(id)}
              className="flex flex-col rounded-xl border bg-card p-3 text-left shadow-sm transition-colors active:border-primary active:bg-primary/5"
            >
              <span className="text-2xl">{preset.emoji}</span>
              <span className="mt-1.5 text-sm font-semibold">{preset.titleKey}</span>
              <span className="mt-0.5 text-xs leading-snug text-muted-foreground">
                {preset.description}
              </span>
              <span className="mt-2 flex flex-wrap gap-1">
                {preset.chips.map((chip) => (
                  <span key={chip} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {chip}
                  </span>
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
