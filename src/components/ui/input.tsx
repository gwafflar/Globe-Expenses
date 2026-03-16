// Simple Input component styled with Tailwind.
// Matches the general shape of shadcn/ui's Input.

import { forwardRef, type InputHTMLAttributes } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

// forwardRef allows parent components to attach a ref to the underlying <input>
// element (e.g. to programmatically focus it).
export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ className = '', ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
        {...props}
      />
    )
  },
)
