// transactionsTab.ts — the Transactions tab (list, rows, empty states, actions).

export const transactionsTab = {
  /** Shown on tap / hover of the greyed-out Import and Export buttons. */
  sheetsComingSoon: 'This feature is coming back soon',

  // Sync badge on a row
  pending: '⏳ Pending',
  pendingTitle: 'Saved locally — will sync when back online.',
  synced: '✅ Saved',

  // Type badges on a row (expenses have none)
  types: {
    transfer: 'Transfer',
    withdrawal: 'Withdrawal',
    adjustment: 'Adjustment',
  },
  yourShare: (p: { amount: string }) => `your share: ${p.amount}`,

  // Expanded detail panel
  detail: {
    category: 'Category',
    payment: 'Payment',
    fees: 'Fees',
    country: 'Country',
    city: 'City',
    notes: 'Notes:',
    from: 'From',
    to: 'To',
    paidBy: 'Paid by',
    split: 'Split',
    you: '(you)',
  },

  // Toolbar
  comingSoon: 'Coming soon',
  filter: '🔍 Filter',
  display: '⊞ Display',
  import: 'Import',
  export: 'Export',
  exporting: 'Exporting…',

  // Empty states
  empty: 'No expenses recorded yet.',
  emptyHint: 'Tap + to add your first expense.',
  addFirst: '💸 Add your first expense',
  noMatch: 'No transactions match your filters.',
  clearAll: 'Clear all filters',
}
