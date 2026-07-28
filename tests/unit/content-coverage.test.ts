import { describe, it, expect, beforeAll } from 'vitest';
import { loadAllQuestions, loadAllStates } from '../../scripts/content/lib/content-io.mjs';
import { CATEGORY_TARGETS, TOTAL_TARGET, FLOOR_PER_STATE_TOTAL, FLOOR_PER_CATEGORY } from '../../scripts/content/lib/schema-constants.mjs';
import { STATES } from '../../src/lib/states-directory';
import { applicableQuestions, byCategory } from '../../src/lib/questions';
import type { Question } from '../../src/lib/types';

/**
 * docs/CHANGE_SPEC_COMPLETENESS.md §10, `content-coverage.test.ts` row:
 * "≥500 applicable questions per state; ≥25 per category per state; tier
 * minimums hold; per-category column arithmetic matches the §2.1 table;
 * sub-requirements satisfiable 5× over (NY needs ≥20 road-signs items to vary
 * a 4-question draw); every stateExceptions entry has a replacesQuestionId
 * covering it."
 *
 * §2: "There is exactly one acceptance contract, and it is a floor: every
 * jurisdiction must reach ≥500 applicable questions and ≥25 in every
 * category ... Tier minimums (T1≥400, T2≥60, T3≥50) are secondary assertions
 * ... Where any two numbers in this document disagree, the floor governs."
 */
describe('content coverage', () => {
  let questions: Question[];
  let states: ReturnType<typeof loadAllStates>['records'];

  beforeAll(() => {
    questions = loadAllQuestions() as unknown as Question[];
    states = loadAllStates().records;
  });

  it(`every jurisdiction has ≥${FLOOR_PER_STATE_TOTAL} applicable questions (§2 floor)`, () => {
    const shortfalls: string[] = [];
    for (const { code } of STATES) {
      const pool = applicableQuestions(questions, code);
      if (pool.length < FLOOR_PER_STATE_TOTAL) {
        shortfalls.push(`${code}: ${pool.length} applicable questions (< ${FLOOR_PER_STATE_TOTAL})`);
      }
    }
    expect(shortfalls).toEqual([]);
  });

  it(`every jurisdiction has ≥${FLOOR_PER_CATEGORY} applicable questions per category (§2 floor)`, () => {
    const shortfalls: string[] = [];
    for (const { code } of STATES) {
      const pool = applicableQuestions(questions, code);
      for (const category of Object.keys(CATEGORY_TARGETS) as Question['category'][]) {
        const count = byCategory(pool, category).length;
        if (count < FLOOR_PER_CATEGORY) {
          shortfalls.push(`${code}/${category}: ${count} applicable questions (< ${FLOOR_PER_CATEGORY})`);
        }
      }
    }
    expect(
      shortfalls.length,
      `${shortfalls.length} state/category cells fall below the ${FLOOR_PER_CATEGORY}-question floor. ` +
        `First 15: ${shortfalls.slice(0, 15).join('; ')}`,
    ).toBe(0);
  });

  it('tier minimums hold where tiers are populated (T1≥400, T2≥60, T3≥50) — a secondary assertion, not the floor', () => {
    const perStateTierCounts = new Map<string, { T1: number; T2: number; T3: number; untiered: number }>();
    for (const { code } of STATES) {
      perStateTierCounts.set(code, { T1: 0, T2: 0, T3: 0, untiered: 0 });
    }
    for (const { code } of STATES) {
      const pool = applicableQuestions(questions, code);
      const counts = perStateTierCounts.get(code)!;
      for (const q of pool) {
        if (q.tier === 'T1') counts.T1 += 1;
        else if (q.tier === 'T2') counts.T2 += 1;
        else if (q.tier === 'T3') counts.T3 += 1;
        else counts.untiered += 1;
      }
    }
    const anyTiered = [...perStateTierCounts.values()].some((c) => c.T1 + c.T2 + c.T3 > 0);
    // Non-vacuous gate: this floor cannot be honestly asserted true if no
    // question has been tiered at all yet — that is itself the gap.
    expect(
      anyTiered,
      `0 questions across all states carry a tier (T1/T2/T3). §2's tier-minimum ` +
        `assertion (T1≥400, T2≥60, T3≥50 per state) cannot be evaluated until the ` +
        `§2 tier reshape (build order step 6/7) has run.`,
    ).toBe(true);

    const shortfalls: string[] = [];
    for (const [code, counts] of perStateTierCounts) {
      if (counts.T1 < 400) shortfalls.push(`${code}: T1=${counts.T1} (< 400)`);
      if (counts.T2 < 60) shortfalls.push(`${code}: T2=${counts.T2} (< 60)`);
      if (counts.T3 < 50) shortfalls.push(`${code}: T3=${counts.T3} (< 50)`);
    }
    expect(shortfalls).toEqual([]);
  });

  it('the §2.1 per-category column arithmetic (T1+T2+T3=perState, and totals=555) is internally consistent', () => {
    const mismatches: string[] = [];
    let t1Sum = 0;
    let t2Sum = 0;
    let t3Sum = 0;
    let perStateSum = 0;
    for (const [category, target] of Object.entries(CATEGORY_TARGETS)) {
      const rowSum = target.t1 + target.t2 + target.t3;
      if (rowSum !== target.perState) {
        mismatches.push(`${category}: T1(${target.t1})+T2(${target.t2})+T3(${target.t3})=${rowSum}, expected perState=${target.perState}`);
      }
      t1Sum += target.t1;
      t2Sum += target.t2;
      t3Sum += target.t3;
      perStateSum += target.perState;
    }
    expect(mismatches).toEqual([]);
    expect(t1Sum).toBe(TOTAL_TARGET.t1);
    expect(t2Sum).toBe(TOTAL_TARGET.t2);
    expect(t3Sum).toBe(TOTAL_TARGET.t3);
    expect(perStateSum).toBe(TOTAL_TARGET.perState);
    expect(perStateSum).toBeGreaterThanOrEqual(FLOOR_PER_STATE_TOTAL);
  });

  it('every subRequirements draw is satisfiable 5× over without repeating a question (§10 example: NY needs ≥20 road-signs items for a 4-question draw)', () => {
    const shortfalls: string[] = [];
    let subReqCount = 0;
    for (const state of states) {
      const variants = state.examVariants ?? state.examVariant ?? [];
      const variantList = Array.isArray(variants) ? variants : [variants];
      for (const variant of variantList) {
        for (const sub of variant.subRequirements ?? []) {
          subReqCount += 1;
          const pool = applicableQuestions(questions, state.code);
          const available = byCategory(pool, sub.category).length;
          const required = sub.outOf * 5;
          if (available < required) {
            shortfalls.push(
              `${state.code}/${variant.variantId}: subRequirement "${sub.category}" draws ${sub.outOf} but only ` +
                `${available} applicable ${sub.category} questions exist (need ≥${required} for a 5x-over margin)`,
            );
          }
        }
      }
    }
    // Non-vacuous gate: only 3 states currently author subRequirements at all
    // (§0 "Realistic mock exams" gap row). If none were found, say so plainly.
    expect(
      subReqCount,
      `0 examVariants across all states declare subRequirements. §0 records this as a known gap ` +
        `("subRequirements authored for only 3 states") — expected >0 here.`,
    ).toBeGreaterThan(0);
    expect(shortfalls).toEqual([]);
  });

  it('every stateExceptions entry is covered by a replacesQuestionId on a state-specific replacement', () => {
    const byId = new Map(questions.map((q) => [q.id, q] as const));
    const uncovered: string[] = [];
    let stateExceptionEntries = 0;
    for (const q of questions) {
      for (const excludedState of q.stateExceptions ?? []) {
        stateExceptionEntries += 1;
        const replacement = questions.find(
          (candidate) =>
            candidate.replacesQuestionId === q.id &&
            (candidate.stateScope === 'all' ? false : candidate.stateScope.includes(excludedState)),
        );
        if (!replacement) {
          uncovered.push(`${q.id} excludes ${excludedState} but no question has replacesQuestionId="${q.id}" scoped to ${excludedState}`);
        }
      }
    }
    // Reported for visibility, not asserted-nonzero: §4.6 sweeps may legitimately
    // reach 0 stateExceptions today (no sweep-vs-replacement content authored yet).
    // eslint-disable-next-line no-console
    if (stateExceptionEntries === 0) {
      console.warn('content-coverage: 0 stateExceptions entries found in the corpus — nothing to check yet (§4.6 sweeps not authored).');
    }
    expect(uncovered).toEqual([]);
    void byId;
  });
});
