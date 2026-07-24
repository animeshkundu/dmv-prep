# Architecture - DMV Prep

System design for a static, offline-capable, no-backend PWA that serves cited, per-state driving-test prep for all 51 US jurisdictions. Everything ships as static files to GitHub Pages; all learner state lives on-device.

- Related: [Product Spec](./PRODUCT_SPEC.md) · [Data Schema](./DATA_SCHEMA.md) · [Content Strategy](./CONTENT_STRATEGY.md) · [Infra](./INFRA.md) · [Design System](./DESIGN_SYSTEM.md)
- Source of truth for shapes: [`src/content.config.ts`](../src/content.config.ts) · config: [`astro.config.mjs`](../astro.config.mjs)

---

## 1. High-level design

```
                Build time (CI / Actions)                      Runtime (browser)
   ┌───────────────────────────────────────────┐   ┌──────────────────────────────────┐
   │ Content Collections (JSON/MD) ─┐           │   │  Static HTML/CSS (Astro output)  │
   │  states / questions /          ├─ Zod ──►  │   │        │                         │
   │  lessons / signs               │  validate │   │        ▼                         │
   │                                │           │   │  Preact islands (hydrated)       │
   │ states-directory.ts ─► getStaticPaths ───► │   │  Quiz · MockExam · Flashcards ·  │
   │   → /state/[code], /signs, ... static pages│   │  Progress                        │
   │                                            │   │        │                         │
   │ vite-plugin-pwa (Workbox) → service worker │   │        ▼                         │
   └───────────────────────────────────────────┘   │  Storage layer                   │
                                                    │   idb-keyval (IndexedDB):        │
                    dist/ ──► GitHub Pages          │     progress, SRS, mock history  │
                    base: /dmv-prep/                │   localStorage: settings, theme  │
                                                    │   JSON export/import: backup     │
                                                    │        │                         │
                                                    │   ts-fsrs: schedule flashcards   │
                                                    └──────────────────────────────────┘
```

No application server, no database, no auth. The "backend" is the build: content is validated and fanned out into static routes; the browser does the interactive work and persists everything locally.

---

## 2. Astro islands model

Content pages are static HTML with ~0 KB JS. Interactivity is isolated to **islands** - small Preact components hydrated only where needed.

- Static Astro components (`src/components`, `src/layouts`, `.astro` pages) render at build time to plain HTML. Header, Footer, hero, state hub shell, lessons, cheat sheet, and the process layer are static.
- Interactive **Preact islands** (`src/islands`) hydrate on demand: `Quiz`, `MockExam`, `Flashcards`, `Progress`. They mount with `client:visible` (below the fold, e.g. quiz on a category page) or `client:idle` (needed soon but not blocking, e.g. progress widgets).
- Islands never re-fetch page content they can get from props; the page passes the state's data and the island owns only interaction + storage.

This keeps content pages fast and cheap while the few dynamic surfaces stay small (Preact, not React) and route-scoped.

---

## 3. Build-time route generation

Routes fan out from data via `getStaticPaths`, so adding a state is a data change, not a code change.

- **State directory** ([`src/lib/states-directory.ts`](../src/lib/states-directory.ts)) is the canonical list of 51 jurisdictions. A state appears in the directory (and gets a route) even before its full content is authored.
- `src/pages/state/[code].astro` (and sub-routes for practice, mock, flashcards, guide, cheat sheet) uses `getStaticPaths` over `STATES` to emit one static tree per jurisdiction.
- Content Collections are queried at build (`getCollection` / `getEntry`) to pull the state's exam variants, applicable questions, lessons, and signs into each page's props.
- `getStaticPaths` slugs use `stateSlug(code)` (lowercased code), matching the links in `index.astro` and `404.astro`.

Because generation is build-time, there is zero runtime routing cost and every route is a real static file (important for the no-SPA 404 approach in [Infra](./INFRA.md)).

---

## 4. Data flow

1. **Author -> content files.** Questions/states/lessons/signs land as JSON/MD under `src/content` with provenance (see [Content Strategy](./CONTENT_STRATEGY.md)).
2. **Validate.** `astro build` runs the Zod schema; `scripts/validate-content.mjs` adds policy checks. A malformed or uncited item fails the build.
3. **Generate.** `getStaticPaths` + collection queries render per-state pages and embed the state's question pool / exam variants into island props (or a route-scoped JSON bank for code-splitting; see §7).
4. **Hydrate.** Islands mount in the browser and read their initial data from props.
5. **Interact + persist.** User answers/reviews; the storage layer writes progress/SRS/history to IndexedDB and settings to localStorage.
6. **Schedule.** `ts-fsrs` computes next-due for flashcards from stored card state.
7. **Backup.** Export serializes all local state to a JSON file; import validates and migrates it back.

---

## 5. Storage architecture

Three tiers, chosen per data shape. No cookies for learner data (see ADR-3).

| Store | Mechanism | Holds | Why |
|---|---|---|---|
| Progress / SRS / history | IndexedDB via `idb-keyval` | per-category mastery, Challenge Bank, FSRS card state, mock history | Async, structured, grows over weeks; large enough |
| Settings | `localStorage` | theme, chosen state, language, session sizes, consent | Tiny, synchronous, read on first paint (e.g. theme init in `BaseLayout.astro`) |
| Backup | JSON export/import | full snapshot with `schemaVersion` | Only cross-device path without accounts |

- A thin storage module in `src/lib` wraps `idb-keyval` with typed getters/setters and a namespaced key convention (`dmvp:` prefix, matching the existing `dmvp:theme` key).
- **`schemaVersion` migrations:** stored data carries a `schemaVersion`. On load, a migration ladder upgrades older shapes forward; import applies the same ladder so old exports keep working. Migrations are pure functions with unit tests. See [Data Schema](./DATA_SCHEMA.md#client-side-stored-user-data).
- Writes are debounced/batched so rapid quiz answering does not thrash IndexedDB.
- Everything is best-effort and wrapped in try/catch: storage denial (private mode, quota) degrades to in-memory for the session rather than crashing.

---

## 6. FSRS integration and per-card data model

Spaced repetition uses `ts-fsrs` with default parameters.

- Each reviewable unit (a sign, fact, or flagged question) maps to one **card** holding FSRS state: `due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `state`, `last_review` (the `ts-fsrs` `Card` shape), plus our `cardId` and a link to the source item.
- Grading (`Again` / `Hard` / `Good` / `Easy`) calls the FSRS scheduler to produce the next card state and due date, which is persisted to IndexedDB.
- A review session queries due cards (`due <= now`), orders them, caps by the session-size setting, and serves them.
- FSRS runs entirely client-side; there is no account and no server optimizer. A client-side parameter optimizer is a possible later enhancement, out of v1 scope.
- Scheduling transitions are unit-tested per grade so a `ts-fsrs` upgrade cannot silently change behavior.

Full card shape: [Data Schema](./DATA_SCHEMA.md#fsrs-card-state-indexeddb).

---

## 7. Code-splitting per-state banks

We never ship all 51 question banks to every visitor.

- Per-state question banks are loaded **on demand** - route-scoped so a state page only carries its own pool, or dynamically imported when a quiz/mock starts.
- National templates confirmed for a state are merged with that state's per-state items at build into the state's effective pool; the merged pool is what gets route-scoped.
- This keeps the payload roughly constant as content scales from one flagship state to all 51.
- Signs and lessons follow the same principle: load what the current route needs.

---

## 8. PWA and service worker

Configured via `vite-plugin-pwa` (Workbox) with `registerType: 'autoUpdate'`.

- **Base-aware scope is mandatory under a subpath.** The SW `base` and `scope` are set to `/dmv-prep/`; precached URLs include the base. A root-scoped SW would not control the subpath and offline would silently break. This is the most common subpath PWA bug and is called out in [Infra](./INFRA.md).
- `navigateFallback` points at `${BASE}404.html` - a real static 404, not an SPA rewrite (see ADR-5 and Infra).
- `globPatterns` precache JS/CSS/HTML/SVG/PNG/WOFF2/JSON; `maximumFileSizeToCacheInBytes` is raised because content JSON banks can be large.
- `autoUpdate` means new deploys refresh the SW; the UI should surface a "verified as of" stamp and stale-content note so cached facts are never mistaken for live truth.

> Repo note: `astro.config.mjs` wires PWA through the raw `vite-plugin-pwa` Vite plugin (not the `@astrojs`-style `@vite-pwa/astro` integration, which is also in `devDependencies`). Both work; the raw plugin is what is active. Flagged for maintainers to avoid confusion.

---

## 9. Module boundaries

```
src/
  content.config.ts   # Zod collections - the data contract (do not fork shapes elsewhere)
  content/            # authored data (JSON/MD)
  lib/
    states-directory.ts  # canonical 51-jurisdiction list + slug/lookup helpers
    site.ts              # base-aware href()/asset() - ALL internal links route through these
    storage.ts (planned) # idb-keyval wrapper, schemaVersion migrations
    fsrs.ts     (planned) # ts-fsrs wrapper + card model
    quiz.ts     (planned) # selection, shuffle, scoring, sub-requirement evaluation
  components/         # static Astro UI (Header, Footer, cards)
  layouts/           # BaseLayout (theme init, head, skip link)
  islands/           # Preact: Quiz, MockExam, Flashcards, Progress
  pages/             # routes; [code] trees via getStaticPaths
  styles/            # tokens.css + global.css
scripts/             # validate-content.mjs, check-links.mjs
```

Boundary rules:

- **All internal hrefs/assets go through `href()` / `asset()`** in `site.ts` so the `/dmv-prep/` base is never hardcoded and never dropped.
- **Data shapes come only from `content.config.ts`.** Islands and lib import inferred types; they do not redeclare content shapes.
- **Islands own interaction + storage; pages own data fetching.** An island receives data as props and never queries collections directly.
- **`lib` is framework-agnostic** where possible (quiz/fsrs/storage are plain TS), so logic is unit-testable without a DOM.

---

## 10. Architecture Decision Records

Short ADRs capturing the load-bearing choices. Each is already locked; recorded here so the reasoning survives.

### ADR-1: Astro (static output) for the framework

**Decision.** Build with Astro, static output, Content Collections + Zod.
**Context.** The product is content-heavy and data-driven: 51 jurisdictions, thousands of cited items, mostly static pages with a few interactive surfaces.
**Rationale.** Astro is built for exactly this. Content Collections give typed, build-validated content; `getStaticPaths` fans out all per-state route trees from data at zero runtime cost; the islands model keeps content pages near-0 KB JS. It outputs plain static files that drop onto GitHub Pages.
**Alternatives.** Next.js (heavier, SSR-oriented, more JS by default); a SPA (worse SEO, no real 404, ships a router to every visitor); a static-site generator without typed content (loses build-time validation).
**Consequences.** Interactivity must be deliberately islanded; no server means all dynamic behavior is client-side.

### ADR-2: Preact islands for interactivity

**Decision.** Use Preact (`@astrojs/preact`, `compat: false`) for the interactive islands.
**Context.** Only a few surfaces are interactive (quiz, mock, flashcards, progress); the rest is static.
**Rationale.** Islands keep content pages ~0 KB JS; Preact keeps the interactive bundles tiny versus React while giving a familiar component model. `compat: false` avoids pulling React compatibility weight.
**Alternatives.** React (larger), Svelte/Vue (fine, but Preact's size and React-like ergonomics won), vanilla JS (worse maintainability for stateful quiz UIs).
**Consequences.** No React-only libraries without `compat`; islands stay small and route-scoped.

### ADR-3: IndexedDB + localStorage, not cookies

**Decision.** Store progress/SRS/history in IndexedDB (`idb-keyval`), settings in localStorage, backup via JSON export/import. No cookies for learner data.
**Context.** Learner state grows over weeks (SRS schedules, mock history, per-item mastery) and must persist with no account.
**Rationale.** Cookies are the wrong tool: ~4 KB limit, sent on every request (pointless for a static host), and they trigger consent obligations. IndexedDB is async, structured, and effectively unbounded for our needs; localStorage handles the tiny synchronous settings read on first paint (theme). Export/import is the only cross-device path without accounts.
**Alternatives.** Cookies (rejected as above); server-side accounts (rejected: adds a backend, privacy surface, and signup friction the product explicitly avoids).
**Consequences.** No cross-device sync except manual export/import; storage can be denied (private mode/quota), so the layer degrades gracefully. Analytics cookies (Clarity/GA4) are a separate, consented concern (see [Privacy](../PRIVACY.md)).

### ADR-4: FSRS over SM-2 / Leitner

**Decision.** Schedule flashcards with FSRS via `ts-fsrs` (default params).
**Context.** Efficient memorization of signs/limits/rules is a core value prop, and it must work with no account out of the box.
**Rationale.** FSRS delivers roughly 20-30% fewer reviews than SM-2 for equal retention, models stability/difficulty per card, and runs fully client-side. `ts-fsrs` is a small, well-typed implementation. A client-side optimizer can be added later.
**Alternatives.** SM-2 (more reviews for the same retention), Leitner boxes (simpler but coarse and less efficient), a bespoke scheduler (reinventing a solved problem).
**Consequences.** We depend on `ts-fsrs`; scheduling transitions are unit-tested so upgrades are safe.

### ADR-5: Static, no-backend architecture

**Decision.** Ship as static files to GitHub Pages with no application server or database.
**Context.** Free hosting, privacy by design, offline capability, and low maintenance are all goals.
**Rationale.** A static PWA is free to host, has no server to secure or scale, keeps all learner data on-device (strong privacy story), and works offline. Content correctness is enforced at build, not runtime. A real static `404.astro` is used instead of an SPA fallback so unknown URLs return a true 404 that still respects the base path.
**Alternatives.** A backend for sync/accounts (adds cost, privacy surface, and signup friction, all explicitly out of scope); serverless functions (unnecessary - nothing needs server compute).
**Consequences.** No server-side personalization or sync; everything dynamic is client-side; content freshness is handled by re-audit + stamps rather than live queries.

### ADR-6: Adversarial cross-model content verification

**Decision.** The launch quality gate is an adversarial, decorrelated verification pass on a **different model** (`gpt-5.6-sol`, high effort) that tries to break every item; human spot-check is sampled, not per-item.
**Context.** 51 jurisdictions with state-specific exceptions and hard legal constraints make confident-but-wrong content the primary risk. Per-item human review of the whole bank is not feasible at launch.
**Rationale.** A single authoring model tends to confidently repeat its own mistakes. A decorrelated verifier whose explicit job is to disprove the "correct" answer, catch missed state exceptions, flag uncited/stale claims, and detect copying catches a different error class than the author. Backed by the legal guardrails (original-only + citations, source-rights matrix, no seals, correction/takedown channel) and visible "verified as of" stamps, this is a stronger and more scalable gate than sampled human review alone.
**Alternatives.** Human-per-item review (does not scale to launch); single-model self-check (correlated errors); no verification (unacceptable for legal/safety content).
**Consequences.** Verification is a real pipeline stage with a `reviewStatus` state machine; content cannot ship at `draft`; the process is documented and repeatable for every new/updated item (see [Content Strategy](./CONTENT_STRATEGY.md) and [Maintenance](./MAINTENANCE.md)).
