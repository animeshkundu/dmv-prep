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

/** Curated policy/value lattices for non-scalar typed facts. */
export const TURN_ON_RED_LATTICE = [
  'After stopping, turn when the way is clear.',
  'Turn without making a full stop.',
  'Wait for a green arrow before starting your turn.',
  'Turn only when an officer waves you through.',
  'Remain stopped until the signal changes.',
  'Yield first, then turn without making a complete stop.',
];

export const LEFT_ON_RED_LATTICE = [
  'Turn after stopping when the way is clear.',
  'Turn only after a green arrow appears for your lane.',
  'Remain stopped until the signal changes.',
  'Turn without stopping if the road is empty.',
  'Wait for an officer to direct the entire turn movement.',
  'Treat the red signal as a yield sign.',
];

export const MOVE_OVER_LATTICE = [
  'Change lanes if safe; otherwise slow down.',
  'Change lanes whenever it is safely possible.',
  'Slow down only; changing lanes is optional.',
  'Keep speed and lane unless traffic stops.',
  'Stop beside the roadside vehicle.',
  'Pass closely to avoid delaying traffic.',
];

export const PHONE_POLICY_LATTICE = [
  { value: 'banned-all', label: 'All drivers: phone holding is barred.' },
  { value: 'banned-novice', label: 'New drivers: phone holding is barred.' },
  { value: 'no-ban', label: 'Drivers: phone holding is allowed.' },
  { value: 'commercial-only', label: 'Truck drivers: phone holding is barred.' },
  { value: 'school-zone-only', label: 'School-zone: phone holding is barred.' },
  { value: 'emergency-only', label: 'Emergency use: phone holding is allowed.' },
];

export const TEXTING_POLICY_LATTICE = [
  { value: 'banned-all', label: 'All drivers: manual texting is barred.' },
  { value: 'banned-novice', label: 'New drivers: manual texting is barred.' },
  { value: 'no-ban', label: 'Drivers: manual texting is allowed.' },
  { value: 'commercial-only', label: 'Truck drivers: manual texting is barred.' },
  { value: 'school-zone-only', label: 'School-zone: manual texting is barred.' },
  { value: 'emergency-only', label: 'Emergency texts: manual use is allowed.' },
];

export const SEAT_BELT_LATTICE = [
  { value: 'primary', label: 'The belt rule is a primary offense.' },
  { value: 'secondary', label: 'The belt rule is a secondary offense.' },
  { value: 'front-only', label: 'The rule applies only to front seats.' },
  { value: 'minor-only', label: 'The rule applies only to minor passengers.' },
  { value: 'commercial-only', label: 'The rule applies only to commercial vehicles.' },
  { value: 'none', label: 'No statewide belt rule applies.' },
];

export const POINT_SYSTEM_LATTICE = [
  { value: true, label: 'A statewide point system applies.' },
  { value: false, label: 'No statewide point system applies.' },
  { value: 'local', label: 'A local-only point system applies.' },
  { value: 'commercial', label: 'A commercial-only point system applies.' },
  { value: 'warning', label: 'Only warning notices are issued.' },
  { value: 'fine', label: 'Only monetary fines are assessed.' },
];

export const IMPLIED_CONSENT_LATTICE = [
  { suspensionMonths: 3, criminalOffense: false },
  { suspensionMonths: 6, criminalOffense: false },
  { suspensionMonths: 12, criminalOffense: false },
  { suspensionMonths: 18, criminalOffense: false },
  { suspensionMonths: 12, criminalOffense: true },
  { suspensionMonths: 24, criminalOffense: true },
];

export const POINT_SUSPENSION_LATTICE = [
  { points: 6, windowMonths: 12 },
  { points: 8, windowMonths: 12 },
  { points: 10, windowMonths: 12 },
  { points: 12, windowMonths: 12 },
  { points: 15, windowMonths: 12 },
  { points: 18, windowMonths: 24 },
];

export const LIABILITY_LATTICE = [
  { bodilyPerPerson: 15000, bodilyPerCrash: 30000, property: 5000 },
  { bodilyPerPerson: 25000, bodilyPerCrash: 50000, property: 10000 },
  { bodilyPerPerson: 25000, bodilyPerCrash: 50000, property: 25000 },
  { bodilyPerPerson: 30000, bodilyPerCrash: 60000, property: 15000 },
  { bodilyPerPerson: 35000, bodilyPerCrash: 70000, property: 25000 },
  { bodilyPerPerson: 50000, bodilyPerCrash: 100000, property: 50000 },
  { bodilyPerPerson: 100000, bodilyPerCrash: 300000, property: 100000 },
];

export const CURFEW_LATTICE = [
  { startHour24: 22, endHour24: 5 },
  { startHour24: 23, endHour24: 5 },
  { startHour24: 0, endHour24: 5 },
  { startHour24: 0, endHour24: 6 },
  { startHour24: 23, endHour24: 6 },
  { startHour24: 21, endHour24: 5 },
];

export const PASSENGER_LATTICE = [
  { cap: 0, underAge: 20, familyExempt: true },
  { cap: 1, underAge: 21, familyExempt: true },
  { cap: 2, underAge: 21, familyExempt: true },
  { cap: 1, underAge: 18, familyExempt: false },
  { cap: 0, underAge: 18, familyExempt: false },
  { cap: 2, underAge: 20, familyExempt: false },
];

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
 * @param {readonly number[]} lattice sorted or unsorted array of candidate values
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
