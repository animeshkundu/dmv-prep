import type { ChallengeBank, ExamVariant, Question } from './types';

type PoolQuestion = Pick<Question, 'id' | 'category' | 'difficulty'>;

export interface CatalogTest {
  id: string;
  label: string;
  kind: 'warm-up' | 'standard' | 'advanced' | 'topic' | 'marathon' | 'simulator' | 'hardest' | 'challenge';
  count: number;
  enabled: boolean;
  reason?: string;
  category?: Question['category'];
  variantId?: string;
}

function unavailable(kind: CatalogTest['kind'], id: string, label: string, count: number, need: number, category?: Question['category'], variantId?: string): CatalogTest {
  return {
    id,
    label,
    kind,
    count,
    enabled: false,
    reason: `Only ${count} question${count === 1 ? '' : 's'} available; ${need} required.`,
    ...(category ? { category } : {}),
    ...(variantId ? { variantId } : {}),
  };
}

export function buildTestCatalog(
  questions: readonly PoolQuestion[],
  variants: readonly ExamVariant[],
  challenge: ChallengeBank,
): CatalogTest[] {
  const tests: CatalogTest[] = [];
  const withMinimum = (
    kind: CatalogTest['kind'],
    id: string,
    label: string,
    requested: number,
    pool: readonly PoolQuestion[],
    category?: Question['category'],
    variantId?: string,
  ) => pool.length >= requested
    ? { id, label, kind, count: requested, enabled: true, ...(category ? { category } : {}), ...(variantId ? { variantId } : {}) }
    : unavailable(kind, id, label, pool.length, requested, category, variantId);

  tests.push(withMinimum('warm-up', 'warm-up', 'Warm-up', 10, questions));
  tests.push(withMinimum('standard', 'standard', 'Standard practice', 20, questions));
  tests.push(withMinimum('advanced', 'advanced', 'Advanced practice', 20, questions.filter((question) => question.difficulty !== 'easy')));
  tests.push({
    id: 'marathon',
    label: 'Marathon',
    kind: 'marathon',
    count: questions.length,
    enabled: questions.length > 0,
    ...(questions.length ? {} : { reason: 'No verified questions are available.' }),
  });

  for (const category of [...new Set(questions.map((question) => question.category))].sort()) {
    const pool = questions.filter((question) => question.category === category);
    tests.push(withMinimum('topic', `topic-${category}`, `${category.replaceAll('-', ' ')} drill`, Math.min(10, pool.length), pool, category));
  }

  for (const variant of variants) {
    const pool = variant.categoryScope?.length
      ? questions.filter((question) => variant.categoryScope!.includes(question.category))
      : questions;
    const requirementGap = variant.subRequirements?.find(
      (requirement) => pool.filter((question) => question.category === requirement.category).length < requirement.outOf,
    );
    tests.push(
      requirementGap
        ? {
            ...unavailable('simulator', `simulator-${variant.variantId}`, variant.label, pool.length, variant.numQuestions, undefined, variant.variantId),
            reason: `Only ${pool.filter((question) => question.category === requirementGap.category).length} ${requirementGap.category} questions are available; ${requirementGap.outOf} required by this exam.`,
          }
        : withMinimum('simulator', `simulator-${variant.variantId}`, variant.label, variant.numQuestions, pool, undefined, variant.variantId),
    );
  }

  const activeChallenge = Object.values(challenge.items).filter((item) => !item.retiredAt);
  const challengeQuestionIds = new Set(
    activeChallenge.filter((item) => item.kind === 'question').map((item) => item.refId),
  );
  const hardestPool = [
    ...questions.filter((question) => challengeQuestionIds.has(question.id)),
    ...questions.filter((question) => question.difficulty === 'hard' && !challengeQuestionIds.has(question.id)),
  ];
  tests.push(withMinimum('hardest', 'hardest', 'Hardest available', 20, hardestPool));
  tests.push({
    id: 'challenge',
    label: 'Challenge Bank',
    kind: 'challenge',
    count: Math.min(20, activeChallenge.length),
    enabled: activeChallenge.length > 0,
    ...(activeChallenge.length ? {} : { reason: 'No missed questions are waiting for review.' }),
  });
  return tests;
}
