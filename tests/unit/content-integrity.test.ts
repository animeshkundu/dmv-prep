import { describe, it, expect, beforeAll } from 'vitest';
import { loadAllQuestions } from '../../scripts/content/lib/content-io.mjs';
import { hasAnyStatuteSectionId } from '../../scripts/content/lib/citations.mjs';

/**
 * docs/CHANGE_SPEC_COMPLETENESS.md §10, `content-integrity.test.ts` row:
 * "exactly 4 distinct options; valid correctIndex; ≥1 citation with a real
 * section id; draft items name their verification blocker; non-draft items
 * record verifiedBy and verifiedAt; globally unique ids."
 *
 * This suite reads the raw JSON straight off disk (not through astro:content,
 * which vitest cannot load) so it exercises exactly the bytes that ship.
 * Content-quality assertions remain hard floors. The draft assertion is a
 * provenance-honesty gate: until cross-lab verification is available, a
 * question may be draft only when it names the blocker; a non-draft claim
 * still requires reviewer evidence.
 */
describe('content integrity', () => {
  let questions: Array<Record<string, any>>;

  beforeAll(() => {
    questions = loadAllQuestions();
  });

  it('loads a non-empty question corpus to test against', () => {
    expect(questions.length).toBeGreaterThan(0);
  });

  it('every question has exactly 4 distinct options', () => {
    const violations = questions.filter((q) => {
      const options = q.options;
      if (!Array.isArray(options) || options.length !== 4) return true;
      return new Set(options).size !== 4;
    });
    expect(
      violations.map((q) => `${q.__file}#${q.id ?? q.__index}`),
      `Expected every question to have exactly 4 distinct options. ${violations.length} of ${questions.length} do not.`,
    ).toEqual([]);
  });

  it('every question has a valid correctIndex', () => {
    const violations = questions.filter((q) => {
      const idx = q.correctIndex;
      const options = Array.isArray(q.options) ? q.options : [];
      return typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= options.length;
    });
    expect(
      violations.map((q) => `${q.__file}#${q.id ?? q.__index} correctIndex=${q.correctIndex}`),
      `Expected every question's correctIndex to be a valid index into its options.`,
    ).toEqual([]);
  });

  it('every question carries at least one citation with a real, checkable section id', () => {
    const violations = questions.filter((q) => !hasAnyStatuteSectionId(q.references));
    // Documented, expected-to-fail floor: today the corpus mostly cites handbook
    // chapter titles ("Illinois Rules of the Road, Speed limits"), not a statute
    // or regulation locator. See docs/CHANGE_SPEC_COMPLETENESS.md §1.1 and §9.
    expect(
      violations.length,
      `Expected every question to cite at least one real statute/regulation/MUTCD ` +
        `section locator (e.g. "O.C.G.A. § 40-6-391", "MUTCD Ch. 2B"), not just a ` +
        `handbook chapter title. ${violations.length} of ${questions.length} questions ` +
        `have no such citation. First few offenders: ` +
        `${violations.slice(0, 5).map((q) => `${q.__file}#${q.id}`).join(', ')}`,
    ).toBe(0);
  });

  it('draft questions identify their cross-lab verification blocker', () => {
    const violations = questions.filter(
      (q) => (q.reviewStatus === 'draft' || q.reviewStatus === undefined) && !q.verifyNote,
    );
    expect(
      violations.map((q) => `${q.__file}#${q.id}`),
      `docs/CHANGE_SPEC_COMPLETENESS.md §9.2 requires draft content to state why it cannot ` +
        `be verified. ${violations.length} question(s) are draft/unset without a verifyNote.`,
    ).toEqual([]);
  });

  it('every non-draft question records verifiedBy and verifiedAt', () => {
    const nonDraft = questions.filter((q) => q.reviewStatus && q.reviewStatus !== 'draft');
    const violations = nonDraft.filter((q) => !q.verifiedBy || !q.verifiedAt);
    expect(
      violations.length,
      `docs/CHANGE_SPEC_COMPLETENESS.md §9.2: a non-draft reviewStatus without ` +
        `verifiedBy/verifiedAt is an unfalsifiable stamp. ${violations.length} of ` +
        `${nonDraft.length} non-draft questions are missing one or both fields. ` +
        `First few offenders: ${violations.slice(0, 5).map((q) => `${q.__file}#${q.id}`).join(', ')}`,
    ).toBe(0);
  });

  it('question ids are globally unique', () => {
    const seen = new Map<string, string[]>();
    for (const q of questions) {
      const id = String(q.id ?? '');
      const locations = seen.get(id) ?? [];
      locations.push(q.__file);
      seen.set(id, locations);
    }
    const duplicates = [...seen.entries()].filter(([, locations]) => locations.length > 1);
    expect(
      duplicates.map(([id, locations]) => `${id}: ${locations.join(', ')}`),
      'Expected every question id to be globally unique across the corpus.',
    ).toEqual([]);
  });
});
