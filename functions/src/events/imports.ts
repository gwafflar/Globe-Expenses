/**
 * Import summary (docs/NOTIFICATIONS_SPEC.md §7). PURE.
 *
 * An XLSX import writes hundreds of transactions. Each row gets its own feed
 * entry from the transaction trigger, but NO push. When the importer has
 * committed everything it writes one `importBatches` document; this builds the
 * single `import_completed` event (and push) per involved member from it.
 */
import type { ActivityDraft, ActorRef, SpaceForEvents, TxForEvents } from '../model'
import { involvedMemberIds, spaceRef } from './transactions'

/**
 * @param txs  every transaction stamped with this batch id, as found by a
 *             SERVER query — counts never come from the client.
 */
export function buildImportEvents(
  importBatchId: string,
  txs: TxForEvents[],
  space: SpaceForEvents,
  actor: ActorRef,
): ActivityDraft[] {
  // How many imported rows involve each user (via the slots they claimed).
  const involving = new Map<string, number>()
  for (const tx of txs) {
    const ids = involvedMemberIds(tx)
    const uids = new Set<string>()
    for (const m of space.members) {
      if (m.userId && ids.has(m.travelMemberId)) uids.add(m.userId)
    }
    for (const uid of uids) involving.set(uid, (involving.get(uid) ?? 0) + 1)
  }

  return [...involving]
    .filter(([uid]) => uid !== actor.uid && space.memberUids.includes(uid))
    .map(([uid, count]) => ({
      recipientUid: uid,
      body: {
        kind: 'import_completed' as const,
        actor,
        space: spaceRef(space),
        importBatchId,
        import: { rowCount: txs.length, involvingMe: count },
      },
      push: { throttleKey: space.id, muteSpaceId: space.id },
    }))
}
