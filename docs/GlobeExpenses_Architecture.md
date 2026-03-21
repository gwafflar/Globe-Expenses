**GlobeExpenses**

General Architecture Document

_Version 0.5 - March 2026_

# 1. System Overview

GlobeExpenses is a collaborative travel expense tracking Progressive Web App (PWA). It allows travelers to record, categorize, and analyze spending during trips, with multi-currency support and collaborative expense splitting among travel companions.

The application is designed to function fully offline with automatic synchronization when connectivity is restored. Travel members can invite friends via shareable links and join shared travels through invite tokens. In its first phase it targets individual and small-group travel. Collaborative real-time features and push notifications are planned for subsequent phases.

# 2. High-Level Architecture

## 2.1 Architecture Style

The system follows a client-first, BaaS-backed architecture:

- The frontend PWA is the primary application layer — it contains all UI logic, offline data management, and business rules.
- Firebase serves as the backend platform, providing authentication, real-time database, cloud functions, and push notification infrastructure.
- There is no custom backend server. All server-side logic runs in Firebase Cloud Functions (serverless).

## 2.2 Technology Stack

| **Layer** | **Technology** | **Role** |
| --- | --- | --- |
| Frontend framework | React 18 + TypeScript | UI, routing, component logic |
| Build tool | Vite | Fast dev server, PWA plugin |
| UI components | shadcn/ui + Tailwind CSS v4 | Accessible, consistent design system |
| State management | Zustand | Lightweight global state |
| Offline cache | IndexedDB via Dexie.js | Local persistence for offline use |
| PWA | Vite PWA Plugin + Service Worker | Installable, offline-capable app |
| Authentication | Firebase Auth | Email/password + Google OAuth |
| Database | Cloud Firestore | Real-time sync, offline support |
| Server logic | Firebase Cloud Functions | Currency rates, bank import agent, notifications |
| Push notifications | Firebase Cloud Messaging | Transaction alerts (Phase 3) |
| Hosting | Firebase Hosting | CDN delivery of the PWA |

# 3. Frontend Architecture

## 3.1 Application Structure

The frontend is organized into the following top-level modules:

- **auth/** — Login, registration, profile page, session management
- **travels/** — Travel list, travel creation, travel detail view
  - `travels/components/TravelTabs.tsx` — four-tab container with swipe gesture (Transactions / Balance / Dashboard / Parameters)
  - `travels/components/tabs/TransactionsTab.tsx` — transaction list with pending badges, tap-to-edit
  - `travels/components/tabs/BalanceTab.tsx` — balance/settlement (placeholder)
  - `travels/components/tabs/DashboardTab.tsx` — read-only analytics: hero totals, spending-over-time, recent days by category, by-category breakdown, per-person stats, currencies summary
  - `travels/components/tabs/dashboardHelpers.ts` — pure TypeScript helpers (no React): period filtering, member stats, colour palette, formatting, split normalization
  - `travels/components/CollapsibleCard.tsx` — reusable collapsible card (used by Dashboard; planned for Balance tab)
  - `travels/components/tabs/ParametersTab.tsx` — all per-travel editable lists and settings, members section with invite
- **transactions/** — Transaction form (create + edit), transaction service
- **friends/** — Friend search, invite flows, invite acceptance page
  - `friends/services/friendService.ts` — all friend and invite Firestore operations
  - `friends/hooks/usePendingInvites.ts` — real-time snapshot of incoming active invites, exposes `{ invites, count }`
  - `friends/pages/InvitePage.tsx` — `/invite/:inviteId` acceptance page (capability-based: the URL token is the authorization)
- **drafts/** — Draft transaction inbox, carousel editor, bulk actions (v2)
- **activity/** — Activity feed (v2)
- **dashboard/** — Statistics, charts, balance summaries
- **settings/** — Connected accounts (v2)
- **shared/** — Reusable UI components, hooks, utilities
  - `shared/data/pickerData.ts` — static data for 42 currencies and ~110 countries with flag emojis
  - `shared/utils/exchangeRates.ts` — hardcoded exchange rates, `getExchangeRate()`
- **services/** — Firebase adapters (firebase.ts)

## 3.2 Offline Strategy

Firestore's built-in offline persistence is enabled at SDK initialization. This provides automatic local caching of all Firestore reads and queued writes during offline periods. When connectivity is restored, Firestore automatically replays the write queue.

Additionally, Dexie.js (IndexedDB wrapper) is available for draft transactions and structured offline queuing. The Service Worker handles asset caching so the app shell loads without network.

Conflict policy for v1: last-write-wins (Firestore default). Concurrent edit detection is planned for v2: each transaction document stores `lastModifiedAt` and `lastModifiedBy`. If a document was modified remotely after the user loaded it, a visual warning badge is shown.

**Fire-and-forget write pattern**: transaction creation and travel parameter updates use `doc()` + `setDoc()`/`updateDoc()` without `await`. This returns the document ID synchronously (generated client-side) and closes the form immediately, without blocking on server confirmation. Firestore writes to local IndexedDB cache instantly; server sync happens in the background.

**`hasPendingWrites` metadata**: the `onSnapshot` listener in `useTransactions` is configured with `{ includeMetadataChanges: true }`. This causes the callback to fire when `snapshot.metadata.hasPendingWrites` flips from `true` (locally cached) to `false` (server confirmed). The UI uses this to show and dismiss sync status indicators without polling.

**`TransactionWithStatus`** is a UI-layer TypeScript type (not stored in Firestore) that extends `Transaction` with `isPending: boolean`, derived from `hasPendingWrites`. It is the type returned by the `useTransactions` hook.

**Split normalization at read time**: pre-Session-009 transactions stored splits as `{ uid: string, amount: number }`. Post-refactor splits use `{ travelMemberId: string, amount: number }`. `useTransactions` casts Firestore data as `Split[]` without field transformation, so old splits arrive with `split.travelMemberId === undefined`. `normalizeTransactionSplits()` in `dashboardHelpers.ts` remaps `split.uid` → `split.travelMemberId` using the already-normalised `TravelMember` list as a lookup table. It returns the same array reference when no normalization is needed (avoiding unnecessary `useMemo` invalidation). This normalization is applied once at the top of `DashboardTab` before any downstream computation.

# 4. Data Architecture

## 4.1 Firestore Collection Structure

| **Collection / Document path** | **Description** |
| --- | --- |
| users/{userId} | User profile, preferences, currency, categories, payment methods |
| users/{userId}/friends/{friendId} | Bidirectional friend list; each user owns their half. Document ID = friend's UID. |
| nametags/{tag} | Uniqueness sentinel mapping lowercase nametag handle → `{ uid }`. Used for availability checks and atomic claims. |
| invites/{inviteId} | Invite documents for friend requests and travel member invitations. The inviteId is an opaque random token — possessing it is the authorization to accept. |
| travels/{travelId} | Travel metadata, member list |
| travels/{travelId}/transactions/{txId} | Individual transaction documents |
| travels/{travelId}/drafts/{draftId} | Draft transactions pending user review (v2) |
| travels/{travelId}/settlements/{sId} | Computed settlement suggestions (v2) |

## 4.2 Core Data Models

### User

| **Field** | **Type** | **Description** |
| --- | --- | --- |
| uid | string | Firebase Auth UID (document ID) |
| type | 'human' | Actor type — always 'human' for User documents. Distinguishes from agent actors in CreatedByRef, which never have User documents. |
| displayName | string | User's display name |
| email | string | User email address |
| nametag | string? | Optional unique handle (e.g. 'alice'). Lowercase, alphanumeric + underscore, 3–20 characters. Claimed atomically via nametags/{tag} sentinel. |
| mainCurrency | string | ISO 4217 code, e.g. 'EUR' |
| categories | string[] | User-defined global fallback category list (across all travels) |
| paymentMethods | string[] | User-defined global fallback payment method list |
| createdAt | Timestamp | Account creation date |

### UserProfile (client-side type)

TypeScript interface defined in `src/auth/services/userService.ts`. Mirrors the Firestore User document and is loaded once at sign-in into the Zustand auth store (`useAuthStore`). Not a separate Firestore collection — a typed view of the `users/{userId}` document used throughout the frontend.

| **Field** | **Type** |
| --- | --- |
| uid | string |
| type | 'human' |
| displayName | string |
| email | string |
| nametag | string? |
| mainCurrency | string |
| categories | string[] |
| paymentMethods | string[] |
| createdAt | Timestamp |

### Travel

| **Field** | **Type** | **Description** |
| --- | --- | --- |
| travelId | string | Auto-generated Firestore ID |
| name | string | Travel name (e.g. 'Japan 2026') |
| emoji | string? | Optional emoji for visual identification (e.g. '🇯🇵') |
| description | string? | Optional description |
| members | TravelMember[] | List of members with display info (see TravelMember below) |
| memberUids | string[] | Flat array of member UIDs — required for Firestore security rules. Security rules cannot inspect fields inside array objects, so this parallel flat array enables `array-contains` queries. |
| createdBy | string | UID of travel creator |
| createdAt | Timestamp | Creation timestamp |
| currencies | string[] | All currencies used in this travel (ISO 4217 codes) |
| categories | LabeledItem[] | Per-travel category list. Empty array on new travels — falls back to userProfile.categories in forms if empty. |
| paymentMethods | LabeledItem[] | Per-travel payment method list. Same fallback behaviour. |
| countries | LabeledItem[] | Countries visited on this travel. Seeded automatically via syncTransactionLocation(); editable in Parameters tab via CountryPicker. |
| cities | LabeledItem[] | Cities visited. Same seeding and edit behaviour. |
| settings | object? | Optional travel settings (e.g. `{ trackLocation: boolean }`) |
| archivedByUids | string[] | UIDs of members who have archived this travel. Per-user archive — each member can archive/unarchive independently. Absent on older documents, read as `[]`. |
| pendingInviteId | string? | Transient field written by a joining non-member solely to pass the invite token to Firestore security rules for authorization via `get()`. Not semantic after the write; ignored by the UI. |

**TravelMember**: `{ travelMemberId: string, displayName: string, userId: string | null, allowRename: boolean, joinedAt: Timestamp }`
- `travelMemberId`: client-generated nanoid — stable key used in `Split[]` objects. Never a Firebase Auth UID.
- `userId`: links the slot to a Firebase Auth account; `null` means the slot is unclaimed (name-only placeholder).
- `allowRename`: if true, any travel member can rename this person.
- Legacy documents stored `{ uid, displayName, joinedAt }`. `normaliseMember()` in `travels/types.ts` handles both shapes transparently on read.

**LabeledItem**: `{ id: string, label: string, emoji?: string }`
- `id`: client-generated stable key (used for Firestore arrayUnion/arrayRemove addressing)
- `label`: display name
- `emoji`: optional emoji prefix (flag for countries, custom emoji for categories)

### Transaction

| **Field** | **Type** | **Description** |
| --- | --- | --- |
| txId | string | Auto-generated Firestore ID |
| date | string | Date of the spending (DD-MM-YYYY) |
| name | string | Description / name of the expense |
| totalAmount | number | Total amount in original currency |
| currency | string | ISO 4217 currency code |
| exchangeRate | number | Rate used: 1 unit of currency = X mainCurrency |
| totalAmountMain | number | totalAmount * exchangeRate (computed, stored) |
| category | string? | Optional category |
| paymentMethod | string? | Optional payment method |
| paidBy | Split[] | Who physically paid, and how much each |
| beneficiaries | Split[] | Who benefits, and what share each |
| createdBy | CreatedByRef | Who or what created this record |
| createdAt | Timestamp | Creation timestamp |
| lastModifiedAt | Timestamp | Last write timestamp (for conflict detection) |
| lastModifiedBy | string | UID of last writer |
| draftId | string? | ID of the originating draft if created via bank import (v2) |
| country | string? | Country where the expense occurred (optional) |
| city | string? | City where the expense occurred (optional) |
| notes | string? | Optional free-text notes |

**Split**: `{ travelMemberId: string, amount: number }` — amounts must sum to totalAmount. `travelMemberId` is the stable nanoid from `TravelMember`, never a Firebase Auth UID. Legacy documents stored `{ uid, amount }`; `normalizeTransactionSplits()` in `dashboardHelpers.ts` remaps these at read time.

**CreatedByRef**: `{ type: 'user', uid: string } | { type: 'agent', name: string }`

### Invite

| **Field** | **Type** | **Description** |
| --- | --- | --- |
| inviteId | string | Firestore document ID — an opaque random token. Knowing the ID is the authorization to read and accept the invite (capability-based security). |
| type | 'friend' \| 'travel_member' | Purpose of the invite |
| fromUid | string | Sender's UID |
| fromDisplayName | string | Sender's display name |
| fromNametag | string | Sender's nametag |
| toUid | string? | Target UID for single-use targeted invites. Absent for multi-use shareable links. |
| travelId | string? | For travel_member invites — the travel to join |
| travelName | string? | For travel_member invites — displayed to the recipient |
| multiUse | boolean | True for shareable links (status stays 'active' after acceptance). False for single-use (status → 'accepted' after first use). |
| status | 'active' \| 'accepted' \| 'declined' \| 'revoked' | Lifecycle state |
| usedBy | string[] | UIDs that have accepted this invite (prevents double-accept) |
| createdAt | Timestamp | Creation time |
| expiresAt | Timestamp | Expiry time (30 days from creation) |

### Friend

Stored at `users/{userId}/friends/{friendId}`. The friendship is bidirectional: both users maintain their own copy.

| **Field** | **Type** | **Description** |
| --- | --- | --- |
| uid | string | Friend's UID (also the document ID) |
| displayName | string | Friend's display name |
| nametag | string | Friend's nametag |
| addedAt | Timestamp | When the friendship was established |

### Draft Transaction (v2)

| **Field** | **Type** | **Description** |
| --- | --- | --- |
| draftId | string | Auto-generated Firestore ID |
| source | string | Payment method / bank source (e.g. 'Revolut', 'Deblock') |
| rawData | object | Raw payload as received from bank webhook or on-chain event. Preserved permanently for audit. |
| date | date | Transaction date from bank data |
| name | string | Merchant name |
| totalAmount | number | Amount in original currency |
| currency | string | ISO 4217 code |
| country | string? | Country from bank data |
| city | string? | Inferred city |
| paymentMethod | string? | Pre-filled from source account |
| category | string? | AI-suggested category |
| travelId | string? | Assigned by user during review (null until then) |
| status | 'pending' \| 'validated' \| 'dismissed' | Lifecycle state (soft delete — never hard-deleted) |
| linkedTxId | string? | ID of the validated transaction |
| createdBy | CreatedByRef | Agent that created the draft |
| createdAt | Timestamp | Creation timestamp |
| expiresAt | Timestamp? | Optional auto-expiry for unreviewed drafts (duration TBD) |

## 4.3 Balance & Settlement Computation

From the transaction collection, the net balance of each member is computed as:

`net(member) = sum(paidBy[member].amount * exchangeRate) - sum(beneficiaries[member].amount * exchangeRate)` [per travel, in main currency]

A positive net means the member is owed money. A negative net means the member owes money. All amounts are converted to the travel's main currency using the `exchangeRate` stored on each transaction. Values are rounded to 2dp; a 0.01 tolerance is used for "effectively zero" checks to avoid floating-point false positives.

Optimal settlement suggestions are derived using a greedy debt-simplification algorithm (minimize number of transfers): sort creditors descending and debtors ascending by magnitude, repeatedly match the largest pair and transfer `min(creditor.net, |debtor.net|)`, stop when all nets are within 0.01 of zero.

Implementation: `computeBalances()` and `computeSettlements()` in `src/travels/utils/balanceUtils.ts` — pure functions, no React or Firebase dependencies. The member identity key is `travelMemberId` (not Firebase Auth UID). This computation runs client-side in v1 and may move to Cloud Functions in v2.

# 5. Key Flows

## 5.1 Transaction Creation (Online)

1. User fills transaction form (date, name, amount, currency, category, payment method, paidBy splits, beneficiary splits)
2. Client validates that paidBy and beneficiary sums equal totalAmount (2dp tolerance)
3. Exchange rate looked up from local hardcoded table and stored on the document
4. Document written via fire-and-forget: `doc()` + `setDoc()` — ID returned synchronously, form closes immediately without waiting for server
5. `syncTransactionLocation()` called fire-and-forget: if country or city is new to this travel, appended via `arrayUnion`. Parent updates local state optimistically via `onLocationAdded` callback so subsequent form opens and Parameters tab reflect the new value immediately.
6. Real-time listener propagates update to all online members

## 5.2 Transaction Creation (Offline)

Same form and validation. Firestore SDK queues the write locally (IndexedDB). Document appears immediately in the local UI (optimistic update). On reconnection, Firestore replays the queue automatically, including any pending `syncTransactionLocation` writes.

## 5.3 Transaction Edit

User taps a transaction row → form opens pre-filled via `initialValues: TransactionWithStatus` prop. On save, `updateTransaction()` calls `updateDoc()` fire-and-forget. Cleared optional fields (category, paymentMethod, country, city, notes) are written with `deleteField()` to actually remove the Firestore field — preventing stale data from surviving an edit that cleared a previously set value.

## 5.4 Friends & Invite Flow

**Sending a friend request (targeted):**
1. User searches by nametag prefix in Profile page (`searchByNametag()`)
2. Taps "Add friend" → `sendFriendRequest()` creates an `invites/{id}` document: type='friend', multiUse=false, toUid set. Fire-and-forget.
3. Recipient sees badge increment on their profile avatar button (from `usePendingInvites` snapshot listener)

**Accepting or declining a friend request:**
1. Recipient opens Profile page, sees incoming requests with sender info
2. Accept → `acceptFriendRequest()`: atomic batch — invite status→'accepted', usedBy updated, bidirectional `users/{uid}/friends/{friendUid}` entries created (security rules allow the accepter to write their own UID into the sender's friend list)
3. Decline → `declineFriendRequest()`: invite status→'declined'. Fire-and-forget.

**Shareable invite link (friend or travel_member):**
1. User taps "Share link" → `createShareableInvite()` creates an invite with multiUse=true, returns inviteId
2. Share URL: `/invite/:inviteId` — the inviteId IS the authorization token (opaque random ID, never guessable)
3. Recipient opens link → `InvitePage` loads and validates the invite (exists, active, not expired, not already used)
4. Recipient taps Accept → `acceptFriendRequest()` or `acceptTravelInvite()` called

**Non-member joining a travel via invite link:**
1. `acceptTravelInvite()` commits an atomic batch:
   - Invite: `usedBy` updated via arrayUnion (+ status→'accepted' for single-use invites)
   - Travel: `members` appended via arrayUnion (MemberRef), `memberUids` appended via arrayUnion, `pendingInviteId` set to the invite token
2. The Firestore security rule for the non-member travel update validates the write by calling `get()` on the invite document, checking that `status == 'active'` and `travelId` matches. This is capability-based access — the invite token is the proof of authorization.
3. After the batch commits, friendship writes happen as separate fire-and-forget calls outside the batch. Kept separate so a friendship-related edge case (e.g. already friends) can never abort the travel join.

**Critical: arrayUnion and Firestore security rules**

Firestore FieldValue transforms (arrayUnion, arrayRemove, serverTimestamp) are NOT reflected in `request.resource.data` during security rule evaluation — the field retains its pre-write value at rule evaluation time. Security rules must never check `request.resource.data.memberUids` when an arrayUnion transform is used on that field. The travel join rule relies on the invite token capability check instead, which is both reliable and sufficient.

## 5.5 Bank Import Agent Flow (v2)

1. Bank or on-chain event triggers a webhook received by a Firebase Cloud Function
2. Cloud Function calls an LLM (Claude) with the raw transaction data and the user's category list
3. LLM returns a structured draft: name, amount, currency, country, city (inferred), category suggestion, payment method
4. Draft written to `travels/{travelId}/drafts/` with status='pending', rawData set to original bank payload, source set to bank/agent name
5. User reviews draft in the Drafts inbox; assigns travel via horizontal carousel (travel name + emoji cards)
6. User confirms → transaction created with draftId referencing the draft; draft status→'validated' (soft delete), linkedTxId set
7. User can dismiss a draft (status→'dismissed'); both states hidden from inbox but retained in Firestore
8. When editing a transaction with a draftId, the UI offers an expandable 'View original bank data' panel fetching rawData from the linked draft on demand

## 5.6 Activity Feed Flow (v2)

1. When any travel member creates or edits a transaction listing the current user as a payer or beneficiary, an activity event is recorded
2. Activity events surfaced in a dedicated Activity tab (pull model in v2, push via FCM in v3)
3. Chronological feed: new transactions, edits, settlement changes involving the current user
4. Badge on Activity tab shows count of unseen events
5. Each item deep-links to the relevant transaction for quick review and editing

## 5.7 Travel Leave / Delete / Archive

**Leave (multi-user travel):**
1. User taps "Leave this travel" in Parameters tab → confirmation dialog
2. `leaveTravel()` writes a single `updateDoc`: `memberUids` updated via `arrayRemove(uid)` (revokes access), user's member slot unclaimed (`userId → null`, slot itself preserved for split integrity)
3. If the user is `createdBy`, the role is reassigned to a random remaining UID from `memberUids`
4. User navigated back to `/travels`

**Impact on `memberUids`:** YES — `arrayRemove(uid)` revokes Firestore read/write access.
**Impact on `members`:** slot is unclaimed (`userId → null`), NOT removed. `travelMemberId` stays intact in transaction splits.

**Delete (solo / last user):**
1. User taps "Delete this travel" → confirmation dialog
2. `deleteTravel()`: batch-deletes all transactions in the subcollection (`getDocs` + `writeBatch`), then `deleteDoc` on the travel document
3. User navigated back to `/travels`

**v1 limitation:** subcollection cleanup is client-side. If the client crashes mid-deletion, orphaned transactions remain (invisible but consuming storage). A Cloud Function `onDelete` trigger is the proper fix (v2).

**Archive / Unarchive (per-user):**
1. `archivedByUids: string[]` on the travel document — each member archives independently
2. `useTravels` splits results client-side into `activeTravels` and `archivedTravels` based on whether the user's UID is in `archivedByUids`
3. No impact on `memberUids` or `members` — purely additive

## 5.8 CSV Export / Import

- Export: fetch all transactions for a travel, map to flat CSV rows, download as .csv
- Import: parse uploaded CSV, validate rows, batch-write to Firestore
- CSV format documented and versioned to ensure round-trip integrity

# 6. Security Model

## 6.1 Firestore Security Rules

All operations require authentication. Rules are deployed via `firestore.rules` and `firebase deploy --only firestore:rules`.

**users/{userId}:**
- Read: any authenticated user (needed for nametag search results and friend display)
- Write: owner only (auth.uid == userId)

**users/{userId}/friends/{friendId}:**
- Read: owner only
- Delete: owner only
- Create/update: owner writes to their own list, OR an accepter adds themselves (`friendId == auth.uid && request.resource.data.uid == auth.uid`). This second condition enables the invite acceptance batch to write into the sender's friend list on the accepter's behalf.

**nametags/{tag}:**
- Read: any authenticated user (needed for availability checks before claiming)
- Create: authenticated user claiming their own UID (`request.resource.data.uid == auth.uid`)
- Delete: owner only (`resource.data.uid == auth.uid`)
- Update: forbidden — nametag change is implemented as delete-old + create-new for atomicity

**invites/{inviteId}:**
- Read: any authenticated user (the inviteId is an opaque token — possessing it is the authorization)
- Create: authenticated user setting `fromUid == auth.uid`
- Update (accept): requester not already in `usedBy`; invite is multiUse or `toUid == auth.uid`; `fromUid` cannot change (tamper protection)
- Delete (revoke): sender only (`resource.data.fromUid == auth.uid`)

**travels/{travelId}:**
- Read, update, delete: member only (`auth.uid in resource.data.memberUids`)
- Create: authenticated user including themselves in `memberUids`
- Non-member join via invite: `auth.uid NOT in resource.data.memberUids`, `pendingInviteId` present in request, invite document status == 'active' (via `get()`), invite `travelId` matches (via `get()`). Note: the rule does NOT check `request.resource.data.memberUids` — arrayUnion transforms are not reflected in that field at rule evaluation time.

**travels/{travelId}/transactions/{txId}:**
- Read/write: travel member only (membership validated via `get()` on the parent travel document — one extra read per rule evaluation)

# 7. Phased Roadmap

| **Phase** | **Name** | **Scope** |
| --- | --- | --- |
| v1 | Core (current) | PWA, offline sync, single/multi-member travel, transactions with multi-payer splits, transaction editing, travel emoji, per-travel categories/paymentMethods/countries/cities (LabeledItem[] with smart dropdowns), friends system (nametag search, friend requests, shareable invite links), travel member invitations (join via invite link), profile page with nametag claim, four-tab travel detail (Transactions / Balance / Dashboard / Parameters), read-only analytics dashboard (period filter, per-member stats, category breakdown, spending-over-time), CSV export/import, hardcoded currency rates |
| v2 | Collaborative+ | Bank import agent (Revolut webhook, Nordigen aggregator, on-chain via Alchemy/Moralis), draft transaction inbox with soft-delete and raw data audit trail, carousel travel selector, AI-assisted categorization, activity feed (pull model), dynamic membership with join-date visibility cutoff, conflict detection UI, live currency rates, settlement suggestions |
| v3 | Notifications | Push notifications (FCM) for new/edited transactions involving the user; activity feed upgraded to push model |
| v4 | Advanced | Bank-rate currency input, cash withdrawal tracking, full conflict resolution UI, recurring/template transactions, manual fetch-new-transactions trigger, potential native app wrappers |

# 8. Open Questions & Deferred Decisions

| **Topic** | **Detail** | **Status** |
| --- | --- | --- |
| Currency rate source | Hardcoded for v1. Future: official API vs bank rate vs user-input rate. | Decided: hardcoded v1 |
| Dynamic membership with join-date cutoff | Invite-based joining (no cutoff) is v1. Join-date visibility cutoff for past transactions deferred to v2. | Decided |
| Concurrent edit conflicts | Last-write-wins in v1. v2 adds detection via lastModifiedAt timestamp and visual warning. | Decided |
| Settlement computation location | Client-side in v1. May move to Cloud Functions in v2 for consistency. | Open |
| CSV schema versioning | Format to be defined during implementation. Must support round-trip import/export. | Open |
| Bank import: push vs polling | Revolut/Wise support native webhooks. N26/Deblock fiat require polling via GoCardless/Nordigen. Deblock on-chain via Alchemy/Moralis. | Open (v2) |
| Draft lifecycle: soft delete | Drafts never hard-deleted. Validated: status='validated', linkedTxId set. Dismissed: retained, hidden from inbox. | Decided (v2) |
| Draft expiry policy | Auto-expire unreviewed drafts after N days? Duration TBD. | Open (v2) |
| Activity feed storage | Top-level activities/{userId} collection vs derived from Firestore listeners. | Open (v2) |
| Activity feed seen/unseen state | lastSeenAt on User document is the likely approach. | Open (v2) |
| Manual fetch trigger | On-demand webhook fallback deferred to v4. | Decided (v4) |
| updateTravelList conflict | Adding categories/methods from transaction form overwrites the full LabeledItem[] array. Two offline members adding different items simultaneously → last sync wins. Fix in v2: use arrayUnion for individual item additions. | Open (v2) |
| arrayUnion in security rules | Resolved: FieldValue transforms (arrayUnion) are NOT reflected in request.resource.data during rule evaluation. Rules must use capability tokens (pendingInviteId + get()) instead of checking mutated array fields. | Decided |
| Travel deletion subcollection cleanup | Client-side batch delete in v1 (getDocs + writeBatch). Cloud Function `onDelete` trigger on `travels/{travelId}` needed for v2: handles crash recovery, >500 transactions, orphan cleanup. | Open (v2) |
