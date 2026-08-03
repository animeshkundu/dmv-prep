/**
 * Mirrors the enum constants declared in `src/content.config.ts`.
 *
 * Why duplicated rather than imported: `content.config.ts` imports `astro:content`
 * at module scope (a real, non-type-only import), which only resolves inside an
 * Astro build/dev context — vitest cannot load it (confirmed: attempting to import
 * `src/content.config.ts` from a test fails with "Failed to load url astro:content").
 * This is exactly why docs/CHANGE_SPEC_COMPLETENESS.md §10 says the acceptance
 * suite reads JSON from disk and imports shared primitives from
 * `scripts/content/lib/*.mjs` "since astro:content is unavailable in vitest".
 *
 * Keep this list in sync with `QUESTION_CATEGORIES` / `TYPED_FACT_KEYS` in
 * src/content.config.ts whenever that file changes; a mismatch here would make
 * the acceptance tests validate against the wrong vocabulary.
 */

export const QUESTION_CATEGORIES = [
  'road-signs',
  'traffic-signals',
  'pavement-markings',
  'right-of-way',
  'parking',
  'speed-limits',
  'alcohol-drugs',
  'sharing-the-road',
  'safe-driving',
  'traffic-laws',
  'penalties-points',
  'gdl-teen',
];

export const STATE_CODES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
  'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY',
];

export const TYPED_FACT_KEYS = [
  'bacAdult',
  'bacUnder21',
  'bacCommercial',
  'impliedConsentRefusal',
  'openContainerProhibited',
  'duiFirstSuspensionDays',
  'ruralInterstateMaxMph',
  'urbanInterstateMaxMph',
  'residentialDefaultMph',
  'schoolZoneMph',
  'basicSpeedLaw',
  'rightTurnOnRed',
  'leftTurnOnRedFromOneWay',
  'seatBeltEnforcement',
  'handheldPhone',
  'texting',
  'moveOver',
  'headlightsRequired',
  'parkFtFromHydrant',
  'parkFtFromCrosswalk',
  'parkFtFromStopSign',
  'parkFtFromRailroad',
  'pointSystem',
  'pointSuspension',
  'permitMinAgeMonths',
  'permitHoldingMonths',
  'supervisedHoursTotal',
  'supervisedHoursNight',
  'gdlNightCurfew',
  'gdlPassengerPhase1',
  'minLiability',
  'crashReportThresholdUsd',
];

/**
 * §2.1 per-category authoring targets: T1 (national core), T2 (fact-templated),
 * T3 (state-authored), and the combined per-state floor/target column. Transcribed
 * verbatim from the table in docs/CHANGE_SPEC_COMPLETENESS.md §2.1.
 */
export const CATEGORY_TARGETS = {
  'road-signs': { t1: 90, t2: 0, t3: 4, perState: 94 },
  'traffic-signals': { t1: 30, t2: 2, t3: 2, perState: 34 },
  'pavement-markings': { t1: 30, t2: 0, t3: 3, perState: 33 },
  'right-of-way': { t1: 45, t2: 4, t3: 6, perState: 55 },
  parking: { t1: 25, t2: 6, t3: 4, perState: 35 },
  'speed-limits': { t1: 15, t2: 14, t3: 3, perState: 32 },
  'alcohol-drugs': { t1: 20, t2: 14, t3: 3, perState: 37 },
  'sharing-the-road': { t1: 45, t2: 0, t3: 4, perState: 49 },
  'safe-driving': { t1: 60, t2: 0, t3: 8, perState: 68 },
  'traffic-laws': { t1: 40, t2: 6, t3: 12, perState: 58 },
  'penalties-points': { t1: 10, t2: 10, t3: 8, perState: 28 },
  'gdl-teen': { t1: 10, t2: 14, t3: 8, perState: 32 },
};

export const TOTAL_TARGET = { t1: 420, t2: 70, t3: 65, perState: 555 };

/** §2's acceptance contract: the floor is the only contract; 555 is the (higher) target. */
export const FLOOR_PER_STATE_TOTAL = 500;
export const FLOOR_PER_CATEGORY = 25;

/** §5.1: 11 modules, exact unit counts (5+3+5+3+4+2+3+4+2+2+2 = 35). */
export const LESSON_MODULES = [
  { module: 'signs', units: ['shapes-and-colors', 'regulatory', 'warning', 'guide-and-services', 'work-zone'] },
  { module: 'signals-markings', units: ['traffic-signals', 'flashing-and-special-signals', 'pavement-markings'] },
  {
    module: 'right-of-way',
    units: ['intersections-and-stops', 'left-turns', 'roundabouts', 'pedestrians-crosswalks', 'emergency-vehicles'],
  },
  { module: 'speed', units: ['basic-speed-law', 'posted-limits', 'school-and-work-zones'] },
  { module: 'lane-use', units: ['lane-position-and-changing', 'turning', 'passing', 'freeway-entry-exit'] },
  { module: 'parking', units: ['parallel-and-angle', 'where-you-may-not-park'] },
  {
    module: 'sharing-the-road',
    units: ['motorcycles-bicycles', 'trucks-buses', 'pedestrians-scooters-animals'],
  },
  {
    module: 'safe-driving',
    units: ['following-and-scanning', 'weather-and-night', 'skids-and-emergencies', 'distraction-and-fatigue'],
  },
  { module: 'alcohol-drugs', units: ['impairment-and-bac', 'implied-consent-and-penalties'] },
  { module: 'collisions-insurance', units: ['at-the-scene', 'insurance-and-reporting'] },
  { module: 'licensing-gdl', units: ['permit-rules', 'to-full-license'] },
];

export const TOTAL_LESSON_UNITS = LESSON_MODULES.reduce((sum, m) => sum + m.units.length, 0);
