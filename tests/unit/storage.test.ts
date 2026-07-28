import { beforeEach, describe, expect, it, vi } from 'vitest';
const memory = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: (key: string) => Promise.resolve(memory.get(key)),
  set: (key: string, value: unknown) => { memory.set(key, value); return Promise.resolve(); },
}));
const local = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (key: string) => local.get(key) ?? null, setItem: (key: string, value: string) => local.set(key, value) });
import { exportAll, importAll, migrate, setProgress } from '../../src/lib/storage';

describe('storage', () => {
  beforeEach(() => { memory.clear(); local.clear(); });
  it('exports and imports a versioned backup', async () => {
    await setProgress({ attempts: { q1: { questionId: 'q1', category: 'parking', correct: 1, incorrect: 0, lastSeen: '2026-01-01T00:00:00.000Z' } }, mockResults: [] });
    const backup = await exportAll();
    memory.clear();
    await importAll(JSON.stringify(backup));
    expect((await exportAll()).progress.attempts.q1?.correct).toBe(1);
  });
  it('rejects unsupported schema versions', async () => {
    await expect(importAll({ schemaVersion: 999 })).rejects.toThrow('Backup is from a newer version of DMV Prep.');
  });
  it('migrates v1 counters without losing settings or totals', () => {
    const migrated = migrate({
      schemaVersion: 1,
      progress: {
        attempts: {
          q1: {
            questionId: 'q1',
            category: 'parking',
            correct: 2,
            incorrect: 1,
            lastSeen: '2026-01-01T23:00:00.000Z',
          },
        },
        mockResults: [],
      },
      cards: {},
      settings: { selectedState: 'CA' },
    });
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.settings.selectedState).toBe('CA');
    expect(migrated.progress.attempts.q1?.correct).toBe(2);
    expect(migrated.progress.attempts.q1?.recentSynthetic).toBe(true);
    expect(migrated.progress.attempts.q1?.recentDays).toHaveLength(3);
    expect(migrated.game.dayLog['2026-01-01']?.answers).toBe(1);
    expect(migrated.challenge.items).toEqual({});
  });
});
