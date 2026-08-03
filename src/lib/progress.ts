import type { DayEntry, MockResult, Progress, Question } from './types';
import { localDayKey, shiftDayKey } from './day';

export const emptyProgress = (): Progress => ({ attempts: {}, mockResults: [] });

export function recordAttempt(
  progress: Progress,
  question: Pick<Question, 'id' | 'category'>,
  correct: boolean,
  now = new Date(),
): Progress {
  const previous = progress.attempts[question.id];
  // Reconstructed migration history cannot be mixed with observed outcomes:
  // the first real answer must not inherit a fabricated consecutive run.
  const priorRecent = previous?.recentSynthetic ? '' : (previous?.recent ?? '');
  const priorDays = previous?.recentSynthetic ? [] : (previous?.recentDays ?? []);
  const recent = `${priorRecent}${correct ? '1' : '0'}`.slice(-10);
  const recentDays = [...priorDays, localDayKey(now)].slice(-10);
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
        recent,
        recentDays,
        recentSynthetic: false,
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

export function streakDays(progress: Progress, now = new Date(), dayLog?: Record<string, DayEntry>): number {
  const days = dayLog
    ? new Set(Object.entries(dayLog)
      .filter(([, entry]) => entry.answers >= 5 || entry.flashcards >= 5 || entry.studyUnitsCompleted >= 1)
      .map(([day]) => day))
    : new Set(Object.values(progress.attempts)
      .map((attempt) => new Date(attempt.lastSeen))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => localDayKey(date)));
  let streak = 0;
  let cursor = localDayKey(now);
  while (days.has(cursor)) {
    streak++;
    cursor = shiftDayKey(cursor, -1);
  }
  return streak;
}

export const mockHistory = (progress: Progress): MockResult[] => [...progress.mockResults].reverse();
