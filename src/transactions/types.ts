import type { Timestamp } from 'firebase/firestore'

export interface Split {
  // Stable travelMemberId (nanoid) — never a Firebase Auth UID.
  // Use travel.members.find(m => m.travelMemberId === s.travelMemberId) to resolve display info.
  travelMemberId: string
  amount: number // in transaction currency
}

export type CreatedByRef =
  | { type: 'user'; uid: string }
  | { type: 'agent'; name: string }

// Discriminates transaction purpose. Undefined on legacy documents = 'expense'.
// - 'expense': regular spending (default)
// - 'withdrawal': money deposited into a payment method (ATM withdrawal, top-up, etc.)
// - 'adjustment': reconciliation entry to correct a wallet balance
export type TransactionType = 'expense' | 'withdrawal' | 'adjustment'

// For adjustments: determines whether the amount affects spending analytics.
// - 'expense': counted in spending stats (category breakdown, per-member totals, etc.)
// - 'balance_only': only affects the wallet balance, invisible to spending analytics
export type AdjustmentMode = 'expense' | 'balance_only'

export interface Transaction {
  txId: string
  date: string // date string "DD-MM-YYYY"
  country?: string   // Stored as plain strings. Country includes the flag emoji prefix (e.g. "🇯🇵 Japan").
  city?: string   // City flag emoji deferred to v2 (requires country→city mapping).
  name: string
  totalAmount: number
  currency: string // ISO 4217
  exchangeRate: number
  totalAmountMain: number
  category?: string
  paymentMethod?: string
  paidBy: Split[]
  beneficiaries: Split[]
  createdBy: CreatedByRef
  createdAt: Timestamp
  lastModifiedAt: Timestamp
  lastModifiedBy: string
  draftId?: string
  notes?: string
  amountFormula?: string  // Raw formula string entered by the user (e.g. "2*2.5 + 1.5"). totalAmount is always the computed result. This field is display-only — it is never used in any calculation.
  type?: TransactionType  // Optional for backward compat — undefined treated as 'expense'
  fees?: number           // Withdrawal fees (same currency). Deducted from wallet balance (user received totalAmount - fees).
  adjustmentMode?: AdjustmentMode  // Only meaningful when type === 'adjustment'
}
