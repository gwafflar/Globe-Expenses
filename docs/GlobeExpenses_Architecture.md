**GlobeExpenses**

General Architecture Document

_Version 0.7 - November 2026_

# 1. System Overview

GlobeExpenses is a collaborative space expense tracking Progressive Web App (PWA). It allows travelers to record, categorize, and analyze spending during trips, with multi-currency support and collaborative expense splitting among space companions.

The application is designed to function fully offline with automatic synchronization when connectivity is restored. Space members can invite friends via shareable links and join shared spaces through invite tokens. In its first phase it targets individual and small-group use. Push notifications (FCM) are live since November 2026; the Activity Feed UI is planned.

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
| Push notifications | Firebase Cloud Messaging | Transaction & membership alerts, see `docs/NOTIFICATIONS_SPEC.md` |
| Hosting | Firebase Hosting | CDN delivery of the PWA |

# 3. Frontend Architecture

## 3.1 Application Structure

The frontend is organized into the following top-level modules:

- **auth/** — Login, registration, profile page, session management
- **spaces/** — Space list, space creation, space detail view (module folder is `spaces/`; the Firestore collection remains `travels/`, frozen as legacy — see §4.1)
  - `spaces/components/SpaceTabs.tsx` — four-tab container with swipe gesture (Transactions / Balance / Dashboard / Parameters)
  - `spaces/components/tabs/TransactionsTab.tsx` — transaction list with pending badges, tap-to-edit
  - `spaces/components/tabs/BalanceTab.tsx` — net balances per member, greedy settlement computation, settlement currency selector, copy-to-clipboard, "Mark as paid" pre-fill into transfer form
  - `spaces/components/tabs/DashboardTab.tsx` — read-only analytics: hero totals, spending-over-time, recent days by category, by-category breakdown, per-person stats, currencies summary
  - `spaces/components/tabs/dashboardHelpers.ts` — pure TypeScript helpers (no React): period filtering, member stats, colour palette, formatting, split normalization
  - `spaces/components/CollapsibleCard.tsx` — reusable collapsible card (used by Dashboard; planned for Balance tab)
  - `spaces/components/tabs/ParametersTab.tsx` — all per-space editable lists and settings, members section with invite
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

**Fire-and-forget write pattern**: transaction creation and space parameter updates use `doc()` + `setDoc()`/`updateDoc()` without `await`. This returns the document ID synchronously (generated client-side) and closes the form immediately, without blocking on server confirmation. Firestore writes to local IndexedDB cache instantly; server sync happens in the background.

**`hasPendingWrites` metadata**: the `onSnapshot` listener in `useTransactions` is configured with `{ includeMetadataChanges: true }`. This causes the callback to fire when `snapshot.metadata.hasPendingWrites` flips from `true` (locally cached) to `false` (server confirmed). The UI uses this to show and dismiss sync status indicators without polling.

**`TransactionWithStatus`** is a UI-layer TypeScript type (not stored in Firestore) that extends `Transaction` with `isPending: boolean`, derived from `hasPendingWrites`. It is the type returned by the `useTransactions` hook.

**Split normalization at read time**: pre-Session-009 transactions stored splits as `{ uid: string, amount: number }`. Post-refactor splits use `{ travelMemberId: string, amount: number }`. `useTransactions` casts Firestore data as `Split[]` without field transformation, so old splits arrive with `split.travelMemberId === undefined`. `normalizeTransactionSplits()` in `dashboardHelpers.ts` remaps `split.uid` → `split.travelMemberId` using the already-normalised `SpaceMember` list as a lookup table. It returns the same array reference when no normalization is needed (avoiding unnecessary `useMemo` invalidation). This normalization is applied once at the top of `DashboardTab` before any downstream computation.

## 3.3 Internationalization (i18n)

English and French, in `src/i18n/` (no library — decision #99).

- **Messages**: one file per app area under `messages/en/` and `messages/fr/`. English is the source of truth: `Messages = typeof en`, and every French file is annotated `Messages['<area>']`, so a missing key, an extra key or a different parameter signature does not compile. Messages with parameters are functions (`owes: (p: { from: string; to: string }) => …`); plurals go through `plural(lang, n, { one, other })` (`Intl.PluralRules`: French treats 0 as singular). `languages.test.ts` additionally fails on an empty French string or a multi-word one left in English.
- **API** (`@/i18n`): `useT()` in components (subscribes to the language), `getT()` in plain TS called at run time — never at module level, which would freeze the language at import. `useLocale()` / `getLocale()` give the Intl tag for dates and numbers (keeps the browser's region when it matches, e.g. `fr-BE`).
- **Store**: `useLanguageStore` (Zustand) holds `preference` (`'en' | 'fr' | 'auto'`), the resolved `language` and `locale`. Resolution: profile value applied at sign-in (`useAuthStore` → `applyProfilePreference`) > localStorage cache of this device > browser languages > English. Sets `<html lang>`.
- **Persistence**: `users/{uid}.language`, written fire-and-forget by `LanguageSelect` (Profile → Preferences). Absent = never chose, so each device keeps its own default.
- **Stored data is not translated** (decision #101): countries are stored as English names and shown through `displayCountryName()` / `localizedCountryName()` (`Intl.DisplayNames`); typed names are mapped back with `findCountry()`. Currency names come from `localizedCurrencyName()`. User-entered lists (categories, payment methods) are data.
- **XLSX** workbook content stays English (decision #102); only the dialogs are translated. `buildSpaceWorkbook()` runs inside `withLanguage('en', …)`, which makes every `getT()` / `getLocale()` in shared label helpers (dimension labels, card titles) answer in English for that synchronous call. The foreign-file column matcher also accepts French headers (montant, libellé, devise…).
- **Language-dependent stored defaults**: a few auto-generated names are written in the creator's language (settlement transfer "Remboursement", withdrawal/adjustment/reconciliation default names, "(sans nom)" for unnamed imported rows, "Inconnu" member name). They are user data from then on.
- **Push**: each device writes its language on `users/{uid}/fcmTokens/{token}.language`; `deliverPush()` groups tokens by language and builds the text with `functions/src/push/text.ts` (`PUSH_STRINGS`, a separate table because Functions cannot import `src/`).
- **Adding a language**: add the code in `languages.ts`, copy `messages/en/` to `messages/<code>/` and translate (the compiler lists what is missing), register it in `messages/index.ts`, add a `PUSH_STRINGS` entry in `functions/src/push/text.ts`.

# 4. Data Architecture

## 4.1 Firestore Collection Structure

**⚠️ Legacy note (Space refactor, see `docs/SPACE_REFACTOR_SPEC.md`):** the container is now called **Space** throughout the code (types, functions, UI), but the Firestore collection path stays `travels/` and the `travelMemberId` / `memberUids` field keys stay as written below — renaming a Firestore collection or a stored field key requires a data migration, which was judged to buy nothing. Every consumer reads/writes through `spaceService.ts`, which hard-codes the legacy path internally.

| **Collection / Document path** | **Description** |
| --- | --- |
| users/{userId} | User profile, preferences, currency, categories, payment methods |
| users/{userId}/friends/{friendId} | Bidirectional friend list; each user owns their half. Document ID = friend's UID. |
| nametags/{tag} | Uniqueness sentinel mapping lowercase nametag handle → `{ uid }`. Used for availability checks and atomic claims. |
| invites/{inviteId} | Invite documents for friend requests and space member invitations. The inviteId is an opaque random token — possessing it is the authorization to accept. |
| travels/{travelId} | Space metadata, member list — collection name frozen as legacy |
| travels/{travelId}/transactions/{txId} | Individual transaction documents |
| travels/{travelId}/drafts/{draftId} | Draft transactions pending user review (v2) |
| travels/{travelId}/settlements/{sId} | Computed settlement suggestions (v2) |
| travels/{travelId}/importBatches/{importBatchId} | "Import finished" marker `{ createdBy, rowCount, createdAt }`, written by the XLSX importer after its last batch. Triggers one summary notification per import (`NOTIFICATIONS_SPEC.md` §7). Create-only. |
| users/{userId}/activity/{eventId} | Activity feed entries, written only by Cloud Functions (`NOTIFICATIONS_SPEC.md` §3.1) |
| users/{userId}/fcmTokens/{token} | One document per device registered for push; carries that device's UI `language` (§3.3) |
| users/{userId}/pushThrottle/{spaceId} | Push limiter counter per space (`_social` for invitations) |
| users/{userId}/private/notifications | Owner-only notification settings: `mutedSpaceIds` and the feed watermarks |

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
| categories | string[] | User-defined global fallback category list (across all spaces) |
| paymentMethods | string[] | User-defined global fallback payment method list |
| language | `'en' \| 'fr' \| 'auto'`? | UI language chosen in Profile. Absent = never chosen (device default). See §3.3 |
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

### Space

*(TypeScript type `Space`, formerly `Travel`. Stored at `travels/{travelId}` — path frozen as legacy, see §4.1.)*

| **Field** | **Type** | **Description** |
| --- | --- | --- |
| spaceId | string | Auto-generated Firestore ID. TS property only — never written into the document body, always derived from `doc.id`. |
| name | string | Space name (e.g. 'Japan 2026') |
| emoji | string? | Optional emoji for visual identification (e.g. '🇯🇵') |
| description | string? | Optional description |
| members | SpaceMember[] | List of members with display info (see SpaceMember below) |
| memberUids | string[] | Flat array of member UIDs — required for Firestore security rules. Security rules cannot inspect fields inside array objects, so this parallel flat array enables `array-contains` queries. |
| createdBy | string | UID of space creator |
| createdAt | Timestamp | Creation timestamp |
| currencies | string[] | All currencies used in this space (ISO 4217 codes) |
| mainCurrency | string? | Reference currency for exchange rate conversions. All transactions compute `exchangeRate` and `totalAmountMain` relative to this. Set at creation (defaults to user's `mainCurrency`); locked afterwards (editable + batch recompute is v2). Absent on legacy docs — resolved via `getSpaceMainCurrency()`. |
| defaultRates | Record<string, number>? | Per-space exchange rates: `{ "USD": 0.92 }` means 1 USD = 0.92 mainCurrency. Seeded from hardcoded table at creation via `buildDefaultRates()`. User-editable in ParametersTab. `getExchangeRate()` checks these before the hardcoded fallback. Absent on legacy docs. |
| categories | LabeledItem[] | Per-space category list. Empty array on new spaces — falls back to userProfile.categories in forms if empty. |
| paymentMethods | LabeledItem[] | Per-space payment method list. Same fallback behaviour. |
| countries | LabeledItem[] | Countries visited in this space. Seeded automatically via syncTransactionLocation(); editable in Parameters tab via CountryPicker. |
| cities | LabeledItem[] | Cities visited. Same seeding and edit behaviour. |
| settings | object? | Optional space settings (e.g. `{ trackLocation: boolean }`). **Superseded by `config`** — retained for backward compatibility and read by `getSpaceConfig()` as the legacy source for `builtInFields.country` / `.city`. New writes go to `config`. |
| config | SpaceConfig? | Per-space field and feature configuration. Absent on legacy documents. ⚠️ **Never read directly** — always go through `getSpaceConfig()`, which resolves legacy documents to full travel-mode defaults. See `docs/SPACE_REFACTOR_SPEC.md` §4. |
| presetOrigin | PresetId? | `'travel' \| 'solo' \| 'group' \| 'custom'`. **DISPLAY ONLY** — which preset the space was created from, used for the list badge and the "re-apply preset" section in Parameters. ⚠️ No behaviour may branch on this field; behaviour reads `config`. |
| startDate | string? | Optional trip start, ISO `"YYYY-MM-DD"`. ⚠️ This format **differs** from `Transaction.date` (`"DD-MM-YYYY"`) — never compare the two as raw strings, go through an explicit parse helper. Set only for the `travel` preset's optional "Set trip dates" extra. Display only. |
| endDate | string? | Optional trip end, ISO `"YYYY-MM-DD"`. Same format caveat as `startDate`. |
| archivedByUids | string[] | UIDs of members who have archived this space. Per-user archive — each member can archive/unarchive independently. Absent on older documents, read as `[]`. |
| pendingInviteId | string? | Transient field written by a joining non-member solely to pass the invite token to Firestore security rules for authorization via `get()`. Not semantic after the write; ignored by the UI. |

**SpaceConfig**: `{ builtInFields, features, customFields, dashboardCards? }`
- `builtInFields`: `{ country, city, category, paymentMethod, notes }` — all `boolean`. Disabling hides the field everywhere and omits its export column; it never deletes stored values.
- `features`: `{ wallets, multiCurrency }`. `multiCurrency` is a sticky flag — it auto-upgrades to `true` on first foreign-currency use and never auto-downgrades. `wallets: true` forces `paymentMethod: true` (see `normaliseSpaceConfig()`), since wallet balances are keyed on payment method.
- `customFields`: `CustomFieldDef[]` — `{ id, label, emoji?, type, options?, enabled }` where `type` is `'select' | 'text' | 'boolean'`. `id` is a stable nanoid, never derived from the label.
- `dashboardCards`: `DashboardCardDef[]?` — `{ id, dimensions: [string] | [string, string], title? }`. ⚠️ **Absent and `[]` are different states**: absent means "never edited" and resolves to the legacy default card set; `[]` means the user deleted every card. See `resolveDashboardCards()`.

**Future: `mainCurrency` editability (v2 design note)** — staying locked in v1 by decision. When this is picked up, it must be an explicit **batch-recompute action**, not a quiet field edit: every existing transaction's `exchangeRate` and `totalAmountMain` was computed relative to the *old* `mainCurrency` and becomes silently wrong the instant `mainCurrency` changes underneath it. Proposed flow: user picks a new `mainCurrency` → client computes the new `exchangeRate`/`totalAmountMain` for every transaction in the subcollection (using `defaultRates`/hardcoded fallback resolved against the *new* currency) → show a preview (old vs. new totals, at least aggregate) → user confirms → single batched write (chunked at 500 docs, same pattern as `deleteSpace`/`mergeMembers`). Treat as high blast-radius; do not implement as a simple settings toggle.

**SpaceMember**: `{ travelMemberId: string, displayName: string, userId: string | null, allowRename: boolean, joinedAt: Timestamp }`
- `travelMemberId`: client-generated nanoid — stable key used in `Split[]` objects. Never a Firebase Auth UID. ⚠️ Field name frozen as legacy (see §4.1).
- `userId`: links the slot to a Firebase Auth account; `null` means the slot is unclaimed (name-only placeholder).
- `allowRename`: if true, any space member can rename this person.
- Legacy documents stored `{ uid, displayName, joinedAt }`. `normaliseMember()` in `spaces/types.ts` handles both shapes transparently on read.

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
| country | string? | Country where the expense occurred. ⚠️ Stored **bare**, with no flag prefix (e.g. `"Japan"`) — `SmartCountrySelect` passes the plain name and the flag is kept separately in `Space.countries[].emoji`. This corrects an earlier claim in this document that it carried a `"🇯🇵 Japan"` prefix (audit finding F7); the Analysis sheet's SUMPRODUCT formulas relied on that claim and silently summed every country to zero until Phase 8. **Note the asymmetry with `category` / `paymentMethod`**, which *are* stored with their emoji prefix because the picker's option value is the concatenated display string. `dimensionCellText()` is the single place that encodes which is which. |
| city | string? | City where the expense occurred (optional). Stored bare. |
| notes | string? | Optional free-text notes |
| amountFormula | string? | Raw formula string entered by the user (e.g. "2*2.5 + 1.5"). `totalAmount` is always the computed result. Display-only — never used in any calculation. |
| type | TransactionType? | `'expense' \| 'withdrawal' \| 'adjustment' \| 'transfer'`. Undefined on legacy documents → treated as `'expense'`. |
| fees | number? | Withdrawal fees in transaction currency. Deducted from wallet balance: user received `totalAmount - fees`. Only meaningful when `type === 'withdrawal'`. |
| adjustmentMode | AdjustmentMode? | `'expense'` (counts in spending analytics) or `'balance_only'` (wallet-only, invisible to analytics). Only meaningful when `type === 'adjustment'`. |
| custom | Record<string, CustomValue>? | User-defined field values, keyed by `CustomFieldDef.id`. `CustomValue = string \| boolean`. Absent when the space has no custom fields or none were filled. ⚠️ For `select` fields the value is the **option id**, never the label — renaming an option updates every transaction for free. ⚠️ `false` is **never stored**: `buildCustomPayload()` omits it, so an absent boolean key means "no". A single map rather than top-level keys avoids collisions with reserved names and gives form, detail, filter and export one generic code path. |

| importBatchId | string? | Set on every transaction written by one XLSX import run. Read by Cloud Functions only: imported rows get a feed entry but no push, and one summary push is sent per import. Stays on the document; later manual edits notify normally. |

**Split**: `{ travelMemberId: string, amount: number }` — amounts must sum to totalAmount. `travelMemberId` is the stable nanoid from `SpaceMember`, never a Firebase Auth UID. Legacy documents stored `{ uid, amount }`; `normalizeTransactionSplits()` in `dashboardHelpers.ts` remaps these at read time (applied in both `DashboardTab` and `TransactionsTab`).

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
| travelId | string? | For travel_member invites — the space to join |
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

`net(member) = sum(paidBy[member].amount * exchangeRate) - sum(beneficiaries[member].amount * exchangeRate)` [per space, in main currency]

A positive net means the member is owed money. A negative net means the member owes money. All amounts are converted to the space's main currency using the `exchangeRate` stored on each transaction. Values are rounded to 2dp; a 0.01 tolerance is used for "effectively zero" checks to avoid floating-point false positives.

Optimal settlement suggestions are derived using a greedy debt-simplification algorithm (minimize number of transfers): sort creditors descending and debtors ascending by magnitude, repeatedly match the largest pair and transfer `min(creditor.net, |debtor.net|)`, stop when all nets are within 0.01 of zero.

Implementation: `computeBalances()`, `computeBalancesRaw()`, and `computeSettlements()` in `src/spaces/utils/balanceUtils.ts` — pure functions, no React or Firebase dependencies. The member identity key is `travelMemberId` (not Firebase Auth UID). This computation runs client-side in v1 and may move to Cloud Functions in v2.

**Same-currency optimization**: `getSingleCurrency(transactions)` detects when all balance-affecting transactions share one currency. When that currency equals the selected settlement currency, `BalanceTab` uses `computeBalancesRaw()` (sums raw `split.amount` without multiplying by `exchangeRate`). This eliminates the lossy round-trip distortion of currency→mainCurrency→currency conversions (e.g. an all-MYR trip settling in MYR).

**Transaction type predicates** (in `walletHelpers.ts`):
- `countsAsSpending(tx)` — true for `expense` and spending-mode `adjustment`. Controls what appears in analytics and the Dashboard.
- `affectsBalance(tx)` — true for `expense`, `adjustment`, and `transfer`. Controls what enters the balance/settlement computation. `BalanceTab` uses this predicate, not `countsAsSpending`, so transfers correctly shift inter-member balances without appearing in spending analytics.

# 5. Key Flows

## 5.1 Transaction Creation (Online)

1. User fills transaction form (date, name, amount, currency, category, payment method, paidBy splits, beneficiary splits)
2. Client validates that paidBy and beneficiary sums equal totalAmount (2dp tolerance)
3. Exchange rate looked up from local hardcoded table and stored on the document
4. Document written via fire-and-forget: `doc()` + `setDoc()` — ID returned synchronously, form closes immediately without waiting for server
5. `syncTransactionLocation()` called fire-and-forget: if country or city is new to this space, appended via `arrayUnion`. Parent updates local state optimistically via `onLocationAdded` callback so subsequent form opens and Parameters tab reflect the new value immediately.
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
4. Recipient taps Accept → `acceptFriendRequest()` or `acceptSpaceInvite()` called

**Non-member joining a space via invite link:**
1. `acceptSpaceInvite()` commits an atomic batch:
   - Invite: `usedBy` updated via arrayUnion (+ status→'accepted' for single-use invites)
   - Space: `members` appended via arrayUnion (MemberRef), `memberUids` appended via arrayUnion, `pendingInviteId` set to the invite token
2. The Firestore security rule for the non-member space update validates the write by calling `get()` on the invite document, checking that `status == 'active'` and `travelId` matches. This is capability-based access — the invite token is the proof of authorization.
3. After the batch commits, friendship writes happen as separate fire-and-forget calls outside the batch. Kept separate so a friendship-related edge case (e.g. already friends) can never abort the space join.

**Critical: arrayUnion and Firestore security rules**

Firestore FieldValue transforms (arrayUnion, arrayRemove, serverTimestamp) are NOT reflected in `request.resource.data` during security rule evaluation — the field retains its pre-write value at rule evaluation time. Security rules must never check `request.resource.data.memberUids` when an arrayUnion transform is used on that field. The space join rule relies on the invite token capability check instead, which is both reliable and sufficient.

## 5.5 Bank Import Agent Flow (v2)

1. Bank or on-chain event triggers a webhook received by a Firebase Cloud Function
2. Cloud Function calls an LLM (Claude) with the raw transaction data and the user's category list
3. LLM returns a structured draft: name, amount, currency, country, city (inferred), category suggestion, payment method
4. Draft written to `travels/{travelId}/drafts/` with status='pending', rawData set to original bank payload, source set to bank/agent name
5. User reviews draft in the Drafts inbox; assigns space via horizontal carousel (space name + emoji cards)
6. User confirms → transaction created with draftId referencing the draft; draft status→'validated' (soft delete), linkedTxId set
7. User can dismiss a draft (status→'dismissed'); both states hidden from inbox but retained in Firestore
8. When editing a transaction with a draftId, the UI offers an expandable 'View original bank data' panel fetching rawData from the linked draft on demand

## 5.6 Activity Feed & Push Notifications Flow

Full design: `docs/NOTIFICATIONS_SPEC.md` (authoritative). Steps 1–3 and 5 below are implemented and in production (14 Nov 2026); the feed UI (step 4) is not.

Code map: server in `functions/src/` — `index.ts` (five Firestore triggers), `events/` (pure event and recipient rules), `push/` (limiter, message text, FCM send), `activity/publish.ts` (feed writes), `mapping.ts` (raw documents → event inputs). Client in `src/notifications/` — `services/pushService.ts` (device token lifecycle), `services/notificationPrefs.ts` (mute, limiter reset), `store/usePushPromptStore.ts` + `components/PushPromptBanner.tsx` (permission banner), the two toggles, and `public/push-sw.js` (the `push` / `notificationclick` handlers, loaded into the Workbox service worker with `importScripts`).

Summary:

1. A Firestore write (transaction created/edited/deleted, invite, friend request, space deleted, import finished) fires a Cloud Function that resolves the event kind and its recipients (`travelMemberId` → `uid` via the space's `members`; the actor is never notified)
2. The function writes one activity document per event per recipient to `users/{uid}/activity/{eventId}` (fan-out on write, snapshot of names and amounts, the recipient's own share). This happens from day one, even if push ships before the feed UI
3. Push-worthy events go through a per-(recipient, space) limiter (`users/{uid}/pushThrottle/{spaceId}`, updated in a Firestore transaction: 2 normal pushes, then one "more changes" push, then silence until 60 s of quiet) and are sent via FCM to the user's device tokens (`users/{uid}/fcmTokens/{token}`), unless the space is in `mutedSpaceIds` (private doc `users/{uid}/private/notifications`, since `users/{uid}` is readable by all signed-in users)
4. Feed UI (later): 🔔 header icon with unread badge (`activityLastSeenAt` watermark), entries bold until tapped (`openedAt`) or "Mark all as read" (`activityReadAllAt` watermark)
5. Tapping an entry or a notification deep-links to the transaction or space

## 5.7 Space Leave / Delete / Archive

**Leave (multi-user space):**
1. User taps "Leave this space" in Parameters tab → confirmation dialog
2. `leaveSpace()` writes a single `updateDoc`: `memberUids` updated via `arrayRemove(uid)` (revokes access), user's member slot unclaimed (`userId → null`, slot itself preserved for split integrity)
3. If the user is `createdBy`, the role is reassigned to a random remaining UID from `memberUids`
4. User navigated back to `/spaces`

**Impact on `memberUids`:** YES — `arrayRemove(uid)` revokes Firestore read/write access.
**Impact on `members`:** slot is unclaimed (`userId → null`), NOT removed. `travelMemberId` stays intact in transaction splits.

**Delete (solo / last user):**
1. User taps "Delete this space" → confirmation dialog
2. `deleteSpace()` deletes **only the space document** (fire-and-forget `deleteDoc`, works offline)
3. User navigated back to `/spaces`
4. The Cloud Function `onTravelDeleted` removes every subcollection server-side (`recursiveDelete()`: `transactions`, `importBatches`) and writes one `space_deleted` activity event per former member

Deleting the space first means each cascaded transaction delete finds no parent space (and no end-user actor) and produces no event (`NOTIFICATIONS_SPEC.md` §5 rule 5). There is no 500-write cap any more, and a crash mid-deletion can no longer strand transactions. For a few seconds the orphaned transactions still exist but are unreadable: the rules check the parent's `memberUids`.

A client still running a cached older build uses the old client-side cascade (`getDocs` + `writeBatch`, capped at 500) until its service worker updates. Both paths end in the same state.

**Archive / Unarchive (per-user):**
1. `archivedByUids: string[]` on the space document — each member archives independently
2. `useSpaces` splits results client-side into `activeSpaces` and `archivedSpaces` based on whether the user's UID is in `archivedByUids`
3. No impact on `memberUids` or `members` — purely additive

## 5.8 XLSX Export / Import

*(Not CSV — the format is a styled multi-sheet .xlsx workbook. Implemented in `src/shared/utils/sheet*.ts`.)*

**Export** (`buildSpaceWorkbook()` → `exportSpaceToXlsx()`), five visible sheets plus one hidden:

| Sheet | Contents |
| --- | --- |
| ⚙️ Parameters | Main currency, member slots, exchange rate table |
| 📃 Expenses | One row per transaction. Column layout is **config-driven** — see below |
| ⚖️ Balance | Per-member cost/paid/balance, VLOOKUP'd from Expenses by row index |
| 💸 Balance Summary | Per-member totals |
| 📊 Analysis | **Generated from `config.dashboardCards`** — 1D blocks and 2D cross-tabs, live SUMPRODUCT. Omitted entirely when no card survives |
| `_globeexpenses` | Hidden. JSON payload carrying format version, space identity, the full resolved `SpaceConfig` (field + option ids), and the member list |

- **Columns**: `columnMapForConfig()` emits no column for a disabled built-in, and one column per exported custom field (`select` → option label, `boolean` → `yes`/`no`, `text` → raw). Column *numbers* shift accordingly, so every formula reference is derived from the map, never from a fixed letter.
- **Disabled fields holding data**: detected by `findOrphanedFields()` and warned about before the file is generated, with export-without (default) or include-anyway. Included fields get columns while the metadata still marks them disabled, so re-import restores both values and state.
- **Formula cells carry their computed value.** SheetJS omits any cell whose `v` is `undefined`, so a formula alone never reaches the file; and not every consumer honours `fullCalcOnLoad` (Excel and LibreOffice do; Google Sheets may not), so the cached value must also be *correct*.
- **Dates** are written as Excel serials computed **entirely in UTC**. The 1899 epoch predates standardised time zones, so local-time arithmetic makes the serial depend on the exporting machine's zone.
- **No secrets** in the metadata sheet: no uids, invite ids or emails. A shared export is safe to hand to anyone already allowed to see the transactions.

**Import** — three paths, chosen by the file (`selectImportPath()`):

1. **Lossless** — our own export returning to the same space. Custom values map by option id, members by `travelMemberId`. One confirmation screen, then import. The hidden `txId` column makes re-import *update in place* rather than duplicate.
2. **Foreign space** — our export going into a different space. Config is known but ids are not, so members use the existing slot-mapping step and values fall back to label matching.
3. **Foreign file** — no GlobeExpenses structure. Columns are mapped to fields (auto-matched on header text), each `select` column gets **one** decision (create all missing options / match only existing / skip), and unmatched columns can become new custom fields with an inferred type. Capped at 10 new fields per import.

Writes are chunked `writeBatch` at 500 documents with progress. Field and option creation goes through `updateSpaceConfig()` — the importer never writes config directly.

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
- Read/write: space member only (membership validated via `get()` on the parent space document — one extra read per rule evaluation)

**travels/{travelId}/importBatches/{importBatchId}:**
- Create only: space member, `createdBy == auth.uid`, fields limited to `createdBy`, `rowCount`, `createdAt`. No read, update or delete (the Cloud Function trusts `createdBy` as the actor).

**Notification paths under users/{userId}/** (owner-only; Cloud Functions write with the Admin SDK and bypass rules — see `NOTIFICATIONS_SPEC.md` §3.4):
- `activity/{eventId}`: read; update of `openedAt` only (must be a timestamp). No client create/delete.
- `fcmTokens/{token}`: read, create, update, delete.
- `pushThrottle/{key}`: create/update with `count == 0` as the only changed key (merge write). No read/delete.
- `private/notifications`: read, create, update; only `mutedSpaceIds`, `activityLastSeenAt`, `activityReadAllAt`.
- Rules do not cascade: the `users/{userId}` write rule covers that document only, so each subcollection has its own match.
- Tested against the emulator: `rules-tests/`, run by `pnpm test:rules`.

# 7. Phased Roadmap

| **Phase** | **Name** | **Scope** |
| --- | --- | --- |
| v1 | Core (current) | PWA, offline sync, single/multi-member space, transactions with multi-payer splits, transaction editing, space emoji, per-space categories/paymentMethods/countries/cities (LabeledItem[] with smart dropdowns), friends system (nametag search, friend requests, shareable invite links), space member invitations (join via invite link), profile page with nametag claim, four-tab space detail (Transactions / Balance / Dashboard / Parameters), read-only analytics dashboard (period filter, per-member stats, category breakdown, spending-over-time), CSV export/import, hardcoded currency rates |
| v2 | Collaborative+ | Bank import agent (Revolut webhook, Nordigen aggregator, on-chain via Alchemy/Moralis), draft transaction inbox with soft-delete and raw data audit trail, carousel space selector, AI-assisted categorization, activity feed (pull model), dynamic membership with join-date visibility cutoff, conflict detection UI, live currency rates, settlement suggestions |
| v3 | Notifications | ✅ **Shipped 14 Nov 2026** (ahead of the v2 feed UI). Push notifications (FCM) for events involving the user; writes the feed's activity documents from day one; `onTravelDeleted` cascade function. See `docs/NOTIFICATIONS_SPEC.md` |
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
| Activity feed storage | `users/{uid}/activity/{eventId}`, written only by Cloud Functions (fan-out on write). See `NOTIFICATIONS_SPEC.md` §3. | Decided |
| Activity feed seen/unseen state | Two watermarks in the private doc `users/{uid}/private/notifications`: `activityLastSeenAt` (badge) and `activityReadAllAt` ("Mark all as read"), plus per-entry `openedAt`. | Decided |
| Activity feed retention | Kept forever for now; revisit once real volumes are known. | Open (deferred) |
| Manual fetch trigger | On-demand webhook fallback deferred to v4. | Decided (v4) |
| updateSpaceList conflict | Adding categories/methods from transaction form overwrites the full LabeledItem[] array. Two offline members adding different items simultaneously → last sync wins. Fix in v2: use arrayUnion for individual item additions. | Open (v2) |
| arrayUnion in security rules | Resolved: FieldValue transforms (arrayUnion) are NOT reflected in request.resource.data during rule evaluation. Rules must use capability tokens (pendingInviteId + get()) instead of checking mutated array fields. | Decided |
| Space deletion subcollection cleanup | Cloud Function `onTravelDeleted` cascade-deletes server-side; the client deletes only the space document. Pulled forward from v2 as a prerequisite for notifications (avoids one `tx_deleted` event per transaction). Also fixes the >500-transaction cap and crash recovery. | Implemented and in production (14 Nov 2026) |
