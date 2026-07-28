import type { CollectionEntry } from 'astro:content';
import type { TypedFactKey } from '../content.config';

export type Question = CollectionEntry<'questions'>['data'];
export type StateContent = CollectionEntry<'states'>['data'];
export type Sign = CollectionEntry<'signs'>['data'];
export type Lesson = CollectionEntry<'lessons'>['data'];
export type ExamVariant = StateContent['examVariants'][number];
export type ExamTestGroup = NonNullable<ExamVariant['testGroup']>;
export type ExamCategoryScope = NonNullable<ExamVariant['categoryScope']>;
export type QuestionTier = NonNullable<Question['tier']>;
export type QuestionClaim = NonNullable<Question['claims']>[number];
export type QuestionUniversality = NonNullable<Question['universality']>;
export type QuestionTemplateMetadata = Pick<Question, 'templateId' | 'templateVersion'>;
export type QuestionSignCoverage = NonNullable<Question['coversSigns']>;
export type TypedFacts = NonNullable<StateContent['typedFacts']>;

export type FactConditionKind =
  | 'road-class'
  | 'driver-age'
  | 'gdl-phase'
  | 'vehicle-class'
  | 'time-of-day'
  | 'posting'
  | 'locality'
  | 'occupancy';

export interface FactCondition {
  kind: FactConditionKind;
  detail: string;
}

export type FactState<T> =
  | { status: 'value'; value: T; conditions?: FactCondition[] }
  | { status: 'varies'; variants: Array<{ value: T; conditions: FactCondition[] }> }
  | { status: 'not-applicable'; reason: string }
  | { status: 'unknown'; reason: string };

export interface FactValue<T> {
  state: FactState<T>;
  display: string;
  citation: {
    label: string;
    citation: string;
    url?: string;
  };
  effectiveDate?: string;
  lastVerified: string;
  confidence: 'verified' | 'inferred' | 'unknown';
}

export type { TypedFactKey };
export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface CardState {
  id: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview?: string;
}

export interface Attempt {
  questionId: string;
  category: Question['category'];
  correct: number;
  incorrect: number;
  lastSeen: string;
  /** The last ten outcomes, oldest first. */
  recent?: string;
  /** Local day for each outcome in `recent`. */
  recentDays?: string[];
  /** True when the history was reconstructed during migration. */
  recentSynthetic?: boolean;
}

export interface MockResult {
  id: string;
  state: string;
  variantId: string;
  correct: number;
  total: number;
  passed: boolean;
  completedAt: string;
  passThreshold?: number;
}

export interface Progress {
  attempts: Record<string, Attempt>;
  mockResults: MockResult[];
}

export interface Settings {
  selectedState?: string;
  theme?: 'light' | 'dark' | 'system';
  targetRetention?: number;
  challengeRetireThreshold?: number;
}

export interface ChallengeItem {
  id: string;
  kind: 'question' | 'sign';
  refId: string;
  category?: Question['category'];
  stateCode?: string;
  misses: number;
  correctStreak: number;
  correctDays: string[];
  addedAt: string;
  lastMissedAt: string;
  lastSeenAt: string;
  source: Array<'practice' | 'mock' | 'sign' | 'study-check'>;
  retiredAt?: string;
}

export interface ChallengeBank {
  items: Record<string, ChallengeItem>;
}

export interface DayEntry {
  answers: number;
  flashcards: number;
  studyUnitsCompleted: number;
  credits: number;
  activityCount: number;
}

export interface GameState {
  xp: number;
  level: number;
  dayLog: Record<string, DayEntry>;
  streak: { current: number; longest: number; freezes: number; lastFreezeUsed?: string };
  achievements: Record<string, { unlockedAt: string; seen: boolean }>;
  dailyGoal: { target: number; date: string; earned: number };
}

export interface StudyState {
  completedUnits: Record<string, string>;
  masteredUnits: Record<string, string>;
}

export interface MarathonSession {
  testId: string;
  seed: string | number;
  index: number;
  answers: Record<string, number | undefined>;
  startedAt: string;
  bankContentVersion: string;
  questionIds: string[];
}

export interface SessionState {
  activityIds: string[];
  marathon?: MarathonSession;
}

export type ActivitySource = 'practice' | 'mock' | 'sign' | 'study-check' | 'flashcards' | 'challenge' | 'marathon';
