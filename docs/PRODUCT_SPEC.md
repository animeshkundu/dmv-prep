# Product Spec - DMV Prep

Free, static, one-stop web app for the US **written (knowledge/permit) driving test**, covering all 50 states + DC. Practice tests, exam simulators, spaced-repetition flashcards, a road-sign trainer, coaching, and the full "how to actually get your permit" process for every jurisdiction. No account, private by design, works offline.

- Live: https://animeshkundu.github.io/dmv-prep/
- Related docs: [Architecture](./ARCHITECTURE.md) · [Content Strategy](./CONTENT_STRATEGY.md) · [UX](./UX.md) · [Design System](./DESIGN_SYSTEM.md) · [Data Schema](./DATA_SCHEMA.md) · [Privacy](../PRIVACY.md) · [Disclaimer](./DISCLAIMER.md)

---

## 1. Vision

Passing the written permit test is a small, universal rite of passage that the web serves badly. A learner searching "[state] permit practice test" lands on sites that are either free but cluttered, ad-heavy, and dated, or polished but paywalled and funnel-driven. Nobody combines a modern study experience with the practical question the learner actually has underneath the quiz: *what do I bring, what does it cost, where do I go, and am I even eligible yet?*

DMV Prep is the free, modern, no-signup answer. It pairs Zutobi-grade UX and Genie-grade adaptive prep with a clear per-state process layer, and it gives away the parts that competitors gate: adaptive weak-area retesting, mock exams tuned to each state's real rules, and the full permit process. It stays fast, private, and installable because it is a static PWA with all learner data on-device.

**One-sentence positioning:** the polished, free, private, offline-capable prep app that also tells you how to get the permit, for every US state.

---

## 2. The market gap

| Segment | Examples | Strength | Weakness |
|---|---|---|---|
| Free but cluttered / dated | DMV-Written-Test.com, ePermitTest, DMV.org (paywall funnel) | Free entry, broad coverage | Ad-heavy, dated UI, adaptive/mock features gated or absent, no real process layer, unclear sourcing |
| Polished but paid / ad-gated | Zutobi, Aceable, DMV Genie premium | Excellent UX, adaptive engines | Paywalled, sign-up walls, subscription funnels, still test-only |

The open lane is **free + modern + one-stop**: a no-signup, ad-light PWA that is as pleasant as the paid apps, gives away the adaptive features, and adds a per-state process layer no incumbent cleanly does. Our defensible edge is not any single feature but the combination plus trustworthy, cited, freshness-stamped content (see [Content Strategy](./CONTENT_STRATEGY.md)).

---

## 3. Personas

| Persona | Who | Primary need | Design implications |
|---|---|---|---|
| **Teen first-timer** | 15-17, first permit, often mobile-only, parent involved | Pass the knowledge test; understand GDL steps and supervised-hours rules | Mobile-first, GDL/teen content, no signup, shareable progress, calm confidence-building tone |
| **Adult new resident** | Moved states, already drives, must re-test on local rules | Just the state-variable rules and the process to transfer/obtain | Fast "what's different here" surfacing, strong process layer, cheat sheet |
| **ESL learner** | Studying in a second language | Plain-English explanations; Spanish where available | Spanish (ES) content for top states, simple wording, sign-visual-first drills |
| **Renewer / lapsed** | Returning after a lapse or moving from another country | Refresh signs and rules quickly; confirm documents | Flashcards, road-sign trainer, process/documents, quick mock |

---

## 4. Jobs to be done

- When I need a permit, help me **know if I'm eligible and what to bring** so I don't waste a trip.
- When I'm studying, help me **practice realistic questions with clear explanations** so I actually learn, not just memorize.
- When my test is close, help me **simulate the real exam for my state** so I know I'm ready.
- When I keep missing things, help me **drill exactly my weak spots** without paying.
- When I'm short on time, help me **memorize the highest-yield facts efficiently** (spaced repetition).
- When I switch devices, help me **carry my progress** without creating an account.
- When I'm offline, **let me keep studying**.

---

## 5. Feature spec with acceptance criteria

Each feature lists user-facing behavior and testable acceptance criteria (AC). AC map to the verification plan in the [build plan](../README.md) and to unit/e2e tests.

### 5.1 State selector

Pick from all 51 jurisdictions by search or list; each state shows its real agency name (DMV / DPS / SOS / PennDOT / MVA / BMV / DDS / FLHSMV / DOL, etc.).

- AC1: All 51 jurisdictions from `src/lib/states-directory.ts` render and are reachable.
- AC2: Type-to-filter narrows the list live; an empty result shows a "no state matches" message.
- AC3: Each entry links to `/state/{slug}` where slug is the lowercased code (e.g. `ca`).
- AC4: Keyboard-only users can search, arrow/tab through, and activate a state.

### 5.2 Practice tests

Randomized sets by category with instant right/wrong feedback and an explanation plus handbook citation per question.

- AC1: Questions are drawn from the state's applicable pool (national templates confirmed for the state + per-state items), filtered by chosen category.
- AC2: Selecting an answer immediately marks correct/incorrect using semantic pass/fail colors and announces the result via `aria-live`.
- AC3: Every question shows an explanation and at least one citation (`references[]`) after answering.
- AC4: Option order is shuffled per attempt; the stored `correctIndex` is remapped correctly (no off-by-one).
- AC5: Missed questions are recorded to the Challenge Bank (5.7).

### 5.3 Exam simulator (mock test)

Timed mock matched to the state's real exam, modeled as **variants** (applicant age, test version, language, category quotas) rather than a single count/threshold.

- AC1: The active `examVariant` sets `numQuestions`, `numToPass`, and optional `timeLimitMinutes`; the UI shows count, pass mark, and timer.
- AC2: `subRequirements` are enforced. Concretely, New York's 2-of-4 road-sign sub-rule: the applicant must answer at least 2 of 4 sign questions correctly **and** meet the overall threshold; failing the sub-rule fails the exam even if the overall score passes.
- AC3: When a state has multiple variants (e.g. age-based CA counts), the user can choose the applicable variant before starting.
- AC4: The result screen shows pass/fail, score vs threshold, per-sub-requirement status, elapsed time, and a review of every missed item with explanation and citation.
- AC5: Each completed mock is appended to on-device mock history (see [Data Schema](./DATA_SCHEMA.md)).
- AC6: Unit tests assert exact counts/thresholds for at least CA, TX, FL, NY and the NY sign sub-rule.

### 5.4 Road-sign trainer

Dedicated recognition drills for regulatory, warning, guide, construction signs and pavement markings.

- AC1: Signs come from the `signs` collection; each renders its SVG asset (base-aware path) and name.
- AC2: Drill modes: name-the-sign and match-the-meaning; instant feedback per item.
- AC3: Missed signs feed the Challenge Bank and can seed flashcards.
- AC4: Sign images have accessible names; drills are keyboard operable.

### 5.5 Flashcards with spaced repetition (FSRS)

Memorize signs, limits, right-of-way, and state facts at the user's pace using FSRS via `ts-fsrs`.

- AC1: Each card holds FSRS state (stability, difficulty, due date, reps, lapses); grading a card (Again/Hard/Good/Easy) reschedules it per FSRS.
- AC2: A review session serves only due cards, newest-due first, capped by a session size setting.
- AC3: Card state persists in IndexedDB and survives reload and offline use.
- AC4: Unit tests assert FSRS scheduling transitions for each grade.

### 5.6 Coaching / study mode

Condensed, handbook-grounded lessons per category with worked reasoning, not just answer keys.

- AC1: Lessons come from the `lessons` collection (Markdown), grouped by category, ordered by `order`.
- AC2: Each lesson can carry references; a lesson with claims must cite them.
- AC3: Lessons are readable offline and link to related practice by category.

### 5.7 Weak-area retest ("Challenge Bank")

Auto-resurfaces missed questions; adaptive and fully free.

- AC1: Any missed question (practice, mock, or sign drill) is added to the Challenge Bank with a miss count.
- AC2: "Retest weak areas" builds a set weighted toward most-missed categories/items.
- AC3: Correctly answering an item enough times retires it from the bank; the threshold is a setting.
- AC4: No feature here is gated or upsold.

### 5.8 Cheat sheet

Printable per-state study summary (signs, limits, key rules, process at a glance).

- AC1: A print-optimized view exists with a clean print stylesheet (no nav/chrome).
- AC2: Content is generated from the state's data and highest-yield facts; each fact shows its "verified as of" date.
- AC3: Prints legibly in black and white on one to two pages.

### 5.9 "Get your permit" process layer (differentiator)

Per state: eligibility ages, GDL steps, required documents (incl. REAL ID), fees, appointment-required status, official scheduling/handbook/forms links, vision test, retake rules.

- AC1: Renders from the state's `gdl`, `process`, `retake`, and official URLs.
- AC2: Every process fact shows a "verified as of" (`lastVerified`) stamp and links to the official `.gov` source.
- AC3: Volatile facts (fees, documents, appointments) are visibly tiered for freshness (see [Maintenance](./MAINTENANCE.md)).
- AC4: No agency seals or logos; no implication of official endorsement.

### 5.10 Progress dashboard

Streaks, mastery by category, mock history, all on-device.

- AC1: Shows per-category mastery, current streak, and a mock history list.
- AC2: A "next best action" surfaces the highest-value next step (e.g. weak category, due flashcards, ready-for-mock).
- AC3: All data reads from IndexedDB; nothing is sent to a server.

### 5.11 Export / import progress (JSON)

The only cross-device/backup path, since there are no accounts.

- AC1: Export produces a single JSON file containing settings, progress, FSRS state, and mock history with a `schemaVersion`.
- AC2: Import validates the file, migrates older `schemaVersion`s, and merges or replaces per user choice.
- AC3: A round-trip (export then import into a clean profile) reproduces identical study state.
- AC4: Malformed imports are rejected with a clear error and no partial corruption.

### 5.12 PWA / offline

Installable, fully offline, mobile-first.

- AC1: The app installs (valid manifest + icons) and launches standalone.
- AC2: After first load, core study flows (practice, flashcards, cheat sheet, process for visited states) work with no network.
- AC3: The service worker scope and cached URLs respect the `/dmv-prep/` base (see [Infra](./INFRA.md)).
- AC4: Offline users see a "verified as of" stamp and a stale-content note so cached facts are not mistaken for live truth.

### 5.13 Accessibility (WCAG 2.1 AA)

- AC1: All interactive controls are keyboard operable with a visible focus ring.
- AC2: Quiz feedback is announced via `aria-live`; questions use native `<fieldset>/<legend>` + radios.
- AC3: Color contrast meets AA against paired surfaces in light and dark (see [Design System](./DESIGN_SYSTEM.md)).
- AC4: Touch targets are >=44px; `prefers-reduced-motion` is honored.
- AC5: A manual a11y pass (keyboard, screen reader, zoom/reflow, print) is part of release; automated tools alone do not establish AA.

### 5.14 Spanish (ES) i18n

- AC1: The data model carries `languages[]` on questions/exam variants; ES content is opt-in per item.
- AC2: Top-demand states ship ES first; the UI exposes a language toggle only where ES content exists.
- AC3: No machine-translation-only shipping of legal/process facts without review.

---

## 6. Non-goals for v1

Explicitly out of scope for the first release. The data model is designed to allow these later without a rewrite.

- Motorcycle and CDL knowledge tracks.
- Hazard-perception video.
- Audio read-along / text-to-speech narration.
- Languages beyond English and Spanish.
- Accounts, cloud sync, social/leaderboard features.
- Behind-the-wheel / road-test scheduling or booking.
- Native app-store builds (the PWA is the install path).

---

## 7. Success metrics

Behavior and friction are measured with Microsoft Clarity (primary) and optional GA4, both behind a consent banner (see [Privacy](../PRIVACY.md)). All metrics are privacy-preserving and on-device progress is never uploaded.

| Goal | Metric | Target signal |
|---|---|---|
| People find their state fast | Time from home to a started quiz | Low; low rage/dead-click on the state picker |
| The prep is used, not bounced | Practice/mock sessions per visitor; return visits | Multiple sessions; healthy return rate |
| It builds real readiness | Mock pass-rate trend within a user's own history | Improves across a user's attempts |
| The process layer earns trust | Engagement with permit-guide and official-link clicks | Meaningful guide usage |
| It is installable and sticky | PWA install rate; offline sessions | Non-trivial install and offline use |
| It is trustworthy | Correction/takedown volume and resolution time | Low volume, fast resolution |
| Quality holds | Share of content at `adversarially-verified`+; stale-stamp coverage | 100% verified at launch; fresh stamps |

Because there are no accounts, cohort tracking is aggregate and anonymous. The north star is simple: a learner arrives, prepares with confidence, and passes the first time.
