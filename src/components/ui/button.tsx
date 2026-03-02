// Simple Button component styled with Tailwind.
// This is similar in spirit to shadcn/ui's Button but simplified.

import type { ButtonHTMLAttributes } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  // we can extend with variant/size props later if needed
}

export function Button({ className = '', ...props }: ButtonProps) {
  // Basic primary button styles + allow callers to override/extend via className.
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    />
  )
}

