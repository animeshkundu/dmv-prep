/**
 * Loads and validates the T2 template registry (docs/CHANGE_SPEC_COMPLETENESS.md
 * §4, §11 build order step 3). Templates themselves are hand-authored
 * TypeScript at build order step 7; this module only knows how to find them
 * and check the shape/rules the spec requires before any generation runs.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** scripts/content/lib -> scripts/content -> scripts -> repo root */
const ROOT = join(__dirname, '..', '..', '..');

export const REGISTRY_PATH = join(ROOT, 'src/content/templates/registry.ts');

/**
 * Dynamically imports `src/content/templates/registry.ts`. Node's built-in
 * TypeScript type-stripping loads it directly (no bundler/ts-node needed) as
 * long as it only uses erasable syntax — true of the registry and its
 * `QuestionTemplate` type import, which is `import type` and vanishes at
 * runtime. Returns `{ templates: [], missing: true }` rather than throwing if
 * the registry file itself doesn't exist, so callers can produce a precise,
 * honest error instead of an opaque module-resolution stack trace.
 */
export async function loadTemplateRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    return { templates: [], missing: true };
  }
  const mod = await import(REGISTRY_PATH);
  const templates = Array.isArray(mod.TEMPLATES) ? mod.TEMPLATES : [];
  return { templates, missing: false };
}

/**
 * Validates the registry against the rules §4/§4.4 require of every
 * template, independent of any particular state:
 *   - a well-formed shape (>=4 prompts, >=3 explanations, required functions)
 *   - `claims[].factKey` is a subset of `requires`
 *   - `maxTemplatesPerFactKey` (default 2, §4.4): no fact key may be required
 *     by more than that many templates, so no state ever gets three
 *     near-identical questions about the same underlying fact.
 *
 * Returns `{ ok, errors }` rather than throwing so callers (the CLI, tests)
 * can decide how loudly to fail.
 */
export function validateTemplateRegistry(templates, { maxTemplatesPerFactKey = 2 } = {}) {
  const errors = [];
  const seenIds = new Set();

  for (const t of templates) {
    const label = t?.id ?? '<unknown id>';
    if (!t?.id) {
      errors.push('a template is missing its id');
      continue;
    }
    if (seenIds.has(t.id)) errors.push(`duplicate template id "${t.id}"`);
    seenIds.add(t.id);

    if (!Number.isInteger(t.version) || t.version < 1) {
      errors.push(`${label}: version must be a positive integer`);
    }
    if (t.instancesPerState !== 1 && t.instancesPerState !== 2) {
      errors.push(`${label}: instancesPerState must be 1 or 2`);
    }
    if (!Array.isArray(t.prompts) || t.prompts.length < 4) {
      errors.push(`${label}: requires >=4 prompts (§4.4 — surface forms, not extra questions)`);
    }
    if (!Array.isArray(t.explanations) || t.explanations.length < 3) {
      errors.push(`${label}: requires >=3 explanations (§4.4)`);
    }
    if (typeof t.correct !== 'function') errors.push(`${label}: correct(ctx) must be a function`);
    if (typeof t.distractorPool !== 'function') errors.push(`${label}: distractorPool(ctx) must be a function`);
    if (!Array.isArray(t.requires) || t.requires.length === 0) {
      errors.push(`${label}: requires at least one typed-fact key`);
    }
    if (!Array.isArray(t.supportsStatuses) || t.supportsStatuses.length === 0) {
      errors.push(`${label}: supportsStatuses must declare 'value' and/or 'varies' (§3)`);
    }
    if (!Array.isArray(t.claims) || t.claims.length === 0) {
      errors.push(`${label}: requires at least one claim`);
    } else {
      for (const claim of t.claims) {
        if (!t.requires?.includes(claim.factKey)) {
          errors.push(`${label}: claims factKey "${claim.factKey}" is not declared in requires[]`);
        }
      }
    }
  }

  const templatesPerFactKey = new Map();
  for (const t of templates) {
    for (const factKey of new Set(t.requires ?? [])) {
      if (!templatesPerFactKey.has(factKey)) templatesPerFactKey.set(factKey, new Set());
      templatesPerFactKey.get(factKey).add(t.id);
    }
  }
  for (const [factKey, ids] of templatesPerFactKey) {
    if (ids.size > maxTemplatesPerFactKey) {
      errors.push(
        `fact key "${factKey}" is required by ${ids.size} templates (${[...ids].sort().join(', ')}); ` +
          `maxTemplatesPerFactKey is ${maxTemplatesPerFactKey} (§4.4)`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
