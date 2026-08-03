import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import TestRunner from '../../src/islands/TestRunner';

const root = resolve(import.meta.dirname, '../..');
const practicePage = resolve(root, 'src/pages/state/[code]/practice.astro');
const mockPage = resolve(root, 'src/pages/state/[code]/mock.astro');

describe('study island entry points', () => {
  it('uses TestRunner as the single study-runner island', () => {
    expect(TestRunner).toBeTypeOf('function');
    expect(readFileSync(practicePage, 'utf8')).toContain("import TestRunner from '../../../islands/TestRunner';");
    expect(readFileSync(mockPage, 'utf8')).toContain("import TestRunner from '../../../islands/TestRunner';");
  });

  it('does not retain the superseded Quiz and MockExam islands', () => {
    expect(existsSync(resolve(root, 'src/islands/Quiz.tsx'))).toBe(false);
    expect(existsSync(resolve(root, 'src/islands/MockExam.tsx'))).toBe(false);
  });
});
