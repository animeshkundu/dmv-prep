import { Rating, createEmptyCard, fsrs, generatorParameters, type Card, type CardInput } from 'ts-fsrs';
import type { CardState, Grade } from './types';

const scheduler = fsrs(generatorParameters());
const ratings: Record<Grade, Rating.Again | Rating.Hard | Rating.Good | Rating.Easy> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

function serialize(id: string, card: Card): CardState {
  return {
    id,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review?.toISOString(),
  };
}

function deserialize(card: CardState): CardInput {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.lastReview,
  };
}

export function newCard(id: string, now = new Date()): CardState {
  return serialize(id, createEmptyCard(now));
}

export function reviewCard(card: CardState, grade: Grade, now: Date): CardState {
  return serialize(card.id, scheduler.next(deserialize(card), now, ratings[grade]).card);
}
