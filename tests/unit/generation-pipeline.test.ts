import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildCtx,
  buildInstances,
  evaluateTemplateForState,
  generateForState,
} from '../../scripts/content/lib/generation-engine.mjs';
import { factInputHash, getVerifiedFact, statusEligibility } from '../../scripts/content/lib/facts.mjs';
import { buildSalt, saltedIndex, saltedSample } from '../../scripts/content/lib/salts.mjs';
import { BAC_LATTICE, SPEED_LATTICE, nearestLatticeNeighbors } from '../../scripts/content/lib/lattices.mjs';
import {
  loadTemplateRegistry,
  templateContentHash,
  templateVerificationErrors,
  validateTemplateRegistry,
} from '../../scripts/content/lib/template-registry.mjs';
import { repoPath } from '../../scripts/content/lib/content-io.mjs';
import { run } from '../../scripts/content/generate-templated.mjs';
import { TEMPLATE_ALLOCATION } from '../../src/content/taxonomy/template-allocation';
import { CATEGORY_TARGETS } from '../../scripts/content/lib/schema-constants.mjs';

/**
 * docs/CHANGE_SPEC_COMPLETENESS.md §3, §4, §11 build order step 3: the
 * deterministic T2 (fact-templated) generation pipeline tooling. Exercises
 * `scripts/content/lib/generation-engine.mjs` and its supporting libraries
 * with fixture templates/states — never the real (currently empty) template
 * registry or the real, not-yet-migrated typed facts — so this suite is
 * independent of build-order steps 4 (typed facts) and 7 (T2 authoring),
 * which this change deliberately does not do.
 */

function fact(overrides: any = {}) {
  return {
    state: { status: 'value', value: 0.08 },
    display: '0.08%',
    citation: { label: 'Fixture Handbook', citation: 'FIX §1' },
    effectiveDate: '2024-01-01',
    lastVerified: '2024-01-01',
    confidence: 'verified',
    ...overrides,
  };
}

function state(overrides: any = {}) {
  return {
    code: 'WA',
    name: 'Washington',
    agencyShort: 'WA DOL',
    ...overrides,
    typedFacts: {
      bacAdult: fact({ state: { status: 'value', value: 0.08 }, display: '0.08%' }),
      bacCommercial: fact({ state: { status: 'value', value: 0.04 }, display: '0.04%' }),
      residentialDefaultMph: fact({
        state: { status: 'value', value: 25 },
        display: '25 mph',
        confidence: 'inferred', // deliberately unverified
      }),
      schoolZoneMph: fact({
        state: {
          status: 'varies',
          variants: [{ value: 20, conditions: [{ kind: 'posting', detail: 'when children are present' }] }],
        },
        display: '20 mph when posted',
      }),
      pointSystem: fact({ state: { status: 'unknown', reason: 'not documented in fixture' }, display: 'unknown' }),
      basicSpeedLaw: fact({ state: { status: 'not-applicable', reason: 'no such rule in fixture state' } }),
      ...(overrides.typedFacts ?? {}),
    },
  };
}

function bacTemplate(overrides: any = {}) {
  return {
    id: 'tpl-fixture-bac-adult',
    version: 1,
    category: 'alcohol-drugs',
    tags: ['bac', 'impairment'],
    requires: ['bacAdult'],
    supportsStatuses: ['value'],
    instancesPerState: 2,
    prompts: [
      (c: any) => `In ${c.name}, what is the legal BAC limit for an adult driver?`,
      (c: any) => `${c.agencyShort}: what BAC level defines adult legal impairment?`,
      (c: any) => `What is the maximum BAC allowed for a non-commercial adult driver in ${c.name}?`,
      (c: any) => `An adult driver in ${c.name} is considered impaired per se at what BAC?`,
    ],
    correct: (c: any) => c.facts.bacAdult.display,
    distractorPool: (c: any) =>
      nearestLatticeNeighbors(BAC_LATTICE, c.facts.bacAdult.state.value, {
        exclude: [c.facts.bacCommercial?.state?.value].filter((v) => v !== undefined),
      })
        .map((v) => `${v}%`)
        .concat(['0.12%', '0.20%']),
    explanations: [
      (c: any) => `${c.name} sets the adult BAC limit at ${c.facts.bacAdult.display}.`,
      (c: any) => `Driving at or above ${c.facts.bacAdult.display} BAC is a per se DUI in ${c.name}.`,
      (c: any) => `The non-commercial adult per se limit in ${c.name} is ${c.facts.bacAdult.display}.`,
    ],
    difficulty: 'medium',
    claims: [{ factKey: 'bacAdult', usage: 'correct-answer' }],
    ...overrides,
  };
}

function speedTemplate(overrides: any = {}) {
  return {
    id: 'tpl-fixture-residential',
    version: 1,
    category: 'speed-limits',
    tags: ['speed', 'residential'],
    requires: ['residentialDefaultMph'],
    supportsStatuses: ['value'],
    instancesPerState: 1,
    prompts: [
      (c: any) => `p1 ${c.name}`,
      (c: any) => `p2 ${c.name}`,
      (c: any) => `p3 ${c.name}`,
      (c: any) => `p4 ${c.name}`,
    ],
    correct: (c: any) => c.facts.residentialDefaultMph.display,
    distractorPool: (c: any) => nearestLatticeNeighbors(SPEED_LATTICE, c.facts.residentialDefaultMph.state.value).map(String),
    explanations: [(c: any) => `e1 ${c.name}`, (c: any) => `e2 ${c.name}`, (c: any) => `e3 ${c.name}`],
    difficulty: 'easy',
    claims: [{ factKey: 'residentialDefaultMph', usage: 'correct-answer' }],
    ...overrides,
  };
}

describe('generation-engine: verified-only fact consumption (§3)', () => {
  it('accepts a confidence:verified, status:value fact', () => {
    const result: any = evaluateTemplateForState(bacTemplate(), state());
    expect(result.eligible).toBe(true);
    expect(result.factsUsed.bacAdult.fact.confidence).toBe('verified');
  });

  it('refuses a confidence:inferred fact even though the template otherwise qualifies', () => {
    const result = evaluateTemplateForState(speedTemplate(), state());
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('fact-unverified');
    expect(result.factKey).toBe('residentialDefaultMph');
  });

  it('refuses a fact key entirely absent from the state', () => {
    const s = state();
    delete s.typedFacts.bacAdult;
    const result = evaluateTemplateForState(bacTemplate(), s);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('fact-missing');
  });

  it('always skips not-applicable and unknown facts regardless of supportsStatuses', () => {
    const notApplicableTpl = bacTemplate({
      id: 'tpl-fixture-na',
      requires: ['basicSpeedLaw'],
      supportsStatuses: ['value', 'varies'],
      claims: [{ factKey: 'basicSpeedLaw', usage: 'correct-answer' }],
    });
    const unknownTpl = bacTemplate({
      id: 'tpl-fixture-unknown',
      requires: ['pointSystem'],
      supportsStatuses: ['value', 'varies'],
      claims: [{ factKey: 'pointSystem', usage: 'correct-answer' }],
    });
    expect(evaluateTemplateForState(notApplicableTpl, state())).toMatchObject({
      eligible: false,
      reason: 'fact-not-applicable',
    });
    expect(evaluateTemplateForState(unknownTpl, state())).toMatchObject({
      eligible: false,
      reason: 'fact-unknown',
    });
  });
});

describe('generation-engine: value/varies support only when the template declares it (§3)', () => {
  it("rejects a 'varies' fact when the template only declares supportsStatuses: ['value']", () => {
    const tpl = bacTemplate({
      id: 'tpl-fixture-school-value-only',
      requires: ['schoolZoneMph'],
      supportsStatuses: ['value'],
      claims: [{ factKey: 'schoolZoneMph', usage: 'correct-answer' }],
    });
    const result = evaluateTemplateForState(tpl, state());
    expect(result).toMatchObject({ eligible: false, reason: 'status-unsupported:varies' });
  });

  it("accepts a 'varies' fact once the template opts in via supportsStatuses", () => {
    const tpl = bacTemplate({
      id: 'tpl-fixture-school-varies',
      requires: ['schoolZoneMph'],
      supportsStatuses: ['varies'],
      claims: [{ factKey: 'schoolZoneMph', usage: 'correct-answer' }],
    });
    const result = evaluateTemplateForState(tpl, state());
    expect(result.eligible).toBe(true);
  });
});

describe('generation-engine: deterministic salts (§4.4)', () => {
  it('buildSalt keys are unique per template/state/instance/facet', () => {
    const a = buildSalt('tpl-x', 'WA', 1, 'prompt');
    const b = buildSalt('tpl-x', 'WA', 1, 'explanation');
    const c = buildSalt('tpl-x', 'WA', 2, 'prompt');
    const d = buildSalt('tpl-y', 'WA', 1, 'prompt');
    expect(new Set([a, b, c, d]).size).toBe(4);
  });

  it('saltedIndex and saltedSample are pure functions of their salt (same salt -> same result, always)', () => {
    const salt = buildSalt('tpl-fixture-bac-adult', 'WA', 1, 'prompt');
    const results = Array.from({ length: 5 }, () => saltedIndex(salt, 4));
    expect(new Set(results).size).toBe(1);

    const sampleSalt = buildSalt('tpl-fixture-bac-adult', 'WA', 1, 'distractors');
    const samples = Array.from({ length: 5 }, () => saltedSample(sampleSalt, 6, 3));
    expect(samples.slice(1)).toEqual(Array(4).fill(samples[0]));
  });

  it('two full generations of the same template/state are byte-identical (§4.5)', () => {
    const tpl = bacTemplate();
    const s = state();
    const evalA = evaluateTemplateForState(tpl, s);
    const evalB = evaluateTemplateForState(tpl, s);
    const first = buildInstances(tpl, s, evalA.factsUsed);
    const second = buildInstances(tpl, s, evalB.factsUsed);
    expect(JSON.stringify(first.rows.map((r) => r.question))).toBe(
      JSON.stringify(second.rows.map((r) => r.question)),
    );
  });

  it('picks the prompt/explanation phrasing exactly the salted index predicts', () => {
    const tpl = bacTemplate();
    const s = state();
    const evaluation = evaluateTemplateForState(tpl, s);
    expect(evaluation.eligible).toBe(true);
    if (!evaluation.eligible) throw new Error('Fixture BAC fact must be eligible.');
    const ctx = buildCtx(s, { bacAdult: s.typedFacts.bacAdult });
    const built = buildInstances(tpl, s, evaluation.factsUsed);
    const first = built.rows[0].question;
    const expectedPromptIdx = saltedIndex(buildSalt(tpl.id, s.code, 1, 'prompt'), tpl.prompts.length);
    const expectedExplanationIdx = saltedIndex(buildSalt(tpl.id, s.code, 1, 'explanation'), tpl.explanations.length);
    expect(first.prompt).toBe(tpl.prompts[expectedPromptIdx](ctx));
    expect(first.explanation).toBe(tpl.explanations[expectedExplanationIdx](ctx));
  });
});

describe('generation-engine: domain lattices, never random perturbation (§4.2)', () => {
  it('offers two neighbours below and one above the true value', () => {
    const neighbors = nearestLatticeNeighbors(BAC_LATTICE, 0.08);
    expect(neighbors).toEqual([0.04, 0.05, 0.1]);
  });

  it('excludes a value that is correct for a sibling fact on the same state', () => {
    // 0.04 is WA's commercial BAC limit in the fixture; it must never be
    // offered as a distractor against the adult-limit question.
    const neighbors = nearestLatticeNeighbors(BAC_LATTICE, 0.08, { exclude: [0.04] });
    expect(neighbors).not.toContain(0.04);
    expect(neighbors).toEqual([0.02, 0.05, 0.1]);
  });

  it('returns fewer than requested at the edge of the lattice rather than inventing a value', () => {
    const neighbors = nearestLatticeNeighbors(BAC_LATTICE, 0.0);
    expect(neighbors.length).toBeLessThan(3); // no value below the lattice minimum exists to invent
    expect(neighbors.every((v) => BAC_LATTICE.includes(v))).toBe(true);
    expect(neighbors).not.toContain(-0.01);
  });
});

describe('generation-engine: honest failure, never fabrication (§3, §11)', () => {
  it('records a per-instance shortfall instead of padding an insufficient distractor pool', () => {
    const tpl = bacTemplate({ distractorPool: () => ['0.05%', '0.10%'] }); // only 2, need 3
    const s = state();
    const evaluation = evaluateTemplateForState(tpl, s);
    const built = buildInstances(tpl, s, evaluation.factsUsed);
    expect(built.rows).toHaveLength(0);
    expect(built.shortfallCount).toBe(tpl.instancesPerState);
    expect(built.shortfallReason).toBe('insufficient-distractor-pool');
  });

  it('rejects placeholder options and a uniquely longest correct answer before either can ship', () => {
    const placeholder = bacTemplate({
      distractorPool: () => Array.from({ length: 6 }, (_, index) => `Option ${index + 1} which is plausible.`),
    });
    const longCorrect = bacTemplate({
      correct: () => 'A much longer answer that exposes the correct choice by length alone.',
      distractorPool: () => ['Short one.', 'Short two.', 'Short three.', 'Short four.', 'Short five.', 'Short six.'],
    });
    const s = state();

    const placeholderRows = buildInstances(placeholder, s, evaluateTemplateForState(placeholder, s).factsUsed);
    expect(placeholderRows.rows).toEqual([]);
    expect(placeholderRows.shortfallReason).toBe('placeholder-option-content');

    const longCorrectRows = buildInstances(longCorrect, s, evaluateTemplateForState(longCorrect, s).factsUsed);
    expect(longCorrectRows.rows).toEqual([]);
    expect(longCorrectRows.shortfallReason).toBe('option-length-parity');
  });

  it('never includes a wall-clock or verification stamp in a generated row (§4.5)', () => {
    const tpl = bacTemplate();
    const s = state();
    const evaluation = evaluateTemplateForState(tpl, s);
    const built = buildInstances(tpl, s, evaluation.factsUsed);
    for (const { question } of built.rows) {
      expect(question).not.toHaveProperty('generatedAt');
      expect(question).not.toHaveProperty('verifiedBy');
      expect(question).not.toHaveProperty('verifiedAt');
      expect(question).not.toHaveProperty('verificationAuditId');
      expect(question).not.toHaveProperty('sourceSnapshotHash');
      expect(question.reviewStatus).toBe('draft');
      expect(question.verifyNote).toContain('confidence:verified typed fact');
    }
  });

  it('an empty template registry produces zero fabricated questions and a full, honest shortfall', () => {
    const allocation = [{ id: 'tpl-fixture-bac-adult', category: 'alcohol-drugs', requires: ['bacAdult'], instancesPerState: 2 }];
    const result = generateForState({ state: state(), templates: [], allocation });
    expect(result.questions).toEqual([]);
    expect(result.shortfalls).toEqual([
      { category: 'alcohol-drugs', templateId: 'tpl-fixture-bac-adult', reason: 'template-missing', count: 2 },
    ]);
    expect(result.tagShortfalls).toEqual([
      {
        tag: 'template:tpl-fixture-bac-adult',
        templateId: 'tpl-fixture-bac-adult',
        category: 'alcohol-drugs',
        count: 2,
        reason: 'template-missing',
      },
    ]);
  });
});

describe('generation-engine: per-category fallback allocation with shortfalls and tagShortfalls (§3, §4)', () => {
  it('fills what it can, in table order, and records exactly what it could not', () => {
    const eligibleTpl = bacTemplate(); // 2 instances, eligible
    const ineligibleTpl = speedTemplate(); // 1 instance, blocked (unverified fact)
    const allocation = [
      { id: eligibleTpl.id, category: 'alcohol-drugs', requires: ['bacAdult'], instancesPerState: 2 },
      { id: ineligibleTpl.id, category: 'speed-limits', requires: ['residentialDefaultMph'], instancesPerState: 1 },
    ];
    const result = generateForState({ state: state(), templates: [eligibleTpl, ineligibleTpl], allocation });

    expect(result.questions).toHaveLength(2);
    expect(result.questions.every((q) => q.templateId === eligibleTpl.id)).toBe(true);

    const speedSummary = result.categorySummary.find((c: any) => c.category === 'speed-limits');
    expect(speedSummary).toEqual({ category: 'speed-limits', expected: 1, actual: 0, shortfall: 1 });
    const bacSummary = result.categorySummary.find((c: any) => c.category === 'alcohol-drugs');
    expect(bacSummary).toEqual({ category: 'alcohol-drugs', expected: 2, actual: 2, shortfall: 0 });

    expect(result.shortfalls).toEqual([
      {
        category: 'speed-limits',
        templateId: ineligibleTpl.id,
        reason: 'fact-unverified',
        factKey: 'residentialDefaultMph',
        count: 1,
      },
    ]);
    expect(result.tagShortfalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: 'speed', templateId: ineligibleTpl.id, category: 'speed-limits', count: 1 }),
        expect.objectContaining({ tag: 'residential', templateId: ineligibleTpl.id, category: 'speed-limits', count: 1 }),
      ]),
    );
  });

  it('every generated question row declares claims that resolve to verified facts on its state', () => {
    const tpl = bacTemplate();
    const allocation = [{ id: tpl.id, category: 'alcohol-drugs', requires: ['bacAdult'], instancesPerState: 2 }];
    const s = state();
    const result = generateForState({ state: s, templates: [tpl], allocation });
    for (const q of result.questions) {
      expect(q.claims.length).toBeGreaterThan(0);
      for (const claim of q.claims) {
        expect(s.typedFacts[claim.factKey].confidence).toBe('verified');
      }
    }
  });
});

describe('facts.mjs helpers', () => {
  it('getVerifiedFact distinguishes missing from unverified', () => {
    const s = state();
    expect(getVerifiedFact(s, 'bacAdult')).toMatchObject({ ok: true });
    expect(getVerifiedFact(s, 'residentialDefaultMph')).toEqual({ ok: false, reason: 'unverified' });
    expect(getVerifiedFact(s, 'thisKeyDoesNotExist')).toEqual({ ok: false, reason: 'missing' });
  });

  it('statusEligibility rejects not-applicable/unknown regardless of supportsStatuses', () => {
    expect(
      statusEligibility({ state: { status: 'not-applicable', reason: 'x' } }, ['value', 'varies']),
    ).toEqual({ ok: false, reason: 'fact-not-applicable' });
    expect(statusEligibility({ state: { status: 'unknown', reason: 'x' } }, ['value', 'varies'])).toEqual({
      ok: false,
      reason: 'fact-unknown',
    });
  });

  it('factInputHash is stable for the same fact decisions and changes when a decision changes', () => {
    const s = state();
    const facts = { bacAdult: { fact: s.typedFacts.bacAdult } };
    const h1 = factInputHash(facts);
    const h2 = factInputHash({ bacAdult: { fact: s.typedFacts.bacAdult } });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);

    const changed = { bacAdult: { fact: { ...s.typedFacts.bacAdult, state: { status: 'value', value: 0.05 } } } };
    expect(factInputHash(changed)).not.toBe(h1);

    // Provenance-only edits (citation text, lastVerified) must NOT change the hash.
    const reCited = {
      bacAdult: { fact: { ...s.typedFacts.bacAdult, lastVerified: '2030-01-01', citation: { label: 'x', citation: 'y' } } },
    };
    expect(factInputHash(reCited)).toBe(h1);
  });
});

describe('template-registry: maxTemplatesPerFactKey = 2 (§4.4)', () => {
  it('passes with exactly two templates requiring the same fact key', () => {
    const templates = [
      bacTemplate({ id: 'tpl-a' }),
      bacTemplate({ id: 'tpl-b' }),
    ];
    expect(validateTemplateRegistry(templates)).toMatchObject({ ok: true, errors: [] });
  });

  it('fails when a third template requires the same fact key', () => {
    const templates = [
      bacTemplate({ id: 'tpl-a' }),
      bacTemplate({ id: 'tpl-b' }),
      bacTemplate({ id: 'tpl-c' }),
    ];
    const result = validateTemplateRegistry(templates);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /bacAdult/.test(e) && /max/i.test(e))).toBe(true);
  });

  it('rejects malformed templates: too few prompts/explanations, and claims referencing an undeclared fact key', () => {
    const badPrompts = bacTemplate({ id: 'tpl-bad-prompts', prompts: [() => 'only one'] });
    const badClaims = bacTemplate({
      id: 'tpl-bad-claims',
      claims: [{ factKey: 'bacCommercial', usage: 'correct-answer' }], // not in requires
    });
    const result = validateTemplateRegistry([badPrompts, badClaims]);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('tpl-bad-prompts') && e.includes('prompts'))).toBe(true);
    expect(result.errors.some((e) => e.includes('tpl-bad-claims') && e.includes('bacCommercial'))).toBe(true);
  });

  it('the real (currently empty) registry loads and validates cleanly', async () => {
    const { templates, missing } = await loadTemplateRegistry({
      registryPath: repoPath('tests/fixtures/empty-template-registry.ts'),
    });
    expect(missing).toBe(false);
    expect(Array.isArray(templates)).toBe(true);
    expect(validateTemplateRegistry(templates)).toMatchObject({ ok: true });
  });

  it('the populated production registry loads and validates cleanly', async () => {
    const { templates, missing } = await loadTemplateRegistry();
    expect(missing).toBe(false);
    expect(templates.length).toBeGreaterThan(0);
    expect(validateTemplateRegistry(templates)).toMatchObject({ ok: true });
  });

  it('rejects a confirmed template entry when its content hash is stale', () => {
    const template = bacTemplate();
    const key = `${template.id}@${template.version}`;
    const hashes = new Map([[key, templateContentHash(template)]]);
    expect(templateVerificationErrors([template], hashes)).toEqual([]);
    hashes.set(key, '0'.repeat(64));
    expect(templateVerificationErrors([template], hashes)).toHaveLength(1);
  });
});

describe('generate-templated.mjs CLI: --check/--write contract (§4.5)', () => {
  it('requires exactly one of --check or --write', async () => {
    let message = '';
    const code = await run([], { log: () => {}, error: (m) => (message = m) });
    expect(code).toBe(1);
    expect(message).toMatch(/exactly one of --check or --write/);
  });

  it('rejects passing both --check and --write', async () => {
    const code = await run(['--check', '--write'], { log: () => {}, error: () => {} });
    expect(code).toBe(1);
  });

  it('--check against the real (template-less) repo passes without writing anything', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dmv-generation-check-'));
    rmSync(root, { recursive: true, force: true });
    const generatedDir = join(root, 'generated');
    const auditDir = join(root, 'audits');
    let message = '';
    const options = {
      log: () => {},
      error: (error: unknown) => (message = String(error)),
      templates: [],
      generatedDir,
      auditDir,
    };
    expect(await run(['--write'], options)).toBe(0);
    const before = { generated: existsSync(generatedDir), audits: existsSync(auditDir) };
    const code = await run(['--check'], options);

    expect(code, message).toBe(0);
    // --check must never write, regardless of what it found.
    expect(existsSync(generatedDir)).toBe(before.generated);
    expect(existsSync(auditDir)).toBe(before.audits);
  });

  describe('--write round trip', () => {
    const root = mkdtempSync(join(tmpdir(), 'dmv-generation-'));
    const generatedDir = join(root, 'generated');
    const auditDir = join(root, 'audits');

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it('writes empty, byte-reproducible generated files given the real empty registry, and --check then agrees', async () => {
      const options = { log: () => {}, error: () => {}, generatedDir, auditDir, templates: [] };
      const writeCode = await run(['--write'], options);
      expect(writeCode).toBe(0);
      expect(existsSync(generatedDir)).toBe(true);

      const waFile = join(generatedDir, 'wa.json');
      expect(existsSync(waFile)).toBe(true);
      expect(JSON.parse(readFileSync(waFile, 'utf8'))).toEqual([]);

      const auditFile = join(auditDir, 'wa.json');
      const audit = JSON.parse(readFileSync(auditFile, 'utf8'));
      expect(audit.code).toBe('WA');
      expect(Array.isArray(audit.shortfalls)).toBe(true);
      expect(audit.shortfalls.length).toBeGreaterThan(0);
      expect(Array.isArray(audit.tagShortfalls)).toBe(true);

      const checkCode = await run(['--check'], options);
      expect(checkCode).toBe(0);
    });
  });
});

describe('integration: the real §2.1 template-allocation table drives an honest full-shortfall report', () => {
  it('with zero registered templates, every category shortfall equals its §2.1 T2 target', () => {
    const result = generateForState({ state: state(), templates: [], allocation: TEMPLATE_ALLOCATION });
    for (const summary of result.categorySummary) {
      const target = (CATEGORY_TARGETS as any)[summary.category]?.t2 ?? 0;
      expect(summary.expected).toBe(target);
      expect(summary.actual).toBe(0);
      expect(summary.shortfall).toBe(target);
    }
    expect(result.questions).toEqual([]);
  });
});
