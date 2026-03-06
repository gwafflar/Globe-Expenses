**GlobeExpenses**

Formal Product Specification

_Version 0.5 - March 2026_

_Reference document for AI-assisted development sessions. All decisions recorded herein are binding unless explicitly revised._

# 1. Product Vision

GlobeExpenses is a collaborative travel expense tracking application. It enables travelers to record spending during trips, convert amounts to a reference currency, analyze their expenses via a dashboard, and settle debts among travel companions. The application works fully offline and synchronizes automatically when internet connectivity is available.

The product is distributed as a Progressive Web App (PWA), installable directly on Android and iOS devices without going through an app store.

# 2. Decided Technical Stack

| **Concern** | **Decision** | **Rationale** |
| --- | --- | --- |
| App platform | PWA (Progressive Web App) | Single codebase for Android + iOS, no store fees, offline via Service Worker, push notifications supported iOS 16.4+ |
| Frontend language | TypeScript | Type safety, better AI tooling support, fewer runtime errors |
| Frontend framework | React 18 | Widest AI tool ecosystem, strong community, best Cursor support |
| Build tool | Vite + vite-plugin-pwa | Fast DX, first-class PWA and Service Worker support |
| UI library | shadcn/ui + Tailwind CSS v4 | Accessible components, readable generated code, good AI support |
| State management | Zustand | Minimal boilerplate, easy to reason about, TypeScript-friendly |
| Local persistence | Dexie.js (IndexedDB) | Structured offline storage, offline write queue |
| Backend platform | Firebase (BaaS) | No custom server required, handles auth + DB + functions + notifications |
| Database | Cloud Firestore | Real-time sync, native offline persistence, document model fits data |
| Authentication | Firebase Auth | Email/password + Google OAuth. Apple login excluded (not targeting App Store) |
| Server-side logic | Firebase Cloud Functions | Currency computation, bank import agent (v2), notification dispatch (serverless) |
| Push notifications | Firebase Cloud Messaging | Phase 3 feature |
| Hosting | Firebase Hosting | CDN delivery, HTTPS by default |
| Currency rates | Hardcoded table (v1) | Deferred complexity. Rate stored per transaction at creation time regardless of source. |
| AI coding tools | Cursor (primary) + Claude (architecture/review) | Cursor for daily development, Claude for design decisions and code review |

# 3. Functional Requirements

## 3.1 User Account

- A user must register and authenticate before using the app.
- Authentication methods: email/password and Google OAuth (via Firebase Auth).
- Each user has a profile with: display name, email, main currency (ISO 4217 code), a global fallback list of categories, and a global fallback list of payment methods.
- A user may optionally claim a **nametag** — a unique lowercase handle (3–20 alphanumeric + underscore characters, e.g. `alice`). The nametag is used for friend search and displayed in invites. Claiming a nametag is atomic: a sentinel document in `nametags/{tag}` is written in a batch alongside the user profile update; the batch fails if the tag is already taken.
- The User document carries a `type` field fixed to `'human'`, distinguishing human actors from agent actors in the CreatedByRef union type. Agent actors do not have User documents.
- Global categories and payment methods are available across all travels as a fallback when a travel has no per-travel list defined.

## 3.2 Travel Management

- A user can create multiple travels.
- A travel has: name (required), emoji (optional, for visual identification), description (optional), start date (optional), end date (optional), and a list of members.
- Travel members can invite others to join via a shareable invite link (see section 3.5). The invited user joins the travel by accepting the link — all existing transactions are visible to them from the moment of joining (no join-date visibility cutoff in v1).
- All members have equal access to read and write transactions within a travel.
- A user can view only travels in which they are a member.
- Each travel carries per-travel editable lists: categories, paymentMethods, countries, cities (all `LabeledItem[]`). Managed from the Parameters tab of the travel detail view.
- [v2] Dynamic member removal and join-date based visibility cutoff for past transactions.

## 3.3 Transaction Management

### 3.3.1 Transaction Fields

| **Field** | **Required** | **Type** | **Description** |
| --- | --- | --- | --- |
| Date | Yes | Date | Date the expense occurred |
| Name / Description | Yes | String | Short label for the expense |
| Total Amount | Yes | Decimal | Amount in the transaction currency |
| Currency | Yes | ISO 4217 | Currency of the transaction |
| Exchange Rate | Auto | Decimal | Rate at time of entry (1 unit = X main currency). Stored permanently. |
| Amount (main currency) | Auto | Decimal | Computed: totalAmount * exchangeRate. Stored. |
| Category | No | String | From travel's per-travel category list (falls back to user's global list) |
| Payment Method | No | String | From travel's per-travel payment method list (falls back to user's global list) |
| Country | No | String | Country of the expense. |
| City | No | String | City of the expense. |
| Paid By (splits) | Yes | Split[] | Who paid and how much each. Must sum to total amount. |
| Beneficiaries (splits) | Yes | Split[] | Who benefits and how much each. Must sum to total amount. |
| Draft ID | No | String | ID of the originating draft if created via bank import (v2). Enables retrieval of raw bank data on demand. |
| Notes | No | String | Free text additional notes |

### 3.3.2 Transaction Attribution

The `createdBy` field uses a union type to distinguish between manual user entry and automated agent creation:

- `{ type: 'user', uid: string }` — for manually created transactions
- `{ type: 'agent', name: string }` — for transactions created by the bank import agent (e.g. 'Revolut Agent')

### 3.3.3 Split Model

A Split is defined as: `{ uid: string, amount: number }`. Both `paidBy` and `beneficiaries` are arrays of Splits.

Invariants enforced by the UI:
- `sum(paidBy[].amount) == totalAmount` (validated to 2dp rounding tolerance)
- `sum(beneficiaries[].amount) == totalAmount` (validated to 2dp rounding tolerance)

Split editor behaviour:
- Equal mode: amounts computed to 3dp internally; validity check rounds to 2dp to absorb floating-point drift
- Custom mode: amounts stored and displayed at 2dp; an "absorb" chip redistributes any remainder to a selected member
- Solo travel (1 member): split UI is hidden entirely; paidBy and beneficiaries are set automatically to the single member

Example — Restaurant: Total 75 EUR. Alice paid 50, Bob paid 25 (paidBy). Alice's meal cost 30, Bob's cost 45 (beneficiaries). Net: Alice paid 50, owes 30 → is owed 20. Bob paid 25, owes 45 → owes 20.

### 3.3.4 Transaction Form — Smart Dropdowns

**Currency:**
- Default: last transaction's currency in this travel (falls back to userProfile.mainCurrency for the first transaction)
- Dropdown options: travel.currencies ordered by most recent use
- `+ Add…` option: opens an inline searchable picker; selected currency is permanently added to travel.currencies

**Country:**
- Default: last transaction's country in this travel
- Dropdown options: travel.countries ordered by most recent use, with flag emoji
- `+ Add…` option: opens an inline searchable picker with flag emojis (~110 countries); selected country permanently added to travel.countries

**City:** previously used values from existing transactions, plus `+ Add new…` inline text input.

**Category / Payment Method:** travel's per-travel list shown; falls back to userProfile global list if travel list is empty. Both support `+ Add new…` which adds the item to the travel's list.

When a transaction is saved with a country or city not yet in the travel's lists, `syncTransactionLocation()` writes them to the travel document via `arrayUnion` (fire-and-forget, offline-safe). The travel detail page updates local state optimistically via an `onLocationAdded` callback so subsequent form opens and the Parameters tab reflect the new value immediately.

### 3.3.5 Transaction Operations

- **Create**: any travel member can create. Fire-and-forget write.
- **Edit**: tap any transaction row to open the form pre-filled with existing values. On save, `updateTransaction()` uses `deleteField()` for any cleared optional fields (category, paymentMethod, country, city, notes) to actually remove the Firestore field.
- **Delete**: any travel member can delete (v1, no access control beyond membership)
- **View list**: filterable by date range, category, payment method, currency, member (filter UI is a placeholder in current implementation)

## 3.4 Travel Detail View — Tabs

The travel detail view is organised into three tabs accessible by tapping the tab bar or by horizontal swipe gesture (50px threshold).

### Transactions tab

- Lists all transactions for the travel, ordered by date descending then createdAt descending
- Each transaction card shows: date, category emoji, name, primary payer, location, amount in transaction currency, "for you" amount in main currency, pending sync badge
- Tapping a row opens the transaction in edit mode (pre-filled form)
- Filter button and Display Mode toggle: placeholders, deferred to a future version
- Empty state with CTA to add the first expense
- Floating action button (+) opens the transaction creation bottom sheet

### Balance tab

Placeholder. Will display net balance per member and optimal settlement suggestions (greedy debt-simplification algorithm).

### Parameters tab

Editable per-travel settings. All changes auto-saved to Firestore on interaction.

- **Travel identity**: name (auto-save on blur) and emoji (auto-save on blur, grapheme-aware — keeps first emoji only)
- **Members**: list of current members with avatars. "Invite to travel" button generates a shareable travel_member invite link. Sharing a second time reuses or regenerates the link.
- **Currencies**: collapsible searchable checklist of ~42 currencies (code, symbol, name). Selection persisted to travel.currencies.
- **Categories**: inline editable list (LabeledItem[]) — add item (emoji + label), rename on tap, delete. Persisted to travel.categories.
- **Payment methods**: same inline editable list pattern. Persisted to travel.paymentMethods.
- **Countries**: collapsible searchable checklist of ~110 countries with flag emojis. Persisted to travel.countries.
- **Cities**: inline editable list. Auto-seeded on render from existing transactions (cities not already in the list are appended). Persisted to travel.cities.

## 3.5 Friends & Invite System

### 3.5.1 Overview

The friends system enables users to discover each other by nametag, send friend requests, and invite friends to join shared travels. Invites use capability-based security: the invite link contains an opaque random token that is itself the proof of authorization — no separate access control check is needed.

### 3.5.2 Nametag

- Optional, unique, immutable once claimed (change = release old + claim new)
- Format: lowercase, alphanumeric + underscore, 3–20 characters
- Claimed via atomic batch write: sentinel document `nametags/{tag} = { uid }` + user profile update. Batch fails if the tag is already taken (atomic uniqueness guarantee without a Cloud Function).
- Used as the primary search key for friend discovery
- Displayed in invite pages and friend lists

### 3.5.3 Friend Requests

- **Search**: user types a nametag prefix (minimum 1 character); debounced Firestore range query returns up to 10 matches
- **Send**: creates an `invites/{id}` document with type='friend', multiUse=false, toUid set. The recipient sees an incremented badge on their profile avatar button.
- **Accept**: atomic batch — invite status→'accepted', usedBy updated, bidirectional `users/{uid}/friends/{friendUid}` entries written
- **Decline**: invite status→'declined'. Fire-and-forget.
- Incoming requests visible in Profile page under the Friends section

### 3.5.4 Shareable Invite Links

Any invite (friend or travel_member) can be shared as a link:
- `createShareableInvite()` creates an invite with `multiUse=true`, returns the inviteId
- Share URL: `/invite/:inviteId`
- Multi-use links keep `status='active'` after each acceptance (the link keeps working)
- Single-use targeted invites (toUid set) transition to `status='accepted'` after first use

### 3.5.5 Travel Member Invite

- From the Parameters tab, any travel member can generate a travel_member invite link
- Recipient opens the link → `InvitePage` validates and displays travel + sender info
- Accept → `acceptTravelInvite()`:
  - Atomic batch: invite update + travel update (members + memberUids via arrayUnion, pendingInviteId set)
  - Firestore security rule validates the invite token via `get()` before allowing the non-member write
  - Friendship writes happen fire-and-forget after the batch, so they cannot abort the travel join
- The `pendingInviteId` field on the travel document is a transient authorization carrier — only written to satisfy the security rule; has no semantic meaning after the write

### 3.5.6 Invite Lifecycle

| **State** | **Meaning** |
| --- | --- |
| active | Invite is valid and can be accepted |
| accepted | Single-use invite has been accepted (multi-use stays 'active') |
| declined | Recipient explicitly declined a targeted invite |
| revoked | Sender deleted the invite |

Expiry: invites expire 30 days after creation (enforced client-side in InvitePage; server-side enforcement via Cloud Function is a v2 improvement).

## 3.6 Draft Transactions (v2)

### 3.6.1 Overview

Draft transactions are pre-filled transaction records created automatically by the bank import agent, pending user review. They are a first-class feature with their own inbox and editing flow.

### 3.6.2 Draft Fields

Drafts carry all core transaction fields pre-filled from the bank data, plus:

- `source` — the payment method / bank that originated the draft
- `rawData` — the original bank payload as received; preserved permanently for audit purposes
- `status` — 'pending', 'validated', or 'dismissed' (see lifecycle below)
- `linkedTxId` — ID of the transaction created upon validation; null until validated
- `travelId` — null until assigned by the user during review
- `expiresAt` — optional auto-expiry timestamp for unreviewed drafts (duration TBD)

### 3.6.3 Draft Lifecycle (Soft Delete)

Drafts are never hard-deleted:
- pending → validated: user confirms. A transaction is created with draftId set, linkedTxId set on draft. Hidden from inbox.
- pending → dismissed: user discards. Hidden from inbox but retained in Firestore.
- Validated and dismissed drafts remain queryable. When editing a transaction with a draftId, the UI offers an expandable 'View original bank data' panel.

### 3.6.4 Draft Inbox

- Global across all travels, filterable by payment method / source bank
- Badge on Drafts tab shows count of unreviewed drafts

### 3.6.5 Draft Review Flow

1. User opens a draft from the inbox
2. Travel selection: horizontal swipe carousel with travel cards (name + emoji), extending beyond screen edges
3. User reviews all pre-filled fields — all editable; splits expandable
4. User confirms → transaction created, draft soft-deleted (status='validated')

### 3.6.6 Bulk Actions

- Multi-select for batch dismiss (status→'dismissed') or travel assignment

## 3.7 Activity Feed (v2)

The Activity Feed is a pull-model notification center surfacing collaborative events that affect the current user. Distinct from the Drafts inbox.

- An activity event is generated when any travel member creates or edits a transaction listing the current user as a payer or beneficiary
- Shows a chronological feed: new transactions, edits, settlement changes
- Badge shows count of unseen events; `lastSeenAt` on the User document tracks seen state
- Tapping an item deep-links to the relevant transaction for review/edit
- [v3] Activity events also delivered as push notifications via FCM

## 3.8 Dashboard & Statistics

- Total spending per travel, in main currency
- Spending breakdown by category (pie/bar chart)
- Spending over time (line chart)
- Spending breakdown by member
- Balance summary: who owes whom (optimal settlement suggestions)
- Multi-currency summary with converted totals

## 3.9 Export & Import

- Export: download all transactions for a travel as a .csv file
- Import: upload a .csv file to batch-create transactions in a travel
- CSV format is flat (one row per transaction), versioned, and documented
- Round-trip integrity: an exported file can be re-imported without data loss
- Split data is serialized in a defined format within the CSV (to be specified during implementation)

## 3.10 Offline Behavior

- The app shell loads without network (Service Worker caches assets)
- All previously loaded data is readable offline (Firestore offline persistence)
- Transactions can be created and edited offline
- Offline writes are queued and automatically synchronized when connectivity is restored
- `syncTransactionLocation()` writes are also queued offline and replayed on reconnect
- Conflict policy v1: last-write-wins
- [v2] Conflict detection: if a transaction's lastModifiedAt in Firestore is newer than the version the user loaded, a visual warning is shown

## 3.11 Notifications (Phase 3)

- Push notifications via Firebase Cloud Messaging
- Trigger: a transaction is created or edited that lists the user as a payer or beneficiary
- Notification content: transaction name, amount, travel name, actor
- Users can enable/disable notifications per travel

# 4. Non-Functional Requirements

- The app must be installable on Android (Chrome) and iOS (Safari, 16.4+) via 'Add to Home Screen'
- The app must function without network for all core transaction features
- All data must be stored in Firebase — no sensitive data stored only on device
- All Firestore access must be protected by security rules based on travel membership or invite token
- The app must be responsive and usable on screens from 375px width (iPhone SE) upward
- Exchange rates are stored at transaction time and never retroactively updated

# 5. UI Design Principles

- Design before building: for complex flows (especially the draft review flow), wireframes should be validated before any backend schema is finalized
- Carousel for travel selection: horizontal swipe carousel with large cards showing travel name + emoji, extending beyond screen edge to hint at more content
- Emoji per travel: travels have an optional emoji for visual identification; set at travel creation and editable in Parameters tab
- Progressive disclosure: complex fields (splits, picker lists) are collapsed by default and expanded on demand
- Bulk actions: the draft inbox supports multi-select for batch operations
- Offline-first: every user action must work offline; sync state is surfaced via badges and banners, not blocking modals
- Smart defaults: form fields pre-fill from the most recent transaction where possible (currency, country, city); pickers show recently used items first
- Capability-based invite links: the invite URL itself is the authorization — no login-gated invite page; just validate the token and show the invite

# 6. Out of Scope (v1)

- Dynamic member removal and join-date visibility cutoff (v2; invite-based joining without cutoff is v1)
- Live currency exchange rate API integration
- Bank rate / cash withdrawal rate input
- Conflict resolution UI
- Push notifications (v3)
- Receipt photo attachment
- Multi-language / i18n
- App Store / Play Store distribution
- Settlement recording (marking a debt as paid)
- Bank import agent and draft transaction flow (v2)
- Activity feed for collaborative transaction events (v2)
- Manual fetch-new-transactions trigger (v4)
- Recurring / template transactions (v4)
- Filter and Display Mode in Transactions tab (placeholders exist, implementation deferred)

# 7. Development Approach

- Vibe-coding methodology: Cursor as primary IDE, Claude for architecture decisions and code review
- All sessions should begin by loading this document and the architecture document into context
- Work in small, verifiable increments — each prompt's output must be reviewable in one sitting
- Tests are written alongside code, not after
- Living SPEC.md and ARCHITECTURE.md maintained in the repository
- SESSION_LOG.md summarizes completed work and next steps for AI context loading
- UI design (wireframes) precedes implementation for complex multi-step flows

# 8. Decision Log

| **#** | **Decision** | **Detail** | **Rationale** |
| --- | --- | --- | --- |
| 1 | PWA platform | Single PWA for Android + iOS, no App Store | No publishing fees, one codebase, offline via Service Worker |
| 2 | Firebase backend | Firebase Auth + Firestore + Functions + FCM | No custom server, offline sync built-in, scales with usage |
| 3 | React + TypeScript | React 18, TypeScript, Vite, shadcn/ui | Best AI tooling ecosystem, readable generated code |
| 4 | Hardcoded currency rates (v1) | Rate stored per transaction at creation. No live API yet. | Defers complexity; correct model (store rate at time of purchase) is already in place |
| 5 | Multi-payer splits | Both paidBy and beneficiaries are Split[] arrays summing to total | Handles all real-world payment scenarios including partial payments and cash change |
| 6 | Global categories/payment methods | Per-user global fallback, available across all travels | Maximum flexibility; per-travel lists (decision #38) take priority when defined |
| 7 | Invite-based travel joining (v1) | Non-members can join via invite link. No join-date visibility cutoff. Dynamic membership with cutoff is v2. | Functional collaborative use case without complex cutoff logic |
| 8 | Last-write-wins (v1) | No conflict resolution in v1; conflicts detected and flagged in v2 | Firestore default; acceptable for small travel groups |
| 9 | Auth: email + Google | Firebase Auth, no Apple login | Apple login required only for App Store distribution |
| 10 | No custom server | All backend logic in Cloud Functions | Reduces ops burden; appropriate for expected scale |
| 11 | createdBy as union type | `{ type: 'user', uid }` \| `{ type: 'agent', name }` — applies to both transactions and drafts | Enables clear attribution between manual entry and automated agent; backward compatible |
| 12 | User.type fixed to 'human' | Explicit type field on User document; agents never have User documents | Documents the actor model clearly |
| 13 | Travel emoji (v1) | Optional emoji field on Travel document, displayed in lists and detail header; editable in Parameters tab | Low effort, high personality; supports visual identification |
| 14 | Draft inbox: global + filter by source | All drafts in one inbox, filterable by payment method / source bank | User assigns travel during review; filtering by source useful when multiple accounts connected |
| 15 | Carousel for travel selection in drafts | Horizontal swipe carousel with travel name + emoji cards, extends beyond screen edge | Aesthetic and efficient; avoids dropdown for a visually prominent action |
| 16 | Bank import: Revolut preferred (v2) | Revolut: native webhook + API. N26/Deblock fiat: GoCardless aggregator. Deblock on-chain: Alchemy/Moralis. | Revolut is most developer-friendly; on-chain data is public by design |
| 17 | UI design before backend for complex flows | Wireframes validated before finalizing data models for draft flow and other complex v2 features | Avoids costly backend rework |
| 18 | Draft soft delete | Drafts transition to 'validated' or 'dismissed' but are never hard-deleted. Raw bank data preserved permanently. | Audit trail; enables retroactive inspection of original bank payload |
| 19 | Transaction.draftId reference | Lean pointer from transaction to originating draft; raw data fetched on demand, not duplicated | Keeps transaction documents clean |
| 20 | Activity feed (v2, pull model) | Dedicated Activity tab for collaborative events affecting current user; push upgrade in v3 via FCM | Conceptually separate from drafts inbox; pull model keeps v2 scope manageable |
| 21 | Manual fetch trigger deferred to v4 | Fetch-new-transactions button is v4 | Low priority given reliable webhooks |
| 22 | Auth spinner pattern | Show spinner while isAuthReady === false to prevent flash-to-login | Clean UX; avoids redirect on page load for authenticated users |
| 23 | Firestore profile creation in auth store | Defensive check in onAuthStateChanged — creates doc if missing, handles Google OAuth | Single place for profile bootstrap; no risk of missing doc on first sign-in |
| 24 | memberUids dual-field pattern | members: MemberRef[] for UI, memberUids: string[] for security rules | Firestore security rules cannot inspect fields inside array objects; flat UID array required |
| 25 | Fire-and-forget transaction write | doc() + setDoc() without await; ID returned synchronously | Enables immediate UI feedback and true offline support |
| 26 | isPending flag on transaction | Derived from snapshot.metadata.hasPendingWrites; drives "not synced" badge and save banner | Clear offline/online state feedback without polling |
| 27 | includeMetadataChanges on onSnapshot | Required for isPending badge to disappear when server confirms write | Without it, hasPendingWrites flip is not observed |
| 28 | Per-travel LabeledItem lists | categories, paymentMethods, countries, cities stored as LabeledItem[] on travel document; fall back to userProfile globals if empty | Maximum per-trip flexibility; emoji personalisation; backward compatible |
| 29 | LabeledItem type | `{ id: string, label: string, emoji?: string }` with client-generated stable id | Stable id required for Firestore arrayUnion/arrayRemove addressing |
| 30 | CountryPicker backed by static list | ~110 countries with flag emojis in pickerData.ts; replaces free-text entry for countries | Flag emoji is a v1 feature; static list avoids API dependency |
| 31 | Smart currency/country dropdowns in TransactionForm | Travel lists ordered by recent use; `+ Add…` permanently adds to travel | Reduces friction for recurring currencies/countries |
| 32 | syncTransactionLocation | After transaction save, new country/city written to travel via arrayUnion (fire-and-forget); parent updates local state optimistically via onLocationAdded | Ensures dropdowns and Parameters tab stay current without manual entry |
| 33 | Shared picker data | src/shared/data/pickerData.ts — single source of truth for currency and country static data | Avoids duplication between ParametersTab and TransactionForm |
| 34 | Three-tab travel detail | Transactions / Balance / Parameters tabs with swipe gesture | Separates concerns cleanly; Parameters replaces a separate settings screen |
| 35 | SplitEditor mode as controlled prop | mode (equal/custom) lifted to TransactionForm; persists across drawer open/close | Prevents accidental mode reset when user re-opens the form |
| 36 | Decimal precision rule | UI displays amounts at 2dp. Internal calculations use 3dp to avoid floating-point drift. Validity checks round to 2dp. Applies globally. | 3dp internally prevents false "invalid" states (e.g. 100/3 = 33.333 × 3 = 99.999, rounds to 100 at 2dp). Users never see sub-cent values. |
| 37 | Nametag: atomic sentinel batch write | Delete old nametags/{tag} + create new + update user doc — all in one batch. Fails atomically if tag is taken. | Uniqueness guaranteed without a Cloud Function |
| 38 | deleteField() for cleared optional fields | updateTransaction() uses deleteField() for undefined optional fields (category, city, notes, etc.) | Clearing a field in edit mode actually removes it from Firestore — prevents stale data surviving edits |
| 39 | Unified create/edit drawer | Same Drawer + TransactionForm for both create and edit modes, driven by editingTx state and initialValues prop | Avoids duplicating the form component; mode switch is transparent to the form |
| 40 | No save banner for edited transactions | watchedTxId/SaveBanner pattern only triggered for newly created transactions | Transaction already in snapshot; edit updates flow through onSnapshot naturally |
| 41 | Capability-based invite tokens | inviteId is an opaque random Firestore-generated ID. Possessing it is sufficient authorization to view and accept the invite. | No ACL checks needed; unguessable IDs provide equivalent security without server-side validation |
| 42 | Invite acceptance: core batch + separate friendship writes | Batch = invite update + travel update (atomic, must succeed together). Friendship writes = fire-and-forget outside batch. | A friendship-related failure (e.g. already friends) must not abort the travel join |
| 43 | arrayUnion not reflected in request.resource.data | Firestore FieldValue transforms are evaluated server-side AFTER rules pass. Rules checking request.resource.data.memberUids during an arrayUnion write will see the pre-write value and always fail. | Travel join rule uses pendingInviteId + get() capability check instead of checking the mutated array |
| 44 | pendingInviteId: transient authorization carrier | The accepter writes pendingInviteId to the travel document solely for the security rule to read via get(). It has no semantic meaning for the UI and is not displayed or used after the write. | Enables non-member write authorization without a Cloud Function intermediate |
