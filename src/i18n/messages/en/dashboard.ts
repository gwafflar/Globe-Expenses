// dashboard.ts — the Dashboard tab, its cards, controls and card builder.

import { plural } from '../../plural'

export const dashboard = {
  /** Date-range preset pills and the compact range label (shared/utils/dateRange.ts). */
  range: {
    month: 'This month',
    last30: 'Last 30 days',
    all: 'All time',
    custom: 'Custom',
  },

  /** Short day labels (dashboardHelpers.formatDayLabel / dateRangeLabel). */
  day: {
    today: 'Today',
    yesterday: 'Yest.',
    /** Fallback span label when there is no data. English is always plural
     *  here (kept byte-identical to the original string). */
    days: (n: number) => `${n} days`,
  },

  /** Rows and titles produced by spaces/utils/dashboardCards.ts. */
  breakdown: {
    /** The collapsed tail row / section. */
    other: (n: number) =>
      plural('en', n, { one: `Other · ${n} value`, other: `Other · ${n} values` }),
    /** The "no value" row; `dimension` is the dimension label as displayed. */
    missing: (p: { dimension: string }) => `No ${p.dimension.toLowerCase()}`,
    /** Derived 1D card title. */
    byDimension: (p: { dimension: string }) => `By ${p.dimension.toLowerCase()}`,
    /** Derived 2D card title — the order of the pair is visible. */
    pivotTitle: (p: { primary: string; secondary: string }) =>
      `${p.primary} × ${p.secondary.toLowerCase()}`,
    noData: 'No data',
    showTransactionsFor: (p: { label: string }) => `Show transactions for ${p.label}`,
    expand: (p: { label: string }) => `Expand ${p.label}`,
    collapse: (p: { label: string }) => `Collapse ${p.label}`,
  },

  /** DashboardControls — range pills + member scope picker. */
  controls: {
    allPill: '👤 All',
    youPill: '👤 You',
    whoseSpending: 'Whose spending',
    from: 'From',
    to: 'To',
    apply: 'Apply',
    showSpendingFor: 'Show spending for',
    allMembers: 'All members',
    you: 'You',
    unclaimed: 'unclaimed',
  },

  /** CardBuilder dialog. */
  builder: {
    editTitle: 'Edit card',
    addTitle: 'Add a card',
    description: 'Break your spending down by any field this space tracks.',
    noFields:
      'This space has no fields to break down by yet. Enable a built-in field or add a custom one in Parameters first.',
    firstDimension: 'First dimension',
    secondDimension: 'Second dimension (optional)',
    swapOrder: '⇄ Swap order',
    duplicateHint: 'Already on your dashboard',
    swapUnavailable: 'Swapping is unavailable: already on your dashboard.',
    duplicateExplain:
      'Already on your dashboard. Pick a different combination — or swap the order, which is a different card.',
    title: 'Title',
    preview: 'Preview',
    addCard: 'Add card',
  },

  /** DashboardTab itself. */
  tab: {
    // Hero card
    totalSpent: 'Total spent',
    yourShare: 'Your share',
    memberShare: (p: { name: string }) => `${p.name}'s share`,
    txCountInRange: (p: { count: number; range: string }) =>
      plural('en', p.count, {
        one: `${p.count} transaction · ${p.range}`,
        other: `${p.count} transactions · ${p.range}`,
      }),
    avgPerDay: 'Avg/day',
    you: 'You',
    nameYou: (p: { name: string }) => `${p.name} (you)`,
    paidColon: (p: { amount: string }) => `paid: ${p.amount}`,
    transactions: 'Transactions',

    /** "label: value" — tooltips such as "Mar 12: € 40.00". */
    labelValue: (p: { label: string; value: string }) => `${p.label}: ${p.value}`,

    // Spending over time
    spendingOverTime: 'Spending over time',
    notEnoughData: 'Not enough data',
    txCountShort: (n: number) => plural('en', n, { one: `${n} tx`, other: `${n} txs` }),
    uncategorized: 'Uncategorized',
    showCategory: 'Show this category',
    hideCategoryFromChart: 'Hide entire category from chart',
    hideCategoryFromTheChart: 'Hide entire category from the chart',
    showPill: '👁️ Show',
    hideAllPill: '👁️‍🗨️ Hide all',
    editTransaction: 'Edit this transaction',
    showTransaction: 'Show this transaction',
    hideTransaction: 'Hide this transaction',
    hidden: 'Hidden:',

    // Day by day
    dayByDay: 'Day by day',
    dayCount: (n: number) => plural('en', n, { one: `${n} day`, other: `${n} days` }),
    noExpensesInRange: 'No expenses in this range',
    noExpenses: 'No expenses',
    showFewerDays: 'Show fewer days',
    showAllDays: (n: number) => `Show all ${n} days`,

    // Card management
    moveCardUp: 'Move card up',
    moveCardDown: 'Move card down',
    editCard: 'Edit card',
    deleteCard: 'Delete card',
    emptyCardsInvite: (p: { dimension: string }) =>
      `Break your spending down by ${p.dimension.toLowerCase()} — or any other field.`,
    addACard: '+ Add a card',
    addCard: '+ Add card',
    editCards: 'Edit cards',

    // Per person
    perPerson: 'Per person',
    youSuffix: '(you)',
    paidAmount: (p: { amount: string }) => `paid ${p.amount}`,

    // Wallet balances
    walletBalances: 'Wallet balances',
    walletCount: (n: number) => `${n} wallet(s)`,
    noWalletsYet: 'No wallets yet',
    currencyRemaining: (p: { currency: string }) => `${p.currency} remaining`,
    totalDeposited: 'Total deposited: ',
    totalSpentColon: 'Total spent: ',
    adjustments: 'Adjustments: ',
    sinceLastTopup: 'Since last top-up',
    sinceLastTopupNote: 'Includes all transactions from end of day of last top-up',
    date: 'Date: ',
    amount: 'Amount: ',
    balanceAfter: 'Balance after: ',
    spentSince: 'Spent since: ',
    estRemaining: 'Est. remaining: ',
    notTheAmount: 'Not the amount you have?',
    reconcile: 'Reconcile with current amount',
    noWalletEvents: 'No wallet events recorded yet.',
    history: 'History',
    allWalletEvents: 'All wallet events',
    feesAmount: (p: { amount: string }) => `fees: ${p.amount}`,
    spentBetween: (p: { from: string; to: string }) => `Spent between ${p.from} and ${p.to}:`,
    recordWithdrawalHint: 'Record a withdrawal to start tracking a payment method balance.',
    recordWithdrawal: '+ Record withdrawal',
    walletPrivacyNote:
      'Only your wallet balances are shown. Withdrawal data is stored alongside shared transactions. Transfers between participants are not included in wallet computation.',

    // Currencies
    currencies: 'Currencies',
    convertedNote: 'Amounts converted at rate stored per transaction',
  },
}
