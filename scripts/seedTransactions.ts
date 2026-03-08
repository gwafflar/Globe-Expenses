// scripts/seedTransactions.ts
// One-off script to seed test transactions into Firestore from seedData.json.
// Run with: npx tsx scripts/seedTransactions.ts
//
// IMPORTANT: Fill in the five constants below before running.

import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, Timestamp } from "firebase/firestore";
import rawData from "./seedData.json";

const firebaseConfig = {
  apiKey: "API_KEY",
  authDomain: "globe-expenses.firebaseapp.com",
  projectId: "globe-expenses",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ---- CHANGE THESE VALUES ----
const TRAVEL_ID    = "YOUR_TRAVEL_ID";
const MEMBER_1_UID = "YOUR_MEMBER_1_UID";
const MEMBER_2_UID = "YOUR_MEMBER_2_UID";
const MEMBER_3_UID = "YOUR_MEMBER_3_UID";
const MEMBER_4_UID = "YOUR_MEMBER_4_UID";

// How many transactions to seed (1–100). Adjust as needed.
const COUNT = 100;
// ---------------------------------

// Maps placeholder strings in the JSON to real Firestore UIDs.
const UID_MAP: Record<string, string> = {
  MEMBER_1_UID,
  MEMBER_2_UID,
  MEMBER_3_UID,
  MEMBER_4_UID,
};

function resolveUid(uid: string): string {
  return UID_MAP[uid] ?? uid;
}

async function seed() {
  const transactions = rawData.slice(0, COUNT);
  console.log(`Seeding ${transactions.length} transactions into travel ${TRAVEL_ID}...`);
  const col = collection(db, "travels", TRAVEL_ID, "transactions");

  for (const tx of transactions) {
    // Resolve placeholder UIDs to real UIDs in splits.
    const paidBy       = tx.paidBy.map(s => ({ uid: resolveUid(s.uid), amount: s.amount }));
    const beneficiaries = tx.beneficiaries.map(s => ({ uid: resolveUid(s.uid), amount: s.amount }));

    // createdBy is inferred from the first payer (whoever paid likely entered the transaction).
    const createdByUid = resolveUid(tx.paidBy[0].uid);

    const doc = {
      ...tx,
      paidBy,
      beneficiaries,
      createdBy:      { type: "user", uid: createdByUid },
      createdAt:      Timestamp.now(),
      lastModifiedAt: Timestamp.now(),
      lastModifiedBy: createdByUid,
    };

    const ref = await addDoc(col, doc);
    console.log(`✅  ${tx.date}  ${tx.name}  (${ref.id})`);
  }

  console.log("Done.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
