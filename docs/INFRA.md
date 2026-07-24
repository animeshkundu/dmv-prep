# Infrastructure - DMV Prep

Deployment, CI, base-path handling, PWA-under-subpath caveats, and operational paths (custom domain, rollback, environments) for the static GitHub Pages app.

- Related: [Architecture](./ARCHITECTURE.md) · [Maintenance](./MAINTENANCE.md)
- Config: [`astro.config.mjs`](../astro.config.mjs) · workflows in [`.github/workflows/`](../.github/workflows)

---

## 1. Hosting model

- Static output built by Astro, served by **GitHub Pages** with source set to **GitHub Actions**.
- Project site at a subpath: `https://animeshkundu.github.io/dmv-prep/`.
- No server, no database. All dynamic behavior is client-side (see [Architecture](./ARCHITECTURE.md)).

`astro.config.mjs`:

```js
const SITE = 'https://animeshkundu.github.io';
const BASE = '/dmv-prep/';
// site: SITE, base: BASE, trailingSlash: 'ignore'
```

---

## 2. Deployment (`deploy.yml`)

Triggered on push to `main` and via `workflow_dispatch`.

- Permissions: `contents: read`, `pages: write`, `id-token: write` (required for the Pages OIDC deploy).
- Concurrency group `pages` with `cancel-in-progress: false` so an in-flight production deploy is never cancelled.
- **build job:** `actions/checkout@v4` then `withastro/action@v3`, which installs deps, reads `base` from `astro.config.mjs`, builds to `./dist`, and uploads the Pages artifact.
- **deploy job:** needs `build`; `actions/deploy-pages@v4` publishes the artifact and exposes the environment URL.

One-time setup: in repo Settings -> Pages, set Source = GitHub Actions.

---

## 3. Base-path handling (the golden rule)

Under a project subpath, **every internal link and asset must be base-aware**, or it resolves against the domain root and 404s.

- Route all internal hrefs through `href()` and asset paths through `asset()` from [`src/lib/site.ts`](../src/lib/site.ts); both prefix `import.meta.env.BASE_URL` (`/dmv-prep/`).
- In `.astro` files, direct asset refs use `` `${import.meta.env.BASE_URL}favicon.svg` `` (as `BaseLayout.astro` does for the icon).
- Never hardcode `/dmv-prep/` and never write a root-absolute `/foo` internal link. When the base changes (custom domain -> `/`), base-aware links keep working with zero edits.
- `getStaticPaths` slugs and the `href()` targets must agree (lowercased state code).

```
href('/state/ca')  ->  /dmv-prep/state/ca
asset('/icons/icon-192.png')  ->  /dmv-prep/icons/icon-192.png
```

---

## 4. PWA under a subpath

`vite-plugin-pwa` (Workbox) with `registerType: 'autoUpdate'`. The subpath makes scope handling load-bearing:

- **`base` and `scope` are both `/dmv-prep/`.** A default root scope would not control the subpath and offline would silently fail. This is the single most common subpath PWA bug.
- `manifest.start_url` and `manifest.scope` are also `/dmv-prep/`; icons resolve under the base.
- `navigateFallback` is `` `${BASE}404.html` `` - offline navigations to uncached routes land on the real static 404, **not** an SPA rewrite.
- `globPatterns` precache `js,css,html,svg,png,woff2,json`; `maximumFileSizeToCacheInBytes` is raised to 5 MB because per-state JSON banks can be large.
- `autoUpdate` refreshes the SW on new deploys; pair with the in-app "verified as of" stamp and stale-content note so cached facts aren't mistaken for live truth.

> Repo note: PWA is wired via the raw `vite-plugin-pwa` Vite plugin in `astro.config.mjs`. `@vite-pwa/astro` is also present in `devDependencies` but is not the active integration. Keep one path to avoid double-registration confusion.

---

## 5. Real 404, no SPA hack

`src/pages/404.astro` is a genuine static not-found page (base-aware "Go home" / "Pick your state" actions). GitHub Pages serves `404.html` for unknown paths, and the SW navigate-fallback points at it. We deliberately do **not** use an SPA `index.html` catch-all: it would return 200 for missing pages, break deep-link correctness, and hurt SEO.

---

## 6. CI (`ci.yml`)

On push and PR to `main`, plus `workflow_dispatch`. Node 22, npm cache.

**verify job (blocks merge):**

1. `npm ci`
2. `npm run check` - Astro + tsc typecheck.
3. `npm run validate:content` - schema + citation/policy checks (`scripts/validate-content.mjs`).
4. `npm test` - Vitest unit (scoring, selection/shuffle, per-state thresholds incl. NY sub-rule, FSRS transitions, storage migration).
5. `npm run build` - full static build; Zod content validation runs here and fails on any malformed/uncited item.

**e2e job (needs verify):** installs Playwright Chromium, builds, runs `npm run test:e2e` against the built output at the correct base (practice -> explanation, mock -> correct pass/fail, flashcard reschedule, reload persistence, offline, export/import round-trip).

Planned budgets to fold in: Lighthouse performance/PWA and axe zero-critical, plus the manual a11y pass that automated tools cannot replace.

> Repo note: CI uses Node 22 while the build plan mentions Node 24. Align these when convenient (bump the workflow or the plan).

---

## 7. Link & source health (`link-check.yml`)

Scheduled monthly (`17 6 1 * *`) and on demand; permissions `contents: read`, `issues: write`.

- Runs `scripts/check-links.mjs`, which collects official URLs from every state file (`officialSiteUrl`, `handbook*`, `schedulingUrl`, `feesUrl`), HEAD/GET-checks reachability (retrying with GET on 403/405), and where a `sourceSnapshotHash` is recorded, re-fetches the handbook and compares a normalized SHA-256 to detect **content changes** a link check would miss.
- On any failure it opens a labeled issue (`content-maintenance`, `automated`) with the JSON report, feeding the volatility-tiered re-audit in [Maintenance](./MAINTENANCE.md).

---

## 8. Custom domain path

To move off the subpath onto a custom domain:

1. Add a `CNAME` file in `public/` with the domain, and configure DNS (A/AAAA or CNAME per GitHub docs).
2. Set the domain in repo Settings -> Pages; enable "Enforce HTTPS".
3. Change `base` to `'/'` (and update `site`) in `astro.config.mjs`, plus the PWA `base`/`scope`/`start_url`/`navigateFallback`.
4. Because all internal links go through `href()`/`asset()`, no link edits are needed. Rebuild and deploy.

---

## 9. Rollback

- Pages serves the artifact from the last successful `deploy.yml`. To roll back, re-run the deploy workflow on a known-good commit (revert the offending change or `workflow_dispatch` from that ref).
- Content-only regressions can be reverted via a normal PR revert; CI + content validation gate the re-deploy.
- The SW `autoUpdate` means a corrected deploy propagates to installed clients on next load.

---

## 10. Environments

| Environment | How | Notes |
|---|---|---|
| Local dev | `npm run dev` | Astro dev server; base applies |
| Local preview | `npm run build && npm run preview` | Serves built output at the real base; closest to prod |
| CI | `ci.yml` on push/PR | Typecheck, content validation, unit, e2e, build |
| Production | `deploy.yml` on push to `main` | GitHub Pages `github-pages` environment, URL surfaced by `deploy-pages` |

Verify a production release by loading `https://animeshkundu.github.io/dmv-prep/`, confirming base-path assets load, installing the PWA, and running one full state journey (including offline) on a real phone.
