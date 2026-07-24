import { createStore, get, set } from 'idb-keyval';
import type { CardState, Progress, Settings } from './types';
import { emptyProgress } from './progress';

const SCHEMA_VERSION = 1;
const store = createStore('dmvp', 'study');
const keys = { progress: 'dmvp:progress', cards: 'dmvp:cards', mocks: 'dmvp:mocks' } as const;

async function safeGet<T>(key: string, fallback: T): Promise<T> {
  try { return (await get<T>(key, store)) ?? fallback; } catch { return fallback; }
}
async function safeSet<T>(key: string, value: T): Promise<void> {
  try { await set(key, value, store); } catch { /* Private mode can block IndexedDB. */ }
}

export const getProgress = () => safeGet<Progress>(keys.progress, emptyProgress());
export const setProgress = (value: Progress) => safeSet(keys.progress, value);
export const getCards = () => safeGet<Record<string, CardState>>(keys.cards, {});
export const setCards = (value: Record<string, CardState>) => safeSet(keys.cards, value);

export function getSettings(): Settings {
  try { return JSON.parse(localStorage.getItem('dmvp:settings') ?? '{}') as Settings; } catch { return {}; }
}
export function setSettings(settings: Settings): void {
  try { localStorage.setItem('dmvp:settings', JSON.stringify(settings)); } catch { /* unavailable */ }
}

export interface StorageExport {
  schemaVersion: number;
  progress: Progress;
  cards: Record<string, CardState>;
  settings: Settings;
}

export async function exportAll(): Promise<StorageExport> {
  return { schemaVersion: SCHEMA_VERSION, progress: await getProgress(), cards: await getCards(), settings: getSettings() };
}

export async function importAll(input: string | unknown): Promise<void> {
  const parsed = typeof input === 'string' ? JSON.parse(input) as Partial<StorageExport> : input as Partial<StorageExport>;
  if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION) throw new Error('Unsupported DMV Prep backup schema version.');
  if (parsed.progress) {
    const current = await getProgress();
    await setProgress({
      attempts: { ...current.attempts, ...parsed.progress.attempts },
      mockResults: [...current.mockResults, ...parsed.progress.mockResults].slice(-50),
    });
  }
  if (parsed.cards) await setCards({ ...(await getCards()), ...parsed.cards });
  if (parsed.settings) setSettings({ ...getSettings(), ...parsed.settings });
}

export async function migrate(version: number): Promise<number> {
  return version;
}
