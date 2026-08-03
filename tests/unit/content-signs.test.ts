import { existsSync } from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { loadAllSigns, loadSignManifest, repoPath } from '../../scripts/content/lib/content-io.mjs';
import { loadAllQuestions } from '../../scripts/content/lib/content-io.mjs';

/**
 * docs/CHANGE_SPEC_COMPLETENESS.md §10, `content-signs.test.ts` row + §6:
 * "imageAsset resolves to a sign id (§6.3); referenced asset + sha256 exist on
 * disk; alt text never contains the sign's name; every sign-identify item has
 * a sign-rule counterpart; ≥140 signs with the §6 category mix; MUTCD-coded
 * signs are recorded public-domain-mutcd with source; manifest lives outside
 * the signs collection directory (§6.1)."
 */
describe('content signs', () => {
  let signs: ReturnType<typeof loadAllSigns>;
  let manifest: ReturnType<typeof loadSignManifest>;
  let questions: ReturnType<typeof loadAllQuestions>;

  beforeAll(() => {
    signs = loadAllSigns();
    manifest = loadSignManifest();
    questions = loadAllQuestions();
  });

  it('the sign manifest lives outside the registered signs collection directory (§6.1)', () => {
    expect(existsSync(repoPath('src/content/sign-manifest/manifest.json'))).toBe(true);
    expect(existsSync(repoPath('src/content/signs/manifest.json'))).toBe(false);
    expect(manifest.length, 'src/content/sign-manifest/manifest.json should be non-empty').toBeGreaterThan(0);
  });

  it('every manifest row is downloaded, pending, or excluded, and excluded rows carry an exclusionReason', () => {
    const violations: string[] = [];
    for (const row of manifest) {
      if (!['downloaded', 'pending', 'excluded'].includes(row.status)) {
        violations.push(`${row.id}: unknown status "${row.status}"`);
      }
      if (row.status === 'excluded' && !row.exclusionReason) {
        violations.push(`${row.id}: excluded but has no exclusionReason`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('the sign library reaches ~140 MUTCD signs with the §6 category mix (regulatory 40 / warning 55 / guide 15 / work-zone 20 / school-pedestrian 10)', () => {
    const target = { regulatory: 40, warning: 55, guide: 15, construction: 20, school: 10 };
    const totalTarget = Object.values(target).reduce((a, b) => a + b, 0);
    expect(
      signs.length,
      `§6 requires ~${totalTarget} MUTCD signs. Only ${signs.length} sign record(s) exist in src/content/signs/.`,
    ).toBeGreaterThanOrEqual(totalTarget);

    const byCategory = new Map<string, number>();
    for (const s of signs) byCategory.set(s.category, (byCategory.get(s.category) ?? 0) + 1);
    const shortfalls: string[] = [];
    for (const [category, min] of Object.entries(target)) {
      const actual = byCategory.get(category) ?? 0;
      if (actual < min) shortfalls.push(`${category}: ${actual} (< ${min})`);
    }
    expect(shortfalls).toEqual([]);
  });

  it('every sign asset file referenced by `asset` exists under public/', () => {
    const missing: string[] = [];
    for (const s of signs) {
      if (typeof s.asset !== 'string' || !s.asset.startsWith('/')) {
        missing.push(`${s.id}: asset "${s.asset}" is not a root-relative public/ path`);
        continue;
      }
      const abs = repoPath('public', s.asset.replace(/^\//, ''));
      if (!existsSync(abs)) missing.push(`${s.id}: asset file public${s.asset} does not exist on disk`);
    }
    expect(missing).toEqual([]);
  });

  it('every sign carries a 64-hex-char assetSha256 pinning its artwork (§6.2 schema)', () => {
    const violations: string[] = [];
    for (const s of signs) {
      if (typeof s.assetSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(s.assetSha256)) {
        violations.push(`${s.id}: assetSha256 missing or not a 64-hex-char string (got ${JSON.stringify(s.assetSha256)})`);
      }
    }
    expect(
      violations.length,
      `${violations.length}/${signs.length} sign records lack assetSha256 — the §6.2 schema field does not exist yet ` +
        `on src/content/signs/signs.json records. First 5: ${violations.slice(0, 5).join('; ')}`,
    ).toBe(0);
  });

  it("alt text is populated, and never reveals the sign's name (shape/colour only, §6.3)", () => {
    const violations: string[] = [];
    for (const s of signs) {
      if (typeof s.altText !== 'string' || s.altText.trim().length === 0) {
        violations.push(`${s.id}: no altText field (§6.2 schema addition not present yet)`);
        continue;
      }
      const nameWords = s.name
        .toLowerCase()
        .split(/\s+/)
        .filter((w: string) => w.length > 2);
      const altLower = s.altText.toLowerCase();
      const leaks = nameWords.filter((w: string) => altLower.includes(w));
      if (leaks.length > 0) {
        violations.push(`${s.id}: altText "${s.altText}" contains sign-name word(s) ${leaks.join(', ')}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('MUTCD-coded signs are recorded assetLicense:"public-domain-mutcd"; non-MUTCD state signs are "original" (§6.2 refine)', () => {
    const violations: string[] = [];
    for (const s of signs) {
      if (s.mutcdCode && s.assetLicense !== 'public-domain-mutcd') {
        violations.push(`${s.id}: has mutcdCode "${s.mutcdCode}" but assetLicense is ${JSON.stringify(s.assetLicense)}, not "public-domain-mutcd"`);
      }
      if (!s.mutcdCode && s.assetLicense !== 'original') {
        violations.push(`${s.id}: has no mutcdCode but assetLicense is ${JSON.stringify(s.assetLicense)}, not "original"`);
      }
    }
    expect(
      violations.length,
      `${violations.length}/${signs.length} signs fail the license/mutcdCode refine — assetLicense does not exist on the ` +
        `current signs schema yet. First 5: ${violations.slice(0, 5).join('; ')}`,
    ).toBe(0);
  });

  it('every `imageAsset` on a question resolves to a real sign id (§6.3 referential integrity)', () => {
    const signIds = new Set(signs.map((s) => s.id));
    const withImage = questions.filter((q: any) => typeof q.imageAsset === 'string' && q.imageAsset.length > 0);
    const orphans = withImage.filter((q: any) => !signIds.has(q.imageAsset));
    expect(orphans.map((q: any) => `${q.id} -> imageAsset "${q.imageAsset}"`)).toEqual([]);

    // Non-vacuous gate: §6.3 says ~68 of the 90 T1 road-signs items should be
    // `sign-identify` items carrying an imageAsset. If none exist at all, that
    // is the gap (image wiring, build order step 8, has not happened).
    expect(
      withImage.length,
      `0 questions currently carry an imageAsset. §6.3 expects ~68 sign-identify road-signs ` +
        `items to reference a sign by id once image wiring is complete.`,
    ).toBeGreaterThan(0);
  });

  it('every `sign-identify` item has a `sign-rule` counterpart covering the same sign, so mastery never requires an image (§6.3 accessibility contract)', () => {
    const signIdentify = questions.filter((q: any) => Array.isArray(q.tags) && q.tags.includes('sign-identify'));
    const signRule = questions.filter((q: any) => Array.isArray(q.tags) && q.tags.includes('sign-rule'));

    // Non-vacuous gate: this accessibility contract cannot be honestly asserted
    // "satisfied" while no sign-identify items exist to check.
    expect(
      signIdentify.length,
      `0 questions are tagged "sign-identify". §6.3 requires ~68 such items (and an equal-coverage ` +
        `"sign-rule" counterpart for each) before this accessibility contract can be verified.`,
    ).toBeGreaterThan(0);

    const ruleSignIds = new Set(signRule.map((q: any) => q.imageAsset).filter(Boolean));
    const uncovered = signIdentify.filter((q: any) => !ruleSignIds.has(q.imageAsset)).map((q: any) => q.id);
    expect(uncovered).toEqual([]);
  });
});
