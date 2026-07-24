# Content Strategy - DMV Prep

How DMV Prep's educational content is modeled, sourced, licensed, authored, verified, and kept fresh. This is the trust backbone of the product. If a decision here conflicts with a feature idea, this document wins.

- Related: [Data Schema](./DATA_SCHEMA.md) · [Maintenance](./MAINTENANCE.md) · [Architecture](./ARCHITECTURE.md) · [Disclaimer](./DISCLAIMER.md) · schema of record: [`src/content.config.ts`](../src/content.config.ts)

---

## 1. Content model

Content is split into a **national shared layer** and a **per-state layer**, both validated by Zod at build time.

```
src/content/
  states/     # one JSON per jurisdiction: metadata, exam variants, GDL, process, facts
  questions/  # national shared bank (templates) + per-state banks (JSON)
  lessons/    # coaching prose (Markdown), per category, optionally per state
  signs/      # road-sign trainer metadata (JSON) referencing SVG assets
```

### 1.1 National shared templates, not presumptive national facts

A question is authored once and tagged `stateScope: "all"` **only after** confirming no state exception exists. Until that confirmation, it is a **template**: it applies to explicit state codes and must be re-confirmed per state. National traffic rules routinely carry state-specific exceptions (BAC thresholds, point systems, turn-on-red nuances, move-over specifics), so "it's a national rule" is treated as a hypothesis, not a fact.

- `stateScope: "all"` = verified to hold in all 51 jurisdictions.
- `stateScope: ["CA","TX",...]` = holds only for the listed states.
- `stateExceptions: ["UT",...]` = states that override or exclude an otherwise-shared item (e.g. Utah's 0.05% BAC exception to a shared alcohol item).

This keeps us from shipping "national" answers that are wrong in a handful of states, which is the single most likely correctness failure for a 51-jurisdiction bank.

### 1.2 Per-state layer

Each state gets roughly 30-60 state-specific questions covering state-variable facts:

- Speed limits (interstate, school zone), BAC limits (adult / under-21 / commercial; note Utah 0.05%), point systems and suspension thresholds, move-over rules, named laws.
- Plus the non-question process/reference data in the state file: agency name, GDL ages and steps, required documents, fees, appointment policy, vision test, retake rules, and official links.

### 1.3 stateScope rules (summary)

| Situation | scope | notes |
|---|---|---|
| Rule confirmed identical in all 51 | `"all"` | no `stateExceptions` |
| Rule holds in a known subset | `["AA","BB",...]` | list every applicable code |
| Mostly-national with a few exceptions | `"all"` + `stateExceptions:[...]` | exceptions get their own per-state item |
| State-variable fact | per-state bank item scoped to that code | authored from that state's handbook |

---

## 2. Legal and sourcing policy

This section is non-negotiable. It reflects legal research and adversarial review. Read it fully before authoring or accepting content.

### 2.1 Core principle: public availability != public domain

A handbook being free to download does **not** make it public domain. Many state handbooks are copyright-retained or governed by terms of use. Adding a citation or a disclaimer does **not** cure infringement. Therefore:

- We **do not copy** real DMV exam items. Ever. Official exam questions are not published, and reconstructing them is both infringement and low quality.
- We **do not lift handbook prose verbatim** and **do not close-paraphrase** it. Questions and explanations are **original**, grounded in the underlying facts and rules.
- We prefer **statutes and regulations** as sources where practical, because facts and law texts are generally freer than an agency's expressive handbook prose. When a rule traces to a vehicle code section, cite the statute.

### 2.2 Original questions grounded in public handbooks

The only defensible model: author **original** questions grounded in each state's public handbook and cite the handbook section (or statute) per item. The handbook is the grounding source for *what the rule is*; the wording, distractors, and explanation are ours.

### 2.3 Cite the handbook section per item

Every question and every state fact carries `references[]` with at least one `{ label, citation, url? }`. The `citation` is a specific handbook section or statute id (e.g. `"CA DL 600 §4"`, `"VC §22350"`), not just "the handbook". The build fails on any uncited item.

### 2.4 Never retain or publish handbook corpora

Handbook text is ingested **transiently** for authoring only. We store only original text plus citations, never the source corpus. `.gitignore` already excludes `scripts/.cache/` and `*.handbook.tmp` so fetched corpora never get committed. Any short quotation (rare) follows a documented excerpt policy: minimal, attributed, and only where a fact cannot be conveyed otherwise.

### 2.5 Source-rights matrix

Maintain a per-handbook / per-dataset matrix recording, for each jurisdiction:

| Field | Meaning |
|---|---|
| Copyright status | public-domain / copyright-retained / terms-of-use / unknown (mirrors `handbookCopyrightStatus`) |
| Reproduction terms | what the source's terms allow |
| AI-ingestion terms | whether terms restrict machine ingestion |
| Terms URL | `handbookTermsUrl` |
| Preferred source | handbook vs statute/reg for each fact class |

Seed this from the **Harvard State Government Copyright Center** (per-state copyright posture) and each state's own terms page. The state file fields `handbookCopyrightStatus` and `handbookTermsUrl` are the machine-readable slice of this matrix; the fuller matrix lives in the editorial log (see [Maintenance](./MAINTENANCE.md)).

### 2.6 No agency seals; no implied endorsement

No state seals, logos, or agency wordmarks. Nothing may imply official affiliation or endorsement. The unofficial-study-aid disclaimer is visible in-app (footer + [Disclaimer](./DISCLAIMER.md)). Agency names are used only nominatively ("California DMV") to tell the user where to go.

### 2.7 Correction / takedown channel

A visible correction/takedown path exists: a GitHub issue template ("Content correction") plus a contact route, linked from the footer and [Contributing](../CONTRIBUTING.md). Takedown requests from officials are prioritized and actioned quickly (see the workflow in [Maintenance](./MAINTENANCE.md)).

### 2.8 Content license: CC BY-NC-SA 4.0

Educational content (questions, explanations, per-state facts, lessons) is licensed **CC BY-NC-SA 4.0**. Source code is MIT (see [`LICENSE`](../LICENSE)). The NC term discourages commercial re-hosting; SA keeps derivatives open. MUTCD road signs are largely public domain (verify per sign); original or openly-licensed SVGs are used regardless, with no agency seals.

---

## 3. Editorial standards

- **Plain English.** Short sentences, one idea per question, no trick wording. ESL-friendly.
- **One correct answer**, unambiguous, with plausible distractors grounded in real misconceptions.
- **Explanations teach.** They state the rule and *why*, not just "the answer is B".
- **No stale specifics without a date.** Any fee, age, document, or threshold shows a "verified as of" stamp.
- **Neutral, calm tone.** Confidence-building, never alarmist, never joking about safety-critical rules.
- **Accessibility in content.** Sign questions have text alternatives; nothing relies on color alone.

---

## 4. Authoring and verification pipeline

The pipeline produces all 51 jurisdictions at launch quality. The primary quality gate is an **adversarial, decorrelated cross-model verification pass**, not human-per-item review.

```
1. Compile state data ──► 2. Author (grounded) ──► 3. Adversarial verify (different model)
        │                        │                          │
   states/*.json           reviewStatus: draft        tries to BREAK each item
   + sourceSnapshotHash                                     │
                                                    ┌───────┴────────┐
                                              cannot break      breaks it
                                                    │                │
                                        reviewStatus:            reject /
                                        adversarially-verified   rewrite ──► re-run
                                                    │
                              4. Human spot-check (sampled, optional) ──► human-spot-checked
                                                    │
                              5. Zod validate at build (fails on any gap)
                                                    │
                              6. Editorial log + volatility-tiered re-audit
```

### Step 1 - Compile per-state metadata/process

From official sources into `states/*.json`, storing `sourceSnapshotHash` (normalized SHA-256 of the fetched source) so source-change monitoring can later detect edits.

### Step 2 - Author, grounded in the fetched handbook

An authoring agent, grounded in the transiently-fetched handbook text, generates **original** questions + explanations + citations per category per state. Output is `reviewStatus: "draft"`.

### Step 3 - Adversarial decorrelated verification (the launch gate)

Every item is re-checked by a **different model** (`gpt-5.6-sol` at high effort, via the `qa-engineer` / `debugger` subagents or a `worker-review`). Its explicit job is to **break** the item:

- Independently re-read the cited handbook section and try to prove the "correct" answer wrong.
- Surface a state-specific exception a template missed.
- Catch an uncited or stale claim.
- Detect verbatim or close-paraphrase copying of handbook prose or exam items.

Items it cannot break -> `adversarially-verified`. Items it breaks are rejected or rewritten and re-run. Using a decorrelated model matters: a single model tends to confidently repeat its own errors, so the verifier is deliberately a different one.

### Step 4 - Human spot-check (sampled, optional)

A reviewer samples verified items per state plus all flagged edge cases and upgrades them to `human-spot-checked`. This is **not** a launch blocker; it is a sampled confidence layer.

### Step 5 - Zod validation at build

`astro build` runs the schema in [`src/content.config.ts`](../src/content.config.ts) and fails on any malformed, uncited, or status-missing item. `scripts/validate-content.mjs` adds fast, human-readable policy checks (>=1 citation, valid `correctIndex`, non-draft warning) and blocks CI on hard failures.

### Step 6 - Editorial log + re-audit

Every authored/verified item is recorded in the editorial/provenance log with who/what/when and its review status, feeding the re-audit cadence below.

---

## 5. Provenance fields

Enforced by schema on questions and states (see [Data Schema](./DATA_SCHEMA.md)):

| Field | Purpose |
|---|---|
| `references[]` | >=1 citation `{label, citation, url?}`; build fails if empty |
| `effectiveDate` | when the cited rule took effect |
| `expiryDate?` | when it is known to expire (optional) |
| `sourceSnapshotHash?` | SHA-256 of the fetched source, for source-change monitoring |
| `reviewStatus` | `draft` \| `adversarially-verified` \| `human-spot-checked` |
| `lastVerified` | drives the "verified as of" stamp and re-audit scheduling |
| `contentVersion` | integer bumped on any material content change |

---

## 6. Freshness and volatility-tiered re-audit

Not all facts age at the same rate, so re-audit is tiered by volatility.

| Tier | Content class | Cadence | Trigger |
|---|---|---|---|
| Volatile | Fees, required documents, appointment policy, GDL specifics, test policy | Short cycle | Scheduled review + source-hash drift |
| Semi-stable | Speed limits, BAC, point thresholds, named laws | Periodic | Statute/reg change, source drift |
| Stable | Sign meanings, general right-of-way | On handbook revision | Handbook edition change |

Mechanisms:

- **"Verified as of <date>"** stamp shown per state/item from `lastVerified`.
- **Stale-content warning**, especially offline (cached data may lag live truth).
- **Link-rot + source-hash monitoring** via `scripts/check-links.mjs` (monthly workflow): dead official URLs and *changed* handbook content both open an issue. Link checks catch disappearance; the normalized source hash catches edits a link check would miss.

Full runbook: [Maintenance](./MAINTENANCE.md).

---

## 7. Seed sources

No single authoritative aggregated dataset exists, so we compile per-state and verify. Seed inputs:

- **USA.gov Motor Vehicle Services** - canonical official agency homepages per state.
- **IIHS Graduated Driver Licensing (GDL) laws table** - permit ages, supervised hours, night curfews, passenger limits.
- **Harvard State Government Copyright Center** - per-state copyright posture for the source-rights matrix.
- **Each state's own `.gov`** - the authoritative source; always verify against it. Handbook landing/PDF URLs and terms pages live in the state file.

Seed data is a starting point for compilation, not a substitute for reading each state's current handbook.

---

## 8. Internationalization (Spanish)

- The model already carries `languages[]` on questions and exam variants; ES content is opt-in per item.
- **Author ES for the highest-demand states first** (large Spanish-speaking populations), not all 51 at once.
- Process/legal facts are **not** shipped as machine-translation-only; ES content is reviewed with the same adversarial gate.
- The UI exposes a language toggle only where ES content exists, so users never hit half-translated screens.
- Additional languages are a post-v1 non-goal; the model is ready for them.
