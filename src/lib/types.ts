import type { CollectionEntry } from 'astro:content';

export type Question = CollectionEntry<'questions'>['data'];
export type StateContent = CollectionEntry<'states'>['data'];
export type Sign = CollectionEntry<'signs'>['data'];
export type Lesson = CollectionEntry<'lessons'>['data'];
export type ExamVariant = StateContent['examVariants'][number];
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
}
