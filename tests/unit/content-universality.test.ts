import { describe, it, expect, beforeAll } from 'vitest';
import { loadAllQuestions } from '../../scripts/content/lib/content-io.mjs';
import {
  matchedStateVariablePatterns,
  buildJurisdictionNameRegex,
  containsJurisdictionName,
  TYPED_FACT_KEY_TO_PATTERN,
  TYPED_FACT_EXEMPTIONS,
} from '../../scripts/content/lib/universality.mjs';
import { TYPED_FACT_KEYS } from '../../scripts/content/lib/schema-constants.mjs';
import { STATES } from '../../src/lib/states-directory';

/**
 * docs/CHANGE_SPEC_COMPLETENESS.md §10, `content-universality.test.ts` row + §2.2:
 * "national items declare a universality.basis; no legal-rule item claims
 * concept-only; prompt, all options and explanation contain no jurisdiction
 * name and no state-variable quantity; every typedFacts key maps to a lint
 * pattern or an explicit exemption; sweep-based items have a ledger covering
 * all 51 with stateExceptions matching the ledger's exceptions."
 */
const LEGAL_MODAL_PHRASING = /\b(must|may|is required|is prohibited|shall|is not permitted)\b/i;

describe('content universality', () => {
  let questions: any[];
  let jurisdictionRegex: RegExp;

  beforeAll(() => {
    questions = loadAllQuestions();
    jurisdictionRegex = buildJurisdictionNameRegex(STATES.flatMap((s) => [s.name]));
  });

  it('every typedFacts key maps to at least one lint pattern or carries an explicit exemption (§2.2)', () => {
    const uncovered = TYPED_FACT_KEYS.filter(
      (key: string) => !(key in TYPED_FACT_KEY_TO_PATTERN) && !(key in TYPED_FACT_EXEMPTIONS),
    );
    expect(uncovered).toEqual([]);
  });

  it('every national (stateScope: "all") item declares universality.basis (§2.2 refinement)', () => {
    const national = questions.filter((q) => q.stateScope === 'all');
    const missingBasis = national.filter((q) => !q.universality?.basis);
    expect(
      missingBasis.length,
      `${missingBasis.length}/${national.length} national items have no universality.basis. ` +
        `First 5 ids: ${missingBasis.slice(0, 5).map((q) => q.id).join(', ')}`,
    ).toBe(0);
  });

  it('no legal-rule item claims basis "concept-only" (restricted to non-legal content, §2.2)', () => {
    const conceptOnlyLegal: string[] = [];
    for (const q of questions) {
      if (q.universality?.basis !== 'concept-only') continue;
      const text = [q.prompt, ...(q.options ?? []), q.explanation ?? ''].join(' ');
      if (LEGAL_MODAL_PHRASING.test(text)) {
        conceptOnlyLegal.push(`${q.id}: claims concept-only but contains legal modal phrasing`);
      }
    }
    expect(conceptOnlyLegal).toEqual([]);
  });

  it('a fact-sweep or manual-audit basis always carries a sweepId (§2.2 refinement)', () => {
    const missingSweepId = questions.filter(
      (q) => (q.universality?.basis === 'fact-sweep' || q.universality?.basis === 'manual-audit') && !q.universality?.sweepId,
    );
    expect(missingSweepId.map((q) => q.id)).toEqual([]);
  });

  it('national items contain no jurisdiction name and no state-variable quantity in prompt, options, or explanation (§2.2 lint)', () => {
    const national = questions.filter((q) => q.stateScope === 'all');
    // Non-vacuous gate: this lint is meaningless to assert clean over zero items.
    expect(national.length, 'no national (stateScope: "all") items found to lint').toBeGreaterThan(0);

    const violations: string[] = [];
    for (const q of national) {
      const text = [q.prompt, ...(q.options ?? []), q.explanation ?? ''].join(' ');
      const patternHits = matchedStateVariablePatterns(text);
      if (patternHits.length > 0) {
        violations.push(`${q.id}: contains state-variable pattern(s) [${patternHits.join(', ')}]`);
      }
      if (containsJurisdictionName(text, jurisdictionRegex)) {
        violations.push(`${q.id}: contains a jurisdiction name`);
      }
    }
    expect(
      violations.length,
      `${violations.length}/${national.length} national items fail the universality lint. First 10: ${violations.slice(0, 10).join('; ')}`,
    ).toBe(0);
  });

  it('every sweep-based (fact-sweep/manual-audit) item has a ledger covering all 51 jurisdictions, and its stateExceptions match the ledger exceptions', () => {
    const sweepBased = questions.filter((q) => q.universality?.basis === 'fact-sweep' || q.universality?.basis === 'manual-audit');
    // Non-vacuous gate: §11 places universality-sweep.mjs at build order step 3
    // and no sweep ledgers exist under src/content/audits/sweeps/ yet.
    expect(
      sweepBased.length,
      '0 questions currently declare basis "fact-sweep" or "manual-audit". Once ' +
        'scripts/content/universality-sweep.mjs (§2.2, §11 build order step 3) runs and produces ' +
        'ledgers, this test must validate each against its ledger.',
    ).toBeGreaterThan(0);
  });
});
