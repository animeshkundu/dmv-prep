import type { Attempt, ExamVariant, MockResult, Progress, Question } from './types';

export type MasteryBand = 'weak' | 'developing' | 'proficient' | 'mastered';

export interface MasteryScore {
  score: number;
  seen: number;
  poolSize: number;
  coverage: number;
  averageStrength: number;
}

export interface Readiness {
  score: number;
  categoryScore: number;
  coverageScore: number;
  mockScore: number;
  blockers: string[];
}

type PoolQuestion = Pick<Question, 'id' | 'category'>;

function observedHistory(attempt: Attempt): { outcomes: string; days: string[] } | undefined {
  if (
    attempt.recentSynthetic ||
    !attempt.recent ||
    !attempt.recentDays ||
    attempt.recent.length !== attempt.recentDays.length ||
    !/^[01]+$/.test(attempt.recent)
  ) {
    return undefined;
  }
  return { outcomes: attempt.recent, days: attempt.recentDays };
}

/** Exponentially recency-weighted answer strength over the observed rolling history. */
export function attemptStrength(attempt: Attempt): number {
  const history = observedHistory(attempt);
  if (history) {
    let weightedCorrect = 0;
    let weightTotal = 0;
    for (let index = 0; index < history.outcomes.length; index++) {
      const weight = 0.75 ** (history.outcomes.length - 1 - index);
      weightTotal += weight;
      if (history.outcomes[index] === '1') weightedCorrect += weight;
    }
    return weightTotal ? weightedCorrect / weightTotal : 0;
  }

  const total = attempt.correct + attempt.incorrect;
  // Migrated counters retain a weak learning signal but cannot manufacture observed mastery.
  return total ? (attempt.correct / total) * 0.5 : 0;
}

/** Confirmed mastery requires two observed correct answers on distinct local calendar days. */
export function isMastered(attempt: Attempt): boolean {
  const history = observedHistory(attempt);
  if (!history || !history.outcomes.endsWith('11')) return false;
  return new Set(history.days.slice(-2)).size >= 2;
}

export function masteryBand(score: number): MasteryBand {
  if (score >= 0.9) return 'mastered';
  if (score >= 0.75) return 'proficient';
  if (score >= 0.5) return 'developing';
  return 'weak';
}

export function categoryMastery(
  progress: Progress,
  pool: readonly PoolQuestion[],
  category: Question['category'],
  stateCode?: string,
): MasteryScore {
  const categoryPool = pool.filter((question) => question.category === category);
  const ids = new Set(categoryPool.map((question) => question.id));
  const attempts = Object.values(progress.attempts).filter((attempt) =>
    attempt.category === category &&
    ids.has(attempt.questionId) &&
    (!stateCode || !attempt.stateCode || attempt.stateCode === stateCode),
  );
  const seen = attempts.length;
  const poolSize = categoryPool.length;
  const coverage = poolSize ? Math.min(1, seen / Math.min(poolSize, 12)) : 0;
  const averageStrength = seen
    ? attempts.reduce((total, attempt) => total + attemptStrength(attempt), 0) / seen
    : 0;
  return {
    score: averageStrength * (0.6 + 0.4 * coverage),
    seen,
    poolSize,
    coverage,
    averageStrength,
  };
}

export function masteryByCategory(
  progress: Progress,
  pool?: readonly PoolQuestion[],
  stateCode?: string,
): Record<string, number> {
  if (pool) {
    const categories = [...new Set(pool.map((question) => question.category))];
    return Object.fromEntries(
      categories.map((category) => [category, categoryMastery(progress, pool, category, stateCode).score]),
    );
  }

  const totals = new Map<string, { strength: number; count: number }>();
  for (const attempt of Object.values(progress.attempts)) {
    if (stateCode && attempt.stateCode && attempt.stateCode !== stateCode) continue;
    const current = totals.get(attempt.category) ?? { strength: 0, count: 0 };
    current.strength += attemptStrength(attempt);
    current.count += 1;
    totals.set(attempt.category, current);
  }
  return Object.fromEntries(
    [...totals].map(([category, value]) => [category, value.count ? value.strength / value.count : 0]),
  );
}

function mocksForVariant(progress: Progress, stateCode: string, variantId: string): MockResult[] {
  return progress.mockResults
    .filter((result) => result.state === stateCode && result.variantId === variantId)
    .slice(-3);
}

function mockScore(progress: Progress, stateCode: string, variantId: string): number {
  const scores = mocksForVariant(progress, stateCode, variantId).map((result) => result.correct / result.total);
  return scores.length ? scores.reduce((total, score) => total + score, 0) / scores.length : 0;
}

export function examReadiness(
  progress: Progress,
  pool: readonly PoolQuestion[],
  stateCode: string,
  variant: ExamVariant,
): Readiness {
  const scopedPool = variant.categoryScope?.length
    ? pool.filter((question) => variant.categoryScope!.includes(question.category))
    : [...pool];
  const byCategory = new Map<Question['category'], PoolQuestion[]>();
  for (const question of scopedPool) {
    byCategory.set(question.category, [...(byCategory.get(question.category) ?? []), question]);
  }

  let weightedScore = 0;
  for (const [category, questions] of byCategory) {
    weightedScore += categoryMastery(progress, scopedPool, category, stateCode).score * questions.length;
  }
  const categoryScore = scopedPool.length ? weightedScore / scopedPool.length : 0;
  const questionIds = new Set(scopedPool.map((question) => question.id));
  const answered = Object.values(progress.attempts).filter((attempt) =>
    questionIds.has(attempt.questionId) && (!attempt.stateCode || attempt.stateCode === stateCode),
  ).length;
  const coverageScore = Math.min(1, answered / (variant.numQuestions * 3));
  const recentMockScore = mockScore(progress, stateCode, variant.variantId);
  const recentMocks = mocksForVariant(progress, stateCode, variant.variantId);
  const score = 0.45 * categoryScore + 0.25 * coverageScore + 0.3 * recentMockScore;
  const blockers: string[] = [];

  if (scopedPool.length < variant.numQuestions) {
    blockers.push(`Only ${scopedPool.length} verified questions are available for this ${variant.numQuestions}-question exam.`);
  }
  for (const [category] of byCategory) {
    const mastery = categoryMastery(progress, scopedPool, category, stateCode).score;
    if (mastery < 0.75) {
      blockers.push(`${category.replaceAll('-', ' ')} is at ${Math.round(mastery * 100)}%.`);
    }
  }
  if (answered < variant.numQuestions * 3) {
    blockers.push(`Answer ${variant.numQuestions * 3 - answered} more questions for reliable coverage.`);
  }
  if (!recentMocks.length) blockers.push('You have not completed a mock exam yet.');
  else if (!recentMocks.some((result) => result.passed)) blockers.push('You have not passed a mock exam yet.');

  return { score, categoryScore, coverageScore, mockScore: recentMockScore, blockers };
}

export function groupedReadiness(
  progress: Progress,
  pool: readonly PoolQuestion[],
  stateCode: string,
  variants: readonly ExamVariant[],
): Record<string, Readiness> {
  const groups = new Map<string, ExamVariant[]>();
  for (const variant of variants) {
    const key = variant.testGroup ?? variant.variantId;
    groups.set(key, [...(groups.get(key) ?? []), variant]);
  }
  return Object.fromEntries(
    [...groups].map(([group, members]) => {
      const readiness = members.map((variant) => examReadiness(progress, pool, stateCode, variant));
      const limiting = readiness.reduce((lowest, current) => current.score < lowest.score ? current : lowest);
      return [group, limiting];
    }),
  );
}

export function mocksForState(progress: Progress, stateCode: string): MockResult[] {
  return progress.mockResults.filter((result) => result.state === stateCode);
}
