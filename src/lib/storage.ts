import { createStore, get, set } from 'idb-keyval';
import type {
  CardState,
  ChallengeBank,
  GameState,
  Progress,
  SessionState,
  Settings,
  StudyState,
} from './types';
import { localDayKey } from './day';
import { emptyProgress } from './progress';

export const SCHEMA_VERSION = 2;
const store = createStore('dmvp', 'study');
const keys = {
  progress: 'dmvp:progress',
  cards: 'dmvp:cards',
  challenge: 'dmvp:challenge',
  game: 'dmvp:game',
  study: 'dmvp:study',
  session: 'dmvp:session',
} as const;
const schemaMarker = 'dmvp:storage-schema';

export const emptyChallengeBank = (): ChallengeBank => ({ items: {} });
export const emptyGameState = (): GameState => ({
  xp: 0,
  level: 1,
  dayLog: {},
  streak: { current: 0, longest: 0, freezes: 2 },
  achievements: {},
  dailyGoal: { target: 20, date: '', earned: 0 },
});
export const emptyStudyState = (): StudyState => ({ completedUnits: {}, masteredUnits: {} });
export const emptySessionState = (): SessionState => ({ activityIds: [] });

async function safeGet<T>(key: string, fallback: T): Promise<T> {
  try {
    return (await get<T>(key, store)) ?? fallback;
  } catch {
    return fallback;
  }
}

async function safeSet<T>(key: string, value: T): Promise<void> {
  try {
    await set(key, value, store);
  } catch {
    // Private mode can block IndexedDB.
  }
}

export interface StorageExport {
  schemaVersion: number;
  progress: Progress;
  cards: Record<string, CardState>;
  settings: Settings;
  challenge: ChallengeBank;
  game: GameState;
  study: StudyState;
  session: SessionState;
}

/** The v1 shape was intentionally small and did not contain the v2 roots. */
export type StorageInput = Partial<StorageExport> & { schemaVersion?: number };

function defaultProgress(value: Partial<Progress> | undefined): Progress {
  return {
    attempts: value?.attempts ?? {},
    mockResults: value?.mockResults ?? [],
  };
}

function syntheticAttempt(attempt: Progress['attempts'][string]): Progress['attempts'][string] {
  if (attempt.recent !== undefined && attempt.recentDays !== undefined
      && attempt.recent.length === attempt.recentDays.length) {
    return attempt;
  }

  const outcomeHistory = `${'0'.repeat(Math.min(10, Math.max(0, attempt.incorrect)))}${'1'.repeat(Math.min(10, Math.max(0, attempt.correct)))}`
    .slice(-10);
  const parsedDate = new Date(attempt.lastSeen);
  const day = Number.isNaN(parsedDate.getTime()) ? undefined : localDayKey(parsedDate);
  return {
    ...attempt,
    recent: outcomeHistory,
    recentDays: day ? Array.from({ length: outcomeHistory.length }, () => day) : [],
    recentSynthetic: true,
  };
}

function seedDayLog(progress: Progress, existing: GameState['dayLog']): GameState['dayLog'] {
  const dayLog = { ...existing };
  for (const attempt of Object.values(progress.attempts)) {
    const date = new Date(attempt.lastSeen);
    if (Number.isNaN(date.getTime())) continue;
    const day = localDayKey(date);
    const entry = dayLog[day] ?? {
      answers: 0,
      flashcards: 0,
      studyUnitsCompleted: 0,
      credits: 0,
      activityCount: 0,
    };
    dayLog[day] = { ...entry, answers: entry.answers + 1, activityCount: entry.activityCount + 1 };
  }
  return dayLog;
}

function v1ToV2(input: StorageInput): StorageExport {
  const progress = defaultProgress(input.progress);
  const migratedProgress: Progress = {
    ...progress,
    attempts: Object.fromEntries(
      Object.entries(progress.attempts).map(([id, attempt]) => [id, syntheticAttempt(attempt)]),
    ),
  };
  const game = { ...emptyGameState(), ...(input.game ?? {}) };
  game.dayLog = seedDayLog(migratedProgress, game.dayLog);
  return {
    schemaVersion: 2,
    progress: migratedProgress,
    cards: input.cards ?? {},
    settings: input.settings ?? {},
    challenge: input.challenge ?? emptyChallengeBank(),
    game,
    study: input.study ?? emptyStudyState(),
    session: input.session ?? emptySessionState(),
  };
}

const MIGRATIONS: Record<number, (input: StorageInput) => StorageExport> = {
  1: v1ToV2,
};

/**
 * Apply storage migrations in order. This function is deliberately
 * synchronous so file imports and callers can validate a backup before
 * writing any part of it.
 */
export function migrate(input: StorageInput): StorageExport {
  if (!input || typeof input !== 'object') throw new Error('Invalid DMV Prep backup.');
  let data = input;
  let version = data.schemaVersion ?? 1;
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('Unsupported DMV Prep backup schema version.');
  }
  if (version > SCHEMA_VERSION) throw new Error('Backup is from a newer version of DMV Prep.');
  while (version < SCHEMA_VERSION) {
    const migration = MIGRATIONS[version];
    if (!migration) throw new Error(`No migration available for storage schema version ${version}.`);
    data = migration(data);
    version++;
  }
  const current = data as StorageExport;
  return {
    schemaVersion: SCHEMA_VERSION,
    progress: defaultProgress(current.progress),
    cards: current.cards ?? {},
    settings: current.settings ?? {},
    challenge: current.challenge ?? emptyChallengeBank(),
    game: { ...emptyGameState(), ...(current.game ?? {}) },
    study: { ...emptyStudyState(), ...(current.study ?? {}) },
    session: { ...emptySessionState(), ...(current.session ?? {}) },
  };
}

let migrationPromise: Promise<void> | undefined;
let migrationComplete = false;

function storedSchemaVersion(): number | undefined {
  try {
    const value = localStorage.getItem(schemaMarker);
    return value === null ? undefined : Number(value);
  } catch {
    return undefined;
  }
}

function markSchemaVersion(version: number): void {
  try {
    localStorage.setItem(schemaMarker, String(version));
  } catch {
    // Private mode can block localStorage.
  }
}

async function migrateDeviceStorage(): Promise<void> {
  if (migrationComplete) return;
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    if (storedSchemaVersion() === SCHEMA_VERSION) {
      migrationComplete = true;
      return;
    }
    const legacy: StorageInput = {
      schemaVersion: 1,
      progress: await safeGet(keys.progress, emptyProgress()),
      cards: await safeGet(keys.cards, {}),
      settings: getSettings(),
      challenge: await safeGet(keys.challenge, emptyChallengeBank()),
      game: await safeGet(keys.game, emptyGameState()),
      study: await safeGet(keys.study, emptyStudyState()),
      session: await safeGet(keys.session, emptySessionState()),
    };
    const migrated = migrate(legacy);
    await Promise.all([
      safeSet(keys.progress, migrated.progress),
      safeSet(keys.cards, migrated.cards),
      safeSet(keys.challenge, migrated.challenge),
      safeSet(keys.game, migrated.game),
      safeSet(keys.study, migrated.study),
      safeSet(keys.session, migrated.session),
    ]);
    setSettings(migrated.settings);
    markSchemaVersion(SCHEMA_VERSION);
    migrationComplete = true;
  })();
  return migrationPromise;
}

export async function getProgress(): Promise<Progress> {
  await migrateDeviceStorage();
  return safeGet(keys.progress, emptyProgress());
}
export async function setProgress(value: Progress): Promise<void> {
  await migrateDeviceStorage();
  return safeSet(keys.progress, value);
}
export async function getCards(): Promise<Record<string, CardState>> {
  await migrateDeviceStorage();
  return safeGet(keys.cards, {});
}
export async function setCards(value: Record<string, CardState>): Promise<void> {
  await migrateDeviceStorage();
  return safeSet(keys.cards, value);
}
export async function getChallenge(): Promise<ChallengeBank> {
  await migrateDeviceStorage();
  return safeGet(keys.challenge, emptyChallengeBank());
}
export async function setChallenge(value: ChallengeBank): Promise<void> {
  await migrateDeviceStorage();
  return safeSet(keys.challenge, value);
}
export async function getGame(): Promise<GameState> {
  await migrateDeviceStorage();
  return safeGet(keys.game, emptyGameState());
}
export async function setGame(value: GameState): Promise<void> {
  await migrateDeviceStorage();
  return safeSet(keys.game, value);
}
export async function getStudy(): Promise<StudyState> {
  await migrateDeviceStorage();
  return safeGet(keys.study, emptyStudyState());
}
export async function setStudy(value: StudyState): Promise<void> {
  await migrateDeviceStorage();
  return safeSet(keys.study, value);
}
export async function getSession(): Promise<SessionState> {
  await migrateDeviceStorage();
  return safeGet(keys.session, emptySessionState());
}
export async function setSession(value: SessionState): Promise<void> {
  await migrateDeviceStorage();
  return safeSet(keys.session, value);
}

export function getSettings(): Settings {
  try {
    return JSON.parse(localStorage.getItem('dmvp:settings') ?? '{}') as Settings;
  } catch {
    return {};
  }
}
export function setSettings(settings: Settings): void {
  try {
    localStorage.setItem('dmvp:settings', JSON.stringify(settings));
  } catch {
    // Private mode can block localStorage.
  }
}

export async function exportAll(): Promise<StorageExport> {
  await migrateDeviceStorage();
  return {
    schemaVersion: SCHEMA_VERSION,
    progress: await getProgress(),
    cards: await getCards(),
    settings: getSettings(),
    challenge: await getChallenge(),
    game: await getGame(),
    study: await getStudy(),
    session: await getSession(),
  };
}

function mergeDayLogs(left: GameState['dayLog'], right: GameState['dayLog']): GameState['dayLog'] {
  const merged = { ...left };
  for (const [day, entry] of Object.entries(right)) {
    const current = merged[day];
    if (!current) {
      merged[day] = entry;
      continue;
    }
    merged[day] = {
      answers: current.answers + entry.answers,
      flashcards: current.flashcards + entry.flashcards,
      studyUnitsCompleted: current.studyUnitsCompleted + entry.studyUnitsCompleted,
      credits: current.credits + entry.credits,
      activityCount: current.activityCount + entry.activityCount,
    };
  }
  return merged;
}

export async function importAll(input: string | unknown): Promise<void> {
  const parsed = (typeof input === 'string' ? JSON.parse(input) : input) as StorageInput;
  const imported = migrate(parsed);
  await migrateDeviceStorage();

  const current = await exportAll();
  const progress: Progress = {
    attempts: { ...current.progress.attempts, ...imported.progress.attempts },
    mockResults: [...current.progress.mockResults, ...imported.progress.mockResults].slice(-50),
  };
  const challenge: ChallengeBank = {
    items: { ...current.challenge.items, ...imported.challenge.items },
  };
  const game: GameState = {
    ...current.game,
    ...imported.game,
    dayLog: mergeDayLogs(current.game.dayLog, imported.game.dayLog),
  };
  const session: SessionState = {
    ...current.session,
    ...imported.session,
    activityIds: [...new Set([...current.session.activityIds, ...imported.session.activityIds])],
  };
  await Promise.all([
    setProgress(progress),
    setCards({ ...current.cards, ...imported.cards }),
    setChallenge(challenge),
    setGame(game),
    setStudy({ ...current.study, ...imported.study }),
    setSession(session),
  ]);
  setSettings({ ...current.settings, ...imported.settings });
}
