# Code Review — Travel → Space major upgrade

**Branch**: `Travel-to-Space-maj-upgrade` vs `main`
**Scope**: `main...HEAD` — 22 commits, 101 files, ~19.4k insertions
(Travel→Space refactor + config-driven form/list/dashboard + spreadsheet import/export)
**Date**: 2026-09-01

## Verification status

- `pnpm tsc -b` — clean
- `pnpm test` — 611 / 613 pass. The 2 failures are the 20s-timeout flakes the new
  `vite.config.ts` comment describes; both files pass in isolation
  (`DashboardTab.test.tsx`: 42/42 in 37s standalone). Not code defects.

## Gating note

The spreadsheet path ships behind `SHEETS_FEATURE_ENABLED = false`
(`src/spaces/components/tabs/TransactionsTab.tsx:33`), so findings **5, 6, 7, 11, 12**
are latent until the flag flips. They must be fixed before it does.

---

## Findings

### 1. Editing a transaction deletes stored values of config-disabled built-in fields

`src/transactions/components/TransactionForm.tsx:943` — **high**

`fieldVisible()` (line 564) ANDs in `config.builtInFields.<key>`, so
`category` / `paymentMethod` / `country` / `city` / `notes` go out as `undefined`, and
`updateTransaction()` maps every undefined optional to `deleteField()`
(`transactionService.ts:104-116`).

**Scenario**: 200 expenses have categories and notes; the owner turns Category off in
Parameters (values retained by design); any member then edits one transaction to fix a
typo → `category: deleteField(), notes: deleteField()` is written and the value is gone,
blank if the field is re-enabled.

This contradicts the invariant `mergeCustomPayload()` (`config.ts:104-119`) implements for
custom fields and that `findOrphanedFields()` / `DisabledFieldsExportDialog` are built
around. Built-ins need the same merge: hidden-because-config-disabled must preserve, only
hidden-because-wrong-type should clear. Currently untested.

### 2. `applyPreset()` destroys every dashboard card

`src/spaces/presets.ts:81` — **high**

`applyPreset()` omits `dashboardCards`. `FieldsEditor.handleReset()`
(`FieldsEditor.tsx:382`) emits that config → `updateSpaceConfig()` does
`updateDoc(ref, { config: … })`, a whole-map replacement, and `serialiseSpaceConfig()`
deliberately drops the key when undefined (`spaceService.ts:121`).

**Scenario**: a member builds five dashboard cards, later opens Parameters → Fields →
Reset to realign toggles with the preset → every card definition is destroyed for all
members and `resolveDashboardCards()` silently falls back to `LEGACY_DEFAULT_CARDS`.

**Fix**: carry `dashboardCards: config.dashboardCards` through. Sibling paths use
`emit({ ...config })` and are unaffected.

### 3. `handleUnlinkAndCreateNew` claims a slot using a stale members array

`src/spaces/components/tabs/ParametersTab.tsx:1147` — **high**

`addUnclaimedMember(…, space.members)` writes `[...space.members, newMember]`, then
`claimSpaceMember(…, space.members)` is passed the *old* array and writes it back in full —
so `newMember` is erased, nothing matches its id, and the only net effect is the user's
previous slot being set to `userId: null`.

**Scenario**: "This is not me" → "I'm someone new" → name → Join on a multi-member space
leaves the user with no claimed slot and no new member, while the optimistic
`onSpaceChange` shows success until the next snapshot.

`InvitePage.handleCreateAndClaim` gets this right by passing `[...allMembers, newMember]`.

### 4. "No {dimension}" drill-down silently shows an unfiltered list for custom selects

`src/spaces/utils/dashboardCards.ts:136` — **high**

`computeBreakdown` emits `values: [UNDEFINED_FILTER]` for the missing bucket regardless of
source, but `dimensionValues()` returns `[]` for an absent custom select
(`filterDimensions.ts:324`) and those dimensions are `optionsAreClosed: true` with only the
field's own option ids legal (`filterDimensions.ts:274-278`); `reconcileFilters`
(`filterDimensions.ts:375-383`) then finds no legal value and drops the whole key.

**Scenario**: add a custom select "Trip leg" to an existing space → all old transactions
land in "No trip leg · €480 (12)" → tap → the tab shows all 40 in-range transactions
instead of those 12.

Same for pivot missing section/row (`PivotCard.tsx:88`/`96`). Tests cover only the built-in
`category` case.

### 5. Import value-decision default is displayed but never applied

`src/shared/components/import/ValueDecisionStep.tsx:51` — **high (gated)**

The radio renders `decisions[col.columnIndex] ?? { kind: 'createAll', excluded: [] }` so
"Add the new values (12)" looks pre-selected, but `selectDecisions` stays `{}` until a
click, and `collectPendingOptions` (`foreignSheet.ts:573`) requires
`decision?.kind === 'createAll'` — with no entry it creates nothing and `buildForeignRows`
imports each cell empty.

**Scenario**: foreign sheet, "Trip leg" column mapped to a custom select with 12 new
values, user taps Import without touching the radio → no options created, all 12 values
dropped from every row, no warning. Tests always pass an explicit decision.

### 6. `foreignSpace` path promises custom-field matching that does not exist

`src/shared/components/ImportXlsxDialog.tsx:434` — **medium (gated)**

`ForeignSpaceNotice` says field values "will be asked to match below", but the flow is
mapping (members only) → preview (built-in lists only) → `handleImport`, which passes the
*target* space's `customFields` to `importParsedRows`; `resolveCustomForSpace`
(`sheetImport.ts:406`) drops every value with an unknown field id — and ids are random per
space, so always all of them.

**Scenario**: export Space A (300 rows with "Trip leg" values) → import into Space B →
300 rows land with every custom value gone and the result screen reports success.

### 7. `merge: true` makes cleared cells un-clearable on re-import

`src/shared/utils/sheetImport.ts:641` — **medium (gated)**

`set(…, { merge: true })` now also covers the `custom` map, which Firestore deep-merges.

**Scenario**: lossless path with `txId` present; the user blanks a note and a custom select
cell in Excel and re-imports → both keep their old values while the dialog reports
"1 transaction updated", so the advertised round-trip is one-way for deletions.

### 8. Dashboard drill-down loses the spending-only scope

`src/spaces/components/tabs/DashboardTab.tsx:368` — **medium**

`handleRowDrillDown` carries dimension selections and the date range but not the
spending-only restriction `scopeTransactions` applied (`dashboardScope.ts:121`,
`countsAsSpending`), and the tab starts with no `type` filter
(`useTransactionFilters.ts:132`).

**Scenario**: tapping "Cash · €200" on a Payment card opens a list that also includes the
¥50,000 withdrawal and settlement transfers the card excluded. Tapping "No category · €30"
is worse, since withdrawals / transfers / adjustments never carry a category and all
extract as `UNDEFINED_FILTER`.

### 9. New-transaction prefill can seed a deleted select option id

`src/transactions/components/TransactionForm.tsx:685` — **medium**

A `select` custom field is prefilled from
`existingTransactions.find(tx => tx.custom?.[def.id] !== undefined)` with no validation
against `def.options`.

**Scenario**: an option is deleted in Parameters but the most recent transaction still
carries its id → the new-expense form seeds that dead id, the `<select>` renders blank
(no matching `<option>`), the user saves without touching it, and the transaction stores a
dangling id that `resolveOptionLabel()` renders as a raw nanoid and no filter can match.

**Fix**: guard with `def.options?.some(o => o.id === recentValue)`.

### 10. `updateSpaceConfig` whole-map write defeats the stated concurrency guarantee

`src/spaces/services/spaceService.ts:244` — **medium**

It writes the whole `config` map from a render-time snapshot, contradicting the
dot-notation rationale documented on `updateSpaceDashboardCards` (line 252).

**Scenario**: member A adds a dashboard card; member B toggles Notes in Parameters a moment
later → B's whole-map write carries B's stale `dashboardCards` and reverts A's card.

**Fix**: narrow to per-subkey dot-notation, or soften the comment.

### 11. Unhandled rejection leaves the import dialog stuck on the progress bar

`src/shared/components/ImportXlsxDialog.tsx:673` — **low (gated)**

`handleImport` awaits `importParsedRows` with no try/catch, unlike `handleForeignImport`
(line 792). If `batch.commit()` rejects (rules denial, quota, offline),
`setIsImporting(false)` and `setImportResult` never run, so `ResultStep` shows the progress
bar forever — the Done button only renders when `!isImporting` (line 1026) — and the dialog
can only be dismissed.

### 12. Foreign import writes whole list arrays instead of `arrayUnion`

`src/shared/components/ImportXlsxDialog.tsx:828` — **low (gated)**

`withCreatedListItems(existing ?? [], …)` + `updateDoc`, where the lossless path at line 707
uses `arrayUnion`.

**Scenario**: user B adds a category in Parameters while user A's foreign import is
running → B's category is erased on commit. Same shape at line 814
(`updateSpaceConfig` whole-config write).

### 13. Pivot cards render fully collapsed on first load

`src/spaces/components/dashboard/PivotCard.tsx:73` — **low**

`expanded` is seeded from `sections` in a `useState` initialiser that runs once, but the
card mounts before the Firestore listener delivers transactions, so
`sections.length === 0` and the initial set is empty; the key
`${card.id}:${card.dimensions.join('|')}` never changes, so no remount fixes it.

Result: on a freshly-opened space every pivot section renders collapsed rather than
"first section open" as the comment and the builder preview promise.

### 14. Debounced config write is dropped on unmount

`src/spaces/components/tabs/ParametersTab.tsx:1824` — **low**

The 500ms debounced write is cleared on unmount (cleanup at line 1805) with no flush.

**Scenario**: the user adds a custom field, types its label, and within 500ms taps
"All spaces" or browser-back → `SpaceDetailPage` unmounts, the timer is cleared, nothing is
written, and the label is gone next visit even though the UI showed it saved.

### 15. Hidden-items pill looks up the wrong transaction list

`src/spaces/components/tabs/DashboardTab.tsx:920` — **low**

The "Spending over time" hidden-items pill looks the transaction up in `scopedTxs`, while
the equivalent "Day by day" code uses `normalizedTxs` (line 1160).

**Scenario**: hide a transaction, then narrow the date range so it falls out of scope →
`find` returns `undefined`, the pill renders `null`, and the user sees a bare "Hidden:"
label with no way to clear the exclusion.

---

## Checked and clean

- `mapSpaceDoc` covers every `Space` field
- All `serialise*` helpers test `!== undefined` rather than truthiness
- `normaliseSpaceConfig`'s wallets ↔ paymentMethod invariant is applied on both read and write
- `useSpaces` / `SpaceDetailPage` cache-first listener guards
- `acceptSpaceInvite` batch atomicity
- No behaviour branches on `presetOrigin`
- `balanceUtils` / `dashboardHelpers` / `BalanceTab` are pure renames
- Legacy `/travels/*` routes redirect correctly
- `sheetColumns` column-letter and optional-column arithmetic
