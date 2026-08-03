import type { QuestionTemplate } from './types';

/**
 * The single, stable place `scripts/content/generate-templated.mjs` imports
 * from (docs/CHANGE_SPEC_COMPLETENESS.md §4, §11 build order step 3). Actual
 * templates are hand-authored per fact (build order step 7) and registered
 * here, e.g.:
 *
 *   import { tplBacAdult1 } from './tpl-bac-adult-1';
 *   import { tplBacAdult2 } from './tpl-bac-adult-2';
 *   export const TEMPLATES: QuestionTemplate[] = [tplBacAdult1, tplBacAdult2, ...];
 *
 * It starts empty on purpose: this change only wires the generation pipeline
 * tooling, not the T2 content itself. With an empty registry the generator
 * has nothing to generate and reports every category's quota as a full
 * shortfall — an honest, non-vacuous result — rather than inventing content.
 */
export const TEMPLATES: QuestionTemplate[] = [];
