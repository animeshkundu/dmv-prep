# Contributing to DMV Prep

Thanks for helping make free, accurate driving-test prep. This guide covers dev setup, workflow, content contribution and citation rules, corrections/takedowns, and code style.

- Project docs: [Product Spec](./docs/PRODUCT_SPEC.md) · [Architecture](./docs/ARCHITECTURE.md) · [Content Strategy](./docs/CONTENT_STRATEGY.md) · [Data Schema](./docs/DATA_SCHEMA.md) · [Design System](./docs/DESIGN_SYSTEM.md) · [UX](./docs/UX.md) · [Infra](./docs/INFRA.md) · [Maintenance](./docs/MAINTENANCE.md)

---

## Dev setup

Requires Node (CI runs Node 22) and npm.

```bash
npm install
npm run dev              # local dev server
npm run build            # static build to dist/
npm run preview          # serve the built output at the real base path
```

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Astro dev server |
| `npm run build` | Static build (runs Zod content validation) |
| `npm run preview` | Serve built output at `/dmv-prep/` (closest to prod) |
| `npm run check` | Astro + `tsc` typecheck |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run validate:content` | Editorial + schema/citation checks |
| `npm test` | Unit tests (Vitest) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | End-to-end (Playwright) |

Before opening a PR, run: `npm run check && npm run validate:content && npm test && npm run build`.

---

## Branch / PR workflow

1. Branch off `main` (`feat/...`, `fix/...`, `content/...`).
2. Make focused changes; keep PRs scoped.
3. Ensure CI passes locally (typecheck, content validation, unit; e2e when relevant).
4. Open a PR with a clear description and, for content, the sources/citations used.
5. CI (`ci.yml`) must be green to merge. `main` deploys to GitHub Pages automatically.

Do not commit build output, `node_modules`, or any fetched handbook corpora (`.gitignore` already excludes `scripts/.cache/` and `*.handbook.tmp`).

---

## Contributing content

Content is the trust backbone. Read [Content Strategy](./docs/CONTENT_STRATEGY.md) fully before contributing questions or state data. Shapes are defined in [`src/content.config.ts`](./src/content.config.ts) and explained in [Data Schema](./docs/DATA_SCHEMA.md).

### Hard rules

- **Original only.** Write your own questions and explanations. Never copy real DMV exam items. Never lift or close-paraphrase handbook prose.
- **Public availability is not public domain.** A downloadable handbook may still be copyrighted or terms-restricted. Prefer statutes/regulations where practical. Check the source-rights matrix / [`handbookCopyrightStatus`].
- **Cite every item.** Each question and state fact needs `references[]` with a specific handbook section or statute id, not just "the handbook". The build fails on uncited items.
- **No agency seals or logos.** Nothing may imply official endorsement. Agency names are used only to tell users where to go.
- **Stamp freshness.** Set `effectiveDate`, `lastVerified`, and store a `sourceSnapshotHash` where you fetched a source.
- **stateScope discipline.** Use `stateScope: "all"` only after confirming no state exception; otherwise scope to explicit codes and record exceptions.

### Contribution flow

1. Author the item(s) grounded in the current public handbook (fetch transiently; never commit corpora). Set `reviewStatus: "draft"`.
2. Run the **adversarial verification** step on a different model (`gpt-5.6-sol`, high effort) whose job is to break the item (see [Maintenance](./docs/MAINTENANCE.md#2-content-authoring--adversarial-verification-runbook)). Items that survive become `adversarially-verified`.
3. Run `npm run validate:content` and `npm run build` - both must pass.
4. Record the work in the editorial/provenance log.
5. Open a PR listing your sources and citations.

Content that survives verification but has not been human-reviewed ships at `adversarially-verified`; sampled human spot-checks upgrade items to `human-spot-checked`.

---

## Corrections and takedowns

Accuracy matters and mistakes get fixed fast.

- **Spotted an error?** Open a "Content correction" issue with the item id, what's wrong, and the correct source/citation.
- **Official takedown request?** Use the contact route in the issue template; takedown requests are prioritized and actioned promptly.
- Full workflow: [Maintenance -> Correction / takedown](./docs/MAINTENANCE.md#6-correction--takedown-workflow).

---

## Code style

- **Concise, natural voice.** Write like a careful human, not a spec generator. Say less, mean more.
- **No em dashes.** Use commas, colons, or parentheses.
- **No attribution to AI, Claude, Anthropic, or any LLM** anywhere: not in commits, PRs, issues, code, comments, or docs.
- **Use design tokens.** No raw hex/px in components; pull from [`src/styles/tokens.css`](./src/styles/tokens.css).
- **Base-aware links.** Every internal href/asset goes through `href()`/`asset()` in [`src/lib/site.ts`](./src/lib/site.ts). Never hardcode `/dmv-prep/`.
- **Shapes come from `content.config.ts`.** Import inferred types; do not redeclare content shapes elsewhere.
- **Islands own interaction + storage; pages own data.** Keep logic (quiz/fsrs/storage) framework-agnostic and unit-tested.
- **Accessibility is not optional.** Keyboard operable, visible focus, >=44px targets, `aria-live` feedback, honored `prefers-reduced-motion`. See [Design System](./docs/DESIGN_SYSTEM.md#9-accessibility-spec).
- **Migrations for stored data.** Never change a stored user-data shape without a `schemaVersion` migration and a test.
