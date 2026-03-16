// scripts/migrateRevertTravelMember.ts
//
// ONE-OFF migration: converts travel documents (and their transactions) that
// were written in the new TravelMember schema (travelMemberId / userId) back
// to the original MemberRef schema (uid / displayName / joinedAt).
//
// Background: commit 86d53e0 introduced a TravelMember refactor that was then
// reverted (200e807). The code reverted cleanly, but Firestore documents that
// were written during that session are still in the new format, causing
// runtime crashes in MembersSection.
//
// Safe to run multiple times — documents already in the old format are skipped.
//
// Run with:  npx tsx scripts/migrateRevertTravelMember.ts

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ---------------------------------------------------------------------------
// Init Firebase Admin — bypasses Firestore security rules
// ---------------------------------------------------------------------------
const serviceAccount = JSON.parse(
  readFileSync(resolve('scripts/serviceAccountKey.json'), 'utf8')
)
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()
// Allow undefined field values — some members created during the refactor
// may be missing joinedAt; we write them as-is rather than crashing.
db.settings({ ignoreUndefinedProperties: true })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// A member document stored by the refactor (new format)
interface NewMember {
  travelMemberId: string
  displayName:    string
  userId:         string | null
  allowRename:    boolean
  joinedAt:       FirebaseFirestore.Timestamp
}

// A member document as the current code expects (old format)
interface OldMember {
  uid:         string
  displayName: string
  joinedAt:    FirebaseFirestore.Timestamp
}

// A split as written by the refactor (new format)
interface NewSplit {
  travelMemberId: string
  amount:         number
}

// A split as the current code expects (old format)
interface OldSplit {
  uid:    string
  amount: number
}

// Returns true when a raw member map is in the new (refactor) format.
// New format has `travelMemberId`; old format has `uid`.
function isNewMember(m: Record<string, unknown>): m is NewMember {
  return typeof m.travelMemberId === 'string' && !('uid' in m)
}

// Converts a new-format member back to old format.
// userId is the Firebase Auth UID; fall back to travelMemberId only when null
// (shouldn't happen for claimed/creator members, but be safe).
function downgradeMember(m: NewMember): OldMember {
  return {
    uid:         m.userId ?? m.travelMemberId,
    displayName: m.displayName,
    joinedAt:    m.joinedAt,
  }
}

// Returns true when a raw split is in the new (refactor) format.
function isNewSplit(s: Record<string, unknown>): s is NewSplit {
  return typeof s.travelMemberId === 'string' && !('uid' in s)
}

// Downgrades a split, looking up uid via idMap (travelMemberId → uid).
function downgradeSplit(
  s: NewSplit,
  idMap: Map<string, string>,
  context: string,
): OldSplit {
  const uid = idMap.get(s.travelMemberId)
  if (!uid) {
    console.warn(
      `    [warn] ${context}: unknown travelMemberId "${s.travelMemberId}" — using travelMemberId as uid fallback`
    )
  }
  return { uid: uid ?? s.travelMemberId, amount: s.amount }
}

// Downgrades a Split[] array (used for both paidBy and beneficiaries).
function downgradeSplitArray(
  splits: Record<string, unknown>[],
  idMap: Map<string, string>,
  context: string,
): OldSplit[] {
  return splits.map(s =>
    isNewSplit(s) ? downgradeSplit(s, idMap, context) : (s as unknown as OldSplit)
  )
}

// ---------------------------------------------------------------------------
// Main migration
// ---------------------------------------------------------------------------

async function migrate() {
  console.log('=== TravelMember revert migration ===\n')

  const travelsSnap = await db.collection('travels').get()
  console.log(`Found ${travelsSnap.size} travel document(s).\n`)

  let travelsMigrated      = 0
  let transactionsMigrated = 0

  for (const travelDoc of travelsSnap.docs) {
    const data    = travelDoc.data()
    const members = (data.members ?? []) as Record<string, unknown>[]

    // --- Skip travels whose members are already in the old format ---
    const needsMigration = members.some(isNewMember)
    if (!needsMigration) {
      console.log(`  [skip]   ${travelDoc.id}  (members already in old format)`)
      continue
    }

    // Build a travelMemberId → uid lookup map for fixing splits below
    const idMap = new Map<string, string>()
    const downgradedMembers: OldMember[] = members.map(m => {
      if (isNewMember(m)) {
        const old = downgradeMember(m)
        idMap.set(m.travelMemberId, old.uid)
        return old
      }
      return m as unknown as OldMember  // already old format, keep as-is
    })

    console.log(`  [travel] ${travelDoc.id}  — migrating ${idMap.size} member(s)`)
    db.collection('travels').doc(travelDoc.id).update({ members: downgradedMembers })
    travelsMigrated++

    // --- Migrate transactions under this travel ---
    const txSnap = await db
      .collection('travels').doc(travelDoc.id)
      .collection('transactions').get()

    for (const txDoc of txSnap.docs) {
      const tx           = txDoc.data()
      const paidBy       = (tx.paidBy       ?? []) as Record<string, unknown>[]
      const beneficiaries = (tx.beneficiaries ?? []) as Record<string, unknown>[]

      // Both paidBy and beneficiaries are Split[] — check each for the new format
      const paidByNeedsWork        = paidBy.some(isNewSplit)
      const beneficiariesNeedWork  = beneficiaries.some(isNewSplit)

      if (!paidByNeedsWork && !beneficiariesNeedWork) continue

      const ctx = `tx ${txDoc.id}`
      const update: Record<string, unknown> = {}

      if (paidByNeedsWork) {
        update.paidBy = downgradeSplitArray(paidBy, idMap, `${ctx} paidBy`)
      }
      if (beneficiariesNeedWork) {
        update.beneficiaries = downgradeSplitArray(beneficiaries, idMap, `${ctx} beneficiaries`)
      }

      console.log(
        `    [tx]   ${txDoc.id}  — fixing:` +
        `${paidByNeedsWork ? ' paidBy' : ''}${beneficiariesNeedWork ? ' beneficiaries' : ''}`
      )
      db.collection('travels').doc(travelDoc.id)
        .collection('transactions').doc(txDoc.id)
        .update(update)
      transactionsMigrated++
    }

    console.log()
  }

  console.log('Done.')
  console.log(`  Travels migrated:      ${travelsMigrated}`)
  console.log(`  Transactions migrated: ${transactionsMigrated}`)
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
