// Simple Label component styled with Tailwind.
// Mirrors the basic API of shadcn/ui's Label.

import type { LabelHTMLAttributes } from 'react'

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {}

export function Label({ className = '', ...props }: LabelProps) {
  return (
    <label
      className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}
      {...props}
    />
  )
}

