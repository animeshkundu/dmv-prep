import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

function runScript(scriptPath: string, args: string[] = []) {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error: any) {
    return { status: error.status, stdout: error.stdout, stderr: error.stderr };
  }
}

describe('Pipeline Tooling (docs/CHANGE_SPEC_COMPLETENESS.md §7.2, §4.6, §9.3)', () => {
  it('rebalance-answers.mjs fails on verified items without explicit reverification', () => {
    const questionsDir = mkdtempSync(join(tmpdir(), 'dmv-prep-rebalance-'));
    try {
      writeFileSync(
        join(questionsDir, 'verified.json'),
        JSON.stringify([
          {
            id: 'verified-rebalance-fixture',
            options: ['A', 'B', 'C', 'D'],
            correctIndex: 0,
            explanation: 'Fixture explanation.',
            reviewStatus: 'adversarially-verified',
            verifiedBy: 'fixture-reviewer',
            verifiedAt: '2026-08-02',
            verificationAuditId: 'fixture-audit',
          },
        ]),
      );

      const result = runScript('scripts/content/rebalance-answers.mjs', ['--questions-dir', questionsDir]);
      expect(result.status).not.toBe(0);
      expect(result.stderr || result.stdout).toMatch(/verified/i);
    } finally {
      rmSync(questionsDir, { recursive: true, force: true });
    }
  });

  it('dedupe-report.mjs detects known duplicates', () => {
    const result = runScript('scripts/content/dedupe-report.mjs', [
      '--questions-dir',
      'tests/fixtures/dedupe-questions',
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr || result.stdout).toMatch(/exact duplicate/i);
    expect(result.stderr || result.stdout).toMatch(/near duplicate/i);
  });

  it('dedupe-report.mjs --generated runs without error (no T2 violations yet)', () => {
    const result = runScript('scripts/content/dedupe-report.mjs', ['--generated']);
    expect(result.status).toBe(0);
  });

  it('universality-sweep.mjs enforces exception replacements', () => {
    const result = runScript('scripts/content/universality-sweep.mjs', [
      '--sweepId', 'test-sweep',
      '--questionIds', 'nat-row-003',
      '--factKeys', 'rightTurnOnRed'
    ]);
    expect(result.stdout).toMatch(/"sweepId":\s*"test-sweep"/);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/not checkable across all 51 jurisdictions/i);
  });
});
