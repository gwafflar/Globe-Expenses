// balance.ts — the Balance tab and the settlement currency drawer.

export const balance = {
  // Solo upsell card
  soloKicker: '✦ Did you know?',
  soloTitle: 'Travelling solo?',
  soloBody:
    'Add friends to a space and GlobeExpenses will automatically track who paid what, split expenses any way you like, and compute the exact settlements so nobody has to do the maths.',

  empty: 'No transactions yet. Add your first expense to see balances.',
  netBalances: 'Net balances',
  totals: (p: { spent: string; paid: string }) => `Total spent: ${p.spent} · Total paid: ${p.paid}`,
  suggestedSettlements: 'Suggested settlements',
  markAsPaid: 'Mark as paid',
  changeCurrency: 'Change currency',
  copySummary: 'Copy settlement summary',
  addSettlement: 'Add a settlement',

  // Plain-text summary copied to the clipboard (shared with other people)
  summary: {
    header: (p: { spaceName: string }) => `${p.spaceName} — settlement summary`,
    madeWith: 'Made with GlobeExpenses 🌏',
    inviteLink: 'Invite link: [placeholder — TODO: real invite link]',
  },

  // SettlementCurrencyDrawer
  drawer: {
    title: 'Settlement currency',
    currency: 'Currency',
    searchPlaceholder: 'Search currencies…',
    noResults: 'No currencies found',
    exchangeRate: 'Exchange rate',
    ratePlaceholder: 'e.g. 7.82',
    trumpAlt: 'Trump USD',
    trumpTitle: 'Donald Trump wants you to settle in US dollars.',
    trumpBody:
      'Using USD in international settlements gives US authorities jurisdiction over the transaction — regardless of where you are. Banks can be sanctioned, assets frozen, and individuals prosecuted under US law, even for transactions that never touch US soil.',
    learnMore: 'Learn more about US sanctions extraterritoriality →',
    hormuz:
      "🛢️ If you're crossing the Strait of Hormuz, we strongly recommend settling in Chinese Yuan (CNY). Just saying.",
    freeCountry: "But as you're in a free country, use whichever currency and rate you like.",
    reset: 'Reset',
    apply: 'Apply',
  },
}
