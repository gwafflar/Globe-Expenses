// profile.tsx — the Profile page (identity, security, preferences, friends, sign out).
// `.tsx` because the sign-out dialog text embeds <br /> and <strong> markup.

import type { ReactNode } from 'react'

export const profile = {
  allSpaces: 'All spaces',
  title: 'Profile',
  noName: 'No name set',
  saved: 'Saved.',
  saveFailed: 'Failed to save. Please try again.',

  sections: {
    identity: 'Identity',
    security: 'Security',
    preferences: 'Preferences',
    friends: 'Friends',
  },

  identity: {
    displayName: 'Display name',
    displayNamePlaceholder: 'Your name',
    username: 'Username',
    usernamePlaceholder: 'yourhandle',
    usernameHint: 'Used to find and add friends. Must be unique.',
    // `tag` is the handle without '@'
    tagTaken: (p: { tag: string }) => `@${p.tag} is already taken.`,
    tagJustTaken: (p: { tag: string }) => `@${p.tag} was just taken. Try another handle.`,
  },

  security: {
    email: 'Email',
    password: 'Password',
    sendReset: 'Send password reset email',
    resetSent: (p: { email: string | null }) => `Reset email sent to ${p.email}. Check your inbox.`,
    resetFailed: 'Failed to send reset email. Please try again.',
  },

  preferences: {
    mainCurrency: 'Favorite main space currency',
    mainCurrencyHint: 'Used as the default when you create a new space. Can be overridden per space.',
    darkMode: 'Dark mode',
    themePreference: 'Theme preference',
  },

  friends: {
    creatingLink: 'Creating link…',
    generateLink: 'Generate invite link',
    linkHint: 'Anyone who opens this link can add you as a friend.',
    findByUsername: 'Find by @username',
    searchPlaceholder: 'username',
    searching: 'Searching…',
    alreadyFriends: 'Friends',
    sent: 'Sent',
    add: 'Add',
    noUsersFound: (p: { query: string }) => `No users found for @${p.query}`,
    spaceInvitations: (n: number) => `Space invitations (${n})`,
    unknownSpace: 'Unknown space',
    // `nametag` is already formatted, e.g. ' (@bob)', or '' when absent
    fromSender: (p: { name: string; nametag: string }) => `from ${p.name}${p.nametag}`,
    join: 'Join',
    decline: 'Decline',
    friendRequests: (n: number) => `Friend requests (${n})`,
    accept: 'Accept',
    yourFriends: (n: number) => `Your friends (${n})`,
    noFriends: 'No friends yet. Search by @username above to add someone.',
  },

  signOut: {
    button: 'Sign out',
    title: 'Sign out?',
    description: () => (
      <>
        You will be signed out of GlobeExpenses on this device. All locally cached data will
        be cleared.
        <br /><br />
        <strong>Note:</strong> there is currently no way to reset your password from within
        the app. If you lose access to your account, please contact the developer directly.
      </>
    ),
    confirm: 'Sign out',
  },

  // Collapsible card at the bottom of the page (ContactDeveloperCard)
  contact: {
    title: 'Contact developer',
    // `author` is the link to the developer's GitHub profile
    madeBy: (p: { author: ReactNode }) => <>Made with 💜 by{' '}{p.author}{' '}in South-East Asia 🌏</>,
  },
}
