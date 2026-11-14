/**
 * Notification text and tap target for each event kind. PURE.
 *
 * iOS can neither update nor silence a notification (spec §2), so each message
 * has to stand on its own: who, what, how much, and what it means for the reader.
 * The tap targets follow spec §9.5.
 */
import { SOCIAL_THROTTLE_KEY, type ActivityBody, type Share, type SpaceRef } from '../model'

export interface PushMessage {
  title: string
  body: string
  /** Same-origin path opened when the notification is tapped. */
  url: string
}

const APP_NAME = 'GlobeExpenses'

/** "€84", "€41.50", "MYR 120" — decimals only when there are some. */
export function formatAmount(amount: number, currency: string): string {
  const rounded = Math.round(amount * 100) / 100
  const digits = Number.isInteger(rounded) ? 0 : 2
  try {
    return new Intl.NumberFormat('en', {
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
function shareText(share: Share | undefined, currency: string): string {
  if (!share) return ''
  const parts: string[] = []
  if (share.paid > 0) parts.push(`you paid ${formatAmount(share.paid, currency)}`)
  if (share.owed > 0) parts.push(`your share ${formatAmount(share.owed, currency)}`)
  return parts.join(', ')
}

const withSuffix = (text: string, suffix: string) => (suffix ? `${text} · ${suffix}` : text)

/** The normal push for an event. */
export function buildPushMessage(e: ActivityBody): PushMessage {
  const actor = e.actor.name || 'Someone'
  const label = spaceLabel(e.space)
  const spaceUrl = e.space ? `/spaces/${e.space.id}` : '/spaces'
  const tx = e.tx
  const total = tx ? formatAmount(tx.totalAmount, tx.currency) : ''
  // Opens the space on that transaction (spec §9.5).
  const txUrl = tx ? `${spaceUrl}?tx=${encodeURIComponent(tx.id)}` : spaceUrl

  switch (e.kind) {
    case 'tx_created':
      return {
        title: label,
        body: withSuffix(`${actor} added ${tx?.name} (${total})`, shareText(e.myShare, tx?.currency ?? '')),
        url: txUrl,
      }

    case 'transfer_received': {
      const amount = formatAmount(e.myShare?.owed ?? tx?.totalAmount ?? 0, tx?.currency ?? '')
      // The actor may be recording a payment someone else made.
      const from = e.transferFrom && e.transferFrom !== actor ? ` from ${e.transferFrom}` : ''
      return { title: label, body: `${actor} recorded a payment of ${amount}${from} to you`, url: txUrl }
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
        body = withSuffix(`${actor} added you to ${tx?.name} (${total})`, shareText(now, cur))
      } else if (was.owed !== now.owed || prevCur !== cur) {
        body = `${actor} edited ${tx?.name} · your share ${formatAmount(was.owed, prevCur)} → ${formatAmount(now.owed, cur)}`
      } else if (was.paid !== now.paid) {
        body = `${actor} edited ${tx?.name} · you paid ${formatAmount(was.paid, prevCur)} → ${formatAmount(now.paid, cur)}`
      } else if (e.before?.totalAmount !== undefined) {
        body = `${actor} edited ${tx?.name} (${formatAmount(e.before.totalAmount, prevCur)} → ${total})`
      } else {
        body = `${actor} edited ${tx?.name} (${total})`
      }
      return { title: label, body, url: txUrl }
    }

    case 'tx_removed_from_split':
      return { title: label, body: `${actor} removed you from ${tx?.name} (${total})`, url: txUrl }

    case 'tx_deleted': {
      const was = e.myShareBefore
      const cur = tx?.currency ?? ''
      const suffix = !was
        ? ''
        : was.owed > 0
          ? `your share was ${formatAmount(was.owed, cur)}`
          : was.paid > 0
            ? `you had paid ${formatAmount(was.paid, cur)}`
            : ''
      // The transaction is gone: open the space, not a dead link.
      return { title: label, body: withSuffix(`${actor} deleted ${tx?.name} (${total})`, suffix), url: spaceUrl }
    }

    case 'member_joined':
      return { title: label, body: `${actor} joined this space`, url: spaceUrl }

    case 'member_left':
      return { title: label, body: `${actor} left this space`, url: spaceUrl }

    case 'space_deleted':
      return { title: APP_NAME, body: `${actor} deleted ${label}`, url: '/spaces' }

    case 'space_invite':
      return {
        title: APP_NAME,
        body: `${actor} invited you to ${label}`,
        url: e.inviteId ? `/invite/${encodeURIComponent(e.inviteId)}` : '/profile',
      }

    case 'friend_request':
      return { title: APP_NAME, body: `${actor} sent you a friend request`, url: '/profile' }

    case 'friend_request_accepted':
      return { title: APP_NAME, body: `${actor} accepted your friend request`, url: '/profile' }

    case 'import_completed': {
      const n = e.import?.rowCount ?? 0
      const k = e.import?.involvingMe ?? 0
      return {
        title: label,
        body: `${actor} imported ${n} transaction${n === 1 ? '' : 's'}, ${k} involve${k === 1 ? 's' : ''} you`,
        url: spaceUrl,
      }
    }
  }
}

/**
 * The single "more changes" push sent when a burst hits the limit (§6.1).
 * After it, nothing more is pushed until the burst is over.
 */
export function buildFinalPushMessage(e: ActivityBody, throttleKey: string): PushMessage {
  if (throttleKey === SOCIAL_THROTTLE_KEY || !e.space) {
    return {
      title: APP_NAME,
      body: 'More invitations and requests are waiting. Open the app to see them.',
      url: '/profile',
    }
  }
  const label = spaceLabel(e.space)
  return {
    title: label,
    body: `${e.actor.name || 'Someone'}: more changes in ${label}. Open the app to see them.`,
    // A deleted space has no page to open.
    url: e.kind === 'space_deleted' ? '/spaces' : `/spaces/${e.space.id}`,
  }
}
