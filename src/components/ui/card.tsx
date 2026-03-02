// Simple Card primitives (Card, CardHeader, etc.) styled with Tailwind.
// These follow the same composition pattern as shadcn/ui's Card.

import type { HTMLAttributes } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export function Card({ className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-lg border bg-card text-card-foreground shadow-sm ${className}`}
      {...props}
    />
  )
}

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {}

export function CardHeader({ className = '', ...props }: CardHeaderProps) {
  return <div className={`flex flex-col space-y-1.5 p-6 ${className}`} {...props} />
}

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {}

export function CardTitle({ className = '', ...props }: CardTitleProps) {
  return <h2 className={`text-xl font-semibold leading-none tracking-tight ${className}`} {...props} />
}

export interface CardDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {}

export function CardDescription({ className = '', ...props }: CardDescriptionProps) {
  return <p className={`text-sm text-muted-foreground ${className}`} {...props} />
}

export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {}

export function CardContent({ className = '', ...props }: CardContentProps) {
  return <div className={`p-6 pt-0 ${className}`} {...props} />
}

