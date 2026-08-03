/**
 * Typed-fact selection helpers (docs/CHANGE_SPEC_COMPLETENESS.md §3, §4).
 *
 * "The generator refuses to emit from any fact that is not confidence:
 * 'verified'. Inferred facts become a to-do list, never a shipping hazard."
 *
 * These helpers are the single choke point that enforces that rule so
 * `generate-templated.mjs` and its engine can never accidentally consume an
 * inferred/unknown fact by reaching into `state.typedFacts` directly.
 */
import { createHash } from 'node:crypto';

/**
 * Returns `{ ok: true, fact }` only when the state carries `factKey` at
 * `confidence: 'verified'`; otherwise returns `{ ok: false, reason }`
 * ('missing' | 'unverified') — never a fabricated fallback value.
 */
export function getVerifiedFact(state, factKey) {
  const fact = state?.typedFacts?.[factKey];
  if (!fact) return { ok: false, reason: 'missing' };
  if (fact.confidence !== 'verified') return { ok: false, reason: 'unverified' };
  if (typeof fact.effectiveDate !== 'string') return { ok: false, reason: 'missing-effective-date' };
  return { ok: true, fact };
}

/**
 * §3: a template declares which fact statuses ('value' | 'varies') it can
 * consume. 'not-applicable' and 'unknown' are always skipped regardless of
 * what a template declares (they carry no answerable value at all).
 */
export function statusEligibility(fact, supportsStatuses) {
  const status = fact.state.status;
  if (status === 'not-applicable') return { ok: false, reason: 'fact-not-applicable' };
  if (status === 'unknown') return { ok: false, reason: 'fact-unknown' };
  if (!supportsStatuses.includes(status)) {
    return { ok: false, reason: `status-unsupported:${status}` };
  }
  return { ok: true };
}

/**
 * Stable hash of the exact fact *decisions* (not provenance prose) a
 * generated instance depended on — the §4.5 ledger field `inputFactHash`.
 * Deliberately excludes `lastVerified`/`citation`/`display` so an unrelated
 * provenance edit (e.g. re-citing the same value) doesn't spuriously
 * invalidate already-generated rows; only a change to the decision-bearing
 * `state` shape should.
 */
export function factInputHash(factsByKey) {
  const canonical = Object.keys(factsByKey)
    .sort()
    .map((key) => [key, factsByKey[key].fact.state]);
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}
