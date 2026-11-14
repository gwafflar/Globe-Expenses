/**
 * Notification text and tap target for each event kind. PURE.
 *
 * iOS can neither update nor silence a notification (spec §2), so each message
 * has to stand on its own: who, what, how much, and what it means for the reader.
 * The tap targets follow spec §9.5.
 *
 * Languages: each device's token document carries the UI language of that
 * device (`fcmTokens/{token}.language`, written by the client's pushService).
 * send.ts groups a recipient's devices by language and builds one message per
 * language. Cloud Functions cannot import the app's src/i18n bundle, so the
 * push texts live in PUSH_STRINGS below — add a language there when adding
 * one to src/i18n/languages.ts.
 */
import { SOCIAL_THROTTLE_KEY, type ActivityBody, type Share, type SpaceRef } from '../model'

export interface PushMessage {
  title: string
  body: string
  /** Same-origin path opened when the notification is tapped. */
  url: string
}

/** Languages the push texts exist in. Must match the app's SUPPORTED_LANGUAGES. */
export const PUSH_LANGUAGES = ['en', 'fr'] as const
export type PushLanguage = (typeof PUSH_LANGUAGES)[number]

/** A token written before languages existed has no `language` → English. */
export function toPushLanguage(value: unknown): PushLanguage {
  return (PUSH_LANGUAGES as readonly unknown[]).includes(value) ? (value as PushLanguage) : 'en'
}

const APP_NAME = 'GlobeExpenses'

/** Every sentence a push can contain, per language. Amounts arrive already
 *  formatted. Whole sentences with parameters, never concatenated fragments:
 *  word order differs between languages. */
interface PushStrings {
  someone: string
  youPaid: (amount: string) => string
  yourShare: (amount: string) => string
  txCreated: (p: { actor: string; name: string; total: string }) => string
  transferReceived: (p: { actor: string; amount: string; from?: string }) => string
  addedYouTo: (p: { actor: string; name: string; total: string }) => string
  editedShare: (p: { actor: string; name: string; was: string; now: string }) => string
  editedPaid: (p: { actor: string; name: string; was: string; now: string }) => string
  editedTotal: (p: { actor: string; name: string; was: string; now: string }) => string
  edited: (p: { actor: string; name: string; total: string }) => string
  removedYou: (p: { actor: string; name: string; total: string }) => string
  deleted: (p: { actor: string; name: string; total: string }) => string
  yourShareWas: (amount: string) => string
  youHadPaid: (amount: string) => string
  memberJoined: (actor: string) => string
  memberLeft: (actor: string) => string
  spaceDeleted: (p: { actor: string; space: string }) => string
  spaceInvite: (p: { actor: string; space: string }) => string
  friendRequest: (actor: string) => string
  friendAccepted: (actor: string) => string
  imported: (p: { actor: string; n: number; k: number }) => string
  moreSocial: string
  moreInSpace: (p: { actor: string; space: string }) => string
}

const PUSH_STRINGS: Record<PushLanguage, PushStrings> = {
  en: {
    someone: 'Someone',
    youPaid: (a) => `you paid ${a}`,
    yourShare: (a) => `your share ${a}`,
    txCreated: (p) => `${p.actor} added ${p.name} (${p.total})`,
    transferReceived: (p) => `${p.actor} recorded a payment of ${p.amount}${p.from ? ` from ${p.from}` : ''} to you`,
    addedYouTo: (p) => `${p.actor} added you to ${p.name} (${p.total})`,
    editedShare: (p) => `${p.actor} edited ${p.name} · your share ${p.was} → ${p.now}`,
    editedPaid: (p) => `${p.actor} edited ${p.name} · you paid ${p.was} → ${p.now}`,
    editedTotal: (p) => `${p.actor} edited ${p.name} (${p.was} → ${p.now})`,
    edited: (p) => `${p.actor} edited ${p.name} (${p.total})`,
    removedYou: (p) => `${p.actor} removed you from ${p.name} (${p.total})`,
    deleted: (p) => `${p.actor} deleted ${p.name} (${p.total})`,
    yourShareWas: (a) => `your share was ${a}`,
    youHadPaid: (a) => `you had paid ${a}`,
    memberJoined: (actor) => `${actor} joined this space`,
    memberLeft: (actor) => `${actor} left this space`,
    spaceDeleted: (p) => `${p.actor} deleted ${p.space}`,
    spaceInvite: (p) => `${p.actor} invited you to ${p.space}`,
    friendRequest: (actor) => `${actor} sent you a friend request`,
    friendAccepted: (actor) => `${actor} accepted your friend request`,
    imported: (p) =>
      `${p.actor} imported ${p.n} transaction${p.n === 1 ? '' : 's'}, ${p.k} involve${p.k === 1 ? 's' : ''} you`,
    moreSocial: 'More invitations and requests are waiting. Open the app to see them.',
    moreInSpace: (p) => `${p.actor}: more changes in ${p.space}. Open the app to see them.`,
  },
  fr: {
    someone: "Quelqu'un",
    youPaid: (a) => `vous avez payé ${a}`,
    yourShare: (a) => `votre part ${a}`,
    txCreated: (p) => `${p.actor} a ajouté ${p.name} (${p.total})`,
    transferReceived: (p) => `${p.actor} a enregistré un paiement de ${p.amount}${p.from ? ` de ${p.from}` : ''} pour vous`,
    addedYouTo: (p) => `${p.actor} vous a ajouté à ${p.name} (${p.total})`,
    editedShare: (p) => `${p.actor} a modifié ${p.name} · votre part ${p.was} → ${p.now}`,
    editedPaid: (p) => `${p.actor} a modifié ${p.name} · vous avez payé ${p.was} → ${p.now}`,
    editedTotal: (p) => `${p.actor} a modifié ${p.name} (${p.was} → ${p.now})`,
    edited: (p) => `${p.actor} a modifié ${p.name} (${p.total})`,
    removedYou: (p) => `${p.actor} vous a retiré de ${p.name} (${p.total})`,
    deleted: (p) => `${p.actor} a supprimé ${p.name} (${p.total})`,
    yourShareWas: (a) => `votre part était de ${a}`,
    youHadPaid: (a) => `vous aviez payé ${a}`,
    memberJoined: (actor) => `${actor} a rejoint cet espace`,
    memberLeft: (actor) => `${actor} a quitté cet espace`,
    spaceDeleted: (p) => `${p.actor} a supprimé ${p.space}`,
    spaceInvite: (p) => `${p.actor} vous invite dans ${p.space}`,
    friendRequest: (actor) => `${actor} vous a envoyé une demande d'ami`,
    friendAccepted: (actor) => `${actor} a accepté votre demande d'ami`,
    // French plural: 0 and 1 are singular.
    imported: (p) =>
      `${p.actor} a importé ${p.n} transaction${p.n > 1 ? 's' : ''}, dont ${p.k} vous concerne${p.k > 1 ? 'nt' : ''}`,
    moreSocial: "D'autres invitations et demandes vous attendent. Ouvrez l'application pour les voir.",
    moreInSpace: (p) => `${p.actor} : d'autres changements dans ${p.space}. Ouvrez l'application pour les voir.`,
  },
}

/** "€84", "€41.50", "MYR 120" (en) / "84 €", "41,50 €" (fr) — decimals only when there are some. */
export function formatAmount(amount: number, currency: string, lang: PushLanguage = 'en'): string {
  const rounded = Math.round(amount * 100) / 100
  const digits = Number.isInteger(rounded) ? 0 : 2
  try {
    return new Intl.NumberFormat(lang, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(rounded)
  } catch {
    // Intl throws on anything that is not a well-formed ISO 4217 code.
    return `${rounded.toFixed(digits)} ${currency}`.trim()
  }
}

function spaceLabel(space: SpaceRef | undefined): string {
  if (!space) return APP_NAME
  return [space.emoji, space.name].filter(Boolean).join(' ') || APP_NAME
}

/** "you paid €84, your share €42" — whichever parts are non-zero. */
function shareText(share: Share | undefined, currency: string, lang: PushLanguage): string {
  if (!share) return ''
  const s = PUSH_STRINGS[lang]
  const parts: string[] = []
  if (share.paid > 0) parts.push(s.youPaid(formatAmount(share.paid, currency, lang)))
  if (share.owed > 0) parts.push(s.yourShare(formatAmount(share.owed, currency, lang)))
  return parts.join(', ')
}

const withSuffix = (text: string, suffix: string) => (suffix ? `${text} · ${suffix}` : text)

/** The normal push for an event, in the given language (default English). */
export function buildPushMessage(e: ActivityBody, lang: PushLanguage = 'en'): PushMessage {
  const s = PUSH_STRINGS[lang]
  const fmt = (amount: number, currency: string) => formatAmount(amount, currency, lang)
  const actor = e.actor.name || s.someone
  const label = spaceLabel(e.space)
  const spaceUrl = e.space ? `/spaces/${e.space.id}` : '/spaces'
  const tx = e.tx
  const name = tx?.name ?? ''
  const total = tx ? fmt(tx.totalAmount, tx.currency) : ''
  // Opens the space on that transaction (spec §9.5).
  const txUrl = tx ? `${spaceUrl}?tx=${encodeURIComponent(tx.id)}` : spaceUrl

  switch (e.kind) {
    case 'tx_created':
      return {
        title: label,
        body: withSuffix(s.txCreated({ actor, name, total }), shareText(e.myShare, tx?.currency ?? '', lang)),
        url: txUrl,
      }

    case 'transfer_received': {
      const amount = fmt(e.myShare?.owed ?? tx?.totalAmount ?? 0, tx?.currency ?? '')
      // The actor may be recording a payment someone else made.
      const from = e.transferFrom && e.transferFrom !== actor ? e.transferFrom : undefined
      return { title: label, body: s.transferReceived({ actor, amount, from }), url: txUrl }
    }

    case 'tx_edited': {
      const cur = tx?.currency ?? ''
      // Amounts from before the edit are in the PREVIOUS currency, if it changed.
      const prevCur = e.before?.currency ?? cur
      const was = e.myShareBefore ?? { paid: 0, owed: 0 }
      const now = e.myShare ?? { paid: 0, owed: 0 }
      let body: string
      if (was.paid === 0 && was.owed === 0 && (now.paid > 0 || now.owed > 0)) {
        // The edit brought the reader into the split.
        body = withSuffix(s.addedYouTo({ actor, name, total }), shareText(now, cur, lang))
      } else if (was.owed !== now.owed || prevCur !== cur) {
        body = s.editedShare({ actor, name, was: fmt(was.owed, prevCur), now: fmt(now.owed, cur) })
      } else if (was.paid !== now.paid) {
        body = s.editedPaid({ actor, name, was: fmt(was.paid, prevCur), now: fmt(now.paid, cur) })
      } else if (e.before?.totalAmount !== undefined) {
        body = s.editedTotal({ actor, name, was: fmt(e.before.totalAmount, prevCur), now: total })
      } else {
        body = s.edited({ actor, name, total })
      }
      return { title: label, body, url: txUrl }
    }

    case 'tx_removed_from_split':
      return { title: label, body: s.removedYou({ actor, name, total }), url: txUrl }

    case 'tx_deleted': {
      const was = e.myShareBefore
      const cur = tx?.currency ?? ''
      const suffix = !was
        ? ''
        : was.owed > 0
          ? s.yourShareWas(fmt(was.owed, cur))
          : was.paid > 0
            ? s.youHadPaid(fmt(was.paid, cur))
            : ''
      // The transaction is gone: open the space, not a dead link.
      return { title: label, body: withSuffix(s.deleted({ actor, name, total }), suffix), url: spaceUrl }
    }

    case 'member_joined':
      return { title: label, body: s.memberJoined(actor), url: spaceUrl }

    case 'member_left':
      return { title: label, body: s.memberLeft(actor), url: spaceUrl }

    case 'space_deleted':
      return { title: APP_NAME, body: s.spaceDeleted({ actor, space: label }), url: '/spaces' }

    case 'space_invite':
      return {
        title: APP_NAME,
        body: s.spaceInvite({ actor, space: label }),
        url: e.inviteId ? `/invite/${encodeURIComponent(e.inviteId)}` : '/profile',
      }

    case 'friend_request':
      return { title: APP_NAME, body: s.friendRequest(actor), url: '/profile' }

    case 'friend_request_accepted':
      return { title: APP_NAME, body: s.friendAccepted(actor), url: '/profile' }

    case 'import_completed':
      return {
        title: label,
        body: s.imported({ actor, n: e.import?.rowCount ?? 0, k: e.import?.involvingMe ?? 0 }),
        url: spaceUrl,
      }
  }
}

/**
 * The single "more changes" push sent when a burst hits the limit (§6.1).
 * After it, nothing more is pushed until the burst is over.
 */
export function buildFinalPushMessage(
  e: ActivityBody,
  throttleKey: string,
  lang: PushLanguage = 'en',
): PushMessage {
  const s = PUSH_STRINGS[lang]
  if (throttleKey === SOCIAL_THROTTLE_KEY || !e.space) {
    return { title: APP_NAME, body: s.moreSocial, url: '/profile' }
  }
  const label = spaceLabel(e.space)
  return {
    title: label,
    body: s.moreInSpace({ actor: e.actor.name || s.someone, space: label }),
    // A deleted space has no page to open.
    url: e.kind === 'space_deleted' ? '/spaces' : `/spaces/${e.space.id}`,
  }
}
