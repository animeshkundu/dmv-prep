import { describe, it, expect, beforeAll } from 'vitest';
import { loadAllQuestions } from '../../scripts/content/lib/content-io.mjs';
import { chiSquareUniform, percentages } from '../../scripts/content/lib/stats.mjs';
import { applicableQuestions } from '../../src/lib/questions';
import { STATES } from '../../src/lib/states-directory';

/**
 * docs/CHANGE_SPEC_COMPLETENESS.md §10, `content-answer-distribution.test.ts` row:
 * "every position 20–30% globally; χ² < 11.34 (df=3, p=0.01); no state pool >35%
 * on one position; no category >40%; longest-option-correct rate ≤30%. No
 * run-length assertion."
 *
 * This is D1/D2 from §0.1: today 73% of correct answers sit at option index 1
 * (position B) and 55.1% are the uniquely-longest option. Both floors are
 * expected to fail against the current corpus — that failure is the point.
 */
describe('content answer-position and answer-length distribution', () => {
  let questions: Array<Record<string, any>>;

  beforeAll(() => {
    questions = loadAllQuestions();
  });

  function positionCounts(items: Array<Record<string, any>>): number[] {
    const counts = [0, 0, 0, 0];
    for (const q of items) {
      if (q.correctIndex >= 0 && q.correctIndex <= 3) counts[q.correctIndex]++;
    }
    return counts;
  }

  it('every answer position sits within 20-30% globally', () => {
    const counts = positionCounts(questions);
    const pcts = percentages(counts);
    pcts.forEach((pct: number, position: number) => {
      expect(
        pct,
        `Position ${position} (${['A', 'B', 'C', 'D'][position]}) holds ${pct.toFixed(1)}% ` +
          `of all correct answers (counts=${JSON.stringify(counts)}); the floor requires 20-30%.`,
      ).toBeGreaterThanOrEqual(20);
      expect(
        pct,
        `Position ${position} (${['A', 'B', 'C', 'D'][position]}) holds ${pct.toFixed(1)}% ` +
          `of all correct answers (counts=${JSON.stringify(counts)}); the floor requires 20-30%.`,
      ).toBeLessThanOrEqual(30);
    });
  });

  it('the global chi-square statistic for answer position is below the p=0.01 critical value (11.34, df=3)', () => {
    const counts = positionCounts(questions);
    const chiSq = chiSquareUniform(counts);
    expect(
      chiSq,
      `Chi-square statistic is ${chiSq.toFixed(2)} for counts=${JSON.stringify(counts)}; ` +
        `must be < 11.34 to not reject uniformity at p=0.01.`,
    ).toBeLessThan(11.34);
  });

  it('no single state pool has >35% of its correct answers on one position', () => {
    const violations: string[] = [];
    for (const state of STATES) {
      const pool = applicableQuestions(questions as any, state.code);
      if (pool.length === 0) continue;
      const counts = positionCounts(pool);
      const pcts = percentages(counts);
      const maxPct = Math.max(...pcts);
      if (maxPct > 35) {
        violations.push(`${state.code}: ${maxPct.toFixed(1)}% (n=${pool.length}, counts=${JSON.stringify(counts)})`);
      }
    }
    expect(violations, `State pools exceeding the 35% single-position ceiling:`).toEqual([]);
  });

  it('no category has >40% of its correct answers on one position', () => {
    const categories = [...new Set(questions.map((q) => q.category))];
    const violations: string[] = [];
    for (const category of categories) {
      const items = questions.filter((q) => q.category === category);
      const counts = positionCounts(items);
      const pcts = percentages(counts);
      const maxPct = Math.max(...pcts);
      if (maxPct > 40) {
        violations.push(`${category}: ${maxPct.toFixed(1)}% (n=${items.length}, counts=${JSON.stringify(counts)})`);
      }
    }
    expect(violations, `Categories exceeding the 40% single-position ceiling:`).toEqual([]);
  });

  it('the longest-option-correct rate is at most 30%', () => {
    let longestAndCorrect = 0;
    for (const q of questions) {
      const options: string[] = q.options ?? [];
      const lengths = options.map((o) => o.length);
      const maxLen = Math.max(...lengths);
      const correctLen = options[q.correctIndex]?.length;
      const uniquelyLongest = lengths.filter((l) => l === maxLen).length === 1;
      if (correctLen === maxLen && uniquelyLongest) longestAndCorrect++;
    }
    const rate = (100 * longestAndCorrect) / questions.length;
    expect(
      rate,
      `${longestAndCorrect}/${questions.length} (${rate.toFixed(1)}%) correct answers are the ` +
        `uniquely-longest option; the floor requires <=30%. This is D2 (§0.1): a content ` +
        `defect in distractor length, not fixable by shuffling.`,
    ).toBeLessThanOrEqual(30);
  });
});
