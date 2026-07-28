import { describe, expect, it } from 'vitest';
import MockExam from '../../src/islands/MockExam';
import Quiz from '../../src/islands/Quiz';

describe('legacy island entry points', () => {
  it('preserves the Quiz default export', () => {
    expect(Quiz).toBeTypeOf('function');
  });

  it('preserves the MockExam default export', () => {
    expect(MockExam).toBeTypeOf('function');
  });
});
