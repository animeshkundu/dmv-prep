import { describe, expect, it } from 'vitest';
import { buildTestCatalog } from '../../src/lib/test-catalog';
import type { ExamVariant } from '../../src/lib/types';

const questions = Array.from({ length: 12 }, (_, index) => ({
  id: `q${index}`,
  category: 'road-signs' as const,
  difficulty: index < 2 ? 'easy' as const : 'hard' as const,
}));

describe('test catalog', () => {
  it('keeps unavailable exams visible with a factual capacity reason', () => {
    const variant = {
      variantId: 'permit',
      label: 'Permit simulator',
      numQuestions: 20,
      numToPass: 16,
      languages: ['en'],
      onlineAvailable: false,
      subRequirements: [{ category: 'road-signs', minCorrect: 2, outOf: 4 }],
    } satisfies ExamVariant;
    const catalog = buildTestCatalog(questions, [variant], { items: {} });
    const standard = catalog.find((entry) => entry.id === 'standard');
    const simulator = catalog.find((entry) => entry.id === 'simulator-permit');
    expect(standard).toMatchObject({ enabled: false, reason: 'Only 12 questions available; 20 required.' });
    expect(simulator).toMatchObject({ enabled: false, reason: 'Only 12 questions available; 20 required.' });
    expect(catalog.find((entry) => entry.id === 'challenge')).toMatchObject({ enabled: false });
  });
});
