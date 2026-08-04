/**
 * The deterministic T2 generation engine (docs/CHANGE_SPEC_COMPLETENESS.md
 * §3, §4, §11 build order step 3). Pure functions only: no filesystem I/O, no
 * wall clock, no `Math.random`. `scripts/content/generate-templated.mjs` is
 * the thin CLI wrapper that feeds this real repo state and writes its output;
 * `tests/unit/generation-pipeline.test.ts` exercises it directly with
 * fixture templates and states.
 *
 * Byte-reproducibility (§4.5) falls out of that purity: calling
 * `generateForState` twice with the same `state`/`templates`/`allocation`
 * always returns deep-equal (and JSON-byte-identical) results.
 */
import { shuffle } from '../../../src/lib/quiz-engine.ts';
import { getVerifiedFact, statusEligibility, factInputHash } from './facts.mjs';
import { buildSalt, saltedIndex, saltedSample } from './salts.mjs';

const REQUIRED_OPTION_COUNT = 4; // 1 correct + 3 distractors, per §4.2/§4.3
const PLACEHOLDER_TEXT = /\boption\s+(?:text\s+for\s+)?[a-z0-9]+\s+(?:which\s+is\s+)?plausible\b|\[object Object\]|fake png content|lorem ipsum/i;

function invalidOptionReason(options, correctIndex) {
  if (
    options.some(
      (option) =>
        typeof option !== 'string' ||
        option.trim().length === 0 ||
        PLACEHOLDER_TEXT.test(option),
    )
  ) {
    return 'placeholder-option-content';
  }

  const lengths = options.map((option) => option.length);
  const longest = Math.max(...lengths);
  if (lengths[correctIndex] === longest && lengths.filter((length) => length === longest).length === 1) {
    return 'option-length-parity';
  }

  return undefined;
}

/** Builds the read-only context object a template's callbacks receive. */
export function buildCtx(state, facts = {}) {
  return {
    code: state.code,
    name: state.name,
    agencyShort: state.agencyShort,
    facts,
  };
}

/**
 * Determines whether `template` is eligible to generate for `state`,
 * independent of category quotas. Never consumes a fact that isn't
 * `confidence: 'verified'` (§3), and never a status the template didn't
 * declare support for.
 *
 * Returns `{ eligible: true, factsUsed }` where `factsUsed` maps each
 * required factKey to `{ fact }`, or `{ eligible: false, reason, factKey }`.
 */
export function evaluateTemplateForState(template, state) {
  const factsUsed = {};
  for (const factKey of template.requires) {
    const verified = getVerifiedFact(state, factKey);
    if (!verified.ok) {
      return { eligible: false, reason: `fact-${verified.reason}`, factKey };
    }
    const eligibility = statusEligibility(verified.fact, template.supportsStatuses);
    if (!eligibility.ok) {
      return { eligible: false, reason: eligibility.reason, factKey };
    }
    factsUsed[factKey] = { fact: verified.fact };
  }

  // Sibling values may only remove a distractor when they independently pass
  // the same verified-fact gate. They are still ledgered so their changes
  // invalidate dependent output.
  for (const factKey of template.siblingFactKeys ?? []) {
    if (factsUsed[factKey]) continue;
    const verified = getVerifiedFact(state, factKey);
    if (!verified.ok || verified.fact.state.status !== 'value') continue;
    factsUsed[factKey] = { fact: verified.fact };
  }

  const ctx = buildCtx(
    state,
    Object.fromEntries(Object.entries(factsUsed).map(([key, value]) => [key, value.fact])),
  );
  if (typeof template.appliesTo === 'function' && !template.appliesTo(ctx)) {
    return { eligible: false, reason: 'template-not-applicable' };
  }
  return { eligible: true, factsUsed };
}

/**
 * Generates `template.instancesPerState` question rows for one already-
 * eligible template/state pair. A per-instance shortfall (e.g. the
 * distractor pool has fewer than 3 usable candidates after removing the
 * correct value) is reported rather than padded with a fabricated option.
 */
export function buildInstances(template, state, factsUsed) {
  const ctx = buildCtx(
    state,
    Object.fromEntries(Object.entries(factsUsed).map(([key, value]) => [key, value.fact])),
  );
  const rows = [];
  let shortfallCount = 0;
  let shortfallReason;
  const shortfallCounts = new Map();

  const recordShortfall = (reason) => {
    shortfallCount += 1;
    shortfallReason ??= reason;
    shortfallCounts.set(reason, (shortfallCounts.get(reason) ?? 0) + 1);
  };

  for (let n = 1; n <= template.instancesPerState; n++) {
    const id = `${template.id}-${state.code.toLowerCase()}-${n}`;
    const correct = template.correct(ctx);
    const distractorPool = [...new Set(template.distractorPool(ctx))].filter((v) => v !== correct);
    const neededDistractors = REQUIRED_OPTION_COUNT - 1;

    if (distractorPool.length < neededDistractors) {
      recordShortfall('insufficient-distractor-pool');
      continue;
    }

    const distractorIdx = saltedSample(
      buildSalt(template.id, state.code, n, 'distractors'),
      distractorPool.length,
      neededDistractors,
    );
    const distractors = distractorIdx.map((i) => distractorPool[i]);

    const promptIdx = saltedIndex(buildSalt(template.id, state.code, n, 'prompt'), template.prompts.length);
    const explanationIdx = saltedIndex(
      buildSalt(template.id, state.code, n, 'explanation'),
      template.explanations.length,
    );

    // §4.3: order options with the existing shuffle from src/lib/quiz-engine.ts
    // (not reimplemented), seeded so the order is deterministic per instance.
    const options = shuffle([correct, ...distractors], buildSalt(template.id, state.code, n, 'options'));
    const correctIndex = options.indexOf(correct);
    const optionReason = invalidOptionReason(options, correctIndex);
    if (optionReason) {
      recordShortfall(optionReason);
      continue;
    }

    const primaryClaim = template.claims.find((c) => c.usage === 'correct-answer') ?? template.claims[0];
    const primaryFact = primaryClaim ? factsUsed[primaryClaim.factKey]?.fact : undefined;

    // Only deterministic, citation-derived provenance lands in the generated
    // row itself. `generatedAt` and any verification stamp
    // (verifiedBy/verifiedAt/verificationAuditId) never do (§4.5) — those
    // live in the audit ledger the CLI writes alongside this output.
    const question = {
      id,
      category: template.category,
      stateScope: [state.code],
      tags: [...template.tags],
      tier: 'T2',
      claims: template.claims.map((c) => ({ factKey: c.factKey, usage: c.usage })),
      templateId: template.id,
      templateVersion: template.version,
      prompt: template.prompts[promptIdx](ctx),
      options,
      correctIndex,
      explanation: template.explanations[explanationIdx](ctx),
      difficulty: template.difficulty,
      languages: ['en'],
      references: primaryFact ? [primaryFact.citation] : [],
      effectiveDate: primaryFact?.effectiveDate,
      lastVerified: primaryFact?.lastVerified,
      // A confirmed template review does not make every emitted fact instance
      // a separately reviewed question row. The fact citation remains
      // verified, while the generated wording stays explicitly auditable.
      reviewStatus: 'draft',
      verifyNote: 'Generated from a confirmed T2 template and a confidence:verified typed fact; row-level wording review remains pending.',
      contentVersion: 1,
    };

    rows.push({
      question,
      ledgerEntry: {
        questionId: id,
        templateId: template.id,
        templateVersion: template.version,
        inputFactHash: factInputHash(factsUsed),
      },
    });
  }

  return {
    rows,
    shortfallCount,
    shortfallReason,
    shortfalls: [...shortfallCounts].map(([reason, count]) => ({ reason, count })),
  };
}

/**
 * §3's fallback allocator: fills each category's T2 quota from that
 * category's eligible templates in the deterministic priority order given by
 * `allocation` (the order rows appear in
 * `src/content/taxonomy/template-allocation.ts`), and records the shortfall
 * — per category and per template tag — where a category falls short rather
 * than manufacturing a near-duplicate question to hit the number (§3, §4).
 *
 * @param {{ state: object, templates: object[], allocation: object[] }} args
 */
export function generateForState({ state, templates, allocation }) {
  const templatesById = new Map(templates.map((t) => [t.id, t]));
  const entriesByCategory = new Map();
  for (const entry of allocation) {
    if (!entriesByCategory.has(entry.category)) entriesByCategory.set(entry.category, []);
    entriesByCategory.get(entry.category).push(entry);
  }

  const questions = [];
  const ledger = [];
  const shortfalls = [];
  const tagShortfalls = [];
  const categorySummary = [];

  for (const [category, entries] of entriesByCategory) {
    let expected = 0;
    let actual = 0;

    for (const entry of entries) {
      expected += entry.instancesPerState;
      const template = templatesById.get(entry.id);

      if (!template) {
        shortfalls.push({
          category,
          templateId: entry.id,
          reason: 'template-missing',
          count: entry.instancesPerState,
        });
        tagShortfalls.push({
          tag: `template:${entry.id}`,
          templateId: entry.id,
          category,
          count: entry.instancesPerState,
          reason: 'template-missing',
        });
        continue;
      }

      const evaluation = evaluateTemplateForState(template, state);
      if (!evaluation.eligible) {
        shortfalls.push({
          category,
          templateId: entry.id,
          reason: evaluation.reason,
          factKey: evaluation.factKey,
          count: entry.instancesPerState,
        });
        for (const tag of template.tags) {
          tagShortfalls.push({
            tag,
            templateId: entry.id,
            category,
            count: entry.instancesPerState,
            reason: evaluation.reason,
          });
        }
        continue;
      }

      const built = buildInstances(template, state, evaluation.factsUsed);
      for (const row of built.rows) {
        questions.push(row.question);
        ledger.push(row.ledgerEntry);
      }
      actual += built.rows.length;

      for (const shortfall of built.shortfalls) {
        shortfalls.push({
          category,
          templateId: entry.id,
          reason: shortfall.reason,
          count: shortfall.count,
        });
        for (const tag of template.tags) {
          tagShortfalls.push({
            tag,
            templateId: entry.id,
            category,
            count: shortfall.count,
            reason: shortfall.reason,
          });
        }
      }
    }

    categorySummary.push({ category, expected, actual, shortfall: expected - actual });
  }

  return { questions, ledger, shortfalls, tagShortfalls, categorySummary };
}
