/**
 * Domain lattices for distractor generation (docs/CHANGE_SPEC_COMPLETENESS.md
 * §4.2), transcribed verbatim from the spec so distractors are drawn from a
 * curated, discrete progression that mirrors the real handbooks — never a
 * random perturbation of the correct value.
 */
export const BAC_LATTICE = [0.0, 0.01, 0.02, 0.04, 0.05, 0.08, 0.1, 0.15];
export const SPEED_LATTICE = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85];
export const DISTANCE_FT = [5, 10, 15, 20, 25, 30, 50, 100];
export const POINTS = [6, 8, 10, 11, 12, 15, 18];
export const MONTHS = [1, 3, 6, 9, 12, 18, 24];

/**
 * §4.2: "nearest lattice neighbours to the true value, excluding any value
 * that is also correct for that state under a sibling fact ... Two
 * neighbours below and one above, so magnitude alone never gives it away."
 *
 * Returns whatever is actually available on the lattice — if the true value
 * sits at (or near) the lattice's edge, or every nearby candidate is excluded
 * as a sibling fact's value, this deliberately returns fewer than requested
 * rather than fabricating an out-of-lattice number. Callers are responsible
 * for treating a too-small result as a shortfall (§3), not for padding it.
 *
 * @param {number[]} lattice sorted or unsorted array of candidate values
 * @param {number} value the correct value for this state
 * @param {{ exclude?: number[], below?: number, above?: number }} [options]
 */
export function nearestLatticeNeighbors(lattice, value, options = {}) {
  const { exclude = [], below = 2, above = 1 } = options;
  const excluded = new Set(exclude);
  const sorted = [...new Set(lattice)].sort((a, b) => a - b);
  const belowCandidates = sorted
    .filter((v) => v < value && !excluded.has(v))
    .sort((a, b) => b - a)
    .slice(0, below)
    .sort((a, b) => a - b);
  const aboveCandidates = sorted
    .filter((v) => v > value && !excluded.has(v))
    .sort((a, b) => a - b)
    .slice(0, above);
  return [...belowCandidates, ...aboveCandidates];
}
