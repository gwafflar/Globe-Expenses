# French translation — manual test plan

Automated checks cover key completeness (compiler), empty or untranslated French strings (`src/i18n/languages.test.ts`), English output (all existing tests), the English XLSX export under a French UI, and French push texts (`functions/src/push/push.test.ts`). What follows needs a real browser or device. Report each as OK / failed.

## L1 — Default language
1. Browser set to French, signed out, fresh profile (or clear site data). Open the app.
   - Welcome, login and register pages are in French.
2. Browser set to German or English. Same steps → English.

## L1b — Welcome page pill and sign-up
1. Signed out, Welcome page: a pill top right shows the flag and code ("🇬🇧 EN"). It does not overlap the beta banner or the logo, on phone and desktop.
2. Tap it, choose 🇫🇷 Français: the page turns French. Open login, then register: both French.
3. Register a new account (email, then separately Google): after sign-up the app stays French, and Profile → Language shows "🇫🇷 Français" (not "Automatic").
4. Without touching the pill: a new account's Profile shows "Automatic".
5. Pill set to French, then log in to an existing account whose profile language is English: the app switches to English after login.
6. On Windows, flags show as letters ("GB", "FR"): expected, Windows has no flag emoji glyphs.

## L2 — Picker in Profile
1. Profile → Préférences / Preferences → Language. Options: "Automatic (…)", "🇬🇧 English", "🇫🇷 Français".
2. Switch to Français: the whole page changes immediately, no reload, no Save button.
3. Go through every screen once: spaces list, create space (each preset), space detail, the four tabs, transaction form (all four types), filters, Parameters (members, rates, fields editor, reset-to-preset dialog), Dashboard (cards, card builder, wallet balances), import dialog, export with a disabled field holding data, invite page. Note any English left, any text overflowing its button or badge (French is ~20 % longer), and any awkward wording.
4. Reload: still French. Sign out: login page still French.

## L3 — Follows the user to another device
1. Device A: choose Français. Device B (browser in English, never used the picker): sign in with the same account.
   - B switches to French after sign-in.
2. On B choose "Automatic": B is English. Reopen the app on A (the profile is read at each app open): A switches to "Automatic" too and follows its own browser language.

## L4 — Dates, numbers, countries, currencies
1. French UI: day headers in Transactions and Dashboard show French month names; amounts in the reconciliation dialog use a decimal comma.
2. Country picker shows "Japon", "Allemagne"…, search works with "japon" and "japan". Save a transaction in Japan, then switch to English: it shows "Japan" (one country, not two). The Parameters country list and the country filter show it once.
3. Currency names are French ("euro", "yen japonais").
4. Formula field: `2*2,5 + 1,5` gives 6.5.

## L5 — Export / import
1. French UI → export a space → open the file: sheet names and headers in English, Analysis titles "By category" etc.
2. Re-import the same file: lossless path, no error.
3. Import a foreign sheet with headers "Date, Libellé, Montant, Devise": columns are auto-matched.

## L6 — Push notifications (Android + iPhone)
1. Device in French with notifications on. Another member adds an expense involving you → push text is French ("Alice a ajouté …", "84 €").
2. Switch that device to English in Profile, repeat → push in English.
3. Two devices of the same account in different languages each get their own language.
