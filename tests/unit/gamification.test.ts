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
import { getChallenge, getGame } from '../../src/lib/storage';

describe('gamification activity integration', () => {
  beforeEach(() => {
    memory.clear();
    local.clear();
  });

  it('retires challenge items only after a cross-day correct streak and awards the retirement XP once', async () => {
    const event = (attemptId: string, correct: boolean) => ({
      kind: 'question-answered' as const,
      attemptId,
      questionId: 'missed-question',
      category: 'parking' as const,
      correct,
      source: 'challenge' as const,
      stateCode: 'CA',
    });
    await recordActivity(event('wrong', false), new Date('2026-01-01T12:00:00.000Z'));
    await recordActivity(event('correct-one', true), new Date('2026-01-01T13:00:00.000Z'));
    await recordActivity(event('correct-two', true), new Date('2026-01-02T12:00:00.000Z'));
    await recordActivity(event('correct-three', true), new Date('2026-01-02T13:00:00.000Z'));

    const item = (await getChallenge()).items['q:missed-question'];
    const game = await getGame();
    expect(item?.retiredAt).toBeDefined();
    expect(item?.correctDays).toEqual(['2026-01-01', '2026-01-02']);
    expect(game.xp).toBe(42);
    expect(game.achievements['first-answer']).toBeDefined();
  });
});
