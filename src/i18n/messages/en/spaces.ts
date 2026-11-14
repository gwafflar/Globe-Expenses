// spaces.ts — spaces list, space creation, presets, space detail page and tab shell.

import { plural } from '../../plural'

export const spaces = {
  /** Avatar button in the page headers (tooltip). */
  profile: 'Profile',

  // SpacesPage — the list of the user's spaces
  list: {
    title: 'Your spaces',
    subtitle: 'Select a trip to view and manage its expenses.',
    newSpace: 'New space',
    loading: 'Loading your spaces...',
    loadError: 'Unable to load your spaces.',
    /** useSpaces() fallback when Firestore gives no message. */
    loadErrorFallback: 'Unable to load spaces.',
    empty: 'No spaces yet.',
    emptyHint: 'Create your first trip to start tracking shared expenses with your space companions.',
    createFirst: '🚀 Create your first trip',
    allArchived: 'All your spaces are archived.',
    archived: (n: number) => `Archived (${n})`,
  },

  // Display texts of the creation presets, keyed by PresetId. The config data
  // (fields, features, emoji) stays in src/spaces/presets.ts.
  presets: {
    travel: {
      title: 'Travel',
      description: 'Trip abroad, solo or with friends',
      chips: ['Countries', 'Cities', 'Multi-currency', 'Cash wallet'],
      namePlaceholder: 'Japan 2026',
    },
    solo: {
      title: 'Solo budget',
      description: 'Track your own spending',
      chips: ['Categories', 'Payment methods'],
      namePlaceholder: 'My budget',
    },
    group: {
      title: 'Group',
      description: 'Flatmates, colleagues, couple',
      chips: ['Categories', 'Split & balance'],
      namePlaceholder: 'Colocation',
    },
    custom: {
      title: 'Custom',
      description: 'Start from scratch',
      chips: ['Pick your own fields'],
      namePlaceholder: 'My space',
    },
  },

  // PresetPicker — step 1 of space creation
  presetPicker: {
    title: 'New space',
    subtitle: 'Pick a starting point. You can change everything later.',
  },

  // SpaceCreatePage — essentials step + "created" screen
  create: {
    newSpace: 'New space',
    name: 'Name',
    spaceEmoji: 'Space emoji',
    mainCurrency: 'Main currency',
    mainCurrencyWarning: "Everything is converted to this. It can't be changed afterwards.",
    otherCurrencies: 'Other currencies',
    /** Styled suffix after "Other currencies" / "Set trip dates". */
    optionalSuffix: '— optional',
    setTripDates: 'Set trip dates',
    customizeFields: 'Customize fields',
    customizeFieldsSummary: 'Set up now, or leave it and change it later',
    createSpace: 'Create space',
    /** Member display name written to Firestore when the account has neither a name nor an email. */
    unknownMember: 'Unknown',
    ready: (p: { name: string }) => `${p.name} is ready`,
    readyHint: 'Invite people now, or open the space and do it later.',
    linkCopied: 'Link copied',
    copyInviteLink: 'Copy invite link',
    openSpace: 'Open space',
  },

  // SpaceDetailPage — header, banners, error states, dialogs
  detail: {
    savedLocally: '⏳ Saved locally — will sync with the server',
    transactionSaved: '✅ Transaction saved',
    unarchivedDone: 'This space has been unarchived and is back in your active list.',
    archived: 'This space is archived.',
    unarchiving: 'Unarchiving…',
    unarchive: 'Unarchive',
    rateRepair: (p: { count: number; codes: string }) =>
      plural('en', p.count, {
        one: `⚠️ Corrected ${p.count} exchange rate (${p.codes}) that were stored backwards due to a since-fixed bug. Past transactions are unaffected.`,
        other: `⚠️ Corrected ${p.count} exchange rates (${p.codes}) that were stored backwards due to a since-fixed bug. Past transactions are unaffected.`,
      }),
    dismiss: 'Dismiss',
    missingId: 'Missing space identifier.',
    offlineMessage: "Check your connection and try again — we can't tell whether this space exists until we hear back from the server.",
    notFoundMessage: 'It may have been deleted, or you might not have permission to view it.',
    loadErrorMessage: 'Unable to load this space. Please try again later.',
    allSpaces: 'All spaces',
    loadingSpace: 'Loading space…',
    slowHint: "You seem to have connection issues. If the space doesn't load, try turning off Wi-Fi and mobile data to use the app offline.",
    cantConfirm: "Can't confirm this space",
    notFoundTitle: 'Space not found',
    offlineLead: "You're offline, and this space isn't in your local cache.",
    notFoundLead: "We couldn't find this space.",
    backToSpaces: 'Back to spaces',
    transactionGone: 'This transaction no longer exists.',
    cameraTooltip: 'Coming in v2 — snap a receipt and let AI fill in the transaction.',
    noSlotTitle: 'Claim your member slot first',
    noSlotDescription: "You haven't claimed a member slot yet. Choose who you are in this space so we know who paid for transactions you record.",
    goToMembers: 'Go to Members',
    deleteTitle: 'Delete this expense?',
    deleteDescription: 'This action cannot be undone. The expense will be permanently removed for all members.',
    /** Push-permission banner text, moment (e1). */
    pushPrompt: (p: { author: string; name: string; amount: string }) =>
      `${p.author} added ${p.name} (${p.amount}) involving you. Get notified next time?`,
    someone: 'Someone',
  },

  // SpaceTabs — the four tab labels
  tabs: {
    transactions: 'Transactions',
    balance: 'Balance',
    dashboard: 'Dashboard',
    parameters: 'Parameters',
  },
}
