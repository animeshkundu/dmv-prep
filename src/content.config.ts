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
});

const states = defineCollection({
  loader: glob({ base: './src/content/states', pattern: '**/*.json' }),
  schema: z.object({
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

    // State-variable facts used to author state-specific questions.
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

    ...provenance,
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
