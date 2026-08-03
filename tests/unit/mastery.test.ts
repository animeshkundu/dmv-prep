import { describe, expect, it } from 'vitest';
import {
  attemptStrength,
  categoryMastery,
  examReadiness,
  groupedReadiness,
  isMastered,
  masteryBand,
} from '../../src/lib/mastery';
import type { Attempt, ExamVariant, Progress } from '../../src/lib/types';

const attempt = (overrides: Partial<Attempt> = {}): Attempt => ({
  questionId: 'q1',
  category: 'parking',
  correct: 2,
  incorrect: 8,
  lastSeen: '2026-01-10T12:00:00.000Z',
  recent: '0000000011',
  recentDays: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10'],
  ...overrides,
});

const pool = Array.from({ length: 12 }, (_, index) => ({
  id: `q${index + 1}`,
  category: 'parking' as const,
}));

describe('mastery model', () => {
  it('weights recent observed answers and never lets synthetic history confirm mastery', () => {
    expect(attemptStrength(attempt())).toBeCloseTo(0.464, 3);
    expect(isMastered(attempt())).toBe(true);
    expect(isMastered(attempt({ recentSynthetic: true }))).toBe(false);
    expect(attemptStrength(attempt({ recentSynthetic: true }))).toBe(0.1);
  });

  it('penalizes category mastery when only a thin slice of its pool has been seen', () => {
    const progress: Progress = {
      attempts: { q1: attempt({ recent: '11', recentDays: ['2026-01-09', '2026-01-10'], correct: 2, incorrect: 0 }) },
      mockResults: [],
    };
    const score = categoryMastery(progress, pool, 'parking');
    expect(score.coverage).toBeCloseTo(1 / 12);
    expect(score.averageStrength).toBe(1);
    expect(score.score).toBeCloseTo(0.6333, 3);
    expect(masteryBand(score.score)).toBe('developing');
  });

  it('caps readiness below ready without a mock and uses the weaker grouped exam', () => {
    const variant = {
      variantId: 'rules',
      label: 'Road rules',
      numQuestions: 10,
      numToPass: 8,
      languages: ['en'],
      onlineAvailable: false,
    } satisfies ExamVariant;
    const signs = { ...variant, variantId: 'signs', label: 'Road signs', testGroup: 'knowledge' };
    const rules = { ...variant, testGroup: 'knowledge' };
    const progress: Progress = {
      attempts: {},
      mockResults: [
        { id: 'mock-rules', state: 'GA', variantId: 'rules', correct: 10, total: 10, passed: true, completedAt: '2026-01-10T12:00:00.000Z' },
      ],
    };
    const readiness = examReadiness(progress, pool, 'GA', signs);
    expect(readiness.score).toBeLessThanOrEqual(0.7);
    expect(readiness.blockers).toContain('You have not completed a mock exam yet.');
    const grouped = groupedReadiness(progress, pool, 'GA', [rules, signs]);
    expect(grouped.knowledge?.score).toBeLessThanOrEqual(readiness.score);
  });

  it('requires a passed mock rather than merely a high mock score', () => {
    const variant = {
      variantId: 'permit',
      label: 'Permit',
      numQuestions: 10,
      numToPass: 8,
      languages: ['en'],
      onlineAvailable: false,
    } satisfies ExamVariant;
    const progress: Progress = {
      attempts: {},
      mockResults: [
        { id: 'near-pass', state: 'CA', variantId: 'permit', correct: 9, total: 10, passed: false, completedAt: '2026-01-10T12:00:00.000Z' },
      ],
    };
    expect(examReadiness(progress, pool, 'CA', variant).blockers).toContain('You have not passed a mock exam yet.');
  });
});
