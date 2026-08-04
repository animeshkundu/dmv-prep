import { localDayKey, shiftDayKey } from './day';
import {
  emptyGameState,
  emptyStudyState,
  getChallenge,
  getGame,
  getProgress,
  getSession,
  getStudy,
  getSettings,
  setChallenge,
  setGame,
  setProgress,
  setSession,
  setStudy,
} from './storage';
import { recordAttempt, recordMock } from './progress';
import type {
  ActivitySource,
  ChallengeBank,
  ChallengeItem,
  DayEntry,
  GameState,
  Grade,
  MockResult,
  Progress,
  Question,
  SessionState,
  StudyState,
} from './types';

export type { ActivitySource };

export type ActivityEvent =
  | {
      kind: 'question-answered';
      attemptId: string;
      questionId: string;
      category: Question['category'];
      correct: boolean;
      source: ActivitySource;
      stateCode?: string;
    }
  | { kind: 'card-graded'; attemptId: string; cardId: string; grade: Grade }
  | {
      kind: 'unit-checked';
      attemptId: string;
      unitId: string;
      stateCode: string;
      passed: boolean;
    }
  | { kind: 'unit-mastered'; attemptId: string; unitId: string; stateCode: string }
  | { kind: 'mock-finished'; attemptId: string; result: MockResult };

const bankSources = new Set<ChallengeItem['source'][number]>(['practice', 'mock', 'sign', 'study-check']);
const defaultDayEntry = (): DayEntry => ({
  answers: 0,
  flashcards: 0,
  studyUnitsCompleted: 0,
  credits: 0,
  activityCount: 0,
});

function levelForXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 50)));
}

function updateDay(game: GameState, day: string, changes: Partial<DayEntry>): GameState {
  const entry = { ...defaultDayEntry(), ...game.dayLog[day] };
  const updated = {
    ...entry,
    answers: entry.answers + (changes.answers ?? 0),
    flashcards: entry.flashcards + (changes.flashcards ?? 0),
    studyUnitsCompleted: entry.studyUnitsCompleted + (changes.studyUnitsCompleted ?? 0),
    credits: entry.credits + (changes.credits ?? 0),
    activityCount: entry.activityCount + 1,
  };
  return { ...game, dayLog: { ...game.dayLog, [day]: updated } };
}

function isActiveDay(entry: DayEntry): boolean {
  return entry.answers >= 5 || entry.flashcards >= 5 || entry.studyUnitsCompleted >= 1;
}

function previousDay(day: string): string {
  return shiftDayKey(day, -1);
}

function updateStreak(game: GameState, day: string): GameState {
  let current = 0;
  let cursor = day;
  let freezes = game.streak.freezes;
  let lastFreezeUsed = game.streak.lastFreezeUsed;
  const frozenDays = new Set(game.streak.frozenDays ?? (lastFreezeUsed ? [lastFreezeUsed] : []));
  while (true) {
    const entry = game.dayLog[cursor];
    if (entry && isActiveDay(entry)) {
      current++;
      cursor = previousDay(cursor);
      continue;
    }
    // A freeze only covers a missed day before an active day. It is never
    // spent merely because today's partial activity has not reached the goal.
    if (cursor !== day && frozenDays.has(cursor)) {
      current++;
      cursor = previousDay(cursor);
      continue;
    }
    if (cursor !== day && freezes > 0) {
      freezes--;
      lastFreezeUsed = cursor;
      frozenDays.add(cursor);
      current++;
      cursor = previousDay(cursor);
      continue;
    }
    break;
  }
  const earnsFreeze = current > 0 && current % 7 === 0 && game.streak.lastStreakRewardDay !== day;
  const nextXp = game.xp + (earnsFreeze ? 50 : 0);
  return {
    ...game,
    xp: nextXp,
    level: levelForXp(nextXp),
    streak: {
      ...game.streak,
      current,
      longest: Math.max(game.streak.longest, current),
      freezes: Math.min(3, freezes + (earnsFreeze ? 1 : 0)),
      ...(lastFreezeUsed ? { lastFreezeUsed } : {}),
      ...(frozenDays.size ? { frozenDays: [...frozenDays] } : {}),
      ...(earnsFreeze ? { lastStreakRewardDay: day } : {}),
    },
  };
}

function applyGame(game: GameState, event: ActivityEvent, now: Date, retiredChallengeItem = false): GameState {
  const day = localDayKey(now);
  let xp = game.xp;
  let credits = 0;
  let changes: Partial<DayEntry> = {};

  switch (event.kind) {
    case 'question-answered':
      xp += event.correct ? 5 : 2;
      if (retiredChallengeItem) xp += 25;
      credits = 1;
      changes = { answers: 1 };
      break;
    case 'card-graded':
      xp += 3;
      credits = 1.33;
      changes = { flashcards: 1 };
      break;
    case 'unit-checked':
      if (event.passed) {
        xp += 30;
        credits = 20;
        changes = { studyUnitsCompleted: 1 };
      } else {
        xp += 2;
        credits = 0;
      }
      break;
    case 'unit-mastered':
      xp += 75;
      break;
    case 'mock-finished':
      xp += event.result.passed ? 100 : 40;
      break;
  }

  let updated = { ...game, xp, level: levelForXp(xp) };
  if (event.kind === 'mock-finished' || event.kind === 'unit-mastered' || event.kind === 'unit-checked'
      || event.kind === 'card-graded' || event.kind === 'question-answered') {
    updated = updateDay(updated, day, { ...changes, credits: credits });
  }

  const dayEntry = updated.dayLog[day];
  if (dayEntry) {
    const goal = updated.dailyGoal.date === day
      ? updated.dailyGoal
      : { ...updated.dailyGoal, date: day, earned: 0 };
    const earned = goal.earned + credits;
    const completedGoal = earned >= goal.target && !goal.awardedAt;
    if (completedGoal) {
      xp += 25;
      updated = { ...updated, xp, level: levelForXp(xp) };
    }
    updated = {
      ...updated,
      dailyGoal: {
        ...goal,
        earned,
        ...(completedGoal ? { awardedAt: now.toISOString() } : {}),
      },
    };
  }
  return updateStreak(updated, day);
}

function updateChallenge(
  bank: ChallengeBank,
  event: Extract<ActivityEvent, { kind: 'question-answered' }>,
  now: Date,
): { bank: ChallengeBank; retired: boolean } {
  const day = localDayKey(now);
  const id = `q:${event.questionId}`;
  const existing = bank.items[id];
  const source = bankSources.has(event.source as ChallengeItem['source'][number])
    ? event.source as ChallengeItem['source'][number]
    : 'practice';

  if (!existing && event.correct) return { bank, retired: false };
  const item: ChallengeItem = existing ?? {
    id,
    kind: 'question',
    refId: event.questionId,
    category: event.category,
    stateCode: event.stateCode,
    misses: 0,
    correctStreak: 0,
    correctDays: [],
    addedAt: now.toISOString(),
    lastMissedAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    source: [],
  };
  const sources = item.source.includes(source) ? item.source : [...item.source, source];
  const updated: ChallengeItem = {
    ...item,
    category: item.category ?? event.category,
    stateCode: item.stateCode ?? event.stateCode,
    source: sources,
    lastSeenAt: now.toISOString(),
  };

  const wasRetired = Boolean(updated.retiredAt);
  if (!event.correct) {
    updated.misses++;
    updated.correctStreak = 0;
    updated.lastMissedAt = now.toISOString();
    delete updated.retiredAt;
  } else {
    updated.correctStreak++;
    updated.correctDays = [...new Set([...updated.correctDays, day])].slice(-5);
    const threshold = Math.max(1, getSettings().challengeRetireThreshold ?? 3);
    if (updated.correctStreak >= threshold && updated.correctDays.length >= 2) {
      updated.retiredAt ??= now.toISOString();
    }
  }
  return { bank: { items: { ...bank.items, [id]: updated } }, retired: !wasRetired && Boolean(updated.retiredAt) };
}

function awardAchievements(
  game: GameState,
  progress: Progress,
  challenge: ChallengeBank,
  event: ActivityEvent,
  now: Date,
): GameState {
  let updated = game;
  const answers = Object.values(progress.attempts)
    .reduce((total, attempt) => total + attempt.correct + attempt.incorrect, 0);
  if (answers >= 1) updated = unlockedFrom(updated, 'first-answer', now);
  if (answers >= 100) updated = unlockedFrom(updated, 'century', now);
  if (answers >= 1000) updated = unlockedFrom(updated, 'thousand', now);
  if (updated.level >= 5) updated = unlockedFrom(updated, 'level-5', now);
  if (updated.level >= 10) updated = unlockedFrom(updated, 'level-10', now);
  if (event.kind === 'mock-finished') {
    updated = unlockedFrom(updated, 'first-mock', now);
    if (event.result.passed) updated = unlockedFrom(updated, 'mock-passed', now);
  }
  if (updated.streak.current >= 3) updated = unlockedFrom(updated, 'three-day-streak', now);
  if (updated.streak.current >= 7) updated = unlockedFrom(updated, 'seven-day-streak', now);
  const retired = Object.values(challenge.items).filter((item) => item.retiredAt);
  if (retired.length >= 10) updated = unlockedFrom(updated, 'comeback', now);
  if (retired.some((item) => item.misses >= 3)) updated = unlockedFrom(updated, 'persistent', now);
  return updated;
}

function unlockedFrom(game: GameState, id: string, now: Date): GameState {
  return game.achievements[id]
    ? game
    : { ...game, achievements: { ...game.achievements, [id]: { unlockedAt: now.toISOString(), seen: false } } };
}

function updateStudy(study: StudyState, event: ActivityEvent, now: Date): StudyState {
  if (event.kind === 'unit-checked' && event.passed) {
    return {
      ...study,
      completedUnits: { ...study.completedUnits, [`${event.stateCode}:${event.unitId}`]: now.toISOString() },
    };
  }
  if (event.kind === 'unit-mastered') {
    return {
      ...study,
      masteredUnits: { ...study.masteredUnits, [`${event.stateCode}:${event.unitId}`]: now.toISOString() },
    };
  }
  return study;
}

async function processActivity(event: ActivityEvent, now: Date): Promise<void> {
  const session = await getSession();
  if (session.activityIds.includes(event.attemptId)) return;

  const [progress, challenge, game, study] = await Promise.all([
    getProgress(),
    getChallenge(),
    getGame(),
    getStudy(),
  ]);
  const nextProgress: Progress = event.kind === 'question-answered'
    ? recordAttempt(progress, { id: event.questionId, category: event.category }, event.correct, now, event.stateCode)
    : event.kind === 'mock-finished'
      ? recordMock(progress, event.result)
      : progress;
  const challengeUpdate = event.kind === 'question-answered'
    ? updateChallenge(challenge, event, now)
    : { bank: challenge, retired: false };
  const nextChallenge = challengeUpdate.bank;
  const nextGame = awardAchievements(
    applyGame({ ...emptyGameState(), ...game }, event, now, challengeUpdate.retired),
    nextProgress,
    nextChallenge,
    event,
    now,
  );
  const nextStudy = updateStudy({ ...emptyStudyState(), ...study }, event, now);
  const nextSession: SessionState = {
    ...session,
    activityIds: [...session.activityIds, event.attemptId],
  };

  // Persist the marker last: if a write is interrupted, replaying the event
  // repairs the other roots instead of losing the activity.
  await Promise.all([
    setProgress(nextProgress),
    setChallenge(nextChallenge),
    setGame(nextGame),
    setStudy(nextStudy),
  ]);
  await setSession(nextSession);
}

let activityQueue = Promise.resolve();

/** Idempotent on `attemptId`: replaying an event is a no-op. */
export function recordActivity(event: ActivityEvent, now = new Date()): Promise<void> {
  const result = activityQueue.then(() => processActivity(event, now));
  activityQueue = result.catch(() => undefined);
  return result;
}
