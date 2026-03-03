# Developer Profile — GlobeExpenses Project

> **Purpose**: Load this file at the start of every AI-assisted development session.
> It tells the AI assistant what I know, what I don't, and how to communicate with me.
> Update it as skills are acquired.
>
> Last updated: February 2026

---

## How to use this file (for the AI)

When I share this file with you at the start of a session:
- **Calibrate your explanations** to my level per domain — don't over-explain things I know, but do slow down and comment thoroughly on things flagged as unfamiliar.
- **For unfamiliar areas**: add inline comments to generated code, explain non-obvious choices, and flag when a concept deserves a deeper explanation before we proceed.
- **For familiar areas**: you can be concise, skip basics, and treat me as a peer.
- **Always**: apply best practices without asking, flag architectural tradeoffs, and suggest when something warrants a deeper discussion.

---

## Strong Skills (peer-level — be concise)

### General Programming
- **Python** — fluent. Comfortable with OOP, scripting, data processing, standard library.
- **C / C++** — solid systems-level understanding. Memory management, pointers, compilation, performance thinking.
- **Java** — comfortable with OOP, class hierarchies, standard patterns.
- **Algorithms & data structures** — solid foundations.
- **Git** — comfortable with standard workflows (commit, branch, merge, rebase basics).
- **Reading and reasoning about code** — can review generated code critically, spot logic errors, understand what a function does.
- **Problem decomposition** — experienced at breaking complex problems into modules and thinking about interfaces between them.

### Concepts Understood
- Client-server architecture, REST APIs, HTTP
- Relational databases (SQL concepts, schema design)
- Basic security principles (auth, hashing, HTTPS)
- Testing principles (unit tests, what makes a good test)

---

## Partial / Emerging Skills (explain choices, add comments)

### Firebase / Firestore
- **Familiarity**: aware of the concept, chosen for this project, but no hands-on experience yet.
- **Needs**: explain Firestore-specific patterns (security rules, subcollections, real-time listeners, offline persistence config). Don't assume I know the SDK API.
- **Comfort level**: can understand the logic once explained; will struggle with syntax from memory.

### TypeScript
- **Familiarity**: understand the *why* (type safety over JS), and can read typed code. Have not written TypeScript from scratch, nor JS.
- **Needs**: explain type annotations, interfaces vs types, generics when they appear. Comment non-obvious type patterns.

### NoSQL / Document databases
- **Familiarity**: understand the concept and tradeoffs vs SQL. No hands-on experience with Firestore or MongoDB.
- **Needs**: flag when a NoSQL modeling decision departs from SQL intuition (e.g. denormalization, no joins).

---

## Weak / Unknown Areas (slow down, explain, comment thoroughly)

### Frontend / React
- **Familiarity**: not a frontend developer. Can read HTML/CSS at a basic level. Have not worked with React, JSX, or component-based UI frameworks.
- **Needs**:
  - Explain component structure and the mental model (what is a component, props, state)
  - Comment every hook usage (`useState`, `useEffect`, `useContext`, etc.) with what it does and why
  - Explain the data flow between components when it's non-obvious
  - Flag when a React pattern is idiomatic vs. when there are simpler alternatives
  - Don't assume I'll recognize JSX syntax — annotate it when introducing new patterns
- **Priority**: this is the area where I am most likely to miss bugs or misunderstand generated code. Be extra careful here.

### CSS / Tailwind
- **Familiarity**: basic CSS knowledge (box model, selectors). Never used Tailwind.
- **Needs**: when generating Tailwind classes, briefly comment what visual effect a non-obvious class produces. Prefer readable class groupings over terse one-liners.

### PWA / Service Workers
- **Familiarity**: understand the concept (offline-capable web app, installable). Never implemented a Service Worker.
- **Needs**: explain what the Service Worker is doing whenever we touch that layer. Don't generate Service Worker config without explaining the caching strategy chosen.

### State Management (Zustand)
- **Familiarity**: understand the need for global state (though you can re-explain it at the first occurrence). Have not used Zustand or Redux.
- **Needs**: explain the store structure and how components connect to it the first time we set it up. Comment store actions clearly.

### Vite / Build tooling
- **Familiarity**: not totally aware of bundlers conceptually (like Webpack/Make for the web). Never configured Vite.
- **Needs**: explain config options when we touch vite.config.ts. Don't generate unexplained magic configs.

### Cloud Functions (Firebase)
- **Familiarity**: understand serverless conceptually. Never written a Cloud Function.
- **Needs**: explain triggers, deployment, and cold start implications when relevant.

### Production Environment
- **Familiarity**: aware of the concept of dev and prod environment, and their utility. I'm used to participate to hackathon and deploy code fast-and-dirty. Here I expect an app working in production. I have never use in production the tools that we plan to use for this project.
- **Needs**: Explain required extra steps, and make sure the tools are well configured before moving on.

---

## Development Style Preferences

- **Learning Path**: I'm here to learn. I want to privilege the learning of new useful skills over rapid deployment. The important is the path, not the destination; though I expect to get something functional at the end.
- **Correctness over speed**: I'd rather understand and build it right than ship something fast that breaks. Don't cut corners silently — flag tradeoffs explicitly.
- **Small increments**: generate focused, reviewable chunks of code. Not entire features in one prompt.
- **Comments in code**: always add comments to non-obvious logic, especially in frontend and Firebase code.
- **Tests alongside code**: always offer to generate tests when writing a function or component. This is essential.
- **Explain before generating** when entering an unfamiliar area: a 2-sentence explanation of what you're about to do and why saves me from reviewing blind.
- **Flag when I should ask a clarifying question** rather than making an assumption that would be hard to reverse.

---

## Project Context

- **Project**: GlobeExpenses 🌍 — collaborative travel expense tracker
- **Key documents**: `ARCHITECTURE.md`, `SPEC.md`, `SESSION_LOG.md` (load all at session start)
- **Methodology**: vibe-coding with Cursor + Claude. Cursor for daily development, Claude for architecture decisions and code review.
- **Phase**: v1 (core features, fixed travel membership, hardcoded currency rates)