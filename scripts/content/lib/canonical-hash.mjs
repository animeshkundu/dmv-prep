/**
 * Canonical question hashing.
 *
 * Version 1 is intentionally small and boring: the hash is SHA-256 over the
 * UTF-8 JSON representation of the NFC-normalised tuple
 *
 *   [id, prompt, options, correctIndex, explanation, imageAsset ?? null]
 *
 * Provenance, tags, and review fields are not part of the signed content.  A
 * verifier can therefore detect a changed question without trusting any of
 * those fields.
 */
import { createHash } from 'node:crypto';

export const CANONICAL_HASH_VERSION = 1;
export const CANONICAL_HASH_ALGORITHM = 'sha256';

function normalise(value) {
  if (typeof value === 'string') return value.normalize('NFC');
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      result[key.normalize('NFC')] = normalise(child);
    }
    return result;
  }
  return value;
}

/**
 * Return the exact v1 payload.  Keeping this exported makes it possible for
 * tests and ingest tooling to show what was hashed without duplicating it.
 */
export function canonicalQuestionPayload(question) {
  if (!question || typeof question !== 'object' || Array.isArray(question)) {
    throw new TypeError('A question object is required for canonical hashing');
  }
  const { id, prompt, options, correctIndex, explanation } = question;
  if (
    typeof id !== 'string' ||
    typeof prompt !== 'string' ||
    !Array.isArray(options) ||
    !options.every((option) => typeof option === 'string') ||
    !Number.isInteger(correctIndex) ||
    typeof explanation !== 'string' ||
    (question.imageAsset !== undefined &&
      question.imageAsset !== null &&
      typeof question.imageAsset !== 'string')
  ) {
    throw new TypeError(
      'A question must contain string id/prompt/explanation, string options, and an integer correctIndex',
    );
  }

  return normalise([
    id,
    prompt,
    options,
    correctIndex,
    explanation,
    question.imageAsset ?? null,
  ]);
}

export function canonicalHashInput(question) {
  return JSON.stringify(canonicalQuestionPayload(question));
}

export function canonicalQuestionHash(question) {
  return createHash(CANONICAL_HASH_ALGORITHM)
    .update(canonicalHashInput(question), 'utf8')
    .digest('hex');
}

// Friendly aliases used by pipeline scripts and consumers that call this a
// content hash rather than a question hash.
export const canonicalHash = canonicalQuestionHash;
export const contentHash = canonicalQuestionHash;
export const canonicalHashV1 = canonicalQuestionHash;
export const canonicalizeQuestion = canonicalQuestionPayload;
