// social.tsx — invite page, friends, push notification UI, install prompt.
// `.tsx` because several messages embed markup (<strong>, an icon, a link):
// those are functions taking the ReactNode pieces as parameters, so French can
// place them where its word order needs them.

import type { ReactNode } from 'react'

export const social = {
  // /invite/:inviteId — accepting a friend or space invite link
  invite: {
    allSpaces: 'All spaces',
    goToSpaces: 'Go to my spaces',
    notFoundTitle: 'Invite not found',
    notFoundDesc: 'This invite link is invalid or has been deleted.',
    revokedTitle: 'Link no longer valid',
    revokedDesc: 'The person who shared this link has revoked it.',
    expiredTitle: 'Link expired',
    expiredDesc: 'This invite link has expired. Ask the sender to share a new one.',
    alreadyTitle: 'Already connected',
    alreadyDesc: "You're already friends with this person.",
    errorTitle: 'Something went wrong',
    errorSpace: 'Unable to join this space. Please try again or ask the sender to share a new link.',
    errorFriend: 'Unable to accept this invitation. Please try again.',
    tryAgain: 'Try again',
    friendPitch: (p: { name: string }) => `${p.name} wants to add you as a friend on GlobeExpenses.`,
    spacePitch: (p: { name: string; space: string | undefined }) =>
      `${p.name} is inviting you to join "${p.space}" on GlobeExpenses.`,
    accepting: 'Accepting…',
    accept: 'Accept invitation',
    decline: 'Decline',
    // Identity pick: after joining, link the account to an existing member
    pickTitle: 'Who are you in this trip?',
    pickDesc: "Some members were added before you joined. If one of them is you, select it — your account will be linked to that member's expenses.",
    claimThisIsMe: 'Claim — this is me',
    someoneNew: "I'm someone new — add me with a name:",
    namePlaceholder: 'Your name…',
    join: 'Join',
    skip: 'Skip for now',
    linking: 'Linking your account…',
    joinedTitle: (p: { space: string | undefined }) => `You've joined ${p.space}!`,
    friendsTitle: "You're now friends!",
    joinedDesc: (p: { space: string | undefined; name: string }) =>
      `You are now a member of "${p.space}" and connected with ${p.name}.`,
    friendsDesc: (p: { name: string }) =>
      `You and ${p.name} are now connected. You can invite each other to shared spaces.`,
    openSpace: (p: { space: string | undefined }) => `Open ${p.space}`,
  },

  // Push notifications: the "Get notified?" banner and the on/off switches
  push: {
    // Default text of the banner, per moment (see notifications/utils/pushState.ts)
    banner: {
      a: 'Get notified when members join your space and add or edit transactions.',
      d: 'Get notified when members join your space and add or edit transactions.',
      b: 'Get notified when members add or edit transactions involving you.',
      e2: 'Get notified when members add or edit transactions involving you.',
      e1: 'Someone added a transaction involving you. Get notified next time?',
    },
    // `icon` is the iOS Share glyph
    bannerIosInstall: (p: { icon: ReactNode }) => (
      <>
        On iPhone, first add GlobeExpenses to your Home Screen: tap <strong>Share</strong>{' '}
        {p.icon}, then <strong>"Add to Home Screen"</strong>, and enable
        notifications from the installed app.
      </>
    ),
    enable: 'Enable',
    enabling: 'Enabling…',
    notNow: 'Not now',
    dismiss: 'Dismiss',

    // Profile → Preferences: this device
    device: {
      title: '🔔 Notifications',
      iosInstall: (p: { icon: ReactNode }) => (
        <>
          To get notifications on iPhone, add GlobeExpenses to your Home Screen: tap{' '}
          <strong>Share</strong> {p.icon}, then{' '}
          <strong>"Add to Home Screen"</strong>.
        </>
      ),
      unsupported: "This browser doesn't support push notifications.",
      blockedTitle: '🔔 Notifications are blocked on this device.',
      blockedHint: "Re-enable them in your phone's settings → GlobeExpenses (or in the browser's site settings).",
      onThisDevice: '🔔 Notifications on this device',
      promptHint: 'Get notified when someone adds or changes a transaction involving you.',
      onHint: 'On. Each space can be muted from its Parameters tab.',
      offHint: 'Off. No notification reaches this device.',
      switchLabel: 'Notifications on this device',
      updateFailed: "Couldn't update notifications. Check your connection and try again.",
    },

    // Space → Parameters: this space
    space: {
      // `link` is the "Profile settings →" link
      turnOffAll: (p: { link: ReactNode }) => <>Want to turn off all notifications?{' '}{p.link}</>,
      profileSettings: 'Profile settings →',
      forThisSpace: '🔔 Notifications for this space',
      switchLabel: 'Notifications for this space',
      enableDevice: '🔔 Enable notifications on this device',
      iosInstall: '🔔 To get notifications on iPhone, add GlobeExpenses to your Home Screen first (Share → "Add to Home Screen").',
      blocked: "🔔 Notifications are blocked on this device. Re-enable them in your phone's settings → GlobeExpenses.",
      unsupported: "🔔 This browser doesn't support push notifications.",
    },
  },

  // "Install the app" banner on mobile browsers (Profile page)
  install: {
    title: 'Install GlobeExpenses',
    ios: (p: { icon: ReactNode }) => (
      <>
        Tap <strong>Share</strong> {p.icon} in your browser bar, then{' '}
        <strong>"Add to Home Screen"</strong>.
      </>
    ),
    chrome: 'Add to your home screen for a faster, offline-ready experience.',
    android: () => (
      <>
        Open the <strong>browser menu</strong> (⋮) and tap{' '}
        <strong>"Add to Home Screen"</strong> or <strong>"Install app"</strong>.
      </>
    ),
    install: 'Install',
    dismiss: 'Dismiss install banner',
  },
}
