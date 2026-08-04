import type { QuestionTemplate } from './types';
import { T2_TEMPLATES } from './t2-templates.ts';

/**
 * The single, stable place `scripts/content/generate-templated.mjs` imports
 * from (docs/CHANGE_SPEC_COMPLETENESS.md §4). The registered templates consume
 * only confidence:verified facts; the generator records shortfalls for every
 * state/fact combination that cannot meet that contract.
 */
export const TEMPLATES: QuestionTemplate[] = T2_TEMPLATES;
