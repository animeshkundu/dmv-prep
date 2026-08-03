import { describe, expect, it } from 'vitest';
import national from '../../src/content/questions/national.json';
import { presentQuestion, toDisplayIndex, toStoredIndex } from '../../src/lib/options';
import type { PresentableQuestion } from '../../src/lib/options';

const bank = national as unknown as PresentableQuestion[];

/** The shipped bank is position-biased: every synthetic item stores its answer at index 1. */
const biasedBank: PresentableQuestion[] = Array.from({ length: 240 }, (_, index) => ({
  id: `synthetic-${String(index).padStart(3, '0')}`,
  options: ['stored A', 'stored B', 'stored C', 'stored D'],
  correctIndex: 1,
}));

describe('option presentation', () => {
  it('is pure in (question, seed) so re-renders never rescramble', () => {
    const question = bank[0]!;
    expect(presentQuestion(question, 'attempt-1').options).toEqual(
      presentQuestion(question, 'attempt-1').options,
    );
  });

  it('rearranges across attempts so position memorisation cannot help', () => {
    const changed = biasedBank.filter(
      (question) =>
        presentQuestion(question, 'attempt-1').displayToStored.join('') !==
        presentQuestion(question, 'attempt-2').displayToStored.join(''),
    );
    expect(changed.length / biasedBank.length).toBeGreaterThan(0.8);
    const arrangements = new Set(
      biasedBank.map((question) => presentQuestion(question, 'attempt-1').displayToStored.join('')),
    );
    expect(arrangements.size).toBeGreaterThan(12);
  });

  it('keeps every option exactly once', () => {
    for (const question of bank) {
      const presented = presentQuestion(question, 'seed');
      expect([...presented.options].sort()).toEqual([...question.options].sort());
      expect(new Set(presented.displayToStored).size).toBe(question.options.length);
    }
  });

  it('preserves the correct option text through the permutation', () => {
    for (const question of bank) {
      const presented = presentQuestion(question, 'seed');
      expect(presented.options[presented.correctIndex]).toBe(question.options[question.correctIndex]);
    }
  });

  it('maps the presented correct index back to the stored correct index', () => {
    for (const question of bank) {
      const presented = presentQuestion(question, `${question.id}:run`);
      expect(toStoredIndex(presented, presented.correctIndex)).toBe(question.correctIndex);
      expect(toDisplayIndex(presented, question.correctIndex)).toBe(presented.correctIndex);
    }
  });

  it('round-trips every display index', () => {
    const presented = presentQuestion(bank[3]!, 7);
    presented.options.forEach((option, displayIndex) => {
      const stored = toStoredIndex(presented, displayIndex);
      expect(presented.question.options[stored]).toBe(option);
      expect(toDisplayIndex(presented, stored)).toBe(displayIndex);
    });
  });

  it('breaks the stored answer-position bias across the bank', () => {
    const presentedAtIndexOne = biasedBank.filter(
      (question) => presentQuestion(question, 'bias-check').correctIndex === 1,
    ).length;
    expect(presentedAtIndexOne / biasedBank.length).toBeLessThan(0.4);
    expect(presentedAtIndexOne).toBeGreaterThan(0);
  });

  it('returns -1 for an out-of-range display index', () => {
    expect(toStoredIndex(presentQuestion(bank[0]!, 1), 99)).toBe(-1);
  });
});
