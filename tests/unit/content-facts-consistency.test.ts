import { existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { loadAllQuestions, loadAllStates, repoPath } from '../../scripts/content/lib/content-io.mjs';
import { CATEGORY_TARGETS, TOTAL_TARGET, TYPED_FACT_KEYS } from '../../scripts/content/lib/schema-constants.mjs';
import { TEMPLATE_ALLOCATION } from '../../src/content/taxonomy/template-allocation';

/**
 * docs/CHANGE_SPEC_COMPLETENESS.md §10, `content-facts-consistency.test.ts` row:
 * "generated files byte-identical to a fresh regeneration (§4.5); every
 * question's declared claims[] match its state's typed facts — declared, not
 * inferred ...; every fact consumed by a template is confidence:'verified';
 * the template allocation table sums to the per-category T2 targets."
 *
 * §11 places the generator, the typed facts, and T2 authoring at build-order
 * steps 3/4/7 — after the order-1 contracts this suite otherwise verifies.
 * Where those artifacts don't exist yet, this suite fails loudly and
 * specifically rather than skipping (a skip would be a vacuous pass).
 */
describe('content facts-consistency', () => {
  it('the template allocation table sums to the §2.1 per-category T2 targets', () => {
    const sums: Record<string, number> = {};
    for (const tpl of TEMPLATE_ALLOCATION) {
      sums[tpl.category] = (sums[tpl.category] ?? 0) + tpl.instancesPerState;
    }
    const mismatches: string[] = [];
    for (const [category, target] of Object.entries(CATEGORY_TARGETS)) {
      const actual = sums[category] ?? 0;
      if (actual !== target.t2) {
        mismatches.push(`${category}: allocation table sums to ${actual}, §2.1 requires ${target.t2}`);
      }
    }
    expect(mismatches, 'src/content/taxonomy/template-allocation.ts must sum to the §2.1 T2 column per category').toEqual([]);

    const total = Object.values(sums).reduce((a, b) => a + b, 0);
    expect(total, `Template allocation table totals ${total}; §2 requires exactly ${TOTAL_TARGET.t2} T2 questions per state`).toBe(
      TOTAL_TARGET.t2,
    );
  });

  it('every template requirement references a real, defined typed-fact key', () => {
    const violations: string[] = [];
    for (const tpl of TEMPLATE_ALLOCATION) {
      for (const factKey of tpl.requires) {
        if (!TYPED_FACT_KEYS.includes(factKey)) {
          violations.push(`${tpl.id} requires unknown fact key "${factKey}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('the fact-templated generator and its output exist and are byte-reproducible (§4.5)', () => {
    const generatorPath = repoPath('scripts/content/generate-templated.mjs');
    const generatedDir = repoPath('src/content/questions/generated');
    const generatorExists = existsSync(generatorPath);
    const generatedDirExists = existsSync(generatedDir);
    expect(
      generatorExists,
      `Expected scripts/content/generate-templated.mjs (§4, §11 build order step 3) to exist ` +
        `so T2 generation can be verified byte-reproducible. It does not yet — T2 authoring ` +
        `(build order step 7) has not started.`,
    ).toBe(true);
    expect(
      generatedDirExists,
      `Expected src/content/questions/generated/<code>.json (§2 target corpus shape) to exist. ` +
        `It does not yet.`,
    ).toBe(true);
  });

  it('typed facts are authored and source-verified for all 51 states before any T2 claim can be checked (§3, §9.0)', () => {
    const { records } = loadAllStates();
    const withTypedFacts = records.filter((s: any) => s.typedFacts && Object.keys(s.typedFacts).length > 0);
    expect(
      withTypedFacts.length,
      `§3 requires ~32 typed facts per state (~1,600 records) before T2 generation or claims ` +
        `consistency can be verified. ${withTypedFacts.length} of ${records.length} states currently ` +
        `carry a non-empty typedFacts object.`,
    ).toBe(records.length);
  });

  it("every question's declared claims[] reference a fact that exists on its state(s) with confidence:'verified'", () => {
    const questions = loadAllQuestions();
    const { byCode } = loadAllStates();
    const claimed = questions.filter((q: any) => Array.isArray(q.claims) && q.claims.length > 0);

    // Non-vacuous gate: if no question declares claims yet, that is itself the
    // gap (T2 generation, build order step 7, hasn't produced any claims-bearing
    // questions), not a silent pass.
    expect(
      claimed.length,
      `0 questions currently declare claims[]. Once T2 generation exists this test must find ` +
        `>0 claiming questions and validate each factKey against the claiming state's typedFacts.`,
    ).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const q of claimed) {
      const states: string[] = q.stateScope === 'all' ? [] : q.stateScope;
      for (const stateCode of states) {
        const state = byCode.get(stateCode);
        for (const claim of q.claims) {
          const fact = state?.typedFacts?.[claim.factKey];
          if (!fact) {
            violations.push(`${q.id}: claims factKey "${claim.factKey}" not present in ${stateCode}.typedFacts`);
          } else if (fact.confidence !== 'verified') {
            violations.push(`${q.id}: claims factKey "${claim.factKey}" in ${stateCode} has confidence "${fact.confidence}", not "verified"`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
