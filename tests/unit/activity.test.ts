import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: (key: string) => Promise.resolve(memory.get(key)),
  set: (key: string, value: unknown) => {
    memory.set(key, value);
    return Promise.resolve();
  },
}));

const local = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => local.get(key) ?? null,
  setItem: (key: string, value: string) => local.set(key, value),
});

import { recordActivity } from '../../src/lib/activity';
import { getChallenge, getGame, getProgress, getSession } from '../../src/lib/storage';

const question = {
  kind: 'question-answered' as const,
  attemptId: 'attempt-1',
  questionId: 'q1',
  category: 'parking' as const,
  correct: false,
  source: 'practice' as const,
};

describe('recordActivity', () => {
  beforeEach(() => {
    memory.clear();
    local.clear();
  });

  it('updates progress, challenge bank, day log, and XP', async () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    await recordActivity(question, now);
    expect((await getProgress()).attempts.q1?.incorrect).toBe(1);
    expect((await getChallenge()).items['q:q1']?.misses).toBe(1);
    expect((await getGame()).dayLog['2026-01-01']?.answers).toBe(1);
    expect((await getGame()).xp).toBe(2);
  });

  it('is idempotent on attemptId, including mock completion', async () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    await recordActivity(question, now);
    await recordActivity(question, now);
    const result = {
      id: 'mock-1',
      state: 'CA',
      variantId: 'standard',
      correct: 1,
      total: 2,
      passed: false,
      completedAt: now.toISOString(),
    };
    await recordActivity({ kind: 'mock-finished', attemptId: 'mock-1', result }, now);
    await recordActivity({ kind: 'mock-finished', attemptId: 'mock-1', result }, now);
    expect((await getProgress()).attempts.q1?.incorrect).toBe(1);
    expect((await getProgress()).mockResults).toHaveLength(1);
    expect((await getSession()).activityIds).toEqual(['attempt-1', 'mock-1']);
    expect((await getGame()).xp).toBe(42);
  });
});
