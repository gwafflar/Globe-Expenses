
// src/shared/components/FormulaBadge.tsx
//
// Small "fx" badge shown on transaction list items and detail views
// when the transaction has a stored formula.
// On hover (or tap on mobile), shows the original formula in a tooltip.

interface FormulaBadgeProps {
  formula: string
}

export function FormulaBadge({ formula }: FormulaBadgeProps) {
  return (
    // `group` enables the child tooltip to react to hover on the parent.
    <span className="relative group inline-flex items-center">
      {/* The badge itself: small pill, accent-colored, monospace "fx" label */}
      <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-mono font-semibold bg-primary/10 text-primary border border-primary/20 cursor-default select-none">
        fx
      </span>

      {/* Tooltip showing the full formula on hover */}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md border border-border opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10"
      >
        = {formula}
      </span>
    </span>
  )
}