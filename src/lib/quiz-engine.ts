import type { ExamVariant, Progress, Question } from './types';

/** Selection only needs identity and category, so the reduced client bank works too. */
type SelectableQuestion = Pick<Question, 'id' | 'category'>;
type ScorableQuestion = Pick<Question, 'id' | 'category' | 'correctIndex'>;

function hashSeed(seed: string | number): number {
  if (typeof seed === 'number') return seed >>> 0;
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], seed: string | number): T[] {
  const result = [...items];
  const random = mulberry32(hashSeed(seed));
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

export function buildPracticeSet<T extends SelectableQuestion>(
  questions: T[],
  options: { category?: Question['category']; count: number; seed: string | number },
): T[] {
  const bank = options.category
    ? questions.filter((question) => question.category === options.category)
    : questions;
  return shuffle(bank, options.seed).slice(0, Math.max(0, options.count));
}

export function buildMockExam<T extends SelectableQuestion>(
  _state: string,
  variant: ExamVariant,
  applicable: T[],
  seed: string | number,
): T[] {
  const scope = variant.categoryScope;
  // A scoped variant is its own exam (GA/NC signs test): it may only draw from those categories.
  const pool = scope
    ? applicable.filter((question) => (scope as readonly string[]).includes(question.category))
    : applicable;
  const selected: T[] = [];
  const used = new Set<string>();
  for (const requirement of variant.subRequirements ?? []) {
    const candidates = shuffle(
      pool.filter((question) => question.category === requirement.category),
      `${seed}:${requirement.category}`,
    );
    // Best effort: include up to outOf when the category bank or total exam size is smaller.
    for (const question of candidates.slice(0, Math.min(requirement.outOf, variant.numQuestions))) {
      if (!used.has(question.id)) {
        selected.push(question);
        used.add(question.id);
      }
    }
  }
  for (const question of shuffle(pool, seed)) {
    if (selected.length >= variant.numQuestions) break;
    if (!used.has(question.id)) {
      selected.push(question);
      used.add(question.id);
    }
  }
  return shuffle(selected, `${seed}:final`).slice(0, variant.numQuestions);
}

export interface ScoreResult {
  correct: number;
  total: number;
  passed: boolean;
  passThreshold: number;
  subRequirementResults: Array<{
    category: Question['category'];
    correct: number;
    total: number;
    minCorrect: number;
    outOf: number;
    passed: boolean;
  }>;
}

export function scoreExam<T extends ScorableQuestion>(
  questions: T[],
  answers: Record<string, number | undefined>,
  variant: ExamVariant,
): ScoreResult {
  const correct = questions.filter((question) => answers[question.id] === question.correctIndex).length;
  const subRequirementResults = (variant.subRequirements ?? []).map((requirement) => {
    const categoryQuestions = questions.filter((question) => question.category === requirement.category);
    const categoryCorrect = categoryQuestions.filter(
      (question) => answers[question.id] === question.correctIndex,
    ).length;
    return {
      category: requirement.category,
      correct: categoryCorrect,
      total: categoryQuestions.length,
      minCorrect: requirement.minCorrect,
      outOf: requirement.outOf,
      passed: categoryCorrect >= requirement.minCorrect,
    };
  });
  return {
    correct,
    total: questions.length,
    passed: correct >= variant.numToPass && subRequirementResults.every((result) => result.passed),
    passThreshold: variant.numToPass,
    subRequirementResults,
  };
}

export function nextWeakArea(progress: Progress): Question['category'] | undefined {
  const totals = new Map<Question['category'], { correct: number; total: number }>();
  for (const attempt of Object.values(progress.attempts)) {
    const current = totals.get(attempt.category) ?? { correct: 0, total: 0 };
    current.correct += attempt.correct;
    current.total += attempt.correct + attempt.incorrect;
    totals.set(attempt.category, current);
  }
  return [...totals.entries()].sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)[0]?.[0];
}
