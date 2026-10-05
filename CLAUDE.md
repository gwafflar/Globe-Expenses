# Claude Code — Project Instructions

## Session startup (mandatory)

At the start of every session, before doing anything else, read all files in `docs/`:
- `docs/Developer profile.md` — calibrate explanation depth and communication style to this profile
- `docs/GlobeExpenses_Architecture.md` — system architecture, data models, key flows
- `docs/GlobeExpenses_Specification.md` — product spec, functional requirements, decision log
- `docs/SESSION_LOG.md` — completed work, open carry-forward items, next steps

## Key conventions

- Commits follow gitmoji convention (https://gitmoji.dev/)
- Fire-and-forget write pattern for Firestore: `doc()` + `setDoc()` without `await`
- Per-space lists (`categories`, `paymentMethods`, `countries`, `cities`) use `LabeledItem[]` type
- `memberUids: string[]` (flat array) is stored alongside `members: MemberRef[]` for Firestore security rules
- `userProfile` is loaded once at sign-in into Zustand (`useAuthStore`) — do not fetch it per-component
- Always add inline comments on React hooks, Zustand store actions, and Firebase-specific patterns (developer is not a frontend expert — see Developer profile)
- Firestore paths and field keys are frozen as legacy (`travels/`, `travelMemberId`, `memberUids`) even though the code says Space — see `docs/SPACE_REFACTOR_SPEC.md` §2.1
- No behaviour may branch on `presetOrigin`; behaviour reads `config` via `getSpaceConfig()`
- When stripping fields before a Firestore write, test `v !== undefined` explicitly. Never filter by truthiness — `false`, `0` and `''` are all valid stored values and dropping them produces partial documents that resolvers silently paper over.
- Firestore documents are mapped to domain objects in exactly one place per collection (`mapSpaceDoc()` for `travels/`). Never hand-roll a second mapping — optional fields make an omission type-check, and the value is silently `undefined` rather than a compile error.

## Verification

- Typecheck with **`pnpm tsc -b`**, never `pnpm tsc --noEmit`. The root `tsconfig.json` has `"files": []` and only project references, so `--noEmit` checks nothing and exits 0 — it will pass on code that does not compile. `pnpm build` runs `tsc -b` and is also a valid check.
- Full verification before a commit: `pnpm tsc -b`, `pnpm test`, `pnpm build`.
- When `functions/` or `firestore.rules` changed, also: `pnpm --dir functions typecheck`, `pnpm test:functions`, `pnpm test:rules` (starts the Firestore emulator; needs Java). `functions/` is a standalone package (own `package.json`, lockfile, tsconfig) — it is not covered by the root `tsc -b` or `pnpm test`, and it cannot import from `src/`. Inside `functions/`, `tsc --noEmit` *is* valid (no project references there).

## Development style

- Work in small, reviewable increments
- Offer to write tests alongside new functions/components
- Flag architectural tradeoffs before implementing
- Explain before generating when entering an unfamiliar area (React, Firebase, PWA, Zustand)
