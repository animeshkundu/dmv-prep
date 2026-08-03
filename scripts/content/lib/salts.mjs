/**
 * Deterministic, non-cryptographic hash → index/sample picker used to choose
 * which surface form (prompt/explanation phrasing) a generated T2 instance
 * uses, and which distractors it draws from a template's pool
 * (docs/CHANGE_SPEC_COMPLETENESS.md §4.4: "selected with different hash
 * salts so phrasing and framing do not correlate").
 *
 * Never uses `Math.random` or wall-clock time: the same salt always yields
 * the same index, which is what makes generation byte-reproducible (§4.5).
 * This is a distinct utility from `shuffle` in `src/lib/quiz-engine.ts` (which
 * the generator uses, unmodified, to order the final option list per §4.3) —
 * this module only ever *selects*, it never reorders a rendered option list.
 */

function fnv1a(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Builds the deterministic salt string for one generated instance's facet
 * (e.g. "prompt", "explanation", "distractors", "options"), keyed by template,
 * state, and instance number so no two facets of the same instance — or the
 * same facet across states/instances — share an input (§4.4).
 */
export function buildSalt(templateId, stateCode, instanceIndex, facet) {
  return `${templateId}:${stateCode}:${instanceIndex}:${facet}`;
}

/** Deterministically picks an index in [0, length) from a salt string. */
export function saltedIndex(salt, length) {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error(`saltedIndex: length must be a positive integer (salt="${salt}", length=${length})`);
  }
  return fnv1a(salt) % length;
}

/**
 * Deterministically picks `count` distinct indices from [0, length) using
 * `salt` as a seed. Order is not meaningful — callers that render an ordered
 * list must reorder via the canonical `shuffle` from `src/lib/quiz-engine.ts`,
 * not via this helper (§4.3).
 */
export function saltedSample(salt, length, count) {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`saltedSample: count must be a non-negative integer (salt="${salt}")`);
  }
  if (count > length) {
    throw new Error(`saltedSample: cannot sample ${count} distinct items from ${length} (salt="${salt}")`);
  }
  const pool = Array.from({ length }, (_, i) => i);
  const picked = [];
  let seed = fnv1a(salt);
  for (let n = 0; n < count; n++) {
    seed = Math.imul(seed ^ (seed >>> 13), 0x5bd1e995) >>> 0;
    const idx = seed % pool.length;
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}
