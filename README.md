# GlobeExpenses

GlobeExpenses is a collaborative shared-expense tracking app. It started as a travel expense tracker and is currently moving into a more general-purpose shared-expense app — one that stays optimized for travel and group use cases, but isn't limited to them (see the `Travel-to-Space-maj-upgrade` branch, where `Travel` is being generalized into a configurable `Space`).

It lets people log spending together, convert amounts into a reference currency, analyze spending on a dashboard, and settle debts among group members. It works fully offline and syncs automatically once connectivity returns.

It's distributed as a Progressive Web App (PWA) — installable on Android, iOS, and desktop without an app store.

**📲 Try it now: [https://globe-expenses.web.app](https://globe-expenses.web.app)**




## Features

- 🌍 **Multi-currency tracking** — log transactions in any currency, with automatic conversion to the group's main currency
- 👥 **Split with friends** — share costs and settle balances effortlessly, with flexible "paid by" / "beneficiaries" splits
- 👛 **Wallet / cash tracker** — monitor withdrawals and wallet balances on the go
- 📡 **Works offline** — use it anywhere, even without network; transactions sync automatically once you're back online
- 📊 **In-depth statistics** — a dashboard to monitor spending over time, by category, by person, by currency
- 🔓 **Open-source & free** — free to use, public code, no ads, no paywall

## Why this project exists

GlobeExpenses started as a personal project: the developer wanted an app for their own trips, and a hands-on way to learn app development end to end. It was never built as a SaaS or a money-making venture.

It's now evolving into a fully functional app that anyone can use — but that original motivation (personal use + learning) still shapes the project's priorities: no monetization, no growth hacking, no lock-in.


## Screenshots
### Welcome page & New Expense encoding
<img src=".github\assets\screenshots-readme\welcome-page.png" alt="Welcome Page" width="25%" height="25%">.   . 
<img src=".github\assets\screenshots-readme\new-expense.png" alt="New Expense" width="30%" height="30%">

### Balance Tab & Dashboard
<img src=".github\assets\screenshots-readme\balance_tab.png" alt="Balance Tab" width="40%" height="40%">

<img src=".github\assets\screenshots-readme\dashboard-total.png" alt="Dashboard - Total" width="40%" height="40%">. .
<img src=".github\assets\screenshots-readme\dashboard-pivot-table.png" alt="Dashboard - Pivot Table" width="30%" height="30%">

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19 + TypeScript, Vite |
| UI | shadcn/ui + Tailwind CSS v4 |
| State management | Zustand |
| Offline cache | IndexedDB via Dexie.js |
| PWA | vite-plugin-pwa |
| Backend (BaaS) | Firebase (Auth, Cloud Firestore, Cloud Functions, Hosting) |
| Testing | Vitest + Testing Library |

See [`docs/GlobeExpenses_Architecture.md`](docs/GlobeExpenses_Architecture.md) and [`docs/GlobeExpenses_Specification.md`](docs/GlobeExpenses_Specification.md) for the full architecture and product specification.

## Getting started

### Use the hosted app

GlobeExpenses is hosted on Firebase — no setup required:

👉 **[https://globe-expenses.web.app](https://globe-expenses.web.app)**

### Self-host it

The app is open source, so you can self-host it on your own Firebase project instead.

#### Prerequisites

- Node.js
- A Firebase project (Auth, Firestore, and Hosting enabled)

#### Setup

```bash
git clone https://github.com/gwafflar/Global-Expenses-.git
cd Global-Expenses-
pnpm install
```

Create a `.env` file at the project root with your Firebase project credentials:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

#### Available scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Vite dev server |
| `pnpm build` | Type-check and build for production |
| `pnpm preview` | Preview the production build locally |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run the test suite once (Vitest) |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:ui` | Run tests with the Vitest UI |

#### Deploying

The app deploys to Firebase Hosting, configured in `firebase.json`:

```bash
npm run build
firebase deploy
```

Firestore security rules and indexes live in `firestore.rules` and `firestore.indexes.json`.

## Project structure

```
src/
├── auth/          # Login, registration, profile, session management
├── travels/       # Travel list, creation, and detail view (Transactions / Balance / Dashboard / Parameters tabs)
├── transactions/  # Transaction form (create + edit) and service
├── friends/       # Friend search, invite flows, invite acceptance
├── feedback/      # In-app beta feedback form
├── shared/        # Reusable components, hooks, static data (currencies, countries)
├── services/      # Firebase adapters
└── lib/
scripts/           # One-off data migration / seeding scripts
docs/              # Architecture, specification, and session log
```

## Documentation

The `docs/` folder is the source of truth for product and technical decisions:

- [`GlobeExpenses_Specification.md`](docs/GlobeExpenses_Specification.md) — product vision, functional requirements, and every binding design decision
- [`GlobeExpenses_Architecture.md`](docs/GlobeExpenses_Architecture.md) — system architecture, data model, offline strategy
- [`MEMBERS_UX_SPEC.md`](docs/MEMBERS_UX_SPEC.md) — travel membership system analysis and UX spec - from a previous update
- [`SESSION_LOG.md`](docs/SESSION_LOG.md) — running log of development sessions

## Transparency about AI usage

This project uses a lot of AI-generated code, and we're transparent about it:

- Commits written with Claude's help are marked `Co-Authored-By: Claude` in the commit trailer — check `git log` to see exactly which ones
- [`CLAUDE.md`](CLAUDE.md) — the project instructions given to the AI assistant at the start of every session — is included in the repo
- [`docs/SESSION_LOG.md`](docs/SESSION_LOG.md) documents the complete development process, session by session, including design discussions and decisions

## Roadmap

**Q3 2026 — Travels → Spaces**
The app is transitioning from a travel-specific app to a general-purpose shared-expense app. `Travel` is being generalized into `Space`, a configurable container that can be tailored to travel, roommates, or any group-expense use case. Take a look at the `Travel-to-Space-maj-upgrade` branch to see this in progress.

**2026/2027 — v2 features**
The rest of the v2 feature set described in [`docs/GlobeExpenses_Specification.md`](docs/GlobeExpenses_Specification.md), including dynamic member management, bank import, an activity feed, and push notifications.