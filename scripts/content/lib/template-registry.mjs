/**
 * Loads and validates the T2 template registry (docs/CHANGE_SPEC_COMPLETENESS.md
 * §4, §11 build order step 3). Templates themselves are hand-authored
 * TypeScript at build order step 7; this module only knows how to find them
 * and check the shape/rules the spec requires before any generation runs.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** scripts/content/lib -> scripts/content -> scripts -> repo root */
const ROOT = join(__dirname, '..', '..', '..');

export const REGISTRY_PATH = join(ROOT, 'src/content/templates/registry.ts');
const TEMPLATE_SOURCE_PATH = join(ROOT, 'src/content/templates/t2-templates.ts');
const LATTICE_SOURCE_PATH = join(ROOT, 'scripts/content/lib/lattices.mjs');

/** Hash the files that define template closures and their allowed distractors. */
export function templateSourceBundleHash() {
  return createHash('sha256')
    .update(readFileSync(TEMPLATE_SOURCE_PATH))
    .update('\0')
    .update(readFileSync(LATTICE_SOURCE_PATH))
    .digest('hex');
}

/**
 * Dynamically imports `src/content/templates/registry.ts`. Node's built-in
 * TypeScript type-stripping loads it directly (no bundler/ts-node needed) as
 * long as it only uses erasable syntax — true of the registry and its
 * `QuestionTemplate` type import, which is `import type` and vanishes at
 * runtime. Returns `{ templates: [], missing: true }` rather than throwing if
 * the registry file itself doesn't exist, so callers can produce a precise,
 * honest error instead of an opaque module-resolution stack trace.
 */
export async function loadTemplateRegistry({ registryPath = REGISTRY_PATH } = {}) {
  if (!existsSync(registryPath)) {
    return { templates: [], missing: true };
  }
  const mod = await import(registryPath);
  const templates = Array.isArray(mod.TEMPLATES) ? mod.TEMPLATES : [];
  return { templates, missing: false };
}

function callbackSource(callback) {
  return typeof callback === 'function' ? Function.prototype.toString.call(callback) : null;
}

/**
 * Hash every content-bearing template field, including callback source, so an
 * approved `id@version` cannot silently authorize modified wording or options.
 * This deliberately excludes no semantic fields: a template change requires a
 * new audit entry (and normally a version bump) before it can emit questions.
 */
export function templateContentHash(template) {
  const payload = {
    id: template?.id ?? null,
    version: template?.version ?? null,
    category: template?.category ?? null,
    tags: template?.tags ?? null,
    requires: template?.requires ?? null,
    siblingFactKeys: template?.siblingFactKeys ?? null,
    supportsStatuses: template?.supportsStatuses ?? null,
    instancesPerState: template?.instancesPerState ?? null,
    difficulty: template?.difficulty ?? null,
    claims: template?.claims ?? null,
    appliesTo: callbackSource(template?.appliesTo),
    prompts: Array.isArray(template?.prompts) ? template.prompts.map(callbackSource) : null,
    correct: callbackSource(template?.correct),
    distractorPool: callbackSource(template?.distractorPool),
    explanations: Array.isArray(template?.explanations)
      ? template.explanations.map(callbackSource)
      : null,
  };
  return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}

/** Return every missing or stale verification entry for the supplied registry. */
export function templateVerificationErrors(templates, confirmedTemplateHashes) {
  const errors = [];
  for (const template of templates) {
    const key = `${template.id}@${template.version}`;
    const expectedHash = confirmedTemplateHashes.get(key);
    if (!expectedHash) {
      errors.push(`${key} has no confirmed verification-ledger entry`);
      continue;
    }
    const actualHash = templateContentHash(template);
    if (expectedHash !== actualHash) {
      errors.push(
        `${key} verification-ledger hash is stale (expected ${actualHash}, found ${expectedHash})`,
      );
    }
  }
  return errors;
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
