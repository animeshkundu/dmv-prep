# UX - DMV Prep

Information architecture, core flows, key screens, and the friction-reduction and pixel-perfection bar for DMV Prep. Grounded in the shipped shell (`Header.astro`, `Footer.astro`, `index.astro`, `404.astro`) and the [Design System](./DESIGN_SYSTEM.md).

- Related: [Product Spec](./PRODUCT_SPEC.md) · [Design System](./DESIGN_SYSTEM.md) · [Architecture](./ARCHITECTURE.md)

---

## 1. Information architecture

```
/                         Home - pitch + state picker (search/list all 51)
/states                   All states index (browse/search)
/state/[code]             State hub - dashboard + next best action
  /state/[code]/practice          Practice tests (by category)
  /state/[code]/mock              Exam simulator (variant-aware)
  /state/[code]/flashcards        FSRS review
  /state/[code]/lessons           Coaching / study mode
  /state/[code]/guide             "Get your permit" process layer
  /state/[code]/cheat-sheet       Printable summary
/signs                    Road-sign trainer (global; state-scoped where relevant)
/guide                    Permit-guide entry (routes into per-state guide)
/progress                 Cross-state progress dashboard (on-device)
/about                    What this is, sourcing, disclaimer
/privacy                  Privacy policy (backs the consent banner)
404                       Real static not-found page
```

Nav is intentionally shallow. The primary nav (`Header.astro`) exposes States, Road signs, Permit guide, My progress. The footer carries the unofficial-study-aid disclaimer plus All states, Permit guide, About, Privacy, and Source & corrections. Every internal link routes through `href()` so the `/dmv-prep/` base is always correct.

---

## 2. Sitemap priority

| Tier | Routes | Why |
|---|---|---|
| Entry | `/`, `/states` | Get the user to their state in one step |
| Core loop | `/state/[code]` + practice/mock/flashcards | Where prep happens |
| Support | `/state/[code]/guide`, `/lessons`, `/cheat-sheet`, `/signs` | Process + study depth |
| Meta | `/progress`, `/about`, `/privacy`, `404` | Trust, continuity, recovery |

---

## 3. Core user flow

```
Land (home)
  └─► Pick state (search or grid)           ← no signup, ever
        └─► State hub / dashboard
              ├─ Next best action (weak area / due cards / ready-for-mock)
              ├─► Practice test ─► answer ─► instant feedback + explanation + citation
              │                                   └─► miss ─► Challenge Bank
              ├─► Exam simulator ─► timed ─► pass/fail result (+ sub-rules) ─► review misses
              ├─► Flashcards (FSRS) ─► grade ─► reschedule
              └─► Permit guide (documents, fees, ages, links)
        └─► Weak-area retest resurfaces misses over time
```

The loop is designed so a returning user lands on the dashboard and is told the single highest-value next step, not left to choose blindly.

### Onboarding (zero-friction)

- No account, no email, no wall. First visit goes straight to the state picker.
- Choosing a state is the only required step; the choice is remembered in `localStorage` so the next visit skips straight to the dashboard.
- The consent banner (analytics) is the only interstitial, and it is dismissible and non-blocking (see [Privacy](../PRIVACY.md)).

---

## 4. Key screens

### Home (`/`) - shipped

- Hero: eyebrow ("Free · No sign-up · All 50 states + DC"), headline, lede.
- **State picker card:** a live search input (`role="search"`) filtering a responsive grid of all 51 code+name chips. Empty search result shows "No state matches that search."
- Feature grid (6 tiles) and a "Why DMV Prep is different" panel reinforcing free / private / state-accurate / offline.

### State hub / dashboard (`/state/[code]`)

- Header: state name + real agency name; a "verified as of" stamp.
- **Next best action** card: the single recommended step (weak category, due flashcards, or "you're ready for a mock").
- Mastery-by-category meters, current streak, recent mock history.
- Quick links into practice, mock, flashcards, lessons, guide, cheat sheet.

### Quiz (`/state/[code]/practice`)

- One question at a time: `<fieldset>/<legend>` prompt, radio options (>=44px), optional sign image.
- On answer: option colors flip to pass/fail, an explanation + citation appears, and the result is announced via `aria-live`.
- Progress indicator (question n of m) and category context always visible.
- Missed items silently feed the Challenge Bank.

### Mock result (`/state/[code]/mock` result view)

- Big pass/fail verdict using semantic color **and** text/icon.
- Score vs threshold, per-sub-requirement status (e.g. NY "sign questions 3/4 - passed"), elapsed time.
- Scrollable review of every missed item with explanation + citation.
- Actions: retake, drill misses, back to dashboard. Result is appended to mock history.

### Flashcard review (`/state/[code]/flashcards`)

- Card front (sign/fact/question), reveal, then four grade buttons (Again/Hard/Good/Easy).
- Shows due count and session progress; grading reschedules via FSRS and advances.
- Fully keyboard operable (reveal + grade shortcuts).

### Permit guide (`/state/[code]/guide`)

- Sections: eligibility/GDL steps, required documents (REAL ID note), fees, appointment policy + scheduling link, vision test, retake rules.
- Each fact shows a "verified as of" stamp and links to the official `.gov` source. No agency seals.

### Progress (`/progress`)

- Cross-state view of mastery, streaks, and mock history.
- Export / import controls (JSON) with a plain explanation that this is the only backup path.

### 404 (shipped)

- Friendly "We took a wrong turn." with "Go home" and "Pick your state" actions, base-aware. A real static page, not an SPA fallback.

---

## 5. Empty, loading, error states

| Screen | Empty | Loading | Error |
|---|---|---|---|
| State picker | "No state matches that search." (shipped) | n/a (static) | n/a |
| Dashboard | "No progress yet - start a practice test" + primary CTA | skeleton meters | "Couldn't read your saved progress" + retry/export |
| Quiz | "No questions for this category yet" + verified-as-of note | brief spinner while bank loads (code-split) | "Couldn't load this question bank" + back |
| Flashcards | "You're all caught up - no cards due" (a win, not a dead end) | spinner while due set loads | storage-denied note, degrade to session-only |
| Mock | "No mock history yet" | timer/loading | interrupted-mock recovery prompt |
| Guide | "Process data pending verification" + link to official site | n/a | link-rot fallback to official homepage |

Storage denial (private mode / quota) never crashes: the app degrades to in-memory for the session and tells the user their progress won't be saved.

---

## 6. Pixel-perfect bar

- Every screen is reviewed against the [Design System](./DESIGN_SYSTEM.md) tokens; no raw px/hex in components.
- Consistent vertical rhythm (spacing scale), aligned optical edges, no orphaned single-word lines in headings.
- Touch targets >=44px everywhere; tap feedback present; focus rings visible on every control.
- Light and dark both audited; no low-contrast text; semantic colors never used decoratively.
- Print view (cheat sheet) is genuinely clean: no nav/chrome, legible in black and white.
- If something looks off, even outside the current task, it gets fixed in passing. The bar is a polished, calm surface that reads as trustworthy at a glance.

---

## 7. Friction-reduction principles

- **No signup wall, ever.** The product's core promise; nothing gates the useful features.
- **One decision to start:** pick your state. Remembered thereafter.
- **Instant feedback:** every answer explains itself immediately; no "submit and wait".
- **Always show the next best action** so users never stall on "what now".
- **Adaptive is free:** weak-area retest and mocks are not upsold.
- **Offline-first:** installable PWA; studying continues with no network.
- **Honest freshness:** "verified as of" stamps and stale-content notes build trust instead of pretending data is always live.
- **Private by default:** progress stays on-device; the only banner is a dismissible analytics consent.
