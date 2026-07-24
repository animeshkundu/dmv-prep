# Maintenance - DMV Prep

The operational runbook for keeping content accurate, fresh, and legally clean over time, and for evolving the app without breaking users' on-device data.

- Related: [Content Strategy](./CONTENT_STRATEGY.md) · [Data Schema](./DATA_SCHEMA.md) · [Infra](./INFRA.md) · [Contributing](../CONTRIBUTING.md)
- Tooling: [`scripts/validate-content.mjs`](../scripts/validate-content.mjs) · [`scripts/check-links.mjs`](../scripts/check-links.mjs)

---

## 1. Add or verify a state

Adding a jurisdiction is a data change, not a code change (routes fan out from data; see [Architecture](./ARCHITECTURE.md)).

1. **Confirm the directory entry** exists in [`src/lib/states-directory.ts`](../src/lib/states-directory.ts) (all 51 already present) with the correct real agency short name.
2. **Author the state file** `src/content/states/{code}.json` from official sources: agency name/URLs, handbook edition + copyright status + terms URL, exam variants (count/pass/time/sub-requirements/languages), GDL, process, retake, facts. Store `sourceSnapshotHash`, `references[]`, `effectiveDate`, `lastVerified`.
3. **Author the question bank** `src/content/questions/{code}.json` (per-state items) and confirm which national templates apply to this state (`stateScope` / `stateExceptions`). Target ~30-60 state-specific items.
4. **Run the verification pipeline** (section 2). Every item must reach `adversarially-verified` before launch.
5. **Validate:** `npm run validate:content` and `npm run build` (Zod) must pass; `npm run check` and `npm test` green.
6. **Record** the work in the editorial/provenance log (section 7).

A state may appear in the picker before its content is authored; the content layers on top when ready.

---

## 2. Content authoring + adversarial verification runbook

This is the launch quality gate. Repeat it for every new or changed item.

```
Author (grounded, original) ─► reviewStatus: draft
        │
        ▼
Adversarial verify on a DIFFERENT model (gpt-5.6-sol, high effort)
  goal: BREAK the item -
   • re-read the cited section, try to disprove the "correct" answer
   • find a state exception a template missed
   • catch an uncited or stale claim
   • detect verbatim / close-paraphrase copying
        │
   ┌────┴─────┐
 survives   broken
   │          │
adversarially-verified   reject/rewrite ─► re-run
   │
Human spot-check (sampled, optional) ─► human-spot-checked
   │
Zod validate at build (blocks on any gap)
```

Operational notes:

- Run the verifier via the `qa-engineer` / `debugger` subagents or a `worker-review` so it is genuinely decorrelated from the author.
- Fetch handbook text **transiently** for grounding; never commit corpora (`.gitignore` already excludes `scripts/.cache/` and `*.handbook.tmp`). Store only original text + citations + `sourceSnapshotHash`.
- `validate-content.mjs` warns on any item left at `draft`/unset; CI can be hardened to fail on draft for launch branches.

---

## 3. Volatility-tiered re-audit cadence

Not everything ages the same, so re-audit is tiered.

| Tier | Content class | Cadence | Primary trigger |
|---|---|---|---|
| Volatile | Fees, required documents, appointment policy, GDL specifics, test policy | Short cycle | Scheduled review + source-hash drift |
| Semi-stable | Speed limits, BAC, point thresholds, named laws | Periodic | Statute/reg change; source drift |
| Stable | Sign meanings, general right-of-way, question banks | On handbook revision | New handbook edition |

- Every re-audit updates `lastVerified` (drives the "verified as of" stamp) and bumps `contentVersion` when content materially changes.
- Question banks are re-audited **on handbook revision**, detected via the source-hash job below or a manual edition bump (`handbookEditionYear`).

---

## 4. Link-rot and source-hash monitoring

The monthly `link-check.yml` workflow runs `check-links.mjs`:

- **Reachability:** HEAD/GET on every official URL in each state file (`officialSiteUrl`, `handbook*`, `schedulingUrl`, `feesUrl`). Catches URLs that disappeared.
- **Source drift:** where a `sourceSnapshotHash` is recorded, re-fetch the handbook and compare a normalized SHA-256. Catches *edits* a link check would miss (the meaning changed even though the URL still resolves).
- **On failure:** opens a labeled issue (`content-maintenance`, `automated`) with the JSON report. Triage: dead link -> find the new official URL and update the state file; source drift -> re-audit affected items and re-run verification.

Run on demand with `node scripts/check-links.mjs --report link-report.json`.

---

## 5. Content versioning + user-data schema migration

Two independent version lines:

- **Content:** `contentVersion` (per item) bumps on material content changes; `effectiveDate`/`lastVerified` stamp the "when". These drive audit scheduling and UI freshness labels.
- **User data:** stored client-side under a `schemaVersion`. When the stored shape changes, add a migration step in the client migration ladder (a pure function old -> new), covered by a unit test. The same ladder runs on **import**, so old JSON exports keep working. Never mutate a stored shape without a migration + test. See [Data Schema](./DATA_SCHEMA.md#client-side-stored-user-data).

Golden rule: a returning user's saved progress must survive every deploy. If a change would break it, ship a migration, not a breaking change.

---

## 6. Correction / takedown workflow

A visible, fast path for errors and official requests (linked from the footer and [Contributing](../CONTRIBUTING.md)).

1. **Intake:** a "Content correction" GitHub issue template, plus a contact route for officials. Takedown requests are prioritized.
2. **Triage:** reproduce/confirm the claim against the cited source. Label severity.
3. **Act:**
   - Factual error -> correct the item, re-run adversarial verification, bump `contentVersion`, update `lastVerified`.
   - Copyright/takedown -> remove or rewrite the flagged content promptly; record the request and resolution in the editorial log; confirm back to the requester.
   - Stale data -> re-audit and re-stamp.
4. **Ship:** normal PR with CI + content validation gating the fix; `autoUpdate` SW propagates it to installed clients.
5. **Log:** every correction/takedown is recorded (what, source, decision, date).

No agency seals are ever added; anything implying official endorsement is removed on sight.

---

## 7. Editorial / provenance log

A running record backing the source-rights matrix and the audit trail. For each item/state, capture:

| Field | Example |
|---|---|
| Item / state | `q-ca-speed-001` / `CA` |
| Source + citation | CA Driver Handbook §Speed Limits; `VC §22350` |
| Copyright status | terms-of-use (Harvard center + state terms page) |
| `sourceSnapshotHash` | sha256… |
| Author + date | pipeline, 2026-07-24 |
| Verifier + result | gpt-5.6-sol high - survived |
| Review status | adversarially-verified |
| `lastVerified` / `contentVersion` | 2026-07-24 / 1 |
| Notes | exceptions, takedown history |

The machine-readable slice of this (copyright status, terms URL, dates, review status, hash) lives in the content files themselves via the provenance fields; the fuller matrix and free-text history live in the log.
