**GlobeExpenses**

General Architecture Document

_Version 0.4 - March 2026_

# 1\. System Overview

GlobeExpenses is a collaborative travel expense tracking Progressive Web App (PWA). It allows travelers to record, categorize, and analyze spending during trips, with multi-currency support and collaborative expense splitting among travel companions.

The application is designed to function fully offline with automatic synchronization when connectivity is restored. In its first phase, it targets individual and small-group travel (fixed membership per trip). Collaborative real-time features and push notifications are planned for subsequent phases.

# 2\. High-Level Architecture

## 2.1 Architecture Style

The system follows a client-first, BaaS-backed architecture:

- The frontend PWA is the primary application layer - it contains all UI logic, offline data management, and business rules.
- Firebase serves as the backend platform, providing authentication, real-time database, cloud functions, and push notification infrastructure.
- There is no custom backend server. All server-side logic runs in Firebase Cloud Functions (serverless).

## 2.2 Technology Stack

| **Layer** | **Technology** | **Role** |
| --- | --- | --- |
| Frontend framework | React 18 + TypeScript | UI, routing, component logic |
| Build tool | Vite | Fast dev server, PWA plugin |
| UI components | shadcn/ui + Tailwind CSS | Accessible, consistent design system |
| State management | Zustand | Lightweight global state |
| Offline cache | IndexedDB via Dexie.js | Local persistence for offline use |
| PWA | Vite PWA Plugin + Service Worker | Installable, offline-capable app |
| Authentication | Firebase Auth | Email/password + Google OAuth |
| Database | Cloud Firestore | Real-time sync, offline support |
| Server logic | Firebase Cloud Functions | Currency rates, bank import agent, notifications |
| Push notifications | Firebase Cloud Messaging | Transaction alerts (Phase 3) |
| Hosting | Firebase Hosting | CDN delivery of the PWA |

# 3\. Frontend Architecture

## 3.1 Application Structure

The frontend is organized into the following top-level modules:

- auth/ - Login, registration, and session management screens
- travels/ - Travel list, travel creation, travel detail view
- transactions/ - Transaction form, transaction list, transaction detail
- drafts/ - Draft transaction inbox, carousel editor, bulk actions (v2)
- activity/ - Activity feed: collaborative transaction events affecting the current user (v2)
- dashboard/ - Statistics, charts, balance summaries
- settings/ - User profile, categories, payment methods, currency preferences, connected accounts (v2)
- shared/ - Reusable UI components, hooks, utilities
- services/ - Firebase adapters, sync logic, offline queue, bank import agent adapter (v2)

## 3.2 Offline Strategy

Firestore's built-in offline persistence is enabled at SDK initialization. This provides automatic local caching of all Firestore reads and queued writes during offline periods. When connectivity is restored, Firestore automatically replays the write queue.

Transaction creation uses a fire-and-forget write pattern: `doc()` pre-generates the document ID client-side, then `setDoc()` is called without awaiting. The document appears in the UI immediately via the `onSnapshot` listener with `metadata.hasPendingWrites === true`. This flag drives the "not synced" badge on the transaction card and the save banner colour. The flag flips to false once the server confirms the write.

Additionally, Dexie.js (IndexedDB wrapper) is used to store draft transactions and the offline write queue in a structured, queryable way. The Service Worker handles asset caching so the app shell loads without network.

Conflict policy for v1: last-write-wins (Firestore default). Concurrent edit detection is planned for v2: each transaction document stores a lastModifiedAt timestamp and lastModifiedBy field. If a document was modified remotely after the user loaded it, a visual warning badge is shown on the transaction, prompting the user to review.

# 4\. Data Architecture

## 4.1 Firestore Collection Structure

| **Collection / Document path** | **Description** |
| --- | --- |
| users/{userId} | User profile, preferences, currency, categories, payment methods |
| travels/{travelId} | Travel metadata, member list (fixed at creation in v1), per-travel settings |
| travels/{travelId}/transactions/{txId} | Individual transaction documents |
| travels/{travelId}/drafts/{draftId} | Draft transactions pending user review (v2) |
| travels/{travelId}/settlements/{sId} | Computed settlement suggestions (v2) |

## 4.2 Core Data Models

### User

| **Field** | **Type** | **Description** |
| --- | --- | --- |
| uid | string | Firebase Auth UID (document ID) |
| type | 'human' | Actor type - always 'human' for User documents. Distinguishes from agent actors in CreatedByRef, which never have User documents. |
| displayName | string | User's display name |
| email | string | User email address |
| mainCurrency | string | ISO 4217 code, e.g. 'EUR' |
| categories | string\[\] | User-defined category list (global, across travels) |
| paymentMethods | string\[\] | User-defined payment method list (global) |
| createdAt | timestamp | Account creation date |

### Travel

| **Field** | **Type** | **Description** |
| --- | --- | --- |
| travelId | string | Auto-generated Firestore ID |
| name | string | Travel name (e.g. 'Japan 2026') |
| emoji | string? | Optional emoji for visual identification (e.g. '🇯🇵') |
| description | string? | Optional description |
| startDate | date? | Optional start date |
| endDate | date? | Optional end date |
| members | MemberRef\[\] | Fixed list of members (set at creation in v1) |
| createdBy | string | UID of travel creator |
| createdAt | timestamp | Creation timestamp |
| currencies | string\[\] | All currencies used in this travel |
| settings | TravelSettings? | Optional per-travel configuration. Absent on older travels — read as default. |

MemberRef: { uid: string, displayName: string, joinedAt: timestamp }

TravelSettings: { trackLocation: boolean }
- trackLocation: when false, the country and city fields are hidden in the transaction form and not saved. Defaults to true when the field is absent.

### Transaction

| **Field** | **Type** | **Description** |
| --- | --- | --- |
| txId | string | Auto-generated Firestore ID |
| date | date | Date of the spending (stored as DD-MM-YYYY string) |
| name | string | Description / name of the expense |
| totalAmount | number | Total amount in original currency |
| currency | string | ISO 4217 currency code |
| exchangeRate | number | Rate used: 1 unit of currency = X mainCurrency |
| totalAmountMain | number | totalAmount \* exchangeRate (computed, stored) |
| category | string? | Optional category (from user's list) |
| paymentMethod | string? | Optional payment method (from user's list) |
| country | string? | Optional country of the expense. Stored as a plain string (e.g. 'Japan'). Country flag emoji prefix planned for v2. Controlled by travel.settings.trackLocation. |
| city | string? | Optional city of the expense. Stored as a plain string. City emoji (using country flag) deferred to v2. Controlled by travel.settings.trackLocation. |
| paidBy | Split\[\] | Who physically paid, and how much each |
| beneficiaries | Split\[\] | Who benefits, and what share each |
| createdBy | CreatedByRef | Who or what created this record (user or agent) |
| createdAt | timestamp | Creation timestamp |
| lastModifiedAt | timestamp | Last write timestamp (for conflict detection) |
| lastModifiedBy | string | UID of last writer |
| draftId | string? | ID of the originating draft, if this transaction was created via bank import (v2). Used to retrieve raw bank data on demand. |
| notes | string? | Optional free-text notes |

Split: { uid: string, amount: number } - amounts must sum to totalAmount

CreatedByRef: { type: 'user', uid: string } | { type: 'agent', name: string }

Examples: { type: 'user', uid: 'abc123' } or { type: 'agent', name: 'Revolut Agent' }

**Location field UX (v1):**
- Country and city dropdowns show only values previously used in the same travel, ordered by most recent usage.
- A special "Other" value is available as a named option (stored as the string "Other").
- "Add new…" opens an inline text input to enter a new value, which is then added to the dropdown for future use.
- Both fields are pre-filled from the most recent transaction in the travel on form open.
- Both fields are hidden entirely when travel.settings.trackLocation is false.
- Country flag emoji stored inline (e.g. "🇯🇵 Japan") deferred to v2 — requires a country→emoji mapping utility.
- City emoji (inheriting country flag) deferred to v2.

### Draft Transaction (v2)

| **Field** | **Type** | **Description** |
| --- | --- | --- |
| draftId | string | Auto-generated Firestore ID |
| source | string | Payment method / bank source (e.g. 'Revolut', 'Deblock') |
| rawData | object | Raw payload as received from bank webhook or on-chain event. Preserved permanently for audit and retroactive inspection. |
| date | date | Date of the transaction (from bank data) |
| name | string | Merchant name (from bank data) |
| totalAmount | number | Amount in original currency |
| currency | string | ISO 4217 currency code |
| country | string? | Country of transaction (from bank data) |
| city | string? | City of transaction (inferred from past records or bank data) |
| paymentMethod | string? | Pre-filled from source account |
| category | string? | Suggested by AI agent from merchant name |
| travelId | string? | Assigned by user during review (null until reviewed) |
| status | 'pending' \| 'validated' \| 'dismissed' | Lifecycle state. 'pending': awaiting review. 'validated': committed as a transaction (soft delete - not shown in inbox but retained for audit). 'dismissed': explicitly discarded by user. |
| linkedTxId | string? | ID of the transaction created when this draft was validated. Null until status = 'validated'. |
| createdBy | CreatedByRef | Agent that created the draft |
| createdAt | timestamp | Creation timestamp |
| expiresAt | timestamp? | Optional auto-expiry date for unreviewed drafts (duration TBD) |

Soft delete policy: drafts are never hard-deleted after validation. Status transitions: pending → validated (on user confirm) or pending → dismissed (on user discard). Validated and dismissed drafts are hidden from the inbox but queryable. When editing a transaction that has a draftId, the UI may offer to display the original raw bank data by fetching the linked draft document.

## 4.3 Balance & Settlement Computation

From the transaction collection, the net balance of each member is computed as:

net(user) = sum(paidBy\[user\].amount) - sum(beneficiaries\[user\].amount) \[per travel, in main currency\]

A positive net means the user is owed money. A negative net means the user owes money. From the set of net balances, optimal settlement suggestions are derived using a greedy debt-simplification algorithm (minimize number of transfers). This computation runs client-side in v1 and may move to Cloud Functions in v2.

# 5\. Key Flows

## 5.1 Transaction Creation (Online)

- User fills transaction form (date, name, amount, currency, category, payment method, country, city, paidBy splits, beneficiary splits)
- Client validates that paidBy and beneficiary sums equal totalAmount
- Exchange rate is looked up from local hardcoded table and stored on the document
- Document ID is pre-generated client-side via `doc()`; `setDoc()` is called without awaiting (fire-and-forget)
- Document appears immediately in the local UI via onSnapshot, with hasPendingWrites=true
- Server confirms the write; hasPendingWrites flips to false; UI updates badge and banner

## 5.2 Transaction Creation (Offline)

- Same form, same fire-and-forget write
- Firestore caches the document in local IndexedDB; hasPendingWrites=true
- Document appears in UI immediately with "not synced" badge
- On reconnection, Firestore replays the write automatically; hasPendingWrites flips to false

## 5.3 Bank Import Agent Flow (v2)

- Bank or on-chain event triggers a webhook received by a Firebase Cloud Function
- Cloud Function calls an LLM (Claude) with the raw transaction data and the user's category list
- LLM returns a structured draft: name, amount, currency, country, city (inferred), category suggestion, payment method
- Draft document is written to travels/{travelId}/drafts/ with status: 'pending', rawData set to the original bank payload, and source set to the bank/agent name
- User is notified (badge on Drafts tab and Activity tab) and reviews the draft at their convenience
- User opens the Drafts inbox, optionally filters by payment method/source
- User selects a travel via the horizontal carousel (travel name + emoji displayed on cards)
- User reviews and edits all pre-filled fields in a standard transaction form, including expandable split sections
- User confirms - a transaction is created with draftId referencing the draft; draft status is set to 'validated' and linkedTxId is set. Draft is NOT deleted (soft delete).
- User can also dismiss a draft (status → 'dismissed'); dismissed drafts are hidden from the inbox but retained
- Bulk selection supports multi-draft dismiss or travel assignment
- When editing a transaction that has a draftId, the UI offers an expandable 'View original bank data' panel fetching rawData from the linked draft on demand

## 5.4 Activity Feed Flow (v2)

- When any travel member creates or edits a transaction listing the current user as a payer or beneficiary, an activity event is recorded
- Activity events are surfaced in a dedicated Activity tab (pull model in v2, push notifications via FCM in v3)
- The Activity tab shows a chronological feed of events: new transactions, edits, and settlement changes that involve the current user
- Each activity item deep-links to the relevant transaction, pre-opened for review
- From the transaction view, the user can edit the transaction directly if they disagree with the recorded data
- A badge on the Activity tab shows the count of unseen events
- Activity events are distinct from draft reviews: drafts are the user's own unconfirmed imports; activity is collaborators' actions affecting the user

## 5.5 CSV Export / Import

- Export: fetch all transactions for a travel, map to flat CSV rows (one row per transaction), download as .csv file
- Import: parse uploaded CSV, validate rows, batch-write to Firestore
- CSV format is documented and versioned to ensure round-trip integrity

# 6\. Security Model

## 6.1 Firestore Security Rules

- A user can read/write a travel document only if their UID is in travel.members\[\].uid
- A user can read/write transactions under a travel only if they are a member of that travel
- A user can read/write drafts under a travel only if they are the owner of the linked payment method account (v2)
- User profile documents are readable/writable only by the owning user
- No data is publicly accessible - all operations require authentication

# 7\. Phased Roadmap

| **Phase** | **Name** | **Scope** |
| --- | --- | --- |
| v1  | Core (current) | PWA, offline sync, single/multi-member travel (fixed), transactions with multi-payer splits, travel emoji, location tracking (country/city) with per-travel toggle, dashboard, CSV export/import, hardcoded currency rates |
| v2  | Collaborative+ | Bank import agent (Revolut webhook, Nordigen aggregator, on-chain via Alchemy/Moralis), draft transaction inbox with soft-delete and raw data audit trail, carousel travel selector, AI-assisted categorization and city inference, activity feed (pull model) for collaborative transaction events, dynamic travel membership, conflict detection UI, live currency rates, settlement suggestions, country flag emoji on location fields |
| v3  | Notifications | Push notifications (FCM) for new/edited transactions involving the user; activity feed upgraded to push model |
| v4  | Advanced | Bank-rate currency input, cash withdrawal tracking, full conflict resolution UI, recurring/template transactions, manual fetch-new-transactions trigger, potential native app wrappers |

# 8\. Open Questions & Deferred Decisions

| **Topic** | **Detail** | **Status** |
| --- | --- | --- |
| Currency rate source | Hardcoded for v1. Future: official API vs bank rate vs user-input rate. | DECIDED |
| Dynamic travel membership | Fixed in v1. v2 adds dynamic join with join-date visibility cutoff. | DECIDED |
| Concurrent edit conflicts | Last-write-wins in v1. v2 adds detection via lastModifiedAt timestamp and visual warning. | DECIDED |
| Settlement computation location | Client-side in v1. May move to Cloud Functions in v2 for consistency. | OPEN |
| CSV schema versioning | Format to be defined during implementation. Must support round-trip import/export. | OPEN |
| Categories/payment methods scope | Global per user (across travels) - decided. Per-travel filtering deferred. | DECIDED |
| Bank import: push vs polling | Revolut/Wise support native webhooks. N26/Deblock fiat require polling via GoCardless/Nordigen. Deblock on-chain via Alchemy or Moralis. | OPEN (v2) |
| Draft lifecycle: soft delete | Drafts are never hard-deleted. Validated drafts retain rawData and are linked to their transaction via linkedTxId. Dismissed drafts are also retained. Inbox only shows 'pending'. | DECIDED (v2) |
| Draft expiry policy | Unreviewed drafts may auto-expire after a configurable period. UX and duration TBD. | OPEN (v2) |
| Draft scoping | Drafts inbox is global (all travels), filterable by payment method/source. Travel is assigned during review. | DECIDED (v2) |
| Activity feed storage | Where are activity events stored? Options: a top-level activities/{userId} collection (fast reads), or derived from Firestore listeners on transaction writes. TBD. | OPEN (v2) |
| Activity feed: seen/unseen state | How is 'unseen' tracked per user? A lastSeenAt field on the user document is a simple option. | OPEN (v2) |
| Manual fetch trigger | A button to manually trigger the bank import agent (webhook fallback) is deferred to v4 as low priority given reliable webhooks. | DECIDED (v4) |
| UI design-first approach | UI should be designed (wireframes) before implementing v2 features to avoid costly backend rework. | OPEN |
| Country flag emoji on location fields | Country stored as plain string in v1. Flag emoji prefix (e.g. "🇯🇵 Japan") requires a country→emoji mapping utility. Deferred to v2. | DECIDED (v2) |
| City emoji | City would inherit the country flag emoji. Deferred to v2 alongside country flag work. | DECIDED (v2) |
| "Add new" for categories/payment methods in form | Quick inline creation of new category or payment method from within the transaction form. Deferred to v2 — for now, these are managed only in Settings. | DECIDED (v2) |
| Location field editing in travel settings | Country and city values previously used in a travel should be editable/deletable from the travel settings screen. Deferred to v2. | OPEN (v2) |