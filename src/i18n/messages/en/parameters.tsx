// parameters.tsx — the Parameters tab, fields editor and shared pickers
// (currency / location selects).
//
// .tsx (not .ts) because a few messages wrap a piece of styled JSX passed in
// by the component (e.g. a bold member name inside a sentence).

import type { ReactNode } from 'react'
import { plural } from '../../plural'

export const parameters = {
  // Section headings of the Parameters tab
  sections: {
    space: 'Space',
    members: 'Members',
    fields: 'Fields',
    currencies: 'Currencies',
    exchangeRates: 'Exchange rates',
    categories: 'Categories',
    paymentMethods: 'Payment methods',
    countries: 'Countries',
    cities: 'Cities',
    feedback: 'Feedback',
    manageSpace: 'Manage space',
  },

  // Space name + emoji
  identity: {
    emoji: 'Emoji',
    emojiAria: 'Space emoji',
    emojiHint: 'Tap 🌐',
    name: 'Name',
    namePlaceholder: 'Space name',
  },

  currencies: {
    mainCurrency: 'Main currency',
    lockedBadge: 'set at creation — cannot be modified',
    // Bold prefix of the collapsed picker summary (trailing space intended)
    pickerLabel: 'Currencies: ',
    noneSelected: 'No currencies selected',
    searchPlaceholder: 'Search currency…',
    noMatch: 'No currencies match.',
    mainTag: '(main)',
  },

  rates: {
    hint: 'Default rates for new transactions. Editing a rate only affects future transactions.',
  },

  countries: {
    // Bold prefix of the collapsed picker summary (trailing space intended)
    pickerLabel: 'Countries: ',
    noneSelected: 'No countries selected',
    searchPlaceholder: 'Search country…',
    noMatch: 'No countries match.',
  },

  // Editable lists: categories, payment methods, cities
  lists: {
    emojiAria: 'Emoji',
    newItemEmojiAria: 'New item emoji',
    deleteItem: (label: string) => `Delete ${label}`,
    categoryPlaceholder: 'Category name…',
    paymentMethodPlaceholder: 'Payment method…',
    cityPlaceholder: 'City name…',
  },

  members: {
    soloTitle: 'Members: You',
    soloOnly: "You're the only member in this space.",
    didYouKnow: 'ℹ️ Did you know?',
    soloHint: 'You can add other people in this space, and share your transactions with them.',
    addMember: 'Add member',
    noSlot: "You haven't claimed a slot yet — pick who you are below.",
    you: 'You',
    unclaimed: 'Unclaimed',
    linkedAccount: 'Linked account',
    creator: 'creator',
    renameAria: (name: string) => `Rename ${name}`,
    thisIsMe: '🎯 This is me',
    thisIsNotMe: '❌ This is not me',
    othersCanRename: '🔓 Others can rename',
    renameLocked: '🔒 Rename locked',
    mergeDuplicates: 'Merge duplicate members',
  },

  // "Add a member" modal (4 tabs)
  addMember: {
    title: 'Add a member',
    tabs: {
      name: 'By Name',
      friend: 'Friend',
      username: '@Username',
      link: 'Link',
    },
    byNameHint:
      "Add someone who doesn't have an account. They won't be able to log in, but you can track their share of expenses.",
    namePlaceholder: 'Their name…',
    loadingFriends: 'Loading friends…',
    noFriends: 'No friends yet. Use the @Username tab to find people, or share the invite link.',
    allFriendsIn: 'All your friends are already in this space.',
    invited: 'Invited',
    invite: 'Invite',
    usernameHint: 'Search by @username. An invite will be sent — they must accept to join.',
    usernamePlaceholder: '@username…',
    inSpace: 'In space',
    noUsers: 'No users found.',
    linkHint: 'Share this link with anyone. They can join the space and become your friend.',
    creatingLink: 'Creating link…',
    generateLink: 'Generate invite link',
    linkAnyone: 'Anyone with this link can join this space.',
  },

  // "Merge duplicate members" modal
  merge: {
    doneTitle: '✅ Members merged',
    confirmTitle: 'Confirm merge',
    // p.name is the styled, quoted member name
    doneDeleted: (p: { name: ReactNode }) => <>{p.name} deleted. All transactions updated.</>,
    doneKept: (p: { name: ReactNode }) => <>Expenses are now under {p.name}.</>,
    selectHint: 'Select two member slots that represent the same person. Their expenses will be combined.',
    confirmHint:
      'Choose which member slot to keep. The other will be deleted and all their expenses will move to the kept slot.',
    keep: '← Keep',
    delete: '← Delete',
    cannotUndo: '⚠️ This cannot be undone.',
    warning: (p: { deleted: string; kept: string }) =>
      `"${p.deleted}" will be permanently deleted. All their transactions will move to "${p.kept}".`,
    merging: 'Merging…',
    mergeAndDelete: 'Merge & delete',
  },

  // "This is not me" modal
  unlink: {
    title: 'Who are you in this trip?',
    hint: 'Choose a member to continue. You can pick yourself or a new person.',
    currentlyYou: '(currently you)',
    thisIsMe: 'This is me',
    createNew: '+ Create new member',
    namePlaceholder: 'Name…',
  },

  // Archive / leave / delete
  manage: {
    archiving: 'Archiving…',
    unarchiving: 'Unarchiving…',
    archived: 'Archived!',
    unarchived: 'Unarchived!',
    archive: 'Archive this space',
    unarchive: 'Unarchive this space',
    archiveHintSolo:
      'Move this space to an archive directory. You will still be able to open it and add or edit transactions.',
    archiveHintMulti:
      'Move this space to an archive directory. You will remain a member of this space, and still be able to open it and add or edit transactions. This will have no impact on other participants.',
    archivedBanner: 'This space is now archived. It will appear in your "Archived" section.',
    unarchivedBanner: 'This space has been unarchived and is back in your active list.',
    deleteSpace: 'Delete this space',
    leaveSpace: 'Leave this space',
    deleteExplain:
      'You are the only user. Deleting will permanently remove this space and all its transactions.',
    leaveExplain:
      'Leaving will remove you from the space. Other members will still have access. Your past transactions will be preserved.',
    deleteTitle: 'Delete this space?',
    leaveTitle: 'Leave this space?',
    deleteDescription:
      'This will permanently delete the space and all its transactions. This action cannot be undone.',
    leaveDescription:
      'You will lose access to this space. Your expense history will be preserved for other members.',
    deleting: 'Deleting…',
    leaving: 'Leaving…',
    leave: 'Leave',
  },

  // FieldsEditor (Parameters → Fields, and the creation flow)
  fields: {
    builtIn: {
      country: { label: 'Country', hint: 'Picker with flags' },
      city: { label: 'City', hint: 'Auto-filled from your entries' },
      category: { label: 'Category', hint: 'Used by the dashboard breakdown' },
      paymentMethod: { label: 'Payment method', hint: 'Required for cash wallets' },
      notes: { label: 'Notes', hint: 'Free text on each transaction' },
    },
    features: {
      wallets: { label: 'Cash wallet', hint: 'Withdrawals, adjustments, balance tracking' },
      multiCurrency: {
        label: 'Multiple currencies',
        hint: 'Turns on by itself the first time you use another currency',
      },
    },
    // Custom field types (ids are stored values: 'select' | 'text' | 'boolean')
    types: {
      select: 'Choice',
      text: 'Text',
      boolean: 'Yes-no',
    },
    untitled: 'Untitled field',
    enableField: (label: string) => (label ? `Enable ${label}` : 'Enable field'),
    emojiAria: 'Field emoji',
    namePlaceholder: 'Field name',
    labelAria: 'Field label',
    type: 'Type',
    choices: 'Choices',
    removeChoice: (label: string) => `Remove ${label}`,
    addChoicePlaceholder: 'Add a choice…',
    addChoiceAria: 'Add a choice',
    choicesHint: 'Renaming a choice updates it everywhere, past transactions included.',
    textHint: 'Free text. Searchable, but not summed or charted.',
    booleanHint: 'A yes/no switch. You can filter on it and total the amounts marked yes.',
    deleteField: 'Delete this field',
    deleteTitle: (label: string) => `Delete "${label}"?`,
    deleteDescription:
      'Values already recorded in this field will no longer be visible. You can instead use the switch above to hide the field without losing anything.',
    preset: 'Preset',
    modified: '(modified)',
    differs: 'Your settings differ from the preset',
    matches: 'Matches the preset',
    reset: 'Reset',
    resetTitle: (title: string) => `Reset to ${title}?`,
    resetDescription: 'Your own fields, categories and members are not affected.',
    on: 'on',
    off: 'off',
    keepMine: 'Keep mine',
    resetToggles: 'Reset toggles',
    onEachTransaction: 'Fields on each transaction',
    walletNeedsPm: 'The cash wallet needs this field.',
    offHint: 'Turning a field off hides it. Nothing you already entered is deleted.',
    featuresTitle: 'Features',
    foreignCurrencyTx: (n: number) =>
      plural('en', n, {
        one: `${n} transaction use another currency.`,
        other: `${n} transactions use another currency.`,
      }),
    customTitle: 'Your own fields',
    customEmpty: 'Add a field of your own — a project, a shop, a "reimbursable?" flag.',
  },

  // Shared pickers: CurrencySelect.tsx, LocationSelect.tsx
  pickers: {
    search: 'Search…',
    // "in EUR · + other currency" — p.other is the tappable link
    inCurrency: (p: { currency: string; other: ReactNode }) => (
      <>
        in {p.currency} · {p.other}
      </>
    ),
    otherCurrency: '+ other currency',
    enterValue: (label: string) => `Enter ${label.toLowerCase()}…`,
    other: 'Other',
    addNew: '+ Add new…',
    savedAsOther: 'Saved as "Other". Use "Add new…" to enter a specific name.',
  },
}
