// CollapsibleCard.tsx — a reusable card that can be toggled open/closed.
//
// Used by DashboardTab and (planned) BalanceTab. Keeping it in
// src/spaces/components/ (not inside tabs/) so both sibling tabs can import it.
//
// Anatomy when OPEN:
//   ┌──────────────────────────────────────────┐
//   │  Title                    Summary  ▲      │
//   ├──────────────────────────────────────────┤
//   │  …children…                               │
//   └──────────────────────────────────────────┘
//
// Anatomy when CLOSED:
//   ┌──────────────────────────────────────────┐
//   │  Title                    Summary  ▼      │
//   └──────────────────────────────────────────┘

import { useState } from 'react'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CollapsibleCardProps {
  title: string
  /** Short text shown in the header at all times — a one-line summary of the content. */
  summary: string
  /** Whether the card starts expanded. Defaults to true. */
  defaultOpen?: boolean
  /** Optional controls (edit, delete, reorder…) rendered to the RIGHT of the
   *  header, as a sibling of the toggle button rather than inside it —
   *  a <button> may not contain another <button>. */
  actions?: React.ReactNode
  children: React.ReactNode
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CollapsibleCard({
  title,
  summary,
  defaultOpen = true,
  actions,
  children,
}: CollapsibleCardProps) {
  // isOpen tracks whether the card body is visible.
  // useState initialises from defaultOpen so the parent can set the default
  // state (e.g. some cards start collapsed on first load).
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* ── Header row — always visible ── */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          // flex-1 so the tap target covers the whole header except the actions
          className={`flex flex-1 items-center justify-between py-3 pl-4 text-left ${actions ? 'pr-2' : 'pr-4'}`}
        >
          {/* Card title — left side */}
          <span className="text-sm font-semibold text-foreground">{title}</span>

          {/* Summary + chevron — right side */}
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{summary}</span>
            {/* ▲ / ▼ chevron: simple Unicode character, no icon library needed */}
            <span className="text-xs text-muted-foreground">
              {isOpen ? '▲' : '▼'}
            </span>
          </span>
        </button>

        {actions && <div className="flex shrink-0 items-center gap-1 pr-3">{actions}</div>}
      </div>

      {/* ── Collapsible body ── */}
      {isOpen && (
        <div>
          {/* Divider between header and content */}
          <div className="border-t" />
          <div className="px-4 py-3">{children}</div>
        </div>
      )}
    </div>
  )
}
