// Switch.tsx — shared on/off toggle. Track/thumb colors mirror shadcn/ui's
// actual Switch component (bg-input off / bg-primary on for the track,
// bg-primary-foreground / bg-foreground for the thumb in dark mode) — plain
// bg-muted/bg-background is too close in value to itself in both themes and
// renders as a flat blob with no visible knob.

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors ${
        checked ? 'bg-primary' : 'bg-input dark:bg-input/80'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full shadow transition-transform ${
          checked ? 'translate-x-5 bg-background dark:bg-primary-foreground' : 'translate-x-1 bg-background dark:bg-foreground'
        }`}
      />
    </button>
  )
}
