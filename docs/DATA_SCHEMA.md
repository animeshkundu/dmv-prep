# Data Schema - DMV Prep

Human-readable reference for every content collection and every client-side stored shape. The authoritative schema of record is the Zod definition in [`src/content.config.ts`](../src/content.config.ts); this document explains each field and gives example JSON. If the two ever disagree, the Zod file wins and this doc is fixed.

- Related: [Content Strategy](./CONTENT_STRATEGY.md) · [Architecture](./ARCHITECTURE.md) · [Maintenance](./MAINTENANCE.md)

---

## Shared primitives

- **State codes** (`stateCode`): the 51 jurisdictions `AL, AK, AZ, AR, CA, CO, CT, DE, DC, FL, GA, HI, ID, IL, IN, IA, KS, KY, LA, ME, MD, MA, MI, MN, MS, MO, MT, NE, NV, NH, NJ, NM, NY, NC, ND, OH, OK, OR, PA, RI, SC, SD, TN, TX, UT, VT, VA, WA, WV, WI, WY`.
- **ISO date** (`isoDate`): string matching `YYYY-MM-DD`.
- **Question categories** (`questionCategory`): `road-signs, traffic-signals, pavement-markings, right-of-way, parking, speed-limits, alcohol-drugs, sharing-the-road, safe-driving, traffic-laws, penalties-points, gdl-teen`.

### `reference` (citation)

| Field | Type | Required | Meaning |
|---|---|---|---|
| `label` | string | yes | Human label, e.g. "CA Driver Handbook §Speed Limits" |
| `citation` | string | yes | Specific section/statute id, e.g. `CA DL 600 §4` or `VC §22350` |
| `url` | string (URL) | no | Link to the source |

### `provenance` (mixed into questions and states)

| Field | Type | Required | Meaning |
|---|---|---|---|
| `references` | `reference[]` | yes, >=1 | Citations; build fails if empty |
| `effectiveDate` | isoDate | yes | When the cited rule took effect |
| `expiryDate` | isoDate | no | Known expiry, if any |
| `sourceSnapshotHash` | string (>=8) | no | SHA-256 of the fetched source, for drift detection |
| `reviewStatus` | enum | default `draft` | `draft` \| `adversarially-verified` \| `human-spot-checked` |
| `lastVerified` | isoDate | yes | Drives "verified as of" + re-audit |
| `contentVersion` | int >=0 | default `1` | Bumped on material change |

---

## Collection: `states`

Loaded from `src/content/states/**/*.json`. One file per jurisdiction: metadata, exam variants, GDL, process, facts, plus provenance.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `code` | stateCode | yes | Jurisdiction code |
| `name` | string | yes | Full name |
| `agencyName` | string | yes | Real agency name (e.g. "California Department of Motor Vehicles") |
| `agencyShort` | string | yes | Short form (DMV / DPS / SOS / PennDOT / MVA / BMV / DDS / FLHSMV / DOL …) |
| `officialSiteUrl` | URL | yes | Official agency homepage |
| `handbookLandingUrl` | URL | yes | Handbook landing page |
| `handbookPdfUrl` | URL | no | Direct PDF if available |
| `handbookFormat` | enum | yes | `pdf` \| `html` \| `mixed` |
| `handbookEditionYear` | int >=2018 | yes | Handbook edition year |
| `handbookCopyrightStatus` | enum | default `unknown` | `public-domain` \| `copyright-retained` \| `terms-of-use` \| `unknown` |
| `handbookTermsUrl` | URL | no | Terms-of-use page (source-rights matrix) |
| `applicantVariants` | `applicantVariant[]` | yes, >=1 | `{ id, label }` per applicant type (e.g. adult, under-18) |
| `examVariants` | `examVariant[]` | yes, >=1 | Exam rules as variants (below) |
| `retake` | object | no | `maxAttemptsBeforeExtraReq?`, `waitBetweenAttempts?`, `attemptCapPeriod?`, `retakeFee?` |
| `gdl` | object | yes | GDL/eligibility (below) |
| `process` | object | yes | "Get your permit" data (below) |
| `facts` | object | no | State-variable facts (below) |
| _provenance_ | see above | yes | `references`, dates, `reviewStatus`, etc. |

### `examVariant`

| Field | Type | Required | Meaning |
|---|---|---|---|
| `variantId` | string | yes | Matches an `applicantVariant.id` where relevant |
| `label` | string | yes | e.g. "Adult (18+) Class C knowledge test" |
| `numQuestions` | int >0 | yes | Total questions |
| `numToPass` | int >0 | yes | Passing count |
| `timeLimitMinutes` | int >0 | no | Time limit if any |
| `subRequirements` | array | no | `{ category, minCorrect, outOf, note? }` - e.g. NY 2-of-4 signs |
| `languages` | string[] | default `['en']` | Offered languages |
| `onlineAvailable` | boolean | default `false` | Whether the test can be taken online |

### `gdl`

`permitMinAge` (string, required - string allows "15 yrs 6 mo"), `provisionalMinAge?`, `fullLicenseMinAge?`, `permitHoldingPeriod?`, `supervisedHoursRequired?`, `nightHoursRequired?`, `nightCurfew?`, `passengerLimits?`, `driverEdRequired?` (boolean).

### `process`

`appointmentRequired` (enum: `required` \| `encouraged` \| `walk-in` \| `varies`), `schedulingUrl?`, `requiredDocuments` (string[], >=1), `realIdNotes?`, `permitFee?`, `licenseFee?`, `feesUrl?`, `visionTestRequired` (default true), `visionStandard?`.

### `facts`

Optional: `bacLimitAdult?`, `bacLimitCommercial?`, `bacLimitUnder21?`, `pointSystem?` (bool), `pointSuspensionThreshold?`, `moveOverRule?`, `interstateMaxSpeed?`, `schoolZoneSpeed?`, `namedLaws?` (string[]).

### Example `states/ny.json`

```json
{
  "code": "NY",
  "name": "New York",
  "agencyName": "New York State Department of Motor Vehicles",
  "agencyShort": "DMV",
  "officialSiteUrl": "https://dmv.ny.gov/",
  "handbookLandingUrl": "https://dmv.ny.gov/driver-license/drivers-manual-practice-tests",
  "handbookFormat": "html",
  "handbookEditionYear": 2024,
  "handbookCopyrightStatus": "terms-of-use",
  "handbookTermsUrl": "https://dmv.ny.gov/terms",
  "applicantVariants": [
    { "id": "standard", "label": "Standard applicant" }
  ],
  "examVariants": [
    {
      "variantId": "standard",
      "label": "Class D knowledge test",
      "numQuestions": 20,
      "numToPass": 14,
      "subRequirements": [
        { "category": "road-signs", "minCorrect": 2, "outOf": 4,
          "note": "Must answer at least 2 of 4 sign questions correctly." }
      ],
      "languages": ["en", "es"],
      "onlineAvailable": false
    }
  ],
  "gdl": {
    "permitMinAge": "16",
    "provisionalMinAge": "16 yrs 6 mo",
    "fullLicenseMinAge": "18",
    "supervisedHoursRequired": "50 (15 at night)"
  },
  "process": {
    "appointmentRequired": "varies",
    "requiredDocuments": ["Proof of identity (6 points)", "Proof of NY residency"],
    "realIdNotes": "REAL ID and Enhanced options require additional documents.",
    "permitFee": "$? (verify)",
    "visionTestRequired": true
  },
  "facts": {
    "bacLimitAdult": "0.08%",
    "bacLimitUnder21": "0.02% (Zero Tolerance)",
    "pointSystem": true
  },
  "references": [
    { "label": "NY Driver's Manual - The Written Test",
      "citation": "NY MV-21 Ch.1", "url": "https://dmv.ny.gov/" }
  ],
  "effectiveDate": "2024-01-01",
  "sourceSnapshotHash": "e3b0c44298fc1c14…",
  "reviewStatus": "adversarially-verified",
  "lastVerified": "2026-07-24",
  "contentVersion": 1
}
```

---

## Collection: `questions`

Loaded from `src/content/questions/**/*.json` (a file may hold one object or an array). Original, handbook-grounded items; national shared + per-state.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Unique id, e.g. `q-ny-signs-004` |
| `category` | questionCategory | yes | Topic |
| `stateScope` | `"all"` or `stateCode[]` (>=1) | yes | `"all"` only after confirming no exception; else explicit codes |
| `stateExceptions` | stateCode[] | no | States that override/exclude a shared item |
| `applicantVariants` | string[] | no | Applicant ids this item applies to |
| `prompt` | string | yes | Question text |
| `imageAsset` | string | no | Sign SVG id for road-sign questions |
| `options` | string[] (2-6) | yes | Answer choices |
| `correctIndex` | int >=0 | yes | Index into `options`; refined to be `< options.length` |
| `explanation` | string | yes | Why the answer is correct |
| `difficulty` | enum | default `medium` | `easy` \| `medium` \| `hard` |
| `languages` | string[] | default `['en']` | Available languages |
| _provenance_ | see above | yes | Citations, dates, `reviewStatus`, etc. |

### Example question

```json
{
  "id": "q-all-rightofway-012",
  "category": "right-of-way",
  "stateScope": "all",
  "stateExceptions": [],
  "prompt": "At a four-way stop where two vehicles arrive at the same time, who goes first?",
  "options": [
    "The vehicle on the left",
    "The vehicle on the right",
    "The larger vehicle",
    "Whoever honks first"
  ],
  "correctIndex": 1,
  "explanation": "When two vehicles reach a four-way stop at the same time, the driver on the left yields to the driver on the right.",
  "difficulty": "easy",
  "languages": ["en"],
  "references": [
    { "label": "Right-of-way at intersections", "citation": "UVC §11-403" }
  ],
  "effectiveDate": "2025-01-01",
  "reviewStatus": "adversarially-verified",
  "lastVerified": "2026-07-24",
  "contentVersion": 1
}
```

> `stateScope: "all"` here asserts this rule was confirmed to hold in all 51 jurisdictions. If a state differed, it would move to `stateExceptions` with a per-state replacement item.

---

## Collection: `lessons`

Loaded from `src/content/lessons/**/*.md` (Markdown body + frontmatter).

| Field | Type | Required | Meaning |
|---|---|---|---|
| `title` | string | yes | Lesson title |
| `category` | questionCategory | yes | Topic grouping |
| `stateScope` | `"all"` or `stateCode[]` | default `"all"` | Applicability |
| `summary` | string | yes | One-line summary |
| `order` | int >=0 | default `0` | Sort order within a category |
| `references` | `reference[]` | default `[]` | Citations for any claims |
| `lastVerified` | isoDate | yes | Freshness stamp |
| `contentVersion` | int >=0 | default `1` | Version |

### Example `lessons/right-of-way.md`

```markdown
---
title: "Right-of-way basics"
category: "right-of-way"
stateScope: "all"
summary: "Who yields at intersections, roundabouts, and to pedestrians."
order: 3
references:
  - { label: "Right-of-way", citation: "UVC §11-401" }
lastVerified: "2026-07-24"
contentVersion: 1
---

Right-of-way is something you *give*, not something you take. ...
```

---

## Collection: `signs`

Loaded from `src/content/signs/**/*.json`. Road-sign trainer metadata; SVG assets live in `public/` or `src/content/signs`.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Unique id |
| `name` | string | yes | Sign name |
| `category` | enum | yes | `regulatory` \| `warning` \| `guide` \| `construction` \| `marking` |
| `asset` | string | yes | Path to SVG (base-aware at render) |
| `meaning` | string | yes | What it means |
| `mutcdCode` | string | no | MUTCD code (largely public domain; verify) |
| `stateScope` | `"all"` or `stateCode[]` | default `"all"` | Applicability |
| `references` | `reference[]` | default `[]` | Citations |
| `lastVerified` | isoDate | yes | Freshness stamp |

### Example sign

```json
{
  "id": "sign-r1-1-stop",
  "name": "Stop",
  "category": "regulatory",
  "asset": "/signs/r1-1-stop.svg",
  "meaning": "Come to a complete stop, yield to traffic and pedestrians, then proceed when safe.",
  "mutcdCode": "R1-1",
  "stateScope": "all",
  "references": [{ "label": "MUTCD Regulatory Signs", "citation": "MUTCD §2B.05" }],
  "lastVerified": "2026-07-24"
}
```

---

## Client-side stored user data

Not in the content schema (this is runtime, on-device state). Progress/SRS/history live in **IndexedDB** via `idb-keyval`; settings in **localStorage**; the whole set is exportable/importable as JSON. Every stored root carries a `schemaVersion`.

Keys use a `dmvp:` namespace (matching the existing `dmvp:theme`).

### Settings (localStorage)

```json
{
  "schemaVersion": 1,
  "theme": "dark",
  "stateCode": "CA",
  "language": "en",
  "sessionSize": 20,
  "challengeRetireThreshold": 3,
  "consent": { "analytics": true, "setAt": "2026-07-24T00:00:00Z" }
}
```

| Field | Meaning |
|---|---|
| `theme` | `light` \| `dark` (also mirrored to `dmvp:theme` for pre-paint init) |
| `stateCode` | last-chosen state, so returning users skip the picker |
| `language` | UI/content language where available |
| `sessionSize` | flashcard/practice session cap |
| `challengeRetireThreshold` | correct-streak needed to retire a Challenge Bank item |
| `consent` | analytics consent state backing the banner |

### Progress (IndexedDB)

```json
{
  "schemaVersion": 1,
  "byState": {
    "CA": {
      "mastery": { "road-signs": 0.82, "right-of-way": 0.6 },
      "streakDays": 5,
      "lastStudied": "2026-07-24",
      "challengeBank": [
        { "questionId": "q-ca-speed-003", "misses": 2, "correctStreak": 0 }
      ]
    }
  }
}
```

### FSRS card state (IndexedDB)

One entry per reviewable unit; the `ts-fsrs` `Card` fields plus our linkage.

```json
{
  "schemaVersion": 1,
  "cards": {
    "sign-r1-1-stop": {
      "cardId": "sign-r1-1-stop",
      "source": { "kind": "sign", "id": "sign-r1-1-stop" },
      "due": "2026-07-28T00:00:00Z",
      "stability": 12.4,
      "difficulty": 5.1,
      "elapsed_days": 3,
      "scheduled_days": 4,
      "reps": 5,
      "lapses": 1,
      "state": "Review",
      "last_review": "2026-07-24T00:00:00Z"
    }
  }
}
```

| Field | Meaning |
|---|---|
| `cardId` / `source` | our id + which content item the card reviews |
| `due` | next review time; a session serves `due <= now` |
| `stability` / `difficulty` | FSRS memory model parameters |
| `elapsed_days` / `scheduled_days` | timing bookkeeping |
| `reps` / `lapses` | successful reviews / forgets |
| `state` | FSRS state (`New` / `Learning` / `Review` / `Relearning`) |
| `last_review` | timestamp of the last grade |

### Mock history (IndexedDB)

```json
{
  "schemaVersion": 1,
  "mocks": [
    {
      "id": "mock-1721779200000",
      "stateCode": "NY",
      "variantId": "standard",
      "date": "2026-07-24T00:00:00Z",
      "numQuestions": 20,
      "correct": 18,
      "numToPass": 14,
      "passed": true,
      "subResults": [
        { "category": "road-signs", "correct": 3, "outOf": 4, "passed": true }
      ],
      "elapsedSeconds": 540,
      "missedQuestionIds": ["q-ny-parking-002", "q-ny-laws-009"]
    }
  ]
}
```

### schemaVersion migration note

Every stored root has a `schemaVersion`. On load, a migration ladder (pure functions `vN -> vN+1`) upgrades older data forward; the same ladder runs on **import**, so old JSON exports keep working. Never change a stored shape without adding a migration step and a unit test. See [Maintenance](./MAINTENANCE.md#5-content-versioning--user-data-schema-migration). A returning user's saved progress must survive every deploy.
