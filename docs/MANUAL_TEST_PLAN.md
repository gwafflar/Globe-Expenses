# Manual Test Plan — Phases 7b & 8

> Everything below is **manual browser verification that has never been run**. Phases 7b (pivot
> cards, Session 025) and 8 (import/export, Session 026) shipped with automated tests only —
> 613 passing, `tsc -b` and `build` clean — but no part of either has been exercised against
> real Firestore data in a browser.
>
> **Entry points**: Import and Export are both buttons in the **Transactions tab** header
> (`TransactionsTab.tsx:919/927`). The import wizard's steps are
> `upload → (confirm | mapping | columns) → fields → values → preview → result`.
>
> **P1** = blocks the PR. **P2** = should pass before merge. **P3** = cosmetic, log and move on.

---

## P1 — Blocking

### T1. Legacy space exports and computes in a desktop spreadsheet

**Priority**: P1 — this is the single check that catches the class of bug Phase 8 was full of.

**Repro**
1. Open a space created **before** the Space refactor (a real travel with countries, categories, several members and 30+ transactions).
2. Transactions tab → **Export**. Save the `.xlsx`.
3. Open it in **LibreOffice Calc** (or Excel).
4. Visit every sheet: Transactions, Balance, Balance Summary, Analysis.

**Expected**
- Every sheet present; filename derives from the space name, not "travel".
- Balance, Balance Summary and the ✔/✅ check columns contain **live formulas** — click a cell, the formula bar shows `SUM(...)` / `SUMPRODUCT(...)`, not a bare number.
- The Analysis sheet's **country block shows non-zero totals** that match the Dashboard.
- No `#REF!`, no `#VALUE!`, no `#NAME?` anywhere.
- Totals reconcile: Analysis category block total == Analysis country block total == the space total.

**Potential error**
- **Cells with no formula at all** — regression of the SheetJS `v: undefined` bug (a formula cell without a cached `v` is silently dropped from the file). Would affect all four sheets at once.
- **Country totals uniformly zero** — regression of the SUMPRODUCT filter-value bug: `country` is stored *bare*, `category` emoji-prefixed. If the country block compares `"🇯🇵 Japan"` against `"Japan"` it matches nothing. Category would still look fine, which is what hid this for so long.
- **`#REF!` in Analysis** — column letters shifted because a disabled built-in removed a column but the formula still points at the old letter.

---

### T2. The same file in Google Sheets

**Priority**: P1 — the one assumption Phase 8 shipped on without being able to test it.

**Repro**
1. Take the exact file from T1. Upload to Google Drive, open with Google Sheets.
2. Look at Balance and Analysis **before touching anything**.

**Expected**
- Numbers are correct on first paint. Every formula carries its correct pre-computed cached value, so this must hold whether or not Sheets honours `fullCalcOnLoad`.

**Potential error**
- **A grid of zeros.** Would mean the cached values are not what got written and the file depends on recalculation — worse than the blank cells users had before. If you see this, stop and report; do not merge.
- Minor: Sheets recalculating and *changing* a number would mean a cached value disagrees with its own formula.

---

### T3. Round-trip into a fresh space — with dates checked explicitly

**Priority**: P1 — the acceptance criterion of the whole phase.

**Repro**
1. Note, in the source space: transaction count, grand total, and the **date of the oldest and newest transaction**.
2. Create a new empty space.
3. Transactions tab → **Import** → upload the T1 file.
4. The wizard should go `upload → confirm` (single confirmation — it recognises its own `_globeexpenses` metadata sheet). Confirm.
5. Compare against your notes. Then export the new space and diff the two files.

**Expected**
- Count, grand total, per-member splits, and every custom field value match exactly.
- **Dates are identical — not shifted by one day.**
- `select` custom values resolve to the same options (matched by **option id**, not label).
- The wizard asks nothing about column mapping or member slots — the metadata sheet makes it lossless by construction.

**Potential error**
- **Every date one day early.** The Excel epoch (1899-12-30) predates standard time zones; the fix converts entirely in UTC. If this reappears, the local-midnight path is back.
- Wizard routing to `mapping` instead of `confirm` → the metadata sheet isn't being read.
- A **partial** member-id match silently orphaning some splits — should be treated as foreign and *ask*, not guess.

> ⚠️ Independent of this test: transactions imported **before** this fix are already one day early in Firestore. The mechanism is fixed, the existing rows are not.

---

### T4. 500+ row import — the batch boundary

**Priority**: P1 — 500 is exactly the `writeBatch` limit, so the off-by-one lives here.

**Repro**
1. Build a sheet with **just over 500** rows (501–520 is ideal; duplicate rows in the exported file and re-save).
2. Import into a fresh space.
3. Watch the progress indicator; do not navigate away.
4. When it finishes, count the transactions in the list **and** reload the page to count what actually reached Firestore.

**Expected**
- Progress advances and completes. Every row lands. Count after reload == count in the sheet.
- The UI stays responsive during the write (fire-and-forget convention, no blocking await).

**Potential error**
- Exactly 500 imported and the remainder silently dropped, or a `writeBatch` "maximum 500 writes" exception surfacing as a failed import halfway through — leaving the space in a partial state with no way to tell which rows are missing.

---

## P2 — Should pass before merge

### T5. Foreign sheet — column mapping

**Priority**: P2 — the whole Part 5 path, unit-tested only.

**Repro**
1. Copy the T1 export. In LibreOffice **delete the hidden `_globeexpenses` sheet** (Sheet → Show Sheet to unhide first) and **rename several column headers** (e.g. `Amount` → `Cost`, `Category` → `Type of spend`). Save.
2. Import it into a fresh space.
3. Wizard should route to `mapping` / `columns`. Map each renamed column by hand.
4. On one select-type column choose **create all options**; continue to `preview`, then import.

**Expected**
- The wizard asks per **column**, never per value (importing into a near-empty space leaves nearly every value unmatched — that's the normal case, not an edge case).
- Counts and samples shown on each decision screen.
- Created options appear afterwards in Parameters.
- Rows with no per-member columns attribute the full amount to **your own** member slot — not empty splits.

**Potential error**
- Auto-matching the hidden `txId` column (it has no header text) and **updating in place instead of creating** — or the reverse, duplicating every transaction.
- Options created on `config.customFields` vs `space.categories` via the wrong write path (`updateSpaceConfig` vs `updateSpaceList`) — the value imports but the option never shows in Parameters.

---

### T6. Creating custom fields from unmatched columns

**Priority**: P2 — Part 6.

**Repro**
1. To the T5 sheet add three columns before importing:
   - a **boolean** column (`yes`/`no`/blank),
   - a column with ~12 distinct repeated values across many rows (→ `select`),
   - a column of mostly unique free text (→ `text`).
2. Import; at the `columns` step mark all three as *new field*; reach the `fields` step.

**Expected**
- Type inferred correctly for each, with its **evidence** shown ("12 distinct values in 340 rows").
- You can override a wrong guess.
- Select options are seeded from the distinct values.
- Fields appear in Parameters and on the transaction form afterwards.
- More than 10 new fields in one import is refused (malformed-sheet guard).

**Potential error**
- The select/text boundary misfiring: the rule is distinct ≤ 20 **and** distinct ≤ 50% of non-empty rows. A 12-distinct column in only 20 rows is 60% → should be `text`, not `select`.
- Blank cells counted as a distinct value and skewing the inference.

---

### T7. Solo space export

**Priority**: P2.

**Repro**: Open a solo space (one member, no country data), Export, open the file.

**Expected**: No country column. No country block in Analysis. Analysis reflects that space's **actual dashboard cards**. No `#REF!`. No empty Analysis sheet — if no card survives, the sheet is omitted entirely rather than emitted blank.

**Potential error**: An empty Analysis sheet, or `#REF!` from a country block generated against a column that doesn't exist.

---

### T8. Disabled-field-holding-data warning

**Priority**: P2.

**Repro**
1. In a space with data in, say, `city`, disable that field in Parameters.
2. Export. The `DisabledFieldsExportDialog` should intercept before the file is produced.
3. Run **both** branches: "export without" and "export with".
4. Re-import the "export with" file into a fresh space.

**Expected**
- The warning names the field(s) and shows the **right count** of affected transactions.
- "Without" → no column for it. "With" → column present.
- Re-importing the "with" file restores both the values **and** `enabled: false`.

**Potential error**: Count off (counting rows vs counting non-empty values), or the re-import restoring the values but re-enabling the field.

---

### T9. Import while offline

**Priority**: P2.

**Repro**: DevTools → Network → Offline. Import a small file. Watch the sync banner. Go back online.

**Expected**: The dialog completes, rows appear locally, the pending-write banner shows, and everything syncs on reconnect. No crash, no lost rows.

**Potential error**: The dialog awaiting a server ack that never comes and hanging on the `result` step; or rows appearing locally and never syncing.

---

### T10. Pivot cards against real data (Phase 7b, never verified)

**Priority**: P2.

**Repro**
1. Dashboard tab → card builder. Create a 2-dimension card, e.g. `country × category`.
2. Check section ordering, expand/collapse, and both tap targets in a section header.
3. Tap a **row** → drill-down. Go back, tap a **section total** → drill-down.
4. Try to create the reverse card `category × country`, and try the **swap** control.

**Expected**
- Only the first section expanded on open. Sections sorted by total descending, missing values pinned **last, after "Other"**.
- Row drill-down carries **both** filters + the range; section-total drill-down carries the **primary only**.
- The drilled list's total equals the number you tapped.
- Duplicate greying: `[country]` and `[country, category]` coexist; `[category, country]` is a legitimately different card; **swap is disabled when the swapped card already exists** — the case most easily missed, since it collides without either picker being touched.
- Hidden cards still count toward duplicates.

**Potential error**
- The "Other" section is deliberately non-expandable (`rows: []`) and drills straight through — so "section total = Σ its rows" holds only for *expandable* sections. Don't file that as a bug.
- Caps `TOP_N = 5` and `SECTION_TOP_N = 8` are **acknowledged guesses never seen against real data**. Judge them here — that's what the builder's live preview is for.

---

### T11. Country values render inconsistently — confirm the scale

**Priority**: P2 to *observe*; the fix itself is a known open bug, deliberately deferred.

**Repro**: Dashboard → a card grouped by country. Look for the same country appearing twice, or a bare `🌍`.

**Expected today (this is the known-broken state)**
- You will likely see split rows: `"Japan"` and `"🇯🇵 Japan"` as two entries with divided totals, and `🌍` on countries auto-added by `syncTransactionLocation()` or by import.

**Why**: `Transaction.country` has no canonical stored form, and `getFlagForCountry()` (`pickerData.ts:366`) destructures the flag but compares it to a name — it returns `'🌍'` for every input. The grouping key *is* the raw string, so a display-only fix would render two identical-looking rows.

**What to record**: how many countries are actually split, and whether any real space is affected badly enough to make this a merge blocker rather than a follow-up.

---

## P3 — Cosmetic

### T12. 375px

**Repro**: DevTools responsive mode at 375px wide. Walk through: the import wizard (every step, especially `columns` and `fields` with long header names), the disabled-fields dialog, and a pivot card **with a long section label**.

**Expected**: No horizontal page scroll. Wide content scrolls inside its own container. Buttons reachable without zooming.

**Potential error**: The `columns`/`fields` mapping steps are the densest screens in the app and have never been seen on a phone; a long section label in `PivotCard` pushing the amount and % off-screen.

---

## Sign-off

- [ ] T1 · [ ] T2 · [ ] T3 · [ ] T4 — **P1, all four must pass to open the PR**
- [ ] T5 · [ ] T6 · [ ] T7 · [ ] T8 · [ ] T9 · [ ] T10 · [ ] T11 — P2
- [ ] T12 — P3

Current automated state (verified 31 Aug 2026): `pnpm tsc -b` clean, `pnpm test` 613/613,
`pnpm build` clean, `pnpm lint` 91 problems (pre-existing, not in refactor-touched files, not in CI).
