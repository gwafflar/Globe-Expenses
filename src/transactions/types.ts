import type { Timestamp } from 'firebase/firestore'

export interface Split {
  uid: string
  amount: number // in transaction currency
}

export type CreatedByRef =
  | { type: 'user'; uid: string }
  | { type: 'agent'; name: string }

export interface Transaction {
  txId: string
  date: string // date string "DD-MM-YYYY"
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
}

