import { describe, expect, it } from 'vitest';
import { buildFlashcardQueue } from '../../src/lib/flashcard-queue';

const now = new Date('2026-01-10T12:00:00.000Z');
const card = (id: string, due: string) => ({
  id,
  due,
  stability: 1,
  difficulty: 1,
  elapsedDays: 0,
  scheduledDays: 0,
  reps: 0,
  lapses: 0,
  state: 0,
});

describe('flashcard queue', () => {
  it('puts the most overdue cards before priority-new misses and other new cards', () => {
    const queue = buildFlashcardQueue(
      [{ id: 'q:due-old' }, { id: 'q:due-new' }, { id: 'q:miss' }, { id: 'q:new' }],
      {
        'q:due-old': card('q:due-old', '2026-01-08T12:00:00.000Z'),
        'q:due-new': card('q:due-new', '2026-01-09T12:00:00.000Z'),
      },
      {
        items: {
          'q:miss': {
            id: 'q:miss',
            kind: 'question',
            refId: 'miss',
            misses: 3,
            correctStreak: 0,
            correctDays: [],
            addedAt: now.toISOString(),
            lastMissedAt: now.toISOString(),
            lastSeenAt: now.toISOString(),
            source: ['practice'],
          },
        },
      },
      now,
    );
    expect(queue.map((item) => item.id)).toEqual(['q:due-old', 'q:due-new', 'q:miss', 'q:new']);
  });

  it('honors both the total session cap and the separate new-card cap', () => {
    const queue = buildFlashcardQueue(
      Array.from({ length: 20 }, (_, index) => ({ id: `q:${index}` })),
      {},
      { items: {} },
      now,
      20,
      10,
    );
    expect(queue).toHaveLength(10);
  });
});
