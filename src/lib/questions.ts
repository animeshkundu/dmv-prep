import type { Question } from './types';

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
