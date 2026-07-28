/**
 * Small statistics helpers for `content-answer-distribution.test.ts`
 * (docs/CHANGE_SPEC_COMPLETENESS.md §10).
 */

/**
 * Pearson chi-square goodness-of-fit statistic against a uniform expectation.
 * With 4 answer positions (df = 3), the critical value at p = 0.01 is 11.34,
 * per the spec's own stated threshold — we don't recompute the critical value,
 * we just compute the statistic that gets compared against it.
 */
export function chiSquareUniform(observedCounts) {
  const total = observedCounts.reduce((a, b) => a + b, 0);
  const expected = total / observedCounts.length;
  if (expected === 0) return 0;
  return observedCounts.reduce((sum, o) => sum + (o - expected) ** 2 / expected, 0);
}

export function percentages(observedCounts) {
  const total = observedCounts.reduce((a, b) => a + b, 0) || 1;
  return observedCounts.map((c) => (100 * c) / total);
}
