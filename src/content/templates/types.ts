import type { TypedFacts, TypedFactKey } from '../../lib/types';

/**
 * docs/CHANGE_SPEC_COMPLETENESS.md §4: the shape every fact-templated question
 * generator must conform to. Templates themselves are hand-authored TypeScript
 * (build order step 7); this file only defines the contract so the pipeline
 * tooling built at build order step 3 (`scripts/content/generate-templated.mjs`)
 * has a single, stable shape to import against. It is deliberately free of any
 * runtime code — a type-only module erases cleanly under Node's TypeScript
 * type-stripping, so importing it never pulls in `astro:content`.
 */

/** Everything a template's callbacks need to know about the state it targets. */
export interface TemplateCtx {
  /** e.g. "WA" */
  code: string;
  /** e.g. "Washington" */
  name: string;
  /** e.g. "WA DOL" */
  agencyShort: string;
  /**
   * The state's typed facts. Only `confidence: 'verified'` entries are ever
   * reachable here — `generate-templated.mjs` is the sole gate that decides
   * eligibility (§3: "The generator refuses to emit from any fact that is not
   * confidence: 'verified'"), so a template's callbacks can trust whatever
   * facts are present.
   */
  facts: TypedFacts;
}

/** §3: a template declares which fact statuses it can consume. */
export type FactStatusSupport = 'value' | 'varies';

export interface TemplateClaim {
  factKey: TypedFactKey;
  usage: 'correct-answer' | 'prompt-context';
}

/**
 * §4's `QuestionTemplate`, transcribed with one deliberate change: `category`
 * is typed as `string` rather than importing `QUESTION_CATEGORIES` from
 * `src/content.config.ts`, because that module performs a real (non-type-only)
 * `astro:content` import and cannot be loaded by a plain Node script.
 * `scripts/content/lib/schema-constants.mjs` is the runtime source of truth
 * for the category vocabulary and is what the generator validates against.
 */
export interface QuestionTemplate {
  /** e.g. "tpl-bac-under21" — must match its id in src/content/taxonomy/template-allocation.ts */
  id: string;
  /** Bumping this invalidates previously generated output for this template. */
  version: number;
  category: string;
  /** From the §5.3 vocabulary, fixed before authoring. */
  tags: string[];
  requires: readonly TypedFactKey[];
  /** 'not-applicable' and 'unknown' facts are always skipped, regardless of this list. */
  supportsStatuses: FactStatusSupport[];
  /** How many distinct questions this template emits per state (its quota weight). */
  instancesPerState: 1 | 2;
  /** Skip point templates where pointSystem=false, etc. */
  appliesTo?(ctx: TemplateCtx): boolean;
  /** >= 4 phrasings — surface forms, not extra questions. Exactly one is chosen per instance. */
  prompts: Array<(c: TemplateCtx) => string>;
  correct(c: TemplateCtx): string;
  /** >= 6 realistic candidates, drawn from a domain lattice — never a random perturbation. */
  distractorPool(c: TemplateCtx): string[];
  /** >= 3 framings. */
  explanations: Array<(c: TemplateCtx) => string>;
  difficulty: 'easy' | 'medium' | 'hard';
  /** Which typed fact(s) this item's answer depends on — validated, not inferred. */
  claims: TemplateClaim[];
}
