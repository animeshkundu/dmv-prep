/**
 * Universality lint patterns (docs/CHANGE_SPEC_COMPLETENESS.md §2.2), transcribed
 * verbatim from the spec so `content-universality.test.ts` enforces exactly the
 * rule the document defines — no weakening, no invention.
 *
 * "The lint is a rejection heuristic, not a proof of universality." Absence of a
 * match does not prove a rule is universal; it only proves the item does not
 * contain an obviously state-variable quantity.
 */

export const STATE_VARIABLE_PATTERNS = [
  { name: 'posted-speed-mph', re: /\b\d{2,3}\s?mph\b/i },
  { name: 'bac-percent', re: /\b0?\.\d{2}\s?%/ },
  { name: 'distance-feet', re: /\b\d{1,3}\s?(feet|ft\.?)\b/i },
  { name: 'points', re: /\b\d{1,2}\s?points?\b/i },
  { name: 'gdl-age-years', re: /\b\d{1,2}\s?(years?|yrs?)\b/i },
  { name: 'duration', re: /\b\d{1,3}\s?(days?|months?|weeks?|hours?)\b/i },
  { name: 'currency', re: /\$\s?[\d,]+/ },
  { name: 'curfew-clock-time', re: /\b\d{1,2}(:\d{2})?\s?([ap]\.?m\.?)\b/i },
  { name: 'curfew-boundary-word', re: /\b(midnight|sunrise|sunset)\b/i },
  {
    name: 'word-form-numeral-quantity',
    re: /\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|eighteen|twenty(-\w+)?|thirty|sixty|ninety)\s+(mph|feet|ft|points?|years?|yrs?|days?|months?|weeks?|hours?|dollars?)\b/i,
  },
];

/**
 * Every typed-fact key that §3 defines must map to at least one of these detectors,
 * or carry an explicit exemption with a stated reason (§2.2: "every typedFacts key
 * maps to at least one lint pattern or an explicit exemption"). Booleans/enums with
 * no inherent numeric quantity (e.g. `pointSystem: true|false`) cannot be caught by
 * a numeric/temporal lint and are exempted deliberately, not by omission.
 */
export const TYPED_FACT_KEY_TO_PATTERN = {
  bacAdult: ['bac-percent'],
  bacUnder21: ['bac-percent'],
  bacCommercial: ['bac-percent'],
  impliedConsentRefusal: ['duration', 'word-form-numeral-quantity'],
  duiFirstSuspensionDays: ['duration', 'word-form-numeral-quantity'],
  ruralInterstateMaxMph: ['posted-speed-mph'],
  urbanInterstateMaxMph: ['posted-speed-mph'],
  residentialDefaultMph: ['posted-speed-mph'],
  schoolZoneMph: ['posted-speed-mph'],
  moveOver: ['posted-speed-mph'],
  headlightsRequired: ['duration', 'word-form-numeral-quantity'],
  parkFtFromHydrant: ['distance-feet'],
  parkFtFromCrosswalk: ['distance-feet'],
  parkFtFromStopSign: ['distance-feet'],
  parkFtFromRailroad: ['distance-feet'],
  pointSuspension: ['points', 'duration'],
  permitMinAgeMonths: ['gdl-age-years', 'duration', 'word-form-numeral-quantity'],
  permitHoldingMonths: ['duration', 'word-form-numeral-quantity'],
  supervisedHoursTotal: ['duration', 'word-form-numeral-quantity'],
  supervisedHoursNight: ['duration', 'word-form-numeral-quantity'],
  gdlNightCurfew: ['curfew-clock-time', 'curfew-boundary-word'],
  gdlPassengerPhase1: ['gdl-age-years', 'word-form-numeral-quantity'],
  minLiability: ['currency'],
  crashReportThresholdUsd: ['currency'],
};

/** Keys with no inherent numeric/temporal quantity: a lint cannot detect these. */
export const TYPED_FACT_EXEMPTIONS = {
  openContainerProhibited: 'boolean rule, no numeric quantity to detect',
  basicSpeedLaw: 'boolean rule, no numeric quantity to detect',
  rightTurnOnRed: 'enum rule, no numeric quantity to detect',
  leftTurnOnRedFromOneWay: 'enum rule, no numeric quantity to detect',
  seatBeltEnforcement: 'enum rule, no numeric quantity to detect',
  handheldPhone: 'enum rule, no numeric quantity to detect',
  texting: 'enum rule, no numeric quantity to detect',
  pointSystem: 'boolean rule, no numeric quantity to detect',
};

/** Returns the list of pattern names that match somewhere in `text`. */
export function matchedStateVariablePatterns(text) {
  return STATE_VARIABLE_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
}

/** Builds a case-insensitive regex matching any of the given jurisdiction names. */
export function buildJurisdictionNameRegex(stateNames) {
  const escaped = stateNames
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
}

export function containsJurisdictionName(text, jurisdictionNameRegex) {
  return jurisdictionNameRegex.test(text);
}
