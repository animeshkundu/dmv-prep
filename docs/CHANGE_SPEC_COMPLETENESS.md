# Change Spec — Make DMV Prep Actually Complete

**Status:** approved, ready to build
**Scope:** whole product — content corpus, content pipeline, study experience, gamification, verification
**Authored:** 2026-07-26
**Mandate:** implement this document **in full, in one change**. Partial delivery is not acceptance.

---

## 0. Why this exists

DMV Prep looks finished and is a shell. The scaffolding is genuinely good — a provenance-enforcing Zod content model, a seeded PRNG, FSRS spaced repetition, axe-tested accessibility, 51 jurisdictions routed and built. Behind it, the corpus is close to empty and two of the defects actively teach the wrong thing.

Every number below was computed from the repository, not estimated. Reproduction commands are in §12.

| Promise | Reality |
|---|---|
| One-stop prep for all 51 jurisdictions | **~147 questions per state, of which only ~15 are state-specific.** California has **5**. The other 132 are national items shared verbatim with all 50 other states |
| Guided study | **Zero words of study prose exist.** The `lessons` collection holds one 213-word Markdown file that **no page renders**. Every state "guide" is one hardcoded template rendered 51 times |
| Road-sign training | **5 signs.** `SignTrainer`'s distractor pool is therefore 4, so every question uses all five and the drill is exhausted after 5 cards. **0 of 867 questions carry an image**, despite 46 being categorised `road-signs` |
| Realistic mock exams | `subRequirements` authored for only 3 states. Georgia (two separately scored 20-question tests) and North Carolina (separate signs identification test) are mis-modelled |
| Trustworthy, cited content | All 51 states carry the literal placeholder `"sourceSnapshotHash": "seed-pending-verification"`. All 51 `lastVerified` values are the same date. 24/51 `handbookCopyrightStatus` are `unknown` |

### 0.1 The four severe defects

**D1 — Answer-position bias makes the bank exploitable.** 73% of all 867 correct answers sit at option index 1 (A=50, B=634, C=166, D=17), and options are never shuffled at render: `Quiz.tsx:164` and `MockExam.tsx:159` both map `question.options` in stored order. `shuffle` is applied only to question order. **A user who always picks B scores ~73% without reading anything**, and every learner is being trained to pattern-match position instead of content.

**D2 — Answer-length bias compounds it.** The correct answer is the *uniquely longest* option **55.1%** of the time (478/867; 83.7% counting ties) against 25% by chance. Combined with D1, the bank rewards test-wiseness over knowledge — the precise opposite of its purpose. This is a content defect (distractor rewriting), not an engine defect, and shuffling does not touch it.

**D3 — The question bank is inlined into every HTML page.** `practice.astro:61` passes the whole pool as an island prop. `dist/state/wa/practice/index.html` is **182 KB** at 147 questions. At the ~555-question target that becomes ~650 KB × 51 states × 3 routes ≈ **100 MB of HTML**, all precached by Workbox. **The corpus expansion is physically unshippable until the bank leaves the HTML.**

**D4 — Georgia and North Carolina declare duplicate `variantId` values.** Both `ga.json` and `nc.json` define two exam variants with the identical id `"all"`. `MockExam.tsx:19` resolves with `variants.find(v => v.variantId === variantId)`, so **selecting "Road Rules" in Georgia silently runs the Road Signs exam**, and the `<select>` renders two options with the same `value`. These are exactly the two states whose real exam structure is two independently scored tests.

### 0.2 Secondary defects, all verified

- 6 exact-duplicate prompt groups (14 items). 7 cases where a state's own question is byte-identical to a national question **also in that state's pool** (`ar-traffic-signals-001` ≡ `nat-signals-002`, plus `de-sig-001`, `me-signals-001`, `nv-traffic-signals-001`, `or-signals-001`, `ms-pavement-markings-001`, `wy-pavement-markings-001`). `buildMockExam` dedupes by `id` only, so both survive selection.
- 38 near-duplicate pairs at Jaccard ≥0.70. The dominant anti-pattern is a national question with the state name injected — "When entering a roundabout **in Utah**, you must:".
- `stateExceptions` is used **zero times**. 132 items assert universality with nothing backing it.
- Category skew per state: WA has `penalties-points`=1, `speed-limits`=2, `alcohol-drugs`=3. 41/51 states have zero `parking` items of their own. Four categories have **fewer than 5 questions in every state**.
- `state.facts` is populated on 51/51 states and rendered by **zero pages**.
- `nextWeakArea`, `byCategory`, and `Settings.selectedState` are all defined and never used.
- `streakDays` derives days from `attempt.lastSeen`, which is overwritten on every re-answer — re-answering an old question destroys the evidence of earlier study days.
- The Challenge Bank lives in React state only: no persistence, no miss aggregation, no retirement threshold, no span across surfaces.
- `MockExam` records no per-question attempts, so mock misses never reach mastery or the Challenge Bank.
- `importAll` hard-rejects any `schemaVersion ≠ 1`; `migrate()` is a stub returning its input.
- Flashcards have no session cap, serve due cards in raw array order, and show a bare correct-option string with no explanation.

**The scaffolding is excellent and the corpus is empty. This spec fills it.**

---

## 1. Non-negotiable constraints

### 1.1 Legal

US state driver handbooks are **not** public domain. The federal §105 bar applies only to federal works; for states only the government-edicts doctrine applies (*Georgia v. Public.Resource.Org*, 590 U.S. 255 (2020)), and a handbook is explanatory material *about* the law, not an edict.

- **California's handbook is CC BY-NC 4.0.** NonCommercial is judged by the nature of the use, so an ad-supported free site reproducing it is very likely outside the licence.
- **Washington's dol.wa.gov terms** assert broad ownership and grant no reuse right.
- **24/51 states have `handbookCopyrightStatus: "unknown"`.**

Therefore:

1. **All prose is 100% original.** Copyright protects *expression*, not facts (17 U.S.C. §102(b); *Feist Publications v. Rural Telephone Service*, 499 U.S. 340 (1991)). A handbook's sentences are protected; the BAC limit, the minimum age, and the parking distance stated in them are not.
2. **Reading a fact out of any handbook — including California's — is lawful and expected.** What is forbidden is reproducing the handbook's wording, structure, selection, or arrangement. Do not confuse the two: a blanket ban on *consulting* CC BY-NC or unknown-status handbooks would be legally unnecessary and would mandate a large amount of pointless statute-hunting.
3. **Cite a statute or regulation as the primary reference wherever one exists** — not as a copyright workaround but for **verifiability and durability**: statutes are the authoritative source, they are unambiguously public domain under the edicts doctrine, and they can be quoted directly in an explanation. The handbook is a legitimate secondary reference and a legitimate factual source.
4. **Never reproduce or host handbook text or PDFs**, and never quote more than a short attributed passage of a rule (fair use), preferring the statutory text the handbook is itself paraphrasing.
5. **Never claim "real exam questions."** No state publishes its live pool; the claim is false and is a legal exposure.

The §9.3 copyright gate (6-gram verbatim-overlap detection against the source text) is what actually enforces this line, and it enforces exactly the right one: it catches copied *expression* while leaving fact extraction untouched.

**MUTCD sign designs are public domain** (MUTCD p. I-1: *"shall not be protected by a patent, trademark, or copyright"*), excluding the Interstate Shield and other FHWA-owned marks, the 511 pictograph, and the National Scenic Byway graphic. State route shields and agency seals are excluded too. This asymmetry — free imagery, expensive text — should shape effort allocation.

### 1.2 Product

- Static site on GitHub Pages. **No backend, no accounts, no leaderboards.** All progress is local.
- Offline-capable PWA. Payload growth is a hard constraint, not an afterthought.
- Accessibility is a gate, not a nice-to-have: the existing axe sweep must stay green.

---

## 2. Target corpus shape

Hand-authoring 500 × 51 = 25,000 items cannot be verified at this project's own stated bar. Three tiers deliver 555 effective questions per state from ~7,305 authored rows, of which only **3,735 items plus 45 templates are human-authored prose**.

| Tier | What it is | Location | Rows |
|---|---|---|---|
| **T1 national core** | `stateScope:"all"`, contains no state-variable quantity | `src/content/questions/national/*.json` | 420 |
| **T2 fact-templated** | generated from typed facts × ~45 templates | `src/content/questions/generated/<code>.json` | 3,570 |
| **T3 state-authored** | genuinely idiosyncratic per state | `src/content/questions/state/<code>.json` | 3,315 |

**Per-state effective pool = 420 + 70 + 65 = 555.**

**There is exactly one acceptance contract, and it is a floor:** every jurisdiction must reach **≥500 applicable questions and ≥25 in every category**. The 555 figure is the authoring target, deliberately above the floor so that sweep exceptions and `not-applicable` facts (§3) can reduce a given state's count without breaching acceptance. Tier minimums (T1≥400, T2≥60, T3≥50) are secondary assertions that prevent the floor being met by inflating one tier; they are not an alternative contract. Where any two numbers in this document disagree, **the floor governs**.

### 2.1 Per-category targets

| Category | T1 | T2/state | T3/state | Per-state |
|---|---|---|---|---|
| road-signs | 90 | 0 | 4 | 94 |
| traffic-signals | 30 | 2 | 2 | 34 |
| pavement-markings | 30 | 0 | 3 | 33 |
| right-of-way | 45 | 4 | 6 | 55 |
| parking | 25 | 6 | 4 | 35 |
| speed-limits | 15 | 14 | 3 | 32 |
| alcohol-drugs | 20 | 14 | 3 | 37 |
| sharing-the-road | 45 | 0 | 4 | 49 |
| safe-driving | 60 | 0 | 8 | 68 |
| traffic-laws | 40 | 6 | 12 | 58 |
| penalties-points | 10 | 10 | 8 | 28 |
| gdl-teen | 10 | 14 | 8 | 32 |
| **total** | **420** | **70** | **65** | **555** |

Every per-state total clears the ≥25 floor with margin (lowest is `penalties-points` at 28). This arithmetic is a build-time assertion, not a comment — `content-coverage.test.ts` must check the column sums against the tier targets.

**Floor invariant: ≥25 questions per category per state**, enforced by test. This is what repairs WA's `penalties-points`=1 and the 41-state parking hole.

`arrayJsonLoader` already walks directories recursively, so the reshape needs no loader change. All 867 ids are globally unique, so the `git mv` is safe.

### 2.2 Universality must be mechanical, not asserted

`stateScope:"all"` is currently an unbacked assertion and `stateExceptions` has never been used. Replace judgement with a rule: **a national item may not contain a state-variable quantity or a jurisdiction name.**

```js
// scripts/content/lib/universality.mjs
export const STATE_VARIABLE_PATTERNS = [
  /\b\d{2,3}\s?mph\b/i,                        // posted speeds
  /\b0?\.\d{2}\s?%/,                            // BAC
  /\b\d{1,3}\s?(feet|ft\.?)\b/i,                // parking / stopping distances
  /\b\d{1,2}\s?points?\b/i,                     // point systems
  /\b\d{1,2}\s?(years?|yrs?)\b/i,               // GDL ages
  /\b\d{1,3}\s?(days?|months?|weeks?|hours?)\b/i, // suspensions, holding periods, supervised hours
  /\$\s?[\d,]+/,                                // fees, fines, insurance minimums, crash thresholds
  /\b\d{1,2}(:\d{2})?\s?([ap]\.?m\.?)\b/i,      // curfew clock times
  /\b(midnight|sunrise|sunset)\b/i,             // curfew boundaries
  // word-form numerals, which slip past every digit pattern above
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|eighteen|twenty(-\w+)?|thirty|sixty|ninety)\s+
    (mph|feet|ft|points?|years?|yrs?|days?|months?|weeks?|hours?|dollars?)\b/ix,
];
```

The word-numeral and currency patterns matter as much as the digit ones: `crashReportThresholdUsd`, `gdlNightCurfew`, and `supervisedHoursTotal` are all state-variable facts modelled in §3, and "a **six month** holding period" or "**$1,000** in property damage" would otherwise bleed straight into the national pool. Any new typed fact added to §3 **must** come with a matching detector here; `content-universality.test.ts` asserts that every `typedFacts` key maps to at least one pattern or an explicit exemption. The lint scans the prompt, **all options**, the explanation, and any structured claims — not just the prompt.

**The lint is a rejection heuristic, not a proof of universality.** Absence of a number and a state name does not establish that a rule is universal: *"You may turn left on red from a one-way street onto a one-way street"* contains neither and is still state-variable. So is U-turn legality, school-bus stop-arm behaviour on divided highways, passing-on-the-right, and headlight-use triggers.

Therefore **every T1 item asserting a legal rule requires a positive basis, not merely a clean lint**:

- `mutcd-federal` — the item is about a sign, signal, or marking whose meaning is fixed by the MUTCD.
- `federal-statute` — fixed by federal law.
- `concept-only` — **restricted to genuinely non-legal content**: physics, perception, vehicle handling, hazard recognition. Not a legal rule wearing a safety costume.
- `fact-sweep` / `manual-audit` — requires a `sweepId` ledger covering all 51 jurisdictions.

A legal-rule item may not use `concept-only`. `content-universality.test.ts` enforces this by category and by a keyword check for modal legal phrasing ("must", "may", "is required", "is prohibited") in items claiming `concept-only`.

**Exceptions must preserve the tier arithmetic.** When a sweep produces an exception, the T1 item gains that code in `stateExceptions[]` and the replacement item carries `replacesQuestionId`, so `content-coverage.test.ts` can assert that every excepted state still reaches its per-category target. Removing an item from the national pool without a tracked replacement silently shrinks that state's bank.

Exceptions live in a small per-id allowlist (the `0.00%` zero-tolerance *concept*, the 3-second following rule), so each is a reviewed decision rather than a silent pass.

Schema addition on questions:

```ts
universality: z.object({
  basis: z.enum(['mutcd-federal','federal-statute','concept-only','fact-sweep','manual-audit']),
  sweepId: z.string().min(1).optional(),   // -> src/content/audits/sweeps/<sweepId>.json
  factKeys: z.array(z.string()).optional(),
}).optional(),
```

Refinements: `stateScope === 'all'` requires `universality`; a `fact-sweep` or `manual-audit` basis requires `sweepId`.

`scripts/content/universality-sweep.mjs` emits a ledger covering all 51 jurisdictions:

```json
{ "sweepId": "row-turn-on-red-2026-08", "questionIds": ["nat-row-014"],
  "method": "typed-facts", "factKeys": ["rightTurnOnRed"],
  "perState": { "AL": "match", "NY": "exception" },
  "exceptions": ["NY"], "ranAt": "2026-08-11" }
```

Every exception must appear in that item's `stateExceptions[]` **and** get a replacement T2/T3 item for the excepted state.

---

## 3. Typed facts — the highest-leverage change

Today `facts` is entirely free-text (`"0.08%"`, `"70 mph (where posted on rural interstates)"`), nothing is typed, nothing can be validated or compared, a typo like `"0.8%"` passes Zod, and no page renders it.

Replace with ~32 typed facts per state — roughly **1,600 individually cited fact records** that feed T2 questions, lesson callouts, cheat sheets, and the consistency test.

```ts
/**
 * A fact is not always a scalar. DC has no rural interstate; school-zone and residential
 * limits vary by posting, road class, or municipality; phone and GDL rules vary by driver
 * class and phase. Forcing one value per jurisdiction would make the model lie, so the
 * status is part of the type.
 */
type FactState<T> =
  | { status: 'value';          value: T; conditions?: Condition[] }
  | { status: 'varies';         variants: Array<{ value: T; conditions: Condition[] }> }
  | { status: 'not-applicable'; reason: string }
  | { status: 'unknown';        reason: string };

interface Condition {
  kind: 'road-class' | 'driver-age' | 'gdl-phase' | 'vehicle-class'
      | 'time-of-day' | 'posting' | 'locality' | 'occupancy';
  detail: string;    // human-readable, rendered in callouts and explanations
}

/** A machine-usable fact: typed state + how to say it + where it came from. */
const factValue = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    state: factStateSchema(value),      // the discriminated union above
    display: z.string().min(1),         // the string the UI renders ("0.08%")
    citation: reference,
    lastVerified: isoDate,
    confidence: z.enum(['verified','inferred','unknown']).default('unknown'),
  });
```

**Generation rules that follow from this.** A template declares which statuses it can consume:

```ts
supportsStatuses: Array<'value' | 'varies'>;   // 'not-applicable'/'unknown' are always skipped
```

A template requiring an unconditional scalar consumes only `status: 'value'` with no `conditions`. A `varies` fact can still produce a question if the template is written to scope it ("On a **rural interstate** in Montana, the maximum posted limit is…"), but the qualifying condition must appear in the prompt — never buried in a footnote — or the item is ambiguous and therefore wrong.

**Because `not-applicable`, `unknown`, and unsupported `varies` facts are all skipped, an exact 70 generated questions per state is impossible.** The generator uses a **fallback allocator**: it fills each category's T2 quota from that category's eligible templates in a deterministic priority order, and where a category falls short it records the shortfall in `src/content/audits/generation/<code>.json`. The shortfall is then covered by T3 authoring for that state. This is why §2's acceptance contract is a floor rather than an exact count.

```ts
const mph = z.number().int().min(5).max(90);
const bac = z.number().min(0).max(0.2);

const typedFacts = z.object({
  // Impairment
  bacAdult: factValue(bac),
  bacUnder21: factValue(bac),
  bacCommercial: factValue(bac),
  impliedConsentRefusal: factValue(z.object({
    suspensionMonths: z.number().int(), criminalOffense: z.boolean() })),
  openContainerProhibited: factValue(z.boolean()),
  duiFirstSuspensionDays: factValue(z.number().int()).optional(),

  // Speed
  ruralInterstateMaxMph: factValue(mph),
  urbanInterstateMaxMph: factValue(mph).optional(),
  residentialDefaultMph: factValue(mph),
  schoolZoneMph: factValue(mph),
  basicSpeedLaw: factValue(z.boolean()),

  // Turns and signals
  rightTurnOnRed: factValue(z.enum(['allowed-after-stop','prohibited-unless-posted'])),
  leftTurnOnRedFromOneWay: factValue(z.enum(['allowed','prohibited'])),

  // Enforcement and equipment
  seatBeltEnforcement: factValue(z.enum(['primary','secondary'])),
  handheldPhone: factValue(z.enum(['banned-all','banned-novice','no-ban'])),
  texting: factValue(z.enum(['banned-all','banned-novice','no-ban'])),
  moveOver: factValue(z.object({
    requirement: z.enum(['lane-change-or-slow','lane-change-required','slow-only']),
    coveredVehicles: z.array(z.enum(['emergency','tow','roadside-assist','utility','any-flashing'])),
    slowToMph: z.union([mph, z.literal('20-below-posted')]).optional() })),
  headlightsRequired: factValue(z.object({
    whenWipersOn: z.boolean(), minutesAfterSunset: z.number().int() })),

  // Parking distances
  parkFtFromHydrant: factValue(z.number().int()),
  parkFtFromCrosswalk: factValue(z.number().int()),
  parkFtFromStopSign: factValue(z.number().int()),
  parkFtFromRailroad: factValue(z.number().int()),

  // Penalties
  pointSystem: factValue(z.boolean()),
  pointSuspension: factValue(z.object({
    points: z.number().int(), windowMonths: z.number().int() })).optional(),

  // GDL
  permitMinAgeMonths: factValue(z.number().int()),   // 186 === 15 yrs 6 mo
  permitHoldingMonths: factValue(z.number().int()),
  supervisedHoursTotal: factValue(z.number().int()),
  supervisedHoursNight: factValue(z.number().int()).optional(),
  gdlNightCurfew: factValue(z.object({
    startHour24: z.number().int(), endHour24: z.number().int() })).optional(),
  gdlPassengerPhase1: factValue(z.object({
    cap: z.number().int(), underAge: z.number().int(), familyExempt: z.boolean() })).optional(),

  // Financial responsibility
  minLiability: factValue(z.object({
    bodilyPerPerson: z.number().int(), bodilyPerCrash: z.number().int(), property: z.number().int() })),
  crashReportThresholdUsd: factValue(z.number().int()).optional(),
});
```

`scripts/content/migrate-facts.mjs` parses the existing strings (`"0.08%"` → `{status:'value', value: 0.08}`; `"70 mph (where posted on rural interstates)"` → `{status:'value', value: 70, conditions:[{kind:'posting', detail:'where posted on rural interstates'}]}`) and marks everything `confidence: 'inferred'`. Where the existing string cannot be parsed into a single value, it emits `status:'unknown'` with the original text as the `reason` rather than guessing.

**The generator refuses to emit from any fact that is not `confidence: 'verified'`.** Inferred facts become a to-do list, never a shipping hazard.

Keep the free-text `facts` object for one release marked deprecated, then delete it.

---

## 4. Fact-templated generation

Templates live in `src/content/templates/*.ts` — TypeScript, because they need logic.

```ts
export interface QuestionTemplate {
  id: string;                                    // "tpl-bac-under21"
  version: number;                               // bump invalidates generated output
  category: QuestionCategory;
  tags: string[];                                // from the §5.3 vocabulary, fixed BEFORE authoring
  requires: readonly (keyof TypedFacts)[];
  supportsStatuses: Array<'value' | 'varies'>;   // see §3
  /** How many distinct questions this template emits per state, and its quota weight. */
  instancesPerState: 1 | 2;
  appliesTo?(ctx: TemplateCtx): boolean;         // skip point templates where pointSystem=false
  prompts: ((c: TemplateCtx) => string)[];       // >= 4 phrasings — SURFACE FORMS, not extra questions
  correct(c: TemplateCtx): string;
  distractorPool(c: TemplateCtx): string[];      // >= 6 realistic candidates
  explanations: ((c: TemplateCtx) => string)[];  // >= 3 framings
  difficulty: 'easy' | 'medium' | 'hard';
  /** Which typed fact this item's answer depends on — validated, not inferred. */
  claims: Array<{ factKey: keyof TypedFacts; usage: 'correct-answer' | 'prompt-context' }>;
}
```

**Cardinality is explicit.** Multiple `prompts` are alternative *phrasings of the same question*, not additional questions — exactly one is chosen per state. A template emits `instancesPerState` questions, with ids `${templateId}-${stateCode}-${n}`. To reach 70 T2 questions per state, the ~45 templates must have `instancesPerState` values summing to 70 across the eligible set; `content-facts-consistency.test.ts` asserts the allocation table sums correctly per category before any generation runs. Where `maxTemplatesPerFactKey = 2` and a category's quota exceeds what its facts can support (as with `penalties-points`), the shortfall is allocated to T3 rather than manufactured by asking near-identical questions about the same fact — repeating one fact three ways is worse than one good question plus two authored ones.

### 4.1 What is templated vs hand-authored

**Heuristic: a number or enum readable straight off the facts is templated. Judgement is hand-authored.**

| Templated (T2) | Hand-authored (T1/T3) |
|---|---|
| speed numbers, BAC and implied consent, points, GDL ages/hours/curfew/passengers, parking distances, turn-on-red, move-over, belt and phone enforcement, insurance minimums | hazard perception, scanning, skid recovery, sign meaning, markings, sharing the road, merging, work zones, fault reasoning, state-unique statutes |

### 4.2 Distractors come from domain lattices, never random perturbation

```js
// scripts/content/lib/lattices.mjs
export const BAC_LATTICE   = [0.00, 0.01, 0.02, 0.04, 0.05, 0.08, 0.10, 0.15];
export const SPEED_LATTICE = [15,20,25,30,35,40,45,50,55,60,65,70,75,80,85];
export const DISTANCE_FT   = [5,10,15,20,25,30,50,100];
export const POINTS        = [6,8,10,11,12,15,18];
export const MONTHS        = [1,3,6,9,12,18,24];
```

Rule: nearest lattice neighbours to the true value, **excluding any value that is also correct for that state under a sibling fact**. Never offer `0.04` against "the adult limit" when 0.04 is that state's commercial limit — it is defensibly arguable, therefore a bad item. Two neighbours below and one above, so magnitude alone never gives it away. Enum facts use curated per-value distractor sets in the template.

### 4.3 Answer-position and answer-length balance

Both biases must be designed out at generation time, not patched afterwards.

- **Position:** options are ordered by the **existing** `shuffle` from `src/lib/quiz-engine.ts` (do not reimplement), and `correctIndex` is set to wherever the correct string landed.
- **Length:** option lengths must sit within a narrow band per question. `content-answer-distribution.test.ts` caps the longest-option-correct rate at **30%**. Fixing this on the existing 867 items means rewriting distractors, not just permuting them.

### 4.4 Avoiding formulaic repetition across 51 states

1. ≥4 prompts × ≥3 explanations = 12 surface forms, selected with **different hash salts** so phrasing and framing do not correlate.
2. `maxTemplatesPerFactKey = 2` — no state gets three near-identical BAC questions.
3. A phrasing may use `state.agencyShort`, `facts.namedLaws`, or generic scenario nouns ("on a rural interstate"). Hyper-specific unverifiable nouns ("on I-90 outside Spokane") are banned.
4. `dedupe-report.mjs --generated` computes pairwise Jaccard across a template's 51 outputs after stripping numerals and state names. Warn above 60% of pairs over 0.85; **fail above 80%**. Some repetition is correct — the rule genuinely is the same shape — but total repetition is not.

### 4.5 Generated files are machine-owned and byte-reproducible

`npm run content:generate:check` regenerates in memory and diffs against committed output. CI runs it, so hand-editing a generated file fails the build.

**Byte-reproducibility requires that no wall-clock value lands in a generated file.** `generator.generatedAt` and the verification stamps (`verifiedBy`, `verifiedAt`, `verificationAuditId`) must therefore live **outside** the generated artifact, in ledgers keyed by question id:

```
src/content/audits/generation/<code>.json   { templateId, templateVersion, generatedAt, inputFactHash }
src/content/audits/verify/<batchId>.json    { questionId, verifiedBy, verifiedAt, artifactHash, verdict }
```

The generated question rows themselves contain only deterministic content. A regeneration on a different day is byte-identical, and re-running the generator can never erase or fabricate a verification record.

### 4.6 Cross-state similarity is expected and must not fail the duplicate test

51 states × one adult-BAC template × four phrasings makes exact normalized collisions **mathematically guaranteed** — the rule genuinely is the same in most states, and there are more states than phrasings. §10's duplicate assertions are therefore scoped to **questions that coexist in the same effective state pool**. Cross-state similarity among deterministic T2 siblings is reported by `dedupe-report.mjs --generated` as a variance statistic, never as a build failure.

---

## 5. Curriculum — the missing product

11 modules, 35 units, rendered per state = **623 study routes** (561 module pages + 51 indexes + 11 national).

Fully per-state lessons (35 × 51 = 1,785 documents) is the same trap as 25,000 questions, and one national rule change would mean 51 edits. Instead:

- **35 national unit bodies** in Markdown, provably state-neutral (same universality lint as T1).
- **Fact callouts injected at render** by `src/components/StateFactCallout.astro` reading typed facts. **No interpolation inside Markdown** — it breaks the glob loader's content digest, destroys the "body is provably state-neutral" invariant, and makes the lint unenforceable.
- **Hand-written state deltas only where a state actually deviates** — 4–8 per state, ~300 total.

### 5.1 Modules and units

| Module | Units |
|---|---|
| `signs` | shapes-and-colors, regulatory, warning, guide-and-services, work-zone |
| `signals-markings` | traffic-signals, flashing-and-special-signals, pavement-markings |
| `right-of-way` | intersections-and-stops, left-turns, roundabouts, pedestrians-crosswalks, emergency-vehicles |
| `speed` | basic-speed-law, posted-limits, school-and-work-zones |
| `lane-use` | lane-position-and-changing, turning, passing, freeway-entry-exit |
| `parking` | parallel-and-angle, where-you-may-not-park |
| `sharing-the-road` | motorcycles-bicycles, trucks-buses, pedestrians-scooters-animals |
| `safe-driving` | following-and-scanning, weather-and-night, skids-and-emergencies, distraction-and-fatigue |
| `alcohol-drugs` | impairment-and-bac, implied-consent-and-penalties |
| `collisions-insurance` | at-the-scene, insurance-and-reporting |
| `licensing-gdl` | permit-rules, to-full-license |

### 5.2 Schema

```ts
const lessons = defineCollection({
  loader: glob({ base: './src/content/lessons', pattern: '**/*.md' }),
  schema: z.object({
    unitId: z.string().min(1),                      // "row-intersections" — stable, unique
    module: z.enum(LESSON_MODULES),
    moduleOrder: z.number().int().nonnegative(),
    order: z.number().int().nonnegative(),
    title: z.string().min(1),
    summary: z.string().min(1),
    estimatedMinutes: z.number().int().positive().default(4),
    objectives: z.array(z.string().min(1)).min(1).max(6),
    category: questionCategory,                     // kept for compatibility
    quizCategories: z.array(questionCategory).min(1),
    quizTags: z.array(z.string()).default([]),      // fine-grained study -> quiz binding
    factCallouts: z.array(z.string()).default([]),  // keys of typedFacts
    checkCount: z.number().int().positive().default(5),
    prerequisites: z.array(z.string()).default([]), // unitIds
    stateScope: z.union([z.literal('all'), z.array(stateCode).min(1)]).default('all'),
    references: z.array(reference).min(1),          // tightened from .default([])
    lastVerified: isoDate,
    contentVersion: z.number().int().nonnegative().default(1),
  }),
});

const stateNotes = defineCollection({
  loader: arrayJsonLoader('src/content/state-notes'),
  schema: z.object({
    id: z.string().min(1),                          // "wa-row-intersections-1"
    state: stateCode,
    unitId: z.string().min(1),
    kind: z.enum(['exception','extra','emphasis']),
    title: z.string().min(1),
    body: z.string().min(1),                        // 40-120 words, original
    ...provenance,
  }),
});
```

### 5.3 Study→quiz binding needs tags

Category alone is too coarse — 55 right-of-way items cannot all be "roundabouts". Add `tags: z.array(z.string()).default([])` to questions, with a controlled vocabulary in `src/content/taxonomy/tags.json`, validated so every question tag exists and **every lesson `quizTags` entry matches ≥8 questions in every state**.

### 5.4 Routes

**11 module routes × 51 states = 561, plus 51 study indexes and 11 national module pages = 623 routes total.**

```
src/pages/state/[code]/study/index.astro     NEW  11 module cards + CurriculumMap island
src/pages/state/[code]/study/[module].astro  NEW  renders ALL units in the module, in order
src/pages/lessons/[module].astro             NEW  11 national SEO pages
src/components/StateFactCallout.astro        NEW  display + conditions + citation + lastVerified stamp
src/islands/StudyUnit.tsx                    NEW  per-unit check quiz + mastery gate + advance
src/islands/CurriculumMap.tsx                NEW  unit list with per-unit status
src/lib/curriculum.ts                        NEW  buildCurriculum + gate logic
```

**Route granularity:** the route is per *module*, but the content and progression model are per *unit*. A module page renders each of its units in sequence — each with its own `id` anchor, fact callouts, state notes, and `StudyUnit` check island. Deep links are `#unit-<unitId>` and completion is tracked per `unitId`, never per module. There is deliberately no per-unit route: 35 × 51 = 1,785 pages carrying one lesson each would fragment the reading flow and inflate the build for no navigational gain.

Lesson prose renders at build time — **static HTML, zero JS**. Only the check quiz hydrates.

This is what finally renders `state.facts` and gives the orphaned `right-of-way.md` a home.

---

## 6. Sign library — ~140 MUTCD signs

Mix: regulatory 40 · warning 55 · guide 15 · work-zone 20 · school/pedestrian 10.

Sources: **FHWA Standard Highway Signs** (authoritative, ships vector graphics), with Wikimedia Commons `PD MUTCD` as the practical download channel. Stamp edition **11th Ed. Rev. 1, effective 2026-03-05**.

### 6.1 The manifest is a licence gate

Nothing enters `public/signs/` without a row in the manifest first.

**The manifest must live OUTSIDE the collection directory.** `arrayJsonLoader` walks `src/content/signs/` recursively and parses every `.json` it finds as collection entries, so a manifest at `src/content/signs/manifest.json` would be loaded as sign records and fail the schema. Put it at **`src/content/sign-manifest/manifest.json`** (not a registered collection) or, equivalently, `scripts/signs/manifest.json`.

```json
{ "id": "w1-1-turn-right",
  "status": "downloaded",
  "mutcdCode": "W1-1", "mutcdEdition": "11th-ed-rev-1",
  "sourceUrl": "https://commons.wikimedia.org/wiki/File:MUTCD_W1-1R.svg",
  "sourceLabel": "Wikimedia Commons — PD MUTCD",
  "license": "public-domain-mutcd",
  "licenseEvidence": "MUTCD p. I-1: shall not be protected by a patent, trademark, or copyright",
  "retrieved": "2026-08-14", "assetSha256": "…" }
```

`status` is one of `downloaded | pending | excluded`, and `excluded` rows carry an `exclusionReason` — that is how the Interstate Shield, state route shields, and agency seals stay auditable without ever being fetched.

Excluded by policy and recorded in the manifest so exclusions are auditable: Interstate Shield (M1-1) and other FHWA marks, state route shields, all agency seals and wordmarks.

`scripts/signs/fetch-signs.mjs` is manifest-driven, refuses any URL not already in the manifest, normalises SVGs (strip `<metadata>`, comments, editor namespaces, absolute sizes; enforce `viewBox`; reject embedded rasters and remote `href`), writes back the sha256, and is idempotent.

### 6.2 Schema

```ts
const signs = defineCollection({
  loader: arrayJsonLoader('src/content/signs'),
  schema: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: z.enum(['regulatory','warning','guide','construction','school','marking','emergency']),
    shape: z.enum(['octagon','triangle-down','diamond','rectangle-vertical','rectangle-horizontal',
                   'pentagon','circle','pennant','crossbuck','trapezoid','square']),
    color: z.enum(['red','white','yellow','fluorescent-yellow-green','orange','green',
                   'blue','brown','black','pink','purple']),
    asset: z.string().min(1),
    /** Shape and colour ONLY — must not reveal the meaning; that is the quiz answer. */
    altText: z.string().min(1),
    meaning: z.string().min(1),
    legendText: z.string().optional(),
    commonConfusions: z.array(z.string()).default([]),   // seeds SignTrainer distractors
    mutcdCode: z.string().optional(),
    mutcdEdition: z.string().optional(),
    assetLicense: z.enum(['public-domain-mutcd','cc0','cc-by','original']),
    assetSource: z.object({ label: z.string(), url: z.string().url().optional(), retrieved: isoDate }),
    assetSha256: z.string().length(64),
    stateScope: z.union([z.literal('all'), z.array(stateCode).min(1)]).default('all'),
    references: z.array(reference).min(1),
    lastVerified: isoDate,
  })
  .refine((s) => !s.mutcdCode || s.assetLicense === 'public-domain-mutcd',
    { message: 'MUTCD-coded signs must be recorded as public-domain-mutcd' })
  .refine((s) => !!s.mutcdCode || s.assetLicense === 'original',
    { message: 'Non-MUTCD (state-specific) signs must be original artwork' }),
});
```

### 6.3 Wiring images into questions

**`imageAsset` changes meaning from a raw path to a sign id**, so referential integrity is testable. A raw path leaves orphan refs undetectable across 51 × 90 pages.

Of the 90 T1 `road-signs` items: **~68 are visual-identification items** tagged `sign-identify`, each carrying an `imageAsset`; the remaining **~22 (25%) are `sign-rule` items** that test the rule rather than recognition and carry no image. The visual-coverage test demands an image on every `sign-identify` item and none on `sign-rule`.

`TestRunner` renders the image through a **base-aware** helper — the site is served from `base: '/dmv-prep/'`, so a bare `src={sign.asset}` 404s in production. Export `assetUrl(path)` from `src/lib/site.ts` (which already owns `href()`), built on `import.meta.env.BASE_URL`, and use it in both Astro pages and Preact islands:

```tsx
<img src={assetUrl(sign.asset)} alt={sign.altText} width="180" height="180" loading="lazy" />
```

**Accessibility.** `alt="Stop sign"` gives away the answer, so `altText` is shape and colour only ("red octagonal sign with white lettering"), linted so it never contains the sign's name. But shape-and-colour alt text does **not** make a symbol-identification question answerable by a blind learner, and axe will not detect that — it is a semantic failure, not a markup one. Therefore: **every `sign-identify` item must have a `sign-rule` counterpart covering the same sign**, so a nonvisual learner can reach full topic mastery through the text-answerable pool. `content-signs.test.ts` asserts that every sign referenced by a `sign-identify` item is also covered by at least one text-answerable item, and mastery/readiness never require an image-dependent question.

### 6.4 State-specific non-MUTCD signs

`stateScope` + `assetLicense: 'original'`: **draw a simplified original SVG**, never copy state artwork, never route shields or seals. Budget 0–3 per state. If an original drawing would be indistinguishable from the state's own artwork, use a text-only question instead.

---

## 7. Engine and experience

### 7.1 Payload architecture (fixes D3, blocks everything else)

- New `src/pages/bank/[code].json.ts` and `src/pages/bank/signs.json.ts` static endpoints. `getStaticPaths` over `STATES`; body is `applicableQuestions(all, code)` reduced to client-needed fields only: `id, category, tags, prompt, imageAsset, options, correctIndex, explanation, difficulty, references[0].citation`. Build-time provenance never ships.
- **All bank and asset URLs are base-aware.** The site is served from `base: '/dmv-prep/'`, so root-relative `/bank/wa.json` 404s in production. Build every URL from `import.meta.env.BASE_URL` via the existing `src/lib/site.ts` helpers, and add a Playwright case that loads a practice page under the configured non-root base and asserts the bank actually fetches.
- **Bank JSON must be excluded from Workbox precaching**, not merely given a runtime rule. Adding `runtimeCaching` does not remove files already matched by `globPatterns`; without an explicit exclusion the 51 banks move from HTML bloat into precache bloat and D3 is not solved. Set `workbox.globIgnores` to cover `bank/**/*.json`, then add a StaleWhileRevalidate `runtimeCaching` entry for the same paths in `astro.config.mjs`.
- **Versioning and invalidation.** The build emits an aggregate `bankVersion` (a hash over the emitted bank bytes) into both the JSON body and the page that mounts the island. The IDB cache key is `bank:{code}:{bankVersion}`; on load the island compares the page's `bankVersion` with the cached one and refetches on mismatch, then deletes stale keys for that state.
- **Failure and offline behaviour.** On fetch failure the island falls back to the IDB copy; with neither, it renders an explicit "questions unavailable offline — connect once to download {state}'s bank" state rather than an empty quiz. First visit offline therefore degrades honestly instead of silently.
- **The inlined seed is a real, playable 10-question set**, not a visual placeholder — it is what a no-JS or pre-fetch visitor gets, and it keeps the existing `schema.org/Quiz` `hasPart` (already `.slice(0,10)`) unchanged. **A session that has already started never swaps its question set when the full bank arrives**; the full bank applies from the next set onward.
- `TestRunner` / `Flashcards` take a `bankUrl` instead of `questions[]`.

**Target: `dist/state/wa/practice/index.html` back under ~50 KB.**

### 7.2 Option shuffling (fixes D1)

New `src/lib/options.ts`:

```ts
export interface PresentedQuestion {
  question: Question;
  options: string[];          // display order
  correctIndex: number;       // index into `options`
  displayToStored: number[];  // display index -> stored index
}

/**
 * Deterministically permutes a question's options for one attempt.
 * `sessionSeed` must be stable for the life of an attempt and DIFFERENT across attempts,
 * so a retry rearranges the options and position memorisation cannot help.
 */
export function presentQuestion(question: Question, sessionSeed: string | number): PresentedQuestion;
export function toStoredIndex(presented: PresentedQuestion, displayIndex: number): number;
```

Built on the **existing** `shuffle`. Pure in `(question, seed)`, so a re-render yields the identical arrangement — essential because the mock lets you navigate back to previous questions, where a `Math.random()` approach would visibly scramble options.

Two invariants, both tested: the correct option text always survives the permutation, and `toStoredIndex(p, p.correctIndex) === question.correctIndex`.

Answers stay in **display space** throughout the component, which keeps the 1–4 keyboard handler and the A/B/C/D labels correct with no changes.

Verified safe with no exclusion list: only 6 of 867 options contain "neither/all of the above"-style text and all 6 are semantically self-contained, no question has duplicate option text, and all 867 have exactly 4 options.

**Also repair the data**, via `scripts/content/rebalance-answers.mjs` — `/bank/*.json` is publicly fetchable and `practice.astro` emits `acceptedAnswer` in JSON-LD, so a biased bank stays externally visible no matter what the UI does. The script permutes with `shuffle(options, \`${id}:opts\`)`, rewrites `correctIndex`, bumps `contentVersion`, and **refuses** any item whose explanation contains a positional reference (`/\b(option|answer|choice)\s+[A-D]\b/i`, `/\b(first|second|third|last)\s+(option|answer|choice)\b/i`) — those need a human rewrite first.

### 7.3 Consolidate Quiz and MockExam into TestRunner

`Quiz.tsx` and `MockExam.tsx` are ~85% identical, and that duplication is the direct cause of D1: both render options independently and both got it wrong the same way. Replace with one `src/islands/TestRunner.tsx` parameterised on a `TestDefinition` — feedback timing (immediate vs deferred), navigation (forward-only vs free), timer, sub-requirement scoring.

Keep `/practice` and `/mock` as routes (they are SEO-load-bearing), rendering `TestRunner` with different definitions.

**`MockExam` must start recording per-question attempts.** It currently writes only a `MockResult`, so mock misses never reach mastery or the Challenge Bank. This is a prerequisite for §7.5, §7.6 and §7.7.

### 7.4 Fix the GA/NC variant collision (fixes D4)

`ga.json` → `["signs", "rules"]`. `nc.json` → `["rules", "signs"]`. Add to `scripts/validate-content.mjs`:

```
error if new Set(examVariants.map(v => v.variantId)).size !== examVariants.length
```

plus a unit test asserting `variantId` uniqueness across all 51 files.

### 7.5 Mastery model

`Attempt` gains a bounded rolling log:

```ts
export interface Attempt {
  questionId: string;
  category: Question['category'];
  correct: number;            // kept: lifetime totals
  incorrect: number;
  lastSeen: string;
  /** NEW: last 10 outcomes, oldest first, as "0"/"1" chars. */
  recent?: string;
  /** NEW: ISO local day per entry in `recent`, SAME LENGTH, SAME ORDER. Duplicates expected. */
  recentDays?: string[];
  /** NEW: true when `recent` was reconstructed by migration rather than observed. */
  recentSynthetic?: boolean;
}
```

`recent` and `recentDays` are **aligned parallel arrays** — index *i* of one corresponds to index *i* of the other, duplicate days are expected and meaningful, and both are truncated atomically to the last 10. A `recentDays` length that differs from `recent` is a corruption and must be treated as no history.

**Synthetic history never confers mastery.** Migration cannot reconstruct outcome order from two counters, so a backfilled `recent` could fabricate a "2 consecutive correct" that never happened. Items with `recentSynthetic: true` contribute to `strength` at reduced confidence but are **excluded from confirmed mastery** until at least two real observed answers accumulate. The safest migration leaves `recent` empty and preserves only the totals; if a backfill is done at all, the flag is mandatory.

Storing outcomes as a character string rather than a boolean array is roughly a 5× size reduction across up to 867 attempts and stays readable in an export.

**Per-question strength** — exponentially recency-weighted:

```
w_i = 0.75^(n-1-i)   over `recent`, i = n-1 newest
strength(q) = Σ(w_i · outcome_i) / Σ(w_i)
```

At λ=0.75 with a full 10-answer history the newest answer carries **26.5%** of the total weight (25% asymptotically). Starting from a history of all misses, **two consecutive correct answers move a question from 0.00 to 0.464 and three reach 0.613** — an early miss is recoverable within a session, which is the point. Ten straight correct gives exactly 1.0. These four values are exact and belong in `mastery.test.ts` as fixtures.

**Confirmed mastery** requires **2 consecutive correct on 2 distinct days**:

```ts
const isMastered = (a: Attempt): boolean =>
  a.recent!.endsWith('11') && new Set(a.recentDays!.slice(-2)).size >= 2;
```

Distinct *days* rather than "sessions" is unambiguous, cannot be gamed by refreshing, and directly encodes the distributed-practice finding — meaning mastery genuinely cannot be crammed.

**Per-category mastery** is coverage-penalised so a 3-of-18 perfect run does not read as 100%:

```
coverage    = min(1, seen / min(pool, 12))
avgStrength = mean(strength(q)) over seen
mastery(c)  = avgStrength · (0.6 + 0.4 · coverage)
```

The `0.6 + 0.4·coverage` factor is a soft penalty, not a hard one: with 1 of 18 questions seen the factor is **0.633**, so a perfect run reads as 63% rather than 100%; at 12+ seen the penalty vanishes entirely. This kills the single most misleading dashboard state — a full bar off a two-question sample — without making the early experience feel punitive.

**Shared band table**, used by mastery bars, the study gate, weak-area targeting, and readiness:

| Band | Range | Label | Token |
|---|---|---|---|
| weak | < 0.50 | Needs work | `--c-fail` |
| developing | 0.50–0.74 | Getting there | `--c-warn` |
| proficient | 0.75–0.89 | Solid | `--c-accent` |
| mastered | ≥ 0.90 | Mastered | `--c-pass` |

### 7.6 Exam readiness

The number the whole product orients around. It must be conservative — a false "you're ready" costs a real learner a real test fee.

```
categoryScore = pool-size-weighted mean of mastery(c) over the variant's categories
coverageScore = min(1, distinctQuestionsAnswered / (variant.numQuestions · 3))
mockScore     = mean of the last up-to-3 mock scores for this state, each as correct/total in [0,1]
readiness     = 0.45·categoryScore + 0.25·coverageScore + 0.30·mockScore
```

All three components are normalised to `[0,1]` — `mockScore` is a fraction, never a percentage out of 100. With no mock taken, `mockScore = 0`.

**For `testGroup` states (GA, NC) readiness is the minimum across the required variants, not the mean.** Georgia requires passing both exams, so a learner who is ready for Road Rules and weak on Road Signs is not ready. Taking the mean would tell them they are.

Weighting mocks at 0.30 with **zero** when none has been taken caps a learner who has never rehearsed the real format at 0.70 — they can never see "ready". That is intentional. Bands: `ready ≥ 0.85`, `almost ≥ 0.65`.

`examReadiness()` returns concrete `blockers`, which is what drives the UI. `StateProgress.tsx`'s 4-branch if/else is replaced entirely by "You're almost ready — 2 things left: Road signs is at 61%; you haven't passed a mock yet."

**Wire up the dead `nextWeakArea`** with a `minPool` guard (default 3), or it perpetually targets `speed-limits`, which has 1–3 questions in every state and would otherwise dominate the weakest-first sort forever. Ties break toward the larger pool. Call sites: `StateProgress`, `ProgressDashboard`, `TestRunner`'s default category, and the Challenge Bank route.

### 7.7 Persistent Challenge Bank

New `dmvp:challenge` storage root:

```ts
export interface ChallengeItem {
  id: string;                 // "q:<questionId>" | "s:<signId>"
  kind: 'question' | 'sign';
  refId: string;
  category?: Question['category'];
  stateCode?: string;
  misses: number;             // lifetime, never decremented — the priority signal
  correctStreak: number;      // consecutive correct SINCE entering the bank
  /** Bounded list of local days on which this item was answered CORRECTLY. Last 5. */
  correctDays: string[];
  addedAt: string;
  lastMissedAt: string;
  lastSeenAt: string;
  source: Array<'practice' | 'mock' | 'sign' | 'study-check'>;
  retiredAt?: string;         // set on retirement; the item is KEPT for relapse detection
}
```

**Retirement: `correctStreak >= threshold` (default 3) AND `new Set(correctDays).size >= 2`.** Three rapid correct answers in one sitting is recognition, not retention. `threshold` reads `Settings.challengeRetireThreshold`, which `docs/DATA_SCHEMA.md` already specifies and nothing implements.

**Retired items are kept, not deleted**, so an item missed again after retirement re-enters with its miss history intact and gets priority — exactly the signal a mastery loop needs. Items can legitimately cycle between retired and active indefinitely; in a spaced-repetition system that is relapse detection working, not thrashing. Growth is bounded by the corpus size.

**One write per answered question, ever.** All surfaces funnel through a single idempotent `recordActivity(event)` contract (§7.14) keyed by `{questionId, attemptId}`. Mock *completion* must not replay the answer events it already emitted, or every mock double-counts misses, XP, and streak activity.

Routes: `src/pages/challenge.astro` (global) and `src/pages/state/[code]/challenge.astro`, with `src/islands/ChallengeBankDrill.tsx` serving a **mixed** question-and-sign queue — that mixing is itself interleaved practice. Entry points from the state hub, practice results, mock results, the dashboard, and a header badge when the active count is > 0.

### 7.8 Guided study gates unlock, they do not block

Passing a unit needs **≥80% on the check AND unit mastery ≥0.75** — the second clause makes it a real mastery gate rather than one lucky run.

**Unit mastery** is defined exactly as §7.5's category mastery, computed over the unit's question pool rather than a whole category: `avgStrength · (0.6 + 0.4 · coverage)` where `coverage = min(1, seen / min(unitPool, 12))` and the pool is the questions matching the unit's `quizTags` (falling back to `quizCategories`) within the state's applicable bank.

**On failure the next unit is still clickable.** Failing routes misses into the Challenge Bank and shows "review these 3, then re-check". Hard-blocking a linear curriculum produces blocked-then-abandoned users and contradicts the interleaving evidence. Sequencing pressure — the curriculum map showing unmastered units as "needs work", and the next-best-action engine routing back to them — replaces the wall.

**Interleaving, concretely:** from unit 3 onward each check quiz composes `checkCount - 1` current-unit questions plus **1 question from a previously mastered unit**, chosen weakest-first. Textbook interleaved retrieval for one line in the pool builder.

**Thin-pool handling.** Four categories cannot support a 5-question gate at today's depth (`speed-limits` 1–3, `penalties-points` 1–2, `alcohol-drugs` 2–4, `gdl-teen` 1–6 per state). `buildCurriculum` sets `checkCount = min(lesson.checkCount, poolSize)` and marks a unit `gateable: poolSize >= 3`; units below that render the lesson and callouts, show an honest short-topic note, and auto-satisfy. **Do not fabricate a gate you cannot fill; do not block the curriculum on a content gap.** Once §2's corpus targets land, every unit is gateable — but the code must degrade honestly regardless.

### 7.9 Test variety

`src/lib/test-catalog.ts` builds a per-state catalog:

| Kind | Count | Pass | Pool |
|---|---|---|---|
| Warm-up | 10 | 70% | `easy` |
| Standard | 20 | 80% | all |
| Advanced | 20 | 85% | `medium` + `hard` |
| Topic drill × 12 | `min(10, pool)` | 80% | one category |
| Marathon | full pool | — | all, resumable |
| Simulator × variants | state's `numQuestions` | state's `numToPass` | `categoryScope` |
| Hardest | 20 | 80% | Challenge Bank first, topped up with unseen `hard` |
| Challenge Bank | up to 20 | — | active items |

≈20–21 distinct tests per state, against DMV-Written-Test.com's 26.

Two honesty rules:

- **"Hardest" must be personal.** Compose from the learner's active Challenge Bank items (most-missed first), topped up with `difficulty: 'hard'` items they have never seen. With no history it degrades to pure `hard` and **must relabel itself** — "the 20 toughest in the bank" vs "your 20 hardest". The label must not lie about which one you are getting.
- **Unavailable tests render disabled with a reason**, never hidden. "Only 1 question available for this topic yet" is a trust signal and a content-backlog signal at once.

**Marathon must be resumable.** 148 questions is a 40-minute session and an unresumable one is an abandoned one. Persist `{testId, seed, index, answers, startedAt, bankContentVersion, questionIds}` under `dmvp:session` and offer "Resume your marathon — 47 of 148". This is also the interrupted-mock recovery `docs/UX.md` §5 already specifies and nothing implements.

**Resume must be invalidated on content change.** The bank is now fetched from `/bank/<code>.json` (§7.1) and can change between sessions, so a saved positional `index` would silently map onto different questions and grade the wrong answers. Persist `bankContentVersion` **and** the resolved `questionIds[]`; on resume, if the version differs or any stored id is missing from the current bank, discard the session with an honest message ("The question bank was updated — starting a fresh marathon") rather than restoring corrupted state. Same rule for an interrupted mock.

### 7.10 Sub-section states

GA and NC do not have one exam with sub-requirements — they have **two independently scored exams**. FL/NY/VA use `subRequirements` within one exam. Both need to be representable and visibly distinct.

```ts
/** Variants sharing a testGroup are separate exams a learner must pass to be licensed. */
testGroup: z.string().optional(),
/** Restrict this variant's question pool to these categories. */
categoryScope: z.array(questionCategory).optional(),
```

GA's signs variant gets `categoryScope: ['road-signs','traffic-signals','pavement-markings']`; NC's 8-question sign test likewise. `buildMockExam` filters by `categoryScope` before quota-filling.

**The UI is the important part.** When a state has a `testGroup` with more than one variant, render two exam cards side by side with independent pass state plus a combined banner: *"Georgia requires passing BOTH. Road Signs: passed 17/20 · Road Rules: not yet attempted."* No free competitor surfaces this, and GA/NC learners are routinely blindsided by the two-test structure.

For `subRequirements` states, the results screen gets an explicit pass/fail chip per sub-requirement, and **a failed sub-requirement under a passing overall score gets a dedicated explanation**: "You scored 15/20 overall (pass), but only 1 of 4 sign questions (need 2). In New York this fails the test." Today that outcome renders as an unexplained fail.

### 7.11 Flashcards

- **Session cap** via `Settings.sessionSize` (default 20), new cards capped separately at 10. The queue is unbounded today, so day one serves ~150 cards — the classic Anki-onboarding failure.
- **True due-ordering**: sort overdue-most-first by `due` ascending, new cards last. Currently served in raw array order.
- **Explanation and citation on the reveal.** A bare correct-option string is rereading, not retrieval.
- **Sign cards show the SVG on the prompt face** — "see the sign → recall the meaning" is the direction the test asks for.
- **Seeded from misses**: Challenge Bank items enter the FSRS queue as priority-new.
- **Keyboard**: Space to reveal, 1–4 to grade, per `docs/UX.md` §4.
- **`targetRetention` finally read** and passed into `generatorParameters({ request_retention })`.

### 7.12 Cheat sheet

`src/pages/state/[code]/cheat-sheet.astro` — fully static, zero JS — plus `src/styles/print.css`.

Built entirely from typed facts and rendered nowhere today: BAC limits, point threshold, move-over rule, interstate max, school-zone speed, named laws, key GDL values, process essentials, the sign reference, and the highest-yield rules per category.

`print.css` hides header/footer/breadcrumbs/actions, forces light colours, sets `page-break-inside: avoid` per block, and expands `.gov` link hrefs. Every fact carries its `lastVerified` stamp, and a print-only footer carries the disclaimer and verification date — **a printed page outlives its source**.

### 7.13 Storage migration

Bump `SCHEMA_VERSION` to 2. Replace the `migrate()` stub with an ordered ladder:

```ts
export function migrate(input: StorageExport): StorageExport {
  let data = input;
  let version = data.schemaVersion ?? 1;
  if (version > SCHEMA_VERSION) throw new Error('Backup is from a newer version of DMV Prep.');
  while (version < SCHEMA_VERSION) { data = MIGRATIONS[version]!(data); version++; }
  return { ...data, schemaVersion: SCHEMA_VERSION };
}
```

`v1ToV2` backfills `Attempt.recent` from existing counters (marked synthetic so mastery treats it as low-confidence), seeds `recentDays` from `lastSeen`, creates an empty `ChallengeBank`, and seeds the day-log. `importAll` calls `migrate()` before merging instead of hard-rejecting.

**The day-log fixes the streak defect.** `streakDays` currently derives days from `attempt.lastSeen`, which is overwritten on every re-answer — so re-answering an old question on day 30 destroys the day-1 evidence. Replace with an append-only `GameState.dayLog`.

**`selectedState` finally persists.** Write it on the state hub; read it in `index.astro` and `states/index.astro` via a small synchronous pre-paint script to render "Continue with California →" above the picker. One field, and every returning visit skips the picker.

New export roots: `progress`, `cards`, `settings`, `challenge`, `game`, `study`, `session` — each round-trip tested.

**Import migration and on-device migration are two separate requirements.** `migrate()` above handles a `StorageExport` coming from a file. A returning user opening the upgraded app has v1 structures sitting in IndexedDB and localStorage that must be migrated in place, once, on first load — through the same migration ladder, guarded so a partial write cannot leave a half-migrated store. Both paths are tested.

### 7.14 One activity contract, defined before anything writes

Seven surfaces will eventually record activity — practice, mock, study checks, sign drills, flashcards, the challenge drill, and the marathon — and each one feeds progress, mastery, the challenge bank, the day-log, XP, streak, achievements, and the daily goal. Wiring those seven surfaces to those eight consumers directly means touching every island every time a consumer is added, and it is how double-counting bugs get in.

Define **one** contract in `src/lib/activity.ts` before any surface is wired:

```ts
export type ActivityEvent =
  | { kind: 'question-answered'; attemptId: string; questionId: string;
      category: Question['category']; correct: boolean; source: ActivitySource; stateCode?: string }
  | { kind: 'card-graded';   attemptId: string; cardId: string; grade: Grade }
  | { kind: 'unit-checked';  attemptId: string; unitId: string; stateCode: string; passed: boolean }
  | { kind: 'unit-mastered'; attemptId: string; unitId: string; stateCode: string }
  | { kind: 'mock-finished'; attemptId: string; result: MockResult };

/** Idempotent on `attemptId`: replaying an event is a no-op. */
export function recordActivity(event: ActivityEvent, now?: Date): Promise<void>;
```

`recordActivity` is the single place that updates progress, mastery history, the challenge bank, the day-log, XP, the streak, the daily goal, and achievements. **Idempotency on `attemptId` is what makes "mock completion" safe** — the finish handler emits `mock-finished` only; the per-question events were already emitted as they were answered.

This contract is order 2 in §11 precisely so gamification in order 9 is a new *consumer* rather than another edit to all seven surfaces.

---

## 8. Gamification — full, always on

XP, levels, achievements, daily goals, mastery progression, celebration, and streaks **with a freeze mechanic**. All local-only.

```ts
export interface GameState {
  xp: number;
  level: number;
  dayLog: Record<string, DayEntry>;   // also the streak source of truth
  streak: { current: number; longest: number; freezes: number; lastFreezeUsed?: string };
  achievements: Record<string, { unlockedAt: string; seen: boolean }>;
  dailyGoal: { target: number; date: string; earned: number };
}
```

### 8.1 XP rewards effort and correctness, never speed

| Action | XP |
|---|---|
| Answer a practice question | 2 |
| Answer correctly | +3 (5 total) |
| **Retire a Challenge Bank item** | **25** |
| Grade a flashcard | 3 |
| Complete a study-unit check | 30 |
| Master a study unit | 75 |
| Complete a mock exam | 40 |
| Pass a mock exam | +60 (100 total) |
| Hit the daily goal | 25 |
| Every 7 days of streak | 50 |

Three deliberate choices: **no speed bonus** (speed-rewarding gamification damages accuracy on knowledge tests); **no XP loss for a wrong answer** — the 2 XP is still paid, because punishing errors suppresses the retrieval attempts that produce learning; and **retiring a Challenge Bank item is worth 5× a correct answer**, because that is the behaviour with the strongest evidence behind it.

### 8.2 Levels

```
xpForLevel(n) = 50 · n²                        // L1=50, L2=200, L5=1250, L10=5000, L20=20000
level(xp)     = max(1, floor(sqrt(xp / 50)))   // exact inverse; verify with a round-trip test
```

Quadratic, not exponential: the curve should flatten right around where a learner becomes genuinely test-ready, because the product's job ends when they pass. Road-themed names — Learner's Permit, Student Driver, Road Ready, Highway Confident, Test Ready — so the number carries meaning.

`gamification.test.ts` must assert `level(xpForLevel(n)) === n` for n in 1..30 and `level(xpForLevel(n) - 1) === n - 1` for n in 2..30. (The naive `floor(sqrt(xp/50)) + 1` is **not** the inverse of `50n²` — it is off by one at every threshold.)

### 8.3 Daily goal

The goal is **one normalised progress number**, not an OR across incommensurable units. Define goal-credits:

```
credits = answers + (flashcards · 1.33) + (studyUnitsCompleted · 20)
target  = 20 credits (default)
```

so 20 answers, 15 flashcards, or 1 study unit each independently satisfy it, and mixed activity accumulates sensibly. `dailyGoal.earned` holds credits, `dailyGoal.target` holds the threshold.

Adaptive to `dayLog` (rises toward a 7-day average), **never above 50, never below 10**. An adaptive goal with no ceiling ratchets into a burnout loop for the most engaged users.

### 8.3.1 Local time is a dependency, not an afterthought

Every day-boundary rule here — the day-log key, the streak, "a session started before local midnight counts for that day", `recentDays`, `correctDays` — is defined in the **learner's local timezone**. `new Date().toISOString().slice(0,10)` returns a **UTC** date and will silently misattribute activity for most of the world and around DST transitions.

Introduce `src/lib/day.ts` with `localDayKey(date, tz?)` and inject it everywhere a day key is produced. `gamification.test.ts` must cover a UTC-negative offset (a 9pm local answer that is already tomorrow in UTC) and a DST transition day.

### 8.4 Streaks with forgiveness

- A day counts on **real activity** — ≥5 answers, or ≥5 flashcards, or 1 study unit. Not merely opening the app.
- **Start with 2 freezes, earn 1 per 7 consecutive days, cap 3.** A missed day auto-consumes one and the UI says so plainly: *"You missed Tuesday. A streak freeze covered it. 1 freeze left."*
- Day boundary is local midnight, and a session started before midnight counts for that day.
- **On a genuine break, show the longest streak, not zero** — "Your best streak: 12 days. Let's start a new one." A hard reset to 0 with the previous number erased is the most abandonment-inducing pattern in this category.
- **No loss framing for the streak itself.** "Keep it going", never "you're about to lose your streak", and never a countdown pressuring a session before midnight. Reporting a freeze that was spent ("a streak freeze covered it, 1 left") is a factual status message, not a scarcity prompt — it is the one place a decrement is stated, and it is stated after the fact rather than as a threat.

### 8.5 Achievements (~20)

*Progression:* First Answer · Century (100 answers) · Thousand · Level 5 · Level 10
*Mastery:* Topic Mastered (any category ≥0.90) · Sign Reader · All Topics Proficient (every category ≥0.75) · Curriculum Complete
*Resilience:* Comeback (retire 10 bank items) · Persistent (retire an item missed 3+ times) · No Weak Spots (bank emptied after ≥50 items)
*Rehearsal:* First Mock · Mock Passed · Consistent (3 passed in a row) · **Both Tests (GA/NC — pass both exams in the group)**
*Rhythm:* 3-day · 7-day · 30-day streak · Spaced Learner (flashcards on 10 distinct days)

Deliberately absent: anything for answering fast, for a long single session, or for a perfect run a lucky guess could produce. Locked achievements show greyed **with their criteria stated** — a visible goal motivates, a mystery box does not.

### 8.6 Celebration never interrupts

`src/islands/GameHud.tsx` (level ring, XP-to-next, streak, daily-goal ring) appears in the header **on study routes only**. `src/islands/AchievementToast.tsx` queues, auto-dismisses in 4s, is dismissible, and is `aria-live="polite"`. XP animates inline on results screens, **never as a blocking modal and never mid-question**. All animation respects `prefers-reduced-motion`, which the codebase already honours at `global.css:310`. `src/pages/achievements.astro` is the trophy case.

### 8.7 The non-negotiable constraint

**XP and level measure effort. Readiness measures preparedness. They diverge** — a learner can grind to Level 10 while `road-signs` sits at 55%. **Every screen that shows a level must show readiness with equal or greater prominence.** If someone walks into the DMV because they hit Level 10, the gamification has actively harmed them.

Related: **never gate questions behind levels.** Unlock cosmetics and badges only. Locking practice behind XP would make a free product worse than the free competitors on the axis that matters.

### 8.8 Positioning change

`src/pages/index.astro:26` currently markets **"no streak pressure"** as a feature. That is now a direct contradiction of shipped behaviour and would read as a broken promise. Replace it, leading with the forgiveness mechanic — which is what makes always-on streaks defensible and is a genuine differentiator against Zutobi's paid gamification:

> "Your streak, XP, and badges track real progress — with streak freezes so one busy day never erases your work."

---

## 9. Verification pipeline

### 9.0 What "verified" is allowed to mean

The bar is **100% independent cross-model review of every human-authored item, plus source verification of every typed fact**. State it that way in the UI and the docs. It is not the same as "a human checked every question against the statute", and the product must not imply that it is.

Concretely, what each artifact class gets:

| Artifact | Bar |
|---|---|
| ~1,600 typed facts | **Source-verified against an authoritative citation, 100%.** Nothing generates from a fact below `confidence: 'verified'` |
| Exam formats, thresholds, `subRequirements`, `categoryScope` | **Source-verified, 100%** — these decide pass/fail advice |
| T1 + T3 (~3,735 human-authored items) | **Independent cross-model review, 100%**, with a different-lab reviewer |
| T2 (3,570 generated) | **The 45 templates are reviewed once each**, plus every distinct fact value they consume and a deterministic-output invariant check. Re-reviewing 3,570 mechanical instantiations of 45 reviewed templates buys nothing |
| Lessons, state notes, sign metadata | Independent cross-model review, 100% |
| Everything flagged, and a risk-stratified sample | **Human review** |

The T2 rule is what makes the volume tractable: ~3,735 items at 25 per batch is ~150 review batches, not 293.

### 9.1 Authoring loop

`scripts/content/author-batch.mjs --state WA --category parking --count 8` loads the state's typed facts and citations, the target category's existing prompt fingerprints **across all states**, and the T1 bank. It prompts with the taxonomy, tag vocabulary, style rules from `docs/CONTENT_STRATEGY.md` §3, a banned-phrase list, and "nothing within Jaccard 0.6 of these". Output is `reviewStatus: 'draft'`.

It then runs `dedupe-report.mjs` on the batch and **rejects collisions before they reach the repo**. Today's 6 exact groups and 38 near-duplicate pairs exist precisely because authoring had no visibility into the rest of the bank; at 8× scale that failure mode is fatal.

### 9.2 Cross-lab verification

- **Author lab:** Anthropic.
- **Verifier lab, 100% of human-authored items:** OpenAI via `codex_reviewer`, batches of 25 at high effort. Brief: re-derive the answer from the cited source, try to prove the marked answer wrong, flag state exceptions, flag close paraphrase, flag ambiguous distractors. **The batch payload includes the cited source excerpt** — a reviewer that cannot reach the citation cannot verify it, and government sites are frequently unreachable from automation.
- **Third lab:** Google via `gemini_reviewer` on a 10% stratified sample plus 100% of anything flagged.
- **Verdict schema is fixed** (`{questionId, verdict: 'confirmed'|'wrong-answer'|'ambiguous'|'not-universal'|'paraphrase-risk'|'uncheckable', note}`) and every non-`confirmed` verdict blocks the item until resolved. Disagreement between labs escalates to human review; it never resolves by majority.
- **Attestation:** hash each batch artifact and run `mcp__orchestrate__attest_step`. **Be precise about what this proves**: it proves a different-lab reviewer signed off on *the same bytes* that shipped. It does not prove the reviewer could reach the statute, or checked every item substantively. It is a tamper and staleness check, not an epistemic guarantee — which is why the `uncheckable` verdict exists and why facts get independent source verification.
- Verdicts (not source text) land in `src/content/audits/verify/<batchId>.json`.

**If the reviewer tooling, credentials, or network are unavailable at build time, items stay `draft` and the build fails.** The pipeline must never stamp `reviewStatus: 'adversarially-verified'` on content no reviewer actually saw — that is the single worst failure mode available here, because it launders unverified content as verified in a product people rely on to pass a real test.

New provenance fields:

```ts
verifiedBy: z.string().optional(),            // model id
verifiedAt: isoDate.optional(),
verificationAuditId: z.string().optional(),   // -> audits/verify/<batchId>.json
```

Refinement: `reviewStatus !== 'draft'` requires all three, **and** `content-integrity.test.ts` asserts the item's content hash appears in that audit file with a `confirmed` verdict. Without the hash linkage the stamps are unfalsifiable decoration. `draft` is a hard CI failure on `main`.

### 9.3 Copyright gate

`dedupe-report.mjs --against-cache` computes 6-gram shingle overlap of our prose against the transient source text held in `scripts/.cache/` (already gitignored) during the authoring session.

A 6-word run is a **review trigger, not an automatic failure**. Unavoidable legal formulations collide innocently — "yield the right of way to", "blood alcohol concentration of", "unless otherwise posted", statute titles, defined terms. Maintain an exclusion list of such phrases, fail automatically at **10+ consecutive words**, and route 6–9-word runs to human review. A blunt hard-fail at 6 trains authors to paraphrase around correct legal language, which makes the content worse.

The cache is deleted at session end; only the score is recorded.

### 9.4 Real `sourceSnapshotHash`

All 51 states currently ship the placeholder `"seed-pending-verification"`, so drift monitoring is inert.

`scripts/content/fetch-sources.mjs`:
1. Fetch `handbookPdfUrl` or the landing HTML.
2. **Extract text first, then hash.** Hashing raw PDF bytes is useless — PDFs embed creation timestamps and object ordering, so the hash churns on every re-render and the drift signal becomes noise you learn to ignore. **`scripts/check-links.mjs` has this same latent bug and must share the new normaliser.**
3. Normalise: lowercase, collapse whitespace, strip page numbers, headers, URLs.
4. sha256 → `src/content/sources/<code>.sources.json`.
5. Write the handbook hash into `states/<code>.json`.
6. Never persist the source text.

Also fix the identical-`lastVerified` smell **at its cause, not its symptom**: set `lastVerified` per state at the moment that state is actually re-verified, and set `effectiveDate` to the **cited rule's** effective date rather than the fetch date. All 867 items currently claim 2026-07-24 for both, which is false provenance in a citation-heavy product. Do **not** assert a minimum number of distinct dates — a legitimate single-pass verification may truthfully verify many jurisdictions on one day, and a test demanding variety would reward backdating, which is the exact dishonesty the field exists to prevent.

**Snapshot what the facts actually cite.** Since §1.1 makes statutes the primary citation for numeric facts, hashing only the handbook will miss the drift that matters. `fetch-sources.mjs` records a normalised text hash for **every distinct URL referenced by a typed fact or a question citation**, not just `handbookPdfUrl`.

---

## 10. Content-integrity test suite

New files in `tests/unit/`, node env, reading JSON from disk with `fs` and importing shared primitives from `scripts/content/lib/*.mjs` — matching the existing `redesign-acceptance.test.ts` and `states-directory.test.ts` pattern, since `astro:content` is unavailable in vitest.

| File | Key assertions |
|---|---|
| `content-integrity.test.ts` | exactly 4 distinct options; valid `correctIndex`; ≥1 citation with a real section id; **no item ships as `draft`**; non-draft items record `verifiedBy` and `verifiedAt`; globally unique ids |
| `content-answer-distribution.test.ts` | every position 20–30% globally; χ² < 11.34 (df=3, p=0.01); no state pool >35% on one position; no category >40%; **longest-option-correct rate ≤30%**. *No run-length assertion* — across ~7,000 independently balanced values, runs of five are expected, so a "no run of >4" rule would fail legitimate output or push authors to manipulate file order |
| `content-duplicates.test.ts` | **Scoped to questions coexisting in the same effective state pool.** No two same-pool questions share a normalised prompt (jurisdiction names stripped before shingling, so "roundabout in Utah" collides with the national item); no same-pool pair above Jaccard 0.70; no state question that is a national one with the state name injected. Cross-state similarity among deterministic T2 siblings is **reported, never failed** (§4.6). Candidate pairs come from a MinHash/inverted-index stage — a naïve all-pairs loop over 7,000 items is ~24.8M comparisons |
| `content-facts-consistency.test.ts` | generated files byte-identical to a fresh regeneration (§4.5); **every question's declared `claims[]` match its state's typed facts** — declared, not inferred, because a bare number extractor cannot tell whether `20` is mph, feet, an age, dollars, points, or a distractor; every fact consumed by a template is `confidence:'verified'`; the template allocation table sums to the per-category T2 targets |
| `content-coverage.test.ts` | **≥500 applicable questions per state**; **≥25 per category per state**; tier minimums hold; per-category column arithmetic matches the §2.1 table; **sub-requirements satisfiable 5× over** (NY needs ≥20 road-signs items to vary a 4-question draw); every `stateExceptions` entry has a `replacesQuestionId` covering it |
| `content-signs.test.ts` | every `imageAsset` resolves to a sign id; every asset exists on disk and matches its recorded sha256; **alt text never contains the sign name**; every `sign-identify` item has an image **and a text-answerable counterpart covering the same sign**; ≥140 signs; every MUTCD-coded sign recorded public domain with a source; the manifest is not inside a loaded collection directory |
| `content-universality.test.ts` | national items declare a `universality.basis`; **no legal-rule item claims `concept-only`**; prompt, all options and explanation contain no jurisdiction name and no state-variable quantity; every `typedFacts` key maps to a lint pattern or an explicit exemption; sweep-based items have a ledger covering all 51 with `stateExceptions` matching the ledger's exceptions |
| `content-lessons.test.ts` | all **35** units present (5+3+5+3+4+2+3+4+2+2+2); unique `unitId`; contiguous module order; every `factCallouts` key exists in the typed-facts schema; **every `quizTags` value matches ≥8 questions in every state**; national bodies state-neutral; every state note cites a source and references a real `unitId` |
| `content-provenance.test.ts` | no state still carries `seed-pending-verification`; every recorded hash backed by a sources file; **every non-draft item's content hash appears in a passing audit file**; `effectiveDate` never later than `lastVerified` |
| `options.test.ts` | correct answer text survives permutation over all real questions; **stable for a fixed seed**; **statistically diverse across many seeds** (not "every seed pair differs" — with 24 permutations, two seeds legitimately collide); near-uniform correct position over the real bank; `displayToStored` round-trips |
| `mastery.test.ts` | recovers from an early miss within three correct; weights the most recent answer most; **same-day "11" is NOT mastered**; thin coverage penalised; `nextWeakArea` never returns an empty-pool category; **readiness capped below "ready" with zero mocks** |
| `challenge.test.ts` | aggregates misses across practice, mock and sign drills; retires only after threshold correct across two distinct days; **does not retire on a same-day streak**; relapse resets the streak and un-retires while preserving miss history; prioritises most-missed |
| `test-catalog.test.ts` | produces a buildable catalog for all 51 states; marks thin-pool drills unavailable with a reason; **GA signs and rules variants scope to disjoint pools**; requires both GA exams for group completion; hardest-mode degrades and relabels with no miss data; **exam variant ids unique in every state** |
| `gamification.test.ts` | no XP bonus for speed and no penalty for a wrong answer; level curve monotonic; a freeze covers one missed day and decrements; exhausted freezes break the streak but preserve `longest`; a session spanning local midnight counts for the start day; achievements unlock exactly once; daily goal stays within [10, 50] |
| `storage.test.ts` (extend) | v1→v2 backfill preserves counters; unknown-future version rejected with a clear message; migrated v1 export round-trips; **day-log streak survives a re-answer of an old question**; `selectedState` round-trips |

**Today's corpus fails answer-distribution, duplicates, coverage, signs and provenance. That is the point** — these tests encode the definition of done.

New npm scripts: `content:generate`, `content:generate:check`, `content:dedupe`, `content:report`, `content:sources`, `signs:fetch`. CI runs `content:generate:check` before `npm test`.

---

## 11. Build order

**This is a dependency graph, not a set of separately shippable phases.** Everything below lands in one change. The order matters because several sequences that look natural cause thousands of rows of rework: authoring questions before the tag vocabulary exists means re-tagging them all; authoring sign questions before sign ids exist means `imageAsset` cannot be filled; adding gamification after seven surfaces are wired means editing all seven again.

| Order | What | Why it must be here |
|---|---|---|
| **1** | **Contracts and acceptance first.** Schema changes (`tags`, `claims`, `universality`, `verifiedBy`/`verifiedAt`/`verificationAuditId`, `FactState`); the **tag vocabulary and lesson bindings** (§5.3); GA/NC `variantId` fix, `testGroup`, `categoryScope`; the sign id list; the template allocation table; and the acceptance tests that encode all of it | Everything downstream is authored against these. Defining them late guarantees a rewrite pass |
| **2** | **Runtime contracts.** `options.ts`; `TestRunner` consolidation; `/bank/*.json` endpoints with base-path handling, versioning and precache exclusion; storage v2 + live and import migration; **`recordActivity` (§7.14)** | The bank cannot grow while inlined in HTML. `recordActivity` must exist before any surface writes, or every consumer added later means re-editing every surface |
| **3** | **Pipeline tooling.** `fetch-sources.mjs`, `migrate-facts.mjs`, `generate-templated.mjs`, `rebalance-answers.mjs`, `dedupe-report.mjs` (MinHash), `universality-sweep.mjs`, `author-batch.mjs`, `verify-batch.mjs` | Verification tooling must exist **before** the first authored batch, not after. Authoring thousands of rows and then discovering the reviewer is unreachable is the worst possible ordering |
| **4** | **Typed facts ×51, source-verified**, plus exam formats and thresholds | Templates, lessons, cheat sheets and T2 all consume these |
| **5** | **Sign manifest, ids, and ~140 assets** | T1 road-sign questions reference sign ids; referential integrity is a gate, so ids must exist first |
| **6** | **Repair the existing 867 items** into their final T1/T3 homes: rebalance positions, rewrite long-answer distractors, delete duplicates | Doing this before the tier assignment is known would mean redoing it |
| **7** | **Author T1, generate T2, author T3** — in category batches, with final tags and image ids, **each batch verified before the next** | Batch-then-verify keeps a systematic authoring flaw from replicating across thousands of rows |
| **8** | **Lessons and state notes** against the completed taxonomy and question pools | `quizTags` must match ≥8 questions per state, which requires the pools to exist |
| **9** | **Mastery, challenge bank, test catalog, study routes, flashcards, cheat sheet** | All consume `recordActivity` and the finished corpus |
| **10** | **Gamification** as a new consumer of `recordActivity` | Wraps the pedagogy; wrapping something unfinished produces a game with no substance under it |
| **11** | Flip every coverage floor from warn to fail; add `content:report` to the monthly `link-check.yml` | Final gate |

### 11.1 Definition of done

- All 51 jurisdictions at **≥500 applicable questions** and **≥25 per category**.
- The full `content-*` and new unit test suite green.
- Curriculum rendering for all 51 states; ~140 signs wired with images on `sign-identify` questions.
- Gamification live; `index.astro:26` copy corrected.
- `npm run check && npm run validate:content && npm test && npm run build && npx playwright test` all green, including the axe sweep, with at least one Playwright case exercising the configured non-root base path.
- `dist/state/wa/practice/index.html` under ~50 KB.

**Complete implementation of this document is the acceptance bar.** There is no reduced scope that counts as success.

**If the run cannot reach that bar, the two rules below are absolute, and they are not an invitation to stop early:**

1. **Never fake completion.** Do not stamp `reviewStatus` on unreviewed content, do not fabricate citations, do not weaken a test to make it pass, do not lower a floor to meet it, and do not mark a section done that is not. A smaller honest change is recoverable; a large change that lies about its provenance is worse than no change at all, because this product's entire value is that a learner can trust it.
2. **Report the gap precisely.** State which sections are complete, which are partial, which are untouched, and why — in the PR description, item by item against this document's section numbers.

Work the §11 order top to bottom. It is arranged so that whatever is finished is internally consistent and independently correct: contracts before consumers, tooling before content, facts before templates, sign ids before sign questions, verification before every authored batch.

---

## 12. Explicitly forbidden

- Hand-authoring 500 × 51 items.
- Fixing the answer-position bias only at render time.
- Interpolating state facts into Markdown lesson bodies.
- `imageAsset` as a raw path rather than a sign id.
- Deriving any numeric fact from an **uncited** source. (Reading a fact *out of* the California handbook or any `unknown`-status handbook is fine — facts are not copyrightable. Copying its **wording** is not.)
- Hashing raw PDF bytes for `sourceSnapshotHash`.
- Keeping free-text `facts` as the source of truth.
- Letting `effectiveDate` mean "the day we fetched it".
- **Committing, publishing, redistributing, or retaining** handbook text or PDFs. Transient fetching and text extraction for the §9.3 copyright gate and §9.4 source hashing are required and explicitly permitted; the cache is deleted at session end and never enters the repository.
- Claiming "real exam questions".
- Accounts, backends, or leaderboards.
- Gating questions behind XP or levels.
- Fabricating a mastery gate for a category that lacks the questions to fill it.

---

## 13. Reproducing the audit

```bash
# questions per file
for f in src/content/questions/*.json; do printf "%s\t%s\n" "$(basename $f .json)" "$(jq length $f)"; done

# answer-position bias
jq -r 'if type=="array" then .[] else . end | .correctIndex' src/content/questions/*.json | sort -n | uniq -c

# longest-option-correct rate
jq -r 'if type=="array" then .[] else . end | ([.options[]|length]) as $L
  | [($L|max), (.options[.correctIndex]|length), ([$L[]|select(.==($L|max))]|length)] | @tsv' \
  src/content/questions/*.json \
  | awk '{n++; if($1==$2 && $3==1) s++} END{printf "%d/%d (%.1f%%)\n", s, n, 100*s/n}'

# exact duplicate prompts
jq -r 'if type=="array" then .[] else . end | .prompt' src/content/questions/*.json \
  | tr 'A-Z' 'a-z' | sed 's/[^a-z0-9 ]//g' | tr -s ' ' | sort | uniq -c | sort -rn | awk '$1>1'

# duplicate exam variant ids
for f in src/content/states/*.json; do jq -r 'if ([.examVariants[].variantId]|length) != ([.examVariants[].variantId]|unique|length) then .code else empty end' "$f"; done

# placeholder provenance
jq -r '.sourceSnapshotHash' src/content/states/*.json | sort | uniq -c

# questions carrying an image
jq -r 'if type=="array" then .[] else . end | (.imageAsset//"none")' src/content/questions/*.json | sort | uniq -c

# built page weight
ls -la dist/state/wa/practice/index.html
```
