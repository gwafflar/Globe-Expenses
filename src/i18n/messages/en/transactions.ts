// transactions.ts — split editor, formula bar, reconciliation, filters, type labels.

import { plural } from '../../plural'

export const transactions = {
  // Display names of the four transaction types. The stored values
  // ('expense', 'transfer', …) are never translated — only these labels.
  // Reusable by any screen that shows a type: t.transactions.types[type].
  types: {
    expense: 'Expense',
    transfer: 'Transfer',
    withdrawal: 'Withdrawal',
    adjustment: 'Adjustment',
  },

  // useTransactions — errors shown when the list cannot load.
  load: {
    missingSpace: 'Missing space identifier.',
    failed: (p: { code: string; message: string }) =>
      `Unable to load transactions. (${p.code}: ${p.message})`,
  },

  // FilterPanel + filterDimensions.ts
  filters: {
    // Chip label of each core / built-in dimension (custom fields use their own label).
    dimensions: {
      type: 'Type',
      category: 'Category',
      currency: 'Currency',
      country: 'Country',
      city: 'City',
      paymentMethod: 'Payment',
      paidBy: 'Paid by',
      beneficiaries: 'For',
    },
    // Option shown for transactions where an optional field has no value.
    undefinedOption: 'Undefined',
    yes: 'Yes',
    no: 'No',
    any: 'Any',
    searchPlaceholder: 'Search name, notes or amount…',
    clear: 'Clear',
    clearAll: 'Clear all',
    spendingOnly: 'Spending only',
    removeDateRange: 'Remove date range filter',
    removeSpendingOnly: 'Remove spending-only filter',
    removeFilter: (p: { value: string }) => `Remove filter ${p.value}`,
    // Badge for a value that means nothing on its own ("Undefined", Yes/No).
    qualified: (p: { dimension: string; value: string }) => `${p.dimension}: ${p.value}`,
  },

  // SplitSummaryRow + SplitEditor
  split: {
    notSet: 'Not set',
    you: 'You',
    youPlusOthers: (n: number) =>
      plural('en', n, { one: `You + ${n} other`, other: `You + ${n} others` }),
    people: (n: number) => plural('en', n, { one: `${n} person`, other: `${n} people` }),
    modes: {
      equal: 'Equal',
      custom: 'Custom',
    },
    // "You + 1 other · Equal"
    withMode: (p: { names: string; mode: string }) => `${p.names} · ${p.mode}`,
    incomplete: 'Split is incomplete',
    unassigned: (p: { amount: string }) => `${p.amount} unassigned`,
    overTotal: (p: { amount: string }) => `${p.amount} over total`,
    totalChanged: 'Total changed. Please review and adjust amounts manually.',
    absorb: (p: { amount: string; name: string }) => `Absorb ${p.amount} into ${p.name}`,
    removeMember: (p: { name: string }) => `Remove ${p.name}`,
    addMember: 'Add member',
    remaining: 'Remaining',
  },

  // FormulaBar
  formula: {
    insert: (p: { op: string }) => `Insert ${p.op}`,
    placeholder: 'e.g. 2*2.5 + 1.5',
    inputLabel: 'Formula input',
    invalid: 'Invalid formula',
  },

  // ReconciliationDialog
  reconcile: {
    title: (p: { method: string; currency: string }) => `Reconcile — ${p.method} (${p.currency})`,
    computedRemaining: 'Computed remaining',
    actualQuestion: 'How much do you actually have?',
    difference: 'Difference',
    more: '(you have more than expected)',
    less: '(you have less than expected)',
    balanced: 'Balanced — no adjustment needed',
    howToRecord: 'How should the difference be recorded?',
    createExpense: 'Create expense',
    createExpenseHint: 'Counts toward spending stats (category breakdown, totals)',
    balanceOnly: 'Adjust balance only',
    balanceOnlyHint: 'Corrects the wallet balance without affecting spending analytics',
    // Name of the adjustment transaction this dialog WRITES to Firestore — so it
    // is stored in the language the user had when reconciling.
    surplusName: (p: { method: string }) => `Reconciliation surplus — ${p.method}`,
    shortfallName: (p: { method: string }) => `Reconciliation shortfall — ${p.method}`,
  },
}
