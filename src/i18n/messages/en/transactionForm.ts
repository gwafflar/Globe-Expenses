// transactionForm.ts — the full-screen transaction form (all four types).
// Type labels (Expense, Transfer…) live in transactions.types, shared with other screens.

export const transactionForm = {
  profileUnavailable: 'User profile unavailable. Please sign out and sign in again.',

  // Top-bar title, per mode and type (separate strings: French nouns have genders).
  title: {
    new: {
      expense: 'New expense',
      transfer: 'New transfer',
      withdrawal: 'New withdrawal',
      adjustment: 'New adjustment',
    },
    edit: {
      expense: 'Edit expense',
      transfer: 'Edit transfer',
      withdrawal: 'Edit withdrawal',
      adjustment: 'Edit adjustment',
    },
  },

  // Field labels
  fields: {
    country: 'Country',
    city: 'City',
    category: 'Category',
    paymentMethod: 'Payment Method',
    topUp: 'Top up',
    from: 'From',
    to: 'To',
    paidBy: 'Paid by',
    split: 'Split',
    fees: 'Fees (optional)',
    adjustmentMode: 'Adjustment mode',
    notes: 'Notes',
  },

  // Amount label, adapted to the type
  amount: {
    default: 'Amount',
    transfer: 'Transfer amount',
    withdrawal: 'Withdraw amount',
  },

  // Name input placeholder, per type
  namePlaceholder: {
    expense: 'e.g. Dinner, Taxi, Hotel night',
    transfer: 'e.g. Settlement, Loan to Bob',
    withdrawal: 'e.g. ATM Bangkok (optional)',
    adjustment: 'e.g. Cash reconciliation (optional)',
  },

  // Dropdowns
  select: {
    optional: '— optional —',
    required: '— select —',
    add: '+ Add…',
    addNew: '+ Add new…',
    searchCountry: 'Search country…',
    // Placeholder of the inline "add a new item" input
    newCategory: 'New category…',
    newPaymentMethod: 'New payment method…',
    newTopUp: 'New top up…',
    // Transfer sender list: marks the current user
    you: (p: { name: string }) => `${p.name} (you)`,
  },

  // Formula mode + exchange rate
  formula: {
    close: 'Close formula mode',
    open: 'Enter formula mode',
    enterAbove: 'enter formula above',
  },
  rate: {
    unknown: (p: { from: string; to: string }) =>
      `⚠️ No exchange rate known for ${p.from} → ${p.to}. Amount shown unconverted — enter a rate below.`,
    customSuffix: ' (custom)',
    saveAsDefault: 'Save as default rate',
    reset: 'Reset',
  },

  feesHint: 'Deducted from wallet balance (you received amount minus fees)',

  adjustment: {
    balanceOnly: 'Balance only',
    countAsExpense: 'Count as expense',
    balanceOnlyHint: 'Only corrects the wallet balance. Does not appear in spending stats or category breakdowns.',
    expenseHint: 'Corrects the wallet balance and counts toward spending analytics (totals, categories, charts).',
  },

  solo: {
    prompt: '👥 Share this expense with your friends? Add them to this space.',
    cta: 'Save & add friends →',
  },

  notesPlaceholder: 'Any additional details…',

  // Split drawers
  drawer: {
    paidBy: 'Paid by',
    transferTo: 'Transfer to',
    splitBetween: 'Split between',
  },

  // Validation
  errors: {
    dateRequired: 'Date is required.',
    nameRequired: 'Name is required.',
    invalidAmount: 'Enter a valid amount.',
    positiveAmount: 'Enter a positive amount.',
    paymentMethodRequired: 'Payment method is required.',
    feesNonNegative: 'Fees must be 0 or positive.',
    feesTooHigh: 'Fees must be less than the withdrawal amount.',
    paidByTotal: 'Paid by amounts must equal the total.',
    splitTotal: 'Split amounts must equal the total.',
  },
  // Summary under the form: "Please fix: Name, Amount"
  pleaseFix: (p: { fields: string }) => `Please fix: ${p.fields}`,
  errorFields: {
    date: 'Date',
    name: 'Name',
    amount: 'Amount',
    paidBy: 'Paid by',
    beneficiaries: 'Split',
    paymentMethod: 'Payment method',
    fees: 'Fees',
  },

  // Close confirmation
  discard: {
    titleEdit: 'Discard changes?',
    titleNew: 'Discard transaction?',
    descriptionEdit: 'The changes are not saved and will be lost.',
    descriptionNew: 'The transaction is not saved and will be lost.',
    confirm: 'Discard',
  },

  // Default transaction names WRITTEN to Firestore (stored in the language the
  // user had when saving).
  defaults: {
    settlementName: 'Settlement',
    topUpName: (p: { method: string }) => `Top-up ${p.method}`,
    adjustmentName: (p: { method: string }) => `Adjustment — ${p.method}`,
    transactionName: 'Transaction',
  },
}
