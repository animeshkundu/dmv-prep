/**
 * Per-attempt option presentation.
 *
 * The stored bank is position-biased (73% of correct answers sit at index 1), so options
 * must never be rendered in stored order. Presentation is a pure function of
 * (question id, session seed): re-rendering an already-answered question — which the mock
 * allows by navigating backwards — reproduces the identical arrangement, while a new
 * attempt (new seed) rearranges it so position memorisation cannot help.
 */
import { shuffle } from './quiz-engine';
import type { Question } from './types';

/** Minimum shape needed to present a question: the reduced bank payload satisfies it. */
export type PresentableQuestion = Pick<Question, 'id' | 'options' | 'correctIndex'>;

export interface PresentedQuestion<Q extends PresentableQuestion = Question> {
  question: Q;
  /** Option text in display order. */
  options: string[];
  /** Index of the correct answer within `options`. */
  correctIndex: number;
  /** display index -> stored index. */
  displayToStored: number[];
}

export function presentQuestion<Q extends PresentableQuestion>(
  question: Q,
  sessionSeed: string | number,
): PresentedQuestion<Q> {
  const displayToStored = shuffle(
    question.options.map((_, index) => index),
    `${question.id}:${sessionSeed}`,
  );
  return {
    question,
    options: displayToStored.map((stored) => question.options[stored]!),
    correctIndex: displayToStored.indexOf(question.correctIndex),
    displayToStored,
  };
}

/** Translate a display-space answer back into the stored `correctIndex` space. */
export function toStoredIndex(
  presented: PresentedQuestion<PresentableQuestion>,
  displayIndex: number,
): number {
  return presented.displayToStored[displayIndex] ?? -1;
}

/** Translate a stored index into display space, e.g. to highlight the correct option. */
export function toDisplayIndex(
  presented: PresentedQuestion<PresentableQuestion>,
  storedIndex: number,
): number {
  return presented.displayToStored.indexOf(storedIndex);
}
