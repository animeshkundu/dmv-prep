import {
  BAC_LATTICE,
  CURFEW_LATTICE,
  DISTANCE_FT,
  IMPLIED_CONSENT_LATTICE,
  LEFT_ON_RED_LATTICE,
  LIABILITY_LATTICE,
  MONTHS,
  MOVE_OVER_LATTICE,
  PASSENGER_LATTICE,
  PHONE_POLICY_LATTICE,
  POINT_SUSPENSION_LATTICE,
  POINT_SYSTEM_LATTICE,
  SEAT_BELT_LATTICE,
  SPEED_LATTICE,
  TEXTING_POLICY_LATTICE,
  TURN_ON_RED_LATTICE,
  nearestLatticeNeighbors,
} from '../../../scripts/content/lib/lattices.mjs';
import type { TypedFactKey } from '../../content.config';
import type { QuestionTemplate, TemplateCtx } from './types';

const scalar = (ctx: TemplateCtx, key: TypedFactKey) => {
  const fact = ctx.facts[key];
  if (!fact || fact.state.status !== 'value') {
    throw new Error(`${key} must be a value fact before a template can read it.`);
  }
  return fact.state.value;
};

const numberFact = (ctx: TemplateCtx, key: TypedFactKey) => {
  const value = scalar(ctx, key);
  if (typeof value !== 'number') throw new Error(`${key} must have a numeric value.`);
  return value;
};

const stringFact = (ctx: TemplateCtx, key: TypedFactKey) => {
  const value = scalar(ctx, key);
  if (typeof value !== 'string') throw new Error(`${key} must have a string value.`);
  return value;
};

const booleanFact = (ctx: TemplateCtx, key: TypedFactKey) => {
  const value = scalar(ctx, key);
  if (typeof value !== 'boolean') throw new Error(`${key} must have a boolean value.`);
  return value;
};

const objectFact = (ctx: TemplateCtx, key: TypedFactKey) => {
  const value = scalar(ctx, key);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${key} must have an object value.`);
  }
  return value;
};

const numberProperty = (value: object, key: string) => {
  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== 'number') throw new Error(`${key} must be numeric.`);
  return candidate;
};

const booleanProperty = (value: object, key: string) => {
  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== 'boolean') throw new Error(`${key} must be boolean.`);
  return candidate;
};
const percent = (value: number) => `${value.toFixed(2)}%`;
const mph = (value: number) => `${value} mph`;
const feet = (value: number) => `${value} feet`;
const days = (value: number) => `${value} days`;
const months = (value: number) => `${value} months`;
const hours = (value: number) => `${value} hours`;
const moneyWords = (value: number) => ({
  250: 'two hundred fifty dollars',
  500: 'five hundred dollars',
  750: 'seven hundred fifty dollars',
  1000: 'one thousand dollars',
  1500: 'one thousand five hundred dollars',
  2000: 'two thousand dollars',
})[value] ?? `$${value.toLocaleString()}`;

const without = <T>(items: readonly T[], correct: T, formatter: (item: T) => string) => {
  const correctText = formatter(correct);
  return items.map(formatter).filter((item) => item !== correctText);
};

const prompts = (subject: string): Array<(ctx: TemplateCtx) => string> => [
  (ctx) => `In ${ctx.name}, which statement correctly describes the ${subject}?`,
  (ctx) => `A ${ctx.name} driver is reviewing the ${subject}. Select the accurate answer.`,
  (ctx) => `Choose the rule that applies to the ${subject} in ${ctx.name}.`,
  (ctx) => `What should a learner know about the ${subject} under ${ctx.name} law?`,
];

const explanations = (subject: string, key: TypedFactKey): Array<(ctx: TemplateCtx) => string> => [
  (ctx) => `The cited ${ctx.name} rule sets the ${subject} as shown in the correct answer.`,
  (ctx) => `This answer follows the verified ${key} record for ${ctx.name}; conditions in that record still apply.`,
  (ctx) => `Use the official ${ctx.name} citation on this question when checking the ${subject}.`,
];

function template(config: {
  id: string;
  category: string;
  tags: string[];
  key: TypedFactKey;
  siblings?: readonly TypedFactKey[];
  instances: 1 | 2;
  subject: string;
  correct: (ctx: TemplateCtx) => string;
  distractors: (ctx: TemplateCtx) => string[];
  difficulty?: 'easy' | 'medium' | 'hard';
}): QuestionTemplate {
  return {
    id: config.id,
    version: 1,
    category: config.category,
    tags: config.tags,
    requires: [config.key],
    siblingFactKeys: config.siblings,
    supportsStatuses: ['value'],
    instancesPerState: config.instances,
    prompts: prompts(config.subject),
    correct: config.correct,
    distractorPool: config.distractors,
    explanations: explanations(config.subject, config.key),
    difficulty: config.difficulty ?? 'medium',
    claims: [{ factKey: config.key, usage: 'correct-answer' }],
  };
}

const numeric = (
  id: string,
  category: string,
  tags: string[],
  key: TypedFactKey,
  instances: 1 | 2,
  subject: string,
  lattice: readonly number[],
  formatter: (value: number) => string,
  difficulty?: 'easy' | 'medium' | 'hard',
  siblings: readonly TypedFactKey[] = [],
) =>
  template({
    id,
    category,
    tags,
    key,
    instances,
    subject,
    correct: (ctx) => formatter(numberFact(ctx, key)),
    distractors: (ctx) => {
      const excluded = siblings.flatMap((sibling) => {
        const fact = ctx.facts[sibling];
        return fact?.state.status === 'value' && typeof fact.state.value === 'number'
          ? [fact.state.value]
          : [];
      });
      return nearestLatticeNeighbors(lattice, numberFact(ctx, key), { exclude: excluded }).map(formatter);
    },
    difficulty,
    siblings,
  });

const turnOnRed = (value: string) =>
  value === 'allowed-after-stop'
    ? TURN_ON_RED_LATTICE[0]
    : 'Remain stopped unless a sign allows the turn.';

const leftOnRed = (value: string) =>
  value === 'allowed'
    ? LEFT_ON_RED_LATTICE[0]
    : 'Remain stopped until the signal changes.';

const moveOver = (value: object) => {
  const requirement = stringProperty(value, 'requirement');
  return requirement === 'lane-change-or-slow'
    ? MOVE_OVER_LATTICE[0]
    : requirement === 'lane-change-required'
      ? MOVE_OVER_LATTICE[1]
      : MOVE_OVER_LATTICE[2];
};

const impliedConsent = (value: object) =>
  `${numberProperty(value, 'suspensionMonths')}-month suspension; ${booleanProperty(value, 'criminalOffense') ? 'a criminal offense after refusal.' : 'not a criminal offense.'}`;

const liability = (value: object) => {
  const amount = (number: number) => `$${number.toLocaleString().padStart(7, ' ')}`;
  return `${amount(numberProperty(value, 'bodilyPerPerson'))} / ${amount(numberProperty(value, 'bodilyPerCrash'))} / ${amount(numberProperty(value, 'property'))}`;
};

const pointSuspension = (value: object) =>
  `${numberProperty(value, 'points')} points within ${numberProperty(value, 'windowMonths')} months.`;

const curfew = (value: object) => {
  const hour = (h: number) => {
    const normalized = h % 12 || 12;
    return `${normalized} ${h < 12 ? 'AM' : 'PM'}`;
  };
  return `No driving from ${hour(numberProperty(value, 'startHour24'))} to ${hour(numberProperty(value, 'endHour24'))}.`;
};

const passenger = (value: object) => {
  const cap = numberProperty(value, 'cap');
  return `${cap} passenger${cap === 1 ? '' : 's'} under ${numberProperty(value, 'underAge')}; family exemption: ${booleanProperty(value, 'familyExempt') ? 'yes' : 'no'}.`;
};

const stringProperty = (value: object, key: string) => {
  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== 'string') throw new Error(`${key} must be a string.`);
  return candidate;
};

const phonePolicy = (lattice: readonly { value: unknown; label: string }[], value: unknown) =>
  lattice.find((entry) => entry.value === value)?.label ?? 'No matching statewide policy is listed.';

const booleanChoices = (value: boolean) =>
  value
    ? 'The rule applies statewide.'
    : 'No statewide rule applies.';

export const T2_TEMPLATES: QuestionTemplate[] = [
  template({
    id: 'tpl-signals-right-on-red',
    category: 'traffic-signals',
    tags: ['signal-steady'],
    key: 'rightTurnOnRed',
    instances: 2,
    subject: 'right turn at a steady red signal',
    correct: (ctx) => turnOnRed(stringFact(ctx, 'rightTurnOnRed')),
    distractors: () => [...TURN_ON_RED_LATTICE, 'Turn only when a sign permits it.'],
  }),
  template({
    id: 'tpl-row-left-on-red',
    category: 'right-of-way',
    tags: ['row-left-turns'],
    key: 'leftTurnOnRedFromOneWay',
    instances: 2,
    subject: 'left turn on red from one one-way street to another',
    correct: (ctx) => leftOnRed(stringFact(ctx, 'leftTurnOnRedFromOneWay')),
    distractors: () => [...LEFT_ON_RED_LATTICE, 'Turn only when a sign permits it.'],
  }),
  template({
    id: 'tpl-row-move-over',
    category: 'right-of-way',
    tags: ['row-emergency-vehicles'],
    key: 'moveOver',
    instances: 2,
    subject: 'approach to a stopped covered roadside vehicle',
    correct: (ctx) => moveOver(objectFact(ctx, 'moveOver')),
    distractors: () => MOVE_OVER_LATTICE,
  }),
  numeric('tpl-park-hydrant', 'parking', ['parking-prohibited'], 'parkFtFromHydrant', 2, 'fire-hydrant parking distance', DISTANCE_FT, feet, undefined, ['parkFtFromCrosswalk', 'parkFtFromStopSign', 'parkFtFromRailroad']),
  numeric('tpl-park-crosswalk', 'parking', ['parking-prohibited'], 'parkFtFromCrosswalk', 1, 'crosswalk parking distance', DISTANCE_FT, feet, undefined, ['parkFtFromHydrant', 'parkFtFromStopSign', 'parkFtFromRailroad']),
  numeric('tpl-park-stop-sign', 'parking', ['parking-prohibited'], 'parkFtFromStopSign', 2, 'stop-sign parking distance', DISTANCE_FT, feet, undefined, ['parkFtFromHydrant', 'parkFtFromCrosswalk', 'parkFtFromRailroad']),
  numeric('tpl-park-railroad', 'parking', ['parking-prohibited'], 'parkFtFromRailroad', 1, 'railroad-crossing parking distance', DISTANCE_FT, feet, undefined, ['parkFtFromHydrant', 'parkFtFromCrosswalk', 'parkFtFromStopSign']),
  numeric('tpl-speed-rural-1', 'speed-limits', ['speed-posted-limits'], 'ruralInterstateMaxMph', 2, 'rural-interstate maximum speed', SPEED_LATTICE, mph, undefined, ['urbanInterstateMaxMph', 'residentialDefaultMph', 'schoolZoneMph']),
  numeric('tpl-speed-rural-2', 'speed-limits', ['speed-posted-limits'], 'ruralInterstateMaxMph', 2, 'maximum rural-interstate posting', SPEED_LATTICE, mph, 'hard', ['urbanInterstateMaxMph', 'residentialDefaultMph', 'schoolZoneMph']),
  numeric('tpl-speed-urban-1', 'speed-limits', ['speed-posted-limits'], 'urbanInterstateMaxMph', 2, 'urban-interstate maximum speed', SPEED_LATTICE, mph, undefined, ['ruralInterstateMaxMph', 'residentialDefaultMph', 'schoolZoneMph']),
  numeric('tpl-speed-res-1', 'speed-limits', ['speed-posted-limits'], 'residentialDefaultMph', 2, 'residential-district default speed', SPEED_LATTICE, mph, undefined, ['ruralInterstateMaxMph', 'urbanInterstateMaxMph', 'schoolZoneMph']),
  numeric('tpl-speed-school-1', 'speed-limits', ['speed-school-work-zones'], 'schoolZoneMph', 2, 'school-zone speed where the cited conditions apply', SPEED_LATTICE, mph, undefined, ['ruralInterstateMaxMph', 'urbanInterstateMaxMph', 'residentialDefaultMph']),
  numeric('tpl-speed-school-2', 'speed-limits', ['speed-school-work-zones'], 'schoolZoneMph', 2, 'posted school-zone speed under the cited conditions', SPEED_LATTICE, mph, 'hard', ['ruralInterstateMaxMph', 'urbanInterstateMaxMph', 'residentialDefaultMph']),
  template({
    id: 'tpl-speed-basic-1',
    category: 'speed-limits',
    tags: ['speed-basic-law'],
    key: 'basicSpeedLaw',
    instances: 2,
    subject: 'basic-speed rule',
    correct: (ctx) => booleanChoices(booleanFact(ctx, 'basicSpeedLaw')),
    distractors: () => [
      'No statewide rule applies.',
      'Travel at the posted limit in all conditions.',
      'Travel ten mph below the limit in all conditions.',
      'Match the speed of the fastest nearby vehicle.',
      'Use the same speed on every road class.',
      'Stop whenever conditions begin changing.',
    ],
  }),
  numeric('tpl-dui-adult-1', 'alcohol-drugs', ['alcohol-impairment-bac'], 'bacAdult', 2, 'adult per se BAC limit', BAC_LATTICE, percent, undefined, ['bacUnder21', 'bacCommercial']),
  numeric('tpl-dui-adult-2', 'alcohol-drugs', ['alcohol-impairment-bac'], 'bacAdult', 2, 'adult alcohol concentration that establishes per se impairment', BAC_LATTICE, percent, 'hard', ['bacUnder21', 'bacCommercial']),
  numeric('tpl-dui-under21', 'alcohol-drugs', ['alcohol-impairment-bac'], 'bacUnder21', 2, 'under-21 BAC limit', BAC_LATTICE, percent, undefined, ['bacAdult', 'bacCommercial']),
  numeric('tpl-dui-commercial', 'alcohol-drugs', ['alcohol-impairment-bac'], 'bacCommercial', 2, 'commercial-driver BAC limit', BAC_LATTICE, percent, undefined, ['bacAdult', 'bacUnder21']),
  template({
    id: 'tpl-dui-implied',
    category: 'alcohol-drugs',
    tags: ['alcohol-implied-consent'],
    key: 'impliedConsentRefusal',
    instances: 2,
    subject: 'implied-consent test refusal consequence',
    correct: (ctx) => impliedConsent(objectFact(ctx, 'impliedConsentRefusal')),
    distractors: (ctx) => without(IMPLIED_CONSENT_LATTICE, objectFact(ctx, 'impliedConsentRefusal'), impliedConsent),
  }),
  template({
    id: 'tpl-dui-open',
    category: 'alcohol-drugs',
    tags: ['alcohol-implied-consent'],
    key: 'openContainerProhibited',
    instances: 2,
    subject: 'open-container rule',
    correct: (ctx) => booleanChoices(booleanFact(ctx, 'openContainerProhibited')),
    distractors: () => [
      'No statewide rule applies.',
      'The rule applies only after a crash.',
      'The rule applies only to commercial vehicles.',
      'The rule applies only in school zones.',
      'The rule applies only during daylight.',
      'The rule applies only on rural highways.',
    ],
  }),
  numeric('tpl-dui-suspension', 'alcohol-drugs', ['alcohol-implied-consent'], 'duiFirstSuspensionDays', 2, 'first-DUI suspension period', [30, 60, 90, 180, 365, 730], days, 'hard'),
  template({
    id: 'tpl-law-seatbelt',
    category: 'traffic-laws',
    tags: ['safe-following-scanning'],
    key: 'seatBeltEnforcement',
    instances: 1,
    subject: 'seat-belt enforcement level',
    correct: (ctx) => phonePolicy(SEAT_BELT_LATTICE, stringFact(ctx, 'seatBeltEnforcement')),
    distractors: (ctx) => without(SEAT_BELT_LATTICE, { value: stringFact(ctx, 'seatBeltEnforcement'), label: phonePolicy(SEAT_BELT_LATTICE, stringFact(ctx, 'seatBeltEnforcement')) }, (entry) => entry.label),
  }),
  template({
    id: 'tpl-law-phone',
    category: 'traffic-laws',
    tags: ['safe-distraction-fatigue'],
    key: 'handheldPhone',
    instances: 1,
    subject: 'handheld-phone policy',
    correct: (ctx) => phonePolicy(PHONE_POLICY_LATTICE, stringFact(ctx, 'handheldPhone')),
    distractors: (ctx) => without(PHONE_POLICY_LATTICE, { value: stringFact(ctx, 'handheldPhone'), label: phonePolicy(PHONE_POLICY_LATTICE, stringFact(ctx, 'handheldPhone')) }, (entry) => entry.label),
  }),
  template({
    id: 'tpl-law-texting',
    category: 'traffic-laws',
    tags: ['safe-distraction-fatigue'],
    key: 'texting',
    instances: 2,
    subject: 'manual-texting policy',
    correct: (ctx) => phonePolicy(TEXTING_POLICY_LATTICE, stringFact(ctx, 'texting')),
    distractors: (ctx) => without(TEXTING_POLICY_LATTICE, { value: stringFact(ctx, 'texting'), label: phonePolicy(TEXTING_POLICY_LATTICE, stringFact(ctx, 'texting')) }, (entry) => entry.label),
  }),
  template({
    id: 'tpl-law-headlights',
    category: 'traffic-laws',
    tags: ['safe-weather-night'],
    key: 'headlightsRequired',
    instances: 2,
    subject: 'headlight timing rule',
    correct: (ctx) => {
      const value = objectFact(ctx, 'headlightsRequired');
      return `Use headlights ${booleanProperty(value, 'whenWipersOn') ? 'with wipers and ' : 'without a wiper rule and '}${numberProperty(value, 'minutesAfterSunset')} minutes after sunset.`;
    },
    distractors: () => [
      'Use headlights with wipers and 60 minutes after sunset.',
      'Use headlights with wipers and 15 minutes after sunset.',
      'Use headlights only after full darkness begins.',
      'Use headlights only on roads without streetlights.',
      'Use headlights only when another driver flashes the vehicle lights.',
      'Use headlights after stopping at every intersection.',
    ],
  }),
  template({
    id: 'tpl-penalties-system',
    category: 'penalties-points',
    tags: ['collision-insurance-reporting'],
    key: 'pointSystem',
    instances: 2,
    subject: 'statewide driver-point system',
    correct: (ctx) => phonePolicy(POINT_SYSTEM_LATTICE, booleanFact(ctx, 'pointSystem')),
    distractors: (ctx) => without(POINT_SYSTEM_LATTICE, { value: booleanFact(ctx, 'pointSystem'), label: phonePolicy(POINT_SYSTEM_LATTICE, booleanFact(ctx, 'pointSystem')) }, (entry) => entry.label),
  }),
  template({
    id: 'tpl-penalties-susp-1',
    category: 'penalties-points',
    tags: ['collision-insurance-reporting'],
    key: 'pointSuspension',
    instances: 2,
    subject: 'point accumulation before suspension',
    correct: (ctx) => pointSuspension(objectFact(ctx, 'pointSuspension')),
    distractors: (ctx) => without(POINT_SUSPENSION_LATTICE, objectFact(ctx, 'pointSuspension'), pointSuspension),
  }),
  template({
    id: 'tpl-penalties-susp-2',
    category: 'penalties-points',
    tags: ['collision-insurance-reporting'],
    key: 'pointSuspension',
    instances: 2,
    subject: 'license-suspension point threshold',
    correct: (ctx) => pointSuspension(objectFact(ctx, 'pointSuspension')),
    distractors: (ctx) => without(POINT_SUSPENSION_LATTICE, objectFact(ctx, 'pointSuspension'), pointSuspension),
    difficulty: 'hard',
  }),
  template({
    id: 'tpl-penalties-liab',
    category: 'penalties-points',
    tags: ['collision-insurance-reporting'],
    key: 'minLiability',
    instances: 2,
    subject: 'minimum liability coverage per person / crash / property',
    correct: (ctx) => liability(objectFact(ctx, 'minLiability')),
    distractors: (ctx) => without(LIABILITY_LATTICE, objectFact(ctx, 'minLiability'), liability),
  }),
  numeric('tpl-penalties-crash', 'penalties-points', ['collision-insurance-reporting'], 'crashReportThresholdUsd', 2, 'reportable-crash property-damage threshold', [250, 500, 750, 1000, 1500, 2000], moneyWords, 'hard'),
  numeric('tpl-gdl-age-1', 'gdl-teen', ['gdl-permit-rules'], 'permitMinAgeMonths', 2, 'minimum permit age in months', [168, 174, 180, 186, 192, 198, 204], months),
  numeric('tpl-gdl-age-2', 'gdl-teen', ['gdl-permit-rules'], 'permitMinAgeMonths', 2, 'permit-eligibility age in months', [168, 174, 180, 186, 192, 198, 204], months, 'hard'),
  numeric('tpl-gdl-holding', 'gdl-teen', ['gdl-permit-rules'], 'permitHoldingMonths', 2, 'permit holding period', MONTHS, months),
  numeric('tpl-gdl-hours-tot', 'gdl-teen', ['gdl-permit-rules'], 'supervisedHoursTotal', 2, 'total supervised practice requirement', [20, 30, 40, 50, 60, 80, 100], hours),
  numeric('tpl-gdl-hours-night', 'gdl-teen', ['gdl-permit-rules'], 'supervisedHoursNight', 2, 'supervised night-practice requirement', [5, 8, 10, 12, 15, 20, 25], hours),
  template({
    id: 'tpl-gdl-curfew',
    category: 'gdl-teen',
    tags: ['gdl-to-full-license'],
    key: 'gdlNightCurfew',
    instances: 2,
    subject: 'provisional-license night restriction',
    correct: (ctx) => curfew(objectFact(ctx, 'gdlNightCurfew')),
    distractors: (ctx) => without(CURFEW_LATTICE, objectFact(ctx, 'gdlNightCurfew'), curfew),
  }),
  template({
    id: 'tpl-gdl-passenger',
    category: 'gdl-teen',
    tags: ['gdl-to-full-license'],
    key: 'gdlPassengerPhase1',
    instances: 2,
    subject: 'initial GDL passenger restriction',
    correct: (ctx) => passenger(objectFact(ctx, 'gdlPassengerPhase1')),
    distractors: (ctx) => without(PASSENGER_LATTICE, objectFact(ctx, 'gdlPassengerPhase1'), passenger),
  }),
];
