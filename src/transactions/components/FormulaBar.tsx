// src/transactions/components/FormulaBar.tsx
//
// Inline formula editor shown in place of the amount input when formula mode is active.
//
// Layout (expands ABOVE the amount row):
//   [operator chips: ( ) * / + -]
//   [= ][text input                    ]
//   [live preview: = 6.50  or  error   ]
//
// Props:
//   value         — the current formula string (controlled)
//   onChange      — called on every keystroke with the new formula string
//   onEvaluated   — called with the numeric result whenever the formula is valid
//                   called with null when the formula becomes invalid

import { useRef } from 'react'
import { Input } from '@/components/ui/input'
import { evaluateFormula } from '@/shared/utils/formulaUtils'

// The operator symbols the user can tap to insert into the formula.
// Grouped as: grouping, then multiplicative, then additive.
const OPERATOR_CHIPS = ['(', ')', '*', '/', '+', '-'] as const

interface FormulaBarProps {
  value: string
  onChange: (formula: string) => void
  onEvaluated: (result: number | null) => void
}

export function FormulaBar({ value, onChange, onEvaluated }: FormulaBarProps) {
  // Ref to the text input so we can manage cursor position after chip insertion.
  // (A ref gives us direct access to the underlying DOM element — needed here
  // because React's controlled input doesn't expose cursor position natively.)
  const inputRef = useRef<HTMLInputElement>(null)

  // Evaluate on every render so the preview is always in sync.
  const result = evaluateFormula(value)
  const isInvalid = value.trim().length > 0 && result === null

  // Called when the user types in the formula input.
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    onChange(next)
    onEvaluated(evaluateFormula(next))
  }

  // Insert an operator at the current cursor position.
  // This feels much better than always appending to the end —
  // the user can position the cursor mid-formula and insert there.
  function insertAtCursor(op: string) {
    const el = inputRef.current
    if (!el) return

    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length

    // Build the new formula by splicing the operator at the selection point.
    const next = value.slice(0, start) + op + value.slice(end)
    onChange(next)
    onEvaluated(evaluateFormula(next))

    // Restore focus and reposition cursor after the inserted character.
    // We use requestAnimationFrame because React re-renders asynchronously —
    // we need the DOM to update before we can set selectionStart.
    requestAnimationFrame(() => {
      el.focus()
      const newPos = start + op.length
      el.setSelectionRange(newPos, newPos)
    })
  }

  return (
    // The whole bar is wrapped in a rounded bordered container to visually group it.
    // `animate-in` + `fade-in` + `slide-in-from-top-1` are Tailwind v4 animation
    // utilities — they produce a subtle slide-down reveal when the bar appears.
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-2 animate-in fade-in slide-in-from-top-1 duration-150">

      {/* Operator chip row */}
      <div className="flex gap-1">
        {OPERATOR_CHIPS.map((op) => (
          <button
            key={op}
            type="button" // prevent accidental form submission
            onClick={() => insertAtCursor(op)}
            // Chip styling: small, monospace, pill-shaped, tappable on mobile (min 36px height)
            className="min-w-[36px] min-h-[36px] rounded-md border border-border bg-background px-2 py-1 font-mono text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            aria-label={`Insert ${op}`}
          >
            {op}
          </button>
        ))}
      </div>

      {/* Formula input row: = sign + text field */}
      <div className="flex items-center gap-2">
        {/* The "=" prefix is purely visual — it communicates "this is a formula", Excel-style */}
        <span className="text-sm font-mono font-semibold text-muted-foreground select-none">
          =
        </span>
        <Input
          ref={inputRef}
          type="text"
          inputMode="decimal" // shows numeric keyboard on mobile, but allows all chars
          placeholder="e.g. 2*2.5 + 1.5"
          value={value}
          onChange={handleInputChange}
          // Red border when the user has typed something invalid
          className={isInvalid ? 'border-destructive focus-visible:ring-destructive' : ''}
          autoFocus // focus the input as soon as the bar appears
          aria-label="Formula input"
          aria-describedby="formula-preview"
        />
      </div>

      {/* Live result preview */}
      <div id="formula-preview" className="min-h-[1.25rem] px-1">
        {value.trim().length === 0 ? null : isInvalid ? (
          // Show a red error hint when the formula can't be parsed
          <p className="text-xs text-destructive">Invalid formula</p>
        ) : (
          // Show the evaluated result in muted text as a preview
          <p className="text-xs text-muted-foreground">
            = <span className="font-semibold text-foreground">{result?.toFixed(2)}</span>
          </p>
        )}
      </div>
    </div>
  )
}