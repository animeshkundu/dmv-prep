#!/usr/bin/env node
/**
 * Link & source health check (run monthly by CI, or on demand).
 *   - Collects official URLs from every state file (officialSiteUrl, handbook*, scheduling, fees).
 *   - HEAD/GET checks each for reachability.
 *   - Where a state records `sourceSnapshotHash`, re-fetches the handbook and compares a
 *     normalized SHA-256 so a CHANGED (not just missing) handbook is surfaced for re-audit.
 * Writes a JSON report and exits non-zero if anything needs human attention.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const S_DIR = join(ROOT, 'src/content/states');
const reportIdx = process.argv.indexOf('--report');
const reportPath = reportIdx >= 0 ? process.argv[reportIdx + 1] : null;

const results = [];
let failures = 0;

async function head(url) {
  try {
    const ctrl = AbortSignal.timeout(15000);
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl });
    if (res.status === 405 || res.status === 403)
      res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}

function normalizeHash(text) {
  return createHash('sha256').update(text.replace(/\s+/g, ' ').trim()).digest('hex');
}

async function stateFiles() {
  if (!existsSync(S_DIR)) return [];
  const entries = await readdir(S_DIR, { recursive: true });
  return entries.filter((f) => f.endsWith('.json')).map((f) => join(S_DIR, f));
}

for (const file of await stateFiles()) {
  const data = JSON.parse(await readFile(file, 'utf8'));
  const urls = [
    ['officialSiteUrl', data.officialSiteUrl],
    ['handbookLandingUrl', data.handbookLandingUrl],
    ['handbookPdfUrl', data.handbookPdfUrl],
    ['schedulingUrl', data.process?.schedulingUrl],
    ['feesUrl', data.process?.feesUrl],
  ].filter(([, u]) => !!u);

  for (const [field, url] of urls) {
    const r = await head(url);
    if (!r.ok) {
      failures++;
      results.push({ state: data.code, field, url, ...r, issue: 'unreachable' });
    }
  }

  // Source-change detection where we recorded a snapshot hash.
  if (data.sourceSnapshotHash && data.handbookPdfUrl && data.handbookFormat !== 'pdf') {
    try {
      const res = await fetch(data.handbookLandingUrl, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        const cur = normalizeHash(await res.text());
        if (cur !== data.sourceSnapshotHash) {
          failures++;
          results.push({ state: data.code, field: 'handbook', url: data.handbookLandingUrl, issue: 'source-changed' });
        }
      }
    } catch {
      /* reachability already covered above */
    }
  }
}

const report = { checkedAt: new Date().toISOString(), failures, results };
if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2));
if (failures) {
  console.error(`❌ ${failures} link/source issue(s):`);
  for (const r of results) console.error(`  - ${r.state} ${r.field}: ${r.issue} (${r.status ?? ''}) ${r.url}`);
  process.exit(1);
}
console.log('✅ All official links reachable; no source drift detected.');
