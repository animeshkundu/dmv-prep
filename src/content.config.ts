import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { arrayJsonLoader } from './content/loaders';

/**
 * Content model for DMV Prep.
 *
 * Design notes:
 * - Every question and every state fact is provenance-stamped (references + dates +
 *   reviewStatus + sourceSnapshotHash) so the build can enforce citations and the
 *   maintenance jobs can drive re-audits. See docs/CONTENT_STRATEGY.md + docs/DATA_SCHEMA.md.
 * - Questions are ORIGINAL, grounded in each state's public handbook. `stateScope: "all"`
 *   is only valid once we've confirmed no state exception; otherwise scope to explicit codes.
 * - Exam rules are modeled as VARIANTS (age/version/language), not a single count/threshold.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const STATE_CODES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
  'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY',
] as const;

export const stateCode = z.enum(STATE_CODES);
export type StateCode = z.infer<typeof stateCode>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use ISO date YYYY-MM-DD');

/** Where a fact/question came from, enforced so nothing ships uncited. */
const reference = z.object({
  label: z.string().min(1),
  /** Handbook section / statute id, e.g. "CA DL 600 §4" or "VC §22350". */
  citation: z.string().min(1),
  url: z.string().url().optional(),
});

const reviewStatus = z.enum(['draft', 'adversarially-verified', 'human-spot-checked']);

/** Applied to any content that must be re-audited over time. */
const provenance = {
  references: z.array(reference).min(1, 'At least one citation is required'),
  effectiveDate: isoDate,
  expiryDate: isoDate.optional(),
  /** SHA-256 of the fetched source snapshot used for authoring (source-change monitoring). */
  sourceSnapshotHash: z.string().min(8).optional(),
  reviewStatus: reviewStatus.default('draft'),
  /** Why an item remains draft after review, including the exact unresolved fact. */
  verifyNote: z.string().min(1).optional(),
  /** Model or reviewer identity recorded in the verification audit. */
  verifiedBy: z.string().min(1).optional(),
  verifiedAt: isoDate.optional(),
  /** Identifier of the immutable verification-audit artifact. */
  verificationAuditId: z.string().min(1).optional(),
  lastVerified: isoDate,
  contentVersion: z.number().int().nonnegative().default(1),
};

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
] as const;
export const questionCategory = z.enum(QUESTION_CATEGORIES);

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
] as const;
export const typedFactKey = z.enum(TYPED_FACT_KEYS);
export type TypedFactKey = z.infer<typeof typedFactKey>;

const condition = z.object({
  kind: z.enum([
    'road-class',
    'driver-age',
    'gdl-phase',
    'vehicle-class',
    'time-of-day',
    'posting',
    'locality',
    'occupancy',
  ]),
  detail: z.string().min(1),
});

const factStateSchema = <T extends z.ZodTypeAny>(value: T) =>
  z.discriminatedUnion('status', [
    z.object({
      status: z.literal('value'),
      value,
      conditions: z.array(condition).min(1).optional(),
    }),
    z.object({
      status: z.literal('varies'),
      variants: z
        .array(z.object({ value, conditions: z.array(condition).min(1) }))
        .min(1),
    }),
    z.object({ status: z.literal('not-applicable'), reason: z.string().min(1) }),
    z.object({ status: z.literal('unknown'), reason: z.string().min(1) }),
  ]);

const factValue = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    state: factStateSchema(value),
    display: z.string().min(1),
    citation: reference,
    effectiveDate: isoDate.optional(),
    lastVerified: isoDate,
    confidence: z.enum(['verified', 'inferred', 'unknown']).default('unknown'),
  }).superRefine((fact, ctx) => {
    if (fact.confidence === 'verified' && !fact.effectiveDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['effectiveDate'],
        message: 'Verified facts require the cited rule effectiveDate',
      });
    }
  });

const mph = z.number().int().min(5).max(90);
const bac = z.number().min(0).max(0.2);

export const typedFacts = z.object({
  bacAdult: factValue(bac),
  bacUnder21: factValue(bac),
  bacCommercial: factValue(bac),
  impliedConsentRefusal: factValue(
    z.object({ suspensionMonths: z.number().int(), criminalOffense: z.boolean() }),
  ),
  openContainerProhibited: factValue(z.boolean()),
  duiFirstSuspensionDays: factValue(z.number().int()).optional(),

  ruralInterstateMaxMph: factValue(mph),
  urbanInterstateMaxMph: factValue(mph).optional(),
  residentialDefaultMph: factValue(mph),
  schoolZoneMph: factValue(mph),
  basicSpeedLaw: factValue(z.boolean()),

  rightTurnOnRed: factValue(z.enum(['allowed-after-stop', 'prohibited-unless-posted'])),
  leftTurnOnRedFromOneWay: factValue(z.enum(['allowed', 'prohibited'])),

  seatBeltEnforcement: factValue(z.enum(['primary', 'secondary'])),
  handheldPhone: factValue(z.enum(['banned-all', 'banned-novice', 'no-ban'])),
  texting: factValue(z.enum(['banned-all', 'banned-novice', 'no-ban'])),
  moveOver: factValue(
    z.object({
      requirement: z.enum(['lane-change-or-slow', 'lane-change-required', 'slow-only']),
      coveredVehicles: z.array(
        z.enum(['emergency', 'tow', 'roadside-assist', 'utility', 'any-flashing']),
      ),
      slowToMph: z.union([mph, z.literal('20-below-posted')]).optional(),
    }),
  ),
  headlightsRequired: factValue(
    z.object({ whenWipersOn: z.boolean(), minutesAfterSunset: z.number().int() }),
  ),

  parkFtFromHydrant: factValue(z.number().int()),
  parkFtFromCrosswalk: factValue(z.number().int()),
  parkFtFromStopSign: factValue(z.number().int()),
  parkFtFromRailroad: factValue(z.number().int()),

  pointSystem: factValue(z.boolean()),
  pointSuspension: factValue(
    z.object({ points: z.number().int(), windowMonths: z.number().int() }),
  ).optional(),

  permitMinAgeMonths: factValue(z.number().int()),
  permitHoldingMonths: factValue(z.number().int()),
  supervisedHoursTotal: factValue(z.number().int()),
  supervisedHoursNight: factValue(z.number().int()).optional(),
  gdlNightCurfew: factValue(
    z.object({ startHour24: z.number().int(), endHour24: z.number().int() }),
  ).optional(),
  gdlPassengerPhase1: factValue(
    z.object({
      cap: z.number().int(),
      underAge: z.number().int(),
      familyExempt: z.boolean(),
    }),
  ).optional(),

  minLiability: factValue(
    z.object({
      bodilyPerPerson: z.number().int(),
      bodilyPerCrash: z.number().int(),
      property: z.number().int(),
    }),
  ),
  crashReportThresholdUsd: factValue(z.number().int()).optional(),
});

/** Which applicant a question/exam variant applies to. */
const applicantVariant = z.object({
  id: z.string().min(1), // e.g. "adult", "under-18", "commercial"
  label: z.string().min(1),
});

// ---------------------------------------------------------------------------
// states, metadata, exam rules, and the "get your permit" process layer
// ---------------------------------------------------------------------------

const examVariant = z.object({
  variantId: z.string().min(1), // matches an applicantVariant id where relevant
  label: z.string().min(1), // e.g. "Adult (18+) Class C knowledge test"
  numQuestions: z.number().int().positive(),
  numToPass: z.number().int().positive(),
  timeLimitMinutes: z.number().int().positive().optional(),
  /** Sub-requirements, e.g. NY "must get 2 of 4 road-sign questions correct". */
  subRequirements: z
    .array(
      z.object({
        category: questionCategory,
        minCorrect: z.number().int().nonnegative(),
        outOf: z.number().int().positive(),
        note: z.string().optional(),
      }),
    )
    .optional(),
  languages: z.array(z.string()).default(['en']),
  onlineAvailable: z.boolean().default(false),
  /** Separate exam variants that must all be passed for this credential. */
  testGroup: z.string().min(1).optional(),
  /** Categories from which this exam variant may draw questions. */
  categoryScope: z.array(questionCategory).min(1).optional(),
});

const states = defineCollection({
  loader: glob({ base: './src/content/states', pattern: '**/*.json' }),
  schema: z
    .object({
    code: stateCode,
    name: z.string().min(1),
    /** Real agency name + type: DMV / DPS / SOS / PennDOT / MVA / BMV / DDS / DHSMV / DOL. */
    agencyName: z.string().min(1),
    agencyShort: z.string().min(1),

    officialSiteUrl: z.string().url(),
    handbookLandingUrl: z.string().url(),
    handbookPdfUrl: z.string().url().optional(),
    handbookFormat: z.enum(['pdf', 'html', 'mixed']),
    handbookEditionYear: z.number().int().gte(2018),
    handbookCopyrightStatus: z
      .enum(['public-domain', 'copyright-retained', 'terms-of-use', 'unknown'])
      .default('unknown'),
    handbookTermsUrl: z.string().url().optional(),

    // Written knowledge test, modeled as variants.
    applicantVariants: z.array(applicantVariant).min(1),
    examVariants: z.array(examVariant).min(1),

    // Retake / attempts
    retake: z
      .object({
        maxAttemptsBeforeExtraReq: z.number().int().positive().optional(),
        waitBetweenAttempts: z.string().optional(),
        attemptCapPeriod: z.string().optional(),
        retakeFee: z.string().optional(),
      })
      .optional(),

    // Eligibility / GDL
    gdl: z.object({
      permitMinAge: z.string(), // string to allow "15 yrs 6 mo"
      provisionalMinAge: z.string().optional(),
      fullLicenseMinAge: z.string().optional(),
      permitHoldingPeriod: z.string().optional(),
      supervisedHoursRequired: z.string().optional(),
      nightHoursRequired: z.string().optional(),
      nightCurfew: z.string().optional(),
      passengerLimits: z.string().optional(),
      driverEdRequired: z.boolean().optional(),
    }),

    // Process
    process: z.object({
      appointmentRequired: z.enum(['required', 'encouraged', 'walk-in', 'varies']),
      schedulingUrl: z.string().url().optional(),
      requiredDocuments: z.array(z.string()).min(1),
      realIdNotes: z.string().optional(),
      permitFee: z.string().optional(),
      licenseFee: z.string().optional(),
      feesUrl: z.string().url().optional(),
      visionTestRequired: z.boolean().default(true),
      visionStandard: z.string().optional(),
    }),

    // Deprecated free-text facts remain during the typed-fact migration.
    facts: z
      .object({
        bacLimitAdult: z.string().optional(),
        bacLimitCommercial: z.string().optional(),
        bacLimitUnder21: z.string().optional(),
        pointSystem: z.boolean().optional(),
        pointSuspensionThreshold: z.string().optional(),
        moveOverRule: z.string().optional(),
        interstateMaxSpeed: z.string().optional(),
        schoolZoneSpeed: z.string().optional(),
        namedLaws: z.array(z.string()).optional(),
      })
      .optional(),
    typedFacts: typedFacts.optional(),

    ...provenance,
    })
    .superRefine((state, ctx) => {
      const seen = new Set<string>();
      state.examVariants.forEach((variant, index) => {
        if (seen.has(variant.variantId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['examVariants', index, 'variantId'],
            message: 'variantId values must be unique within a state',
          });
        }
        seen.add(variant.variantId);
      });
    }),
});

// ---------------------------------------------------------------------------
// questions, original, handbook-grounded items (national shared + per-state)
// ---------------------------------------------------------------------------

const questions = defineCollection({
  loader: arrayJsonLoader('src/content/questions'),
  schema: z
    .object({
      id: z.string().min(1),
      category: questionCategory,
      /** "all" only after confirming no state exception; else explicit state codes. */
      stateScope: z.union([z.literal('all'), z.array(stateCode).min(1)]),
      /** States that override/exclude a shared item (exceptions to a template). */
      stateExceptions: z.array(stateCode).optional(),
      applicantVariants: z.array(z.string()).optional(),
      tags: z.array(z.string().min(1)).default([]),
      tier: z.enum(['T1', 'T2', 'T3']).optional(),
      claims: z
        .array(
          z.object({
            factKey: typedFactKey,
            usage: z.enum(['correct-answer', 'prompt-context']),
          }),
        )
        .optional(),
      /** Sign ids covered by this item, including nonvisual sign-rule counterparts. */
      coversSigns: z.array(z.string().min(1)).min(1).optional(),
      replacesQuestionId: z.string().min(1).optional(),
      templateId: z.string().min(1).optional(),
      templateVersion: z.number().int().positive().optional(),
      universality: z
        .object({
          basis: z.enum([
            'mutcd-federal',
            'federal-statute',
            'concept-only',
            'fact-sweep',
            'manual-audit',
          ]),
          sweepId: z.string().min(1).optional(),
          factKeys: z.array(typedFactKey).min(1).optional(),
        })
        .optional(),

      prompt: z.string().min(1),
      imageAsset: z.string().optional(), // e.g. a sign svg id for road-sign questions
      options: z.array(z.string().min(1)).min(2).max(6),
      correctIndex: z.number().int().nonnegative(),
      explanation: z.string().min(1),
      difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
      languages: z.array(z.string()).default(['en']),

      ...provenance,
    })
    .refine((q) => q.correctIndex < q.options.length, {
      message: 'correctIndex must be a valid index into options',
      path: ['correctIndex'],
    })
    .superRefine((q, ctx) => {
      if (q.tier === 'T1' && q.stateScope !== 'all') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['stateScope'],
          message: 'T1 questions must have stateScope "all"',
        });
      }
      if (q.tier === 'T1' && !q.universality) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['universality'],
          message: 'T1 questions require a universality basis',
        });
      }
      if (q.tier === 'T2') {
        if (q.stateScope === 'all') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['stateScope'],
            message: 'T2 questions must be scoped to one or more states',
          });
        }
        if (!q.templateId || !q.templateVersion) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['templateId'],
            message: 'T2 questions require templateId and templateVersion',
          });
        }
        if (!q.claims?.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['claims'],
            message: 'T2 questions require at least one typed-fact claim',
          });
        }
        if (q.reviewStatus !== 'draft' && (q.verifiedBy || q.verifiedAt || q.verificationAuditId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['verifiedBy'],
            message: 'T2 verification belongs in a confirmed template ledger, not generated rows',
          });
        }
      }
      if (q.tier === 'T3' && q.stateScope === 'all') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['stateScope'],
          message: 'T3 questions must be scoped to one or more states',
        });
      }
      if (
        (q.tier === 'T1' || q.tier === 'T3') &&
        q.reviewStatus !== 'draft' &&
        (!q.verifiedBy || !q.verifiedAt || !q.verificationAuditId)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['verificationAuditId'],
          message: 'Verified T1/T3 questions require reviewer, date, and audit linkage',
        });
      }
      if (
        q.universality &&
        ['fact-sweep', 'manual-audit'].includes(q.universality.basis) &&
        !q.universality.sweepId
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['universality', 'sweepId'],
          message: 'fact-sweep and manual-audit bases require a sweepId',
        });
      }
      if ((q.templateId === undefined) !== (q.templateVersion === undefined)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['templateId'],
          message: 'templateId and templateVersion must be provided together',
        });
      }
    }),
});

// ---------------------------------------------------------------------------
// lessons, coaching prose (Markdown) per category, optionally per state
// ---------------------------------------------------------------------------

const lessons = defineCollection({
  loader: glob({ base: './src/content/lessons', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string().min(1),
    category: questionCategory,
    stateScope: z.union([z.literal('all'), z.array(stateCode).min(1)]).default('all'),
    summary: z.string().min(1),
    order: z.number().int().nonnegative().default(0),
    references: z.array(reference).default([]),
    lastVerified: isoDate,
    contentVersion: z.number().int().nonnegative().default(1),
  }),
});

// ---------------------------------------------------------------------------
// signs, road-sign trainer metadata (SVG assets in public/ or src/content/signs)
// ---------------------------------------------------------------------------

const signs = defineCollection({
  loader: arrayJsonLoader('src/content/signs'),
  schema: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: z.enum(['regulatory', 'warning', 'guide', 'construction', 'marking']),
    asset: z.string().min(1), // path to SVG (base-aware at render)
    meaning: z.string().min(1),
    mutcdCode: z.string().optional(), // MUTCD signs are largely public domain
    stateScope: z.union([z.literal('all'), z.array(stateCode).min(1)]).default('all'),
    references: z.array(reference).default([]),
    lastVerified: isoDate,
  }),
});

export const collections = { states, questions, lessons, signs };
