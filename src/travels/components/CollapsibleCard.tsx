// CollapsibleCard.tsx — a reusable card that can be toggled open/closed.
//
// Used by DashboardTab and (planned) BalanceTab. Keeping it in
// src/travels/components/ (not inside tabs/) so both sibling tabs can import it.
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
  children: React.ReactNode
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CollapsibleCard({
  title,
  summary,
  defaultOpen = true,
  children,
}: CollapsibleCardProps) {
  // isOpen tracks whether the card body is visible.
  // useState initialises from defaultOpen so the parent can set the default
  // state (e.g. some cards start collapsed on first load).
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* ── Header row — always visible ── */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        // w-full so the tap target covers the whole header, not just the chevron
        className="flex w-full items-center justify-between px-4 py-3 text-left"
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
