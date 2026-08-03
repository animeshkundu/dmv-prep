import type { Question } from './types';

/**
 * The reduced question shape that reaches the browser — inlined as the page seed and served
 * by the bank endpoint. Build-time provenance never ships.
 */
export interface ClientQuestion {
  id: string;
  category: Question['category'];
  tags?: string[];
  prompt: string;
  imageAsset?: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty?: Question['difficulty'];
  references?: Array<{ citation: string; url?: string }>;
}

export function toClientQuestion(question: Question): ClientQuestion {
  const reference = question.references[0];
  return {
    id: question.id,
    category: question.category,
    ...(question.tags?.length ? { tags: question.tags } : {}),
    prompt: question.prompt,
    ...(question.imageAsset ? { imageAsset: question.imageAsset } : {}),
    options: question.options,
    correctIndex: question.correctIndex,
    explanation: question.explanation,
    difficulty: question.difficulty,
    ...(reference
      ? { references: [{ citation: reference.citation, ...(reference.url ? { url: reference.url } : {}) }] }
      : {}),
  };
}

/**
 * The playable set inlined into the HTML for no-JS and pre-fetch visitors. It deliberately
 * mirrors the first `count` questions so the page's schema.org `hasPart` stays in sync.
 */
export function seedQuestions(questions: Question[], count = 10): ClientQuestion[] {
  return questions.slice(0, count).map(toClientQuestion);
}

export function applicableQuestions(questions: Question[], stateCode: string): Question[] {
  const code = stateCode.toUpperCase();
  return questions.filter((question) =>
    question.stateScope === 'all'
      ? !question.stateExceptions?.includes(code as never)
      : question.stateScope.includes(code as never),
  );
}

export function byCategory(questions: Question[], category: Question['category']): Question[] {
  return questions.filter((question) => question.category === category);
}

export function categoriesPresent(questions: Question[]): Question['category'][] {
  return [...new Set(questions.map((question) => question.category))].sort();
}
