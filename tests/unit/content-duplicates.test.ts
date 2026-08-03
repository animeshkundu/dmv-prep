import { describe, it, expect, beforeAll } from 'vitest';
import { loadAllQuestions } from '../../scripts/content/lib/content-io.mjs';
import {
  normalizePrompt,
  shingles,
  jaccard,
  candidatePairsByShingleIndex,
} from '../../scripts/content/lib/text-similarity.mjs';
import { buildJurisdictionNameRegex } from '../../scripts/content/lib/universality.mjs';
import { applicableQuestions } from '../../src/lib/questions';
import { STATES } from '../../src/lib/states-directory';

/**
 * docs/CHANGE_SPEC_COMPLETENESS.md §10, `content-duplicates.test.ts` row:
 * "Scoped to questions coexisting in the same effective state pool. No two
 * same-pool questions share a normalised prompt (jurisdiction names stripped
 * before shingling, so 'roundabout in Utah' collides with the national item);
 * no same-pool pair above Jaccard 0.70; no state question that is a national
 * one with the state name injected. Cross-state similarity among deterministic
 * T2 siblings is reported, never failed (§4.6). Candidate pairs come from a
 * MinHash/inverted-index stage — a naive all-pairs loop over 7,000 items is
 * ~24.8M comparisons."
 *
 * §0.2 states today's corpus has "6 exact-duplicate prompt groups (14 items)"
 * and "38 near-duplicate pairs at Jaccard >=0.70" — this suite is expected to
 * surface (a superset of) those.
 */
describe('content duplicates (scoped to effective state pools)', () => {
  let questions: Array<Record<string, any>>;
  let jurisdictionNameRegex: RegExp;

  beforeAll(() => {
    questions = loadAllQuestions();
    jurisdictionNameRegex = buildJurisdictionNameRegex(STATES.map((s) => s.name));
  });

  function findDuplicatesInPool(pool: Array<Record<string, any>>) {
    const normalized = pool.map((q) => normalizePrompt(q.prompt ?? '', jurisdictionNameRegex));
    const shingleSets = normalized.map((n) => shingles(n, 3));
    const candidates = candidatePairsByShingleIndex(shingleSets);

    const exact: Array<[Record<string, any>, Record<string, any>]> = [];
    const near: Array<[Record<string, any>, Record<string, any>, number]> = [];

    for (const [i, j] of candidates) {
      if (normalized[i] === normalized[j] && normalized[i].length > 0) {
        exact.push([pool[i], pool[j]]);
        continue;
      }
      const sim = jaccard(shingleSets[i], shingleSets[j]);
      if (sim >= 0.7) near.push([pool[i], pool[j], sim]);
    }
    return { exact, near };
  }

  it('no two questions in the same effective state pool share a normalised prompt', () => {
    const seenPairs = new Set<string>();
    const violations: string[] = [];
    for (const state of STATES) {
      const pool = applicableQuestions(questions as any, state.code);
      const { exact } = findDuplicatesInPool(pool);
      for (const [a, b] of exact) {
        const key = [a.id, b.id].sort().join('|');
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        violations.push(`${state.code}: "${a.id}" === "${b.id}" (normalized prompt collision)`);
      }
    }
    expect(
      violations,
      `Found ${violations.length} exact-duplicate prompt pair(s) coexisting in an effective ` +
        `state pool. docs/CHANGE_SPEC_COMPLETENESS.md §0.2 documents 6 known exact-duplicate ` +
        `groups (14 items) plus 7 state-vs-national byte-identical collisions.`,
    ).toEqual([]);
  });

  it('no two questions in the same effective state pool exceed Jaccard 0.70 similarity', () => {
    const seenPairs = new Set<string>();
    const violations: string[] = [];
    for (const state of STATES) {
      const pool = applicableQuestions(questions as any, state.code);
      const { near } = findDuplicatesInPool(pool);
      for (const [a, b, sim] of near) {
        const key = [a.id, b.id].sort().join('|');
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        violations.push(`${state.code}: "${a.id}" ~ "${b.id}" (Jaccard=${sim.toFixed(2)})`);
      }
    }
    expect(
      violations,
      `Found ${violations.length} near-duplicate pair(s) (Jaccard >= 0.70) coexisting in an ` +
        `effective state pool. docs/CHANGE_SPEC_COMPLETENESS.md §0.2 documents 38 known ` +
        `near-duplicate pairs, dominated by a national question with the state name injected.`,
    ).toEqual([]);
  });

  it('no state-specific question is a national question with only the state name injected', () => {
    const seenPairs = new Set<string>();
    const violations: string[] = [];
    for (const state of STATES) {
      const pool = applicableQuestions(questions as any, state.code);
      const national = pool.filter((q) => q.stateScope === 'all');
      const stateOwned = pool.filter((q) => q.stateScope !== 'all');
      if (national.length === 0 || stateOwned.length === 0) continue;

      const nationalNormalized = national.map((q) => normalizePrompt(q.prompt ?? '', jurisdictionNameRegex));
      const nationalShingles = nationalNormalized.map((n) => shingles(n, 3));

      stateOwned.forEach((sq) => {
        const sNorm = normalizePrompt(sq.prompt ?? '', jurisdictionNameRegex);
        const sShingles = shingles(sNorm, 3);
        national.forEach((nq, idx) => {
          const key = [sq.id, nq.id].sort().join('|');
          if (seenPairs.has(key)) return;
          const isMatch = sNorm === nationalNormalized[idx] || jaccard(sShingles, nationalShingles[idx]) >= 0.7;
          if (isMatch) {
            seenPairs.add(key);
            violations.push(`${state.code}: state item "${sq.id}" duplicates national item "${nq.id}" once the jurisdiction name is stripped`);
          }
        });
      });
    }
    expect(
      violations,
      `Found ${violations.length} state item(s) that are a national question with the state ` +
        `name injected. docs/CHANGE_SPEC_COMPLETENESS.md §0.2 names 7 such byte-identical cases ` +
        `(e.g. ar-traffic-signals-001 === nat-signals-002).`,
    ).toEqual([]);
  });
});
