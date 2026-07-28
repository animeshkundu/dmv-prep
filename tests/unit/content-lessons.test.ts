import { describe, it, expect, beforeAll } from 'vitest';
import { loadLessonFiles, loadStateNotes, loadAllQuestions } from '../../scripts/content/lib/content-io.mjs';
import { LESSON_MODULES, TOTAL_LESSON_UNITS, TYPED_FACT_KEYS } from '../../scripts/content/lib/schema-constants.mjs';
import { matchedStateVariablePatterns, buildJurisdictionNameRegex, containsJurisdictionName } from '../../scripts/content/lib/universality.mjs';
import { STATES } from '../../src/lib/states-directory';
import { applicableQuestions } from '../../src/lib/questions';

/**
 * docs/CHANGE_SPEC_COMPLETENESS.md §10, `content-lessons.test.ts` row + §5:
 * "all 35 units present per the §5.1 table; unique unitId; contiguous module
 * order; factCallouts keys valid against TYPED_FACT_KEYS; quizTags match ≥8
 * questions/state; national bodies state-neutral; state notes cite a source
 * and reference a real unitId."
 *
 * §5.1's own module/unit table (11 modules, 35 units, transcribed verbatim
 * into scripts/content/lib/schema-constants.mjs LESSON_MODULES) is treated as
 * ground truth here — not `src/lib/lessonBindings.ts`, which exists in this
 * repo but diverges from the spec's module names/category mapping (e.g. it
 * splits "signals-markings" into two modules and invents a "driver-requirements"
 * module absent from §5.1). Per this task's instruction to encode the
 * authoritative floors "without weakening", the spec document — not a
 * possibly-drifted implementation artifact — is authoritative.
 */
describe('content lessons', () => {
  let lessons: any[];
  let stateNotes: any[];
  let questions: any[];

  beforeAll(() => {
    lessons = loadLessonFiles();
    stateNotes = loadStateNotes();
    questions = loadAllQuestions();
  });

  it(`all ${TOTAL_LESSON_UNITS} units from the §5.1 module table exist as lesson documents with a matching unitId`, () => {
    const expectedUnitIds = new Set<string>();
    for (const { units } of LESSON_MODULES) {
      for (const unit of units) expectedUnitIds.add(unit);
    }
    const actualUnitIds = new Set(lessons.map((l) => l.unitId).filter(Boolean));
    const missing = [...expectedUnitIds].filter((u) => !actualUnitIds.has(u));
    expect(
      missing.length,
      `${missing.length}/${expectedUnitIds.size} §5.1 units have no corresponding lesson document ` +
        `(matched by frontmatter \`unitId\`). Only ${lessons.length} lesson file(s) exist under ` +
        `src/content/lessons/, and the current schema does not even declare a \`unitId\` field yet. ` +
        `First 10 missing: ${missing.slice(0, 10).join(', ')}`,
    ).toBe(0);
  });

  it('every lesson declares a module from the §5.1 table, and unitId values are globally unique', () => {
    const validModules = new Set(LESSON_MODULES.map((m) => m.module));
    const badModule = lessons.filter((l) => !validModules.has(l.module));
    expect(
      badModule.length,
      `${badModule.length}/${lessons.length} lesson(s) declare a module outside the §5.1 table ` +
        `(or no module field at all). Files: ${badModule.map((l) => l.__file).join(', ')}`,
    ).toBe(0);

    const seen = new Map<string, string[]>();
    for (const l of lessons) {
      if (!l.unitId) continue;
      seen.set(l.unitId, [...(seen.get(l.unitId) ?? []), l.__file]);
    }
    const duplicates = [...seen.entries()].filter(([, files]) => files.length > 1);
    expect(duplicates).toEqual([]);
  });

  it('each module\'s lessons are numbered with a contiguous, zero-based `order`', () => {
    // Non-vacuous gate: cannot assert contiguity meaningfully over zero lessons.
    expect(lessons.length, 'no lesson documents found under src/content/lessons/').toBeGreaterThan(0);

    const byModule = new Map<string, number[]>();
    for (const l of lessons) {
      if (!l.module) continue;
      byModule.set(l.module, [...(byModule.get(l.module) ?? []), l.order]);
    }
    const gaps: string[] = [];
    for (const [module, orders] of byModule) {
      const sorted = [...orders].sort((a, b) => a - b);
      const expected = sorted.map((_, i) => i);
      if (JSON.stringify(sorted) !== JSON.stringify(expected)) {
        gaps.push(`${module}: order values ${JSON.stringify(sorted)}, expected contiguous 0..${sorted.length - 1}`);
      }
    }
    expect(gaps).toEqual([]);
  });

  it('every factCallouts entry references a real TYPED_FACT_KEYS key (§3/§5.2)', () => {
    const withCallouts = lessons.filter((l) => Array.isArray(l.factCallouts) && l.factCallouts.length > 0);
    const violations: string[] = [];
    for (const l of withCallouts) {
      for (const key of l.factCallouts) {
        if (!TYPED_FACT_KEYS.includes(key)) violations.push(`${l.__file}: factCallouts references unknown key "${key}"`);
      }
    }
    expect(violations).toEqual([]);
    // Reported for visibility rather than asserted-nonzero: factCallouts is
    // optional per-lesson, so 0 is not necessarily wrong on its own — but it is
    // worth surfacing since the schema field doesn't exist on any lesson yet.
    if (withCallouts.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('content-lessons: 0 lesson documents declare factCallouts (schema field not present in src/content.config.ts lessons collection yet).');
    }
  });

  it('every lesson quizTags entry matches ≥8 questions in every state it applies to (§5.3)', () => {
    const withQuizTags = lessons.filter((l) => Array.isArray(l.quizTags) && l.quizTags.length > 0);
    // Non-vacuous gate: §5.3 requires this binding to exist and be checkable.
    expect(
      withQuizTags.length,
      '0 lesson documents declare quizTags. §5.3 requires the tag-based study->quiz binding ' +
        '(questions[].tags + src/content/taxonomy/tags.json vocabulary + lesson quizTags) to exist ' +
        'before this can be verified.',
    ).toBeGreaterThan(0);

    const shortfalls: string[] = [];
    for (const l of withQuizTags) {
      const states = l.stateScope === 'all' || !l.stateScope ? STATES.map((s) => s.code) : l.stateScope;
      for (const code of states) {
        const pool = applicableQuestions(questions, code);
        for (const tag of l.quizTags) {
          const count = pool.filter((q: any) => Array.isArray(q.tags) && q.tags.includes(tag)).length;
          if (count < 8) shortfalls.push(`${l.unitId ?? l.__file}/${code}: quizTag "${tag}" matches only ${count} questions (< 8)`);
        }
      }
    }
    expect(shortfalls.slice(0, 20)).toEqual([]);
  });

  it('national lesson bodies (stateScope: "all") are provably state-neutral — same universality lint as T1 questions (§5, §2.2)', () => {
    const national = lessons.filter((l) => l.stateScope === 'all' || !l.stateScope);
    expect(national.length, 'no national (stateScope: "all") lesson documents found').toBeGreaterThan(0);

    const jurisdictionRegex = buildJurisdictionNameRegex(STATES.map((s) => s.name));
    const violations: string[] = [];
    for (const l of national) {
      const text = l.__body ?? '';
      const patternHits = matchedStateVariablePatterns(text);
      if (patternHits.length > 0) violations.push(`${l.__file}: body contains state-variable pattern(s) [${patternHits.join(', ')}]`);
      if (containsJurisdictionName(text, jurisdictionRegex)) violations.push(`${l.__file}: body contains a jurisdiction name`);
    }
    expect(violations).toEqual([]);
  });

  it('every state note cites a source and references a real unitId (§5.2 stateNotes collection)', () => {
    // Non-vacuous gate: the stateNotes collection (src/content/state-notes/)
    // is not yet registered in src/content.config.ts and no files exist there.
    expect(
      stateNotes.length,
      '0 state notes found under src/content/state-notes/. §5 requires ~4-8 hand-written state ' +
        'deltas per state (~300 total) once the stateNotes collection (§5.2) is registered and authored.',
    ).toBeGreaterThan(0);

    const unitIds = new Set(lessons.map((l) => l.unitId).filter(Boolean));
    const violations: string[] = [];
    for (const note of stateNotes) {
      if (!note.unitId || !unitIds.has(note.unitId)) {
        violations.push(`${note.id ?? note.__file}: unitId "${note.unitId}" does not match a real lesson unitId`);
      }
      if (!Array.isArray(note.references) || note.references.length === 0) {
        violations.push(`${note.id ?? note.__file}: no references/citation`);
      }
    }
    expect(violations).toEqual([]);
  });
});
