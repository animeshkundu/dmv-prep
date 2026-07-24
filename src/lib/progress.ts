import type { MockResult, Progress, Question } from './types';

export const emptyProgress = (): Progress => ({ attempts: {}, mockResults: [] });

export function recordAttempt(
  progress: Progress,
  question: Pick<Question, 'id' | 'category'>,
  correct: boolean,
  now = new Date(),
): Progress {
  const previous = progress.attempts[question.id];
  return {
    ...progress,
    attempts: {
      ...progress.attempts,
      [question.id]: {
        questionId: question.id,
        category: question.category,
        correct: (previous?.correct ?? 0) + (correct ? 1 : 0),
        incorrect: (previous?.incorrect ?? 0) + (correct ? 0 : 1),
        lastSeen: now.toISOString(),
      },
    },
  };
}

export function recordMock(progress: Progress, result: MockResult): Progress {
  return { ...progress, mockResults: [...progress.mockResults, result].slice(-50) };
}

export function masteryByCategory(progress: Progress): Record<string, number> {
  const totals: Record<string, { correct: number; total: number }> = {};
  for (const attempt of Object.values(progress.attempts)) {
    const row = (totals[attempt.category] ??= { correct: 0, total: 0 });
    row.correct += attempt.correct;
    row.total += attempt.correct + attempt.incorrect;
  }
  return Object.fromEntries(
    Object.entries(totals).map(([category, row]) => [category, row.total ? row.correct / row.total : 0]),
  );
}

export function streakDays(progress: Progress, now = new Date()): number {
  const days = new Set(Object.values(progress.attempts).map((attempt) => attempt.lastSeen.slice(0, 10)));
  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export const mockHistory = (progress: Progress): MockResult[] => [...progress.mockResults].reverse();
