// scripts/seedTransactions.ts
// One-off script to seed test transactions into Firestore.
// Run with: npx tsx scripts/seedTransactions.ts
//
// IMPORTANT: Replace TRAVEL_ID and USER_UID with real values from your Firestore.
// Find them in Firebase Console → Firestore → travels collection.

import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, Timestamp } from "firebase/firestore";

// Paste your Firebase config here (same as your .env values)
const firebaseConfig = {
  apiKey: "API_KEY",
  authDomain: "globe-expenses.firebaseapp.com",
  projectId: "globe-expenses",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ---- CHANGE THESE TWO VALUES ----
const TRAVEL_ID = "6A1dGPROgLtRo4fQMgrX";
const USER_UID  = "nLCjYcYHqfcllFgnOsUQy4L6HlL2";
// ---------------------------------

const transactions = [
  {
    date: "28-01-2026",
    name: "Airport taxi",
    totalAmount: 35.00,
    currency: "EUR",
    exchangeRate: 1.0,
    totalAmountMain: 35.00,
    category: "Transport",
    paymentMethod: "Revolut",
    paidBy: [{ uid: USER_UID, amount: 35.00 }],
    beneficiaries: [{ uid: USER_UID, amount: 35.00 }],
    createdBy: { type: "user", uid: USER_UID },
    createdAt: Timestamp.now(),
    lastModifiedAt: Timestamp.now(),
    lastModifiedBy: USER_UID,
    notes: "",
  },
  {
    date: "29-01-2026",
    name: "Hotel night 1",
    totalAmount: 120.00,
    currency: "EUR",
    exchangeRate: 1.0,
    totalAmountMain: 120.00,
    category: "Accommodation",
    paymentMethod: "Revolut",
    paidBy: [{ uid: USER_UID, amount: 120.00 }],
    beneficiaries: [{ uid: USER_UID, amount: 120.00 }],
    createdBy: { type: "user", uid: USER_UID },
    createdAt: Timestamp.now(),
    lastModifiedAt: Timestamp.now(),
    lastModifiedBy: USER_UID,
    notes: "",
  },
  {
    date: "29-01-2026",
    name: "Dinner at local restaurant",
    totalAmount: 47.50,
    currency: "EUR",
    exchangeRate: 1.0,
    totalAmountMain: 47.50,
    category: "Food",
    paymentMethod: "Cash",
    paidBy: [{ uid: USER_UID, amount: 47.50 }],
    beneficiaries: [{ uid: USER_UID, amount: 47.50 }],
    createdBy: { type: "user", uid: USER_UID },
    createdAt: Timestamp.now(),
    lastModifiedAt: Timestamp.now(),
    lastModifiedBy: USER_UID,
    notes: "Great pasta",
  },
  {
    date: "30-01-2026",
    name: "Museum tickets",
    totalAmount: 24.00,
    currency: "EUR",
    exchangeRate: 1.0,
    totalAmountMain: 24.00,
    category: "Activities",
    paymentMethod: "Revolut",
    paidBy: [{ uid: USER_UID, amount: 24.00 }],
    beneficiaries: [{ uid: USER_UID, amount: 24.00 }],
    createdBy: { type: "user", uid: USER_UID },
    createdAt: Timestamp.now(),
    lastModifiedAt: Timestamp.now(),
    lastModifiedBy: USER_UID,
    notes: "",
  },
];

async function seed() {
  console.log(`Seeding ${transactions.length} transactions into travel ${TRAVEL_ID}...`);
  const col = collection(db, "travels", TRAVEL_ID, "transactions");

  for (const tx of transactions) {
    const ref = await addDoc(col, tx);
    console.log(`✅ Created: ${tx.name} (${ref.id})`);
  }

  console.log("Done.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});