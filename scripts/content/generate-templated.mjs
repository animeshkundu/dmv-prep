#!/usr/bin/env node
/**
 * docs/CHANGE_SPEC_COMPLETENESS.md §4, §11 build order step 3: deterministic
 * T2 (fact-templated) question generation.
 *
 * Usage:
 *   node scripts/content/generate-templated.mjs --check
 *     Regenerates every state's T2 output in memory and diffs it against the
 *     committed files under src/content/questions/generated/. Never writes.
 *     Exits non-zero on any mismatch (including a hand-edited generated file
 *     — §4.5: "hand-editing a generated file fails the build").
 *
 *   node scripts/content/generate-templated.mjs --write
 *     Regenerates and writes src/content/questions/generated/<code>.json plus
 *     src/content/audits/generation/<code>.json (shortfalls, tagShortfalls,
 *     and the per-question ledger — §4.5).
 *
 * Exactly one of --check/--write is required; there is no default so a bare
 * invocation can never silently overwrite machine-owned files ("--write
 * explicit").
 *
 * This script never fabricates content: an empty or invalid template
 * registry, or facts that are missing/unverified/not-applicable/unknown for
 * a state, produce a recorded shortfall — never a manufactured question.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAllStates, loadVerifyAudits, repoPath } from './lib/content-io.mjs';
import {
  loadTemplateRegistry,
  templateVerificationErrors,
  templateSourceBundleHash,
  validateTemplateRegistry,
} from './lib/template-registry.mjs';
import { generateForState } from './lib/generation-engine.mjs';
import { validateVerificationLedger } from './lib/ledger-schema.mjs';

const GENERATED_DIR = repoPath('src/content/questions/generated');
const AUDIT_DIR = repoPath('src/content/audits/generation');
const ALLOCATION_PATH = repoPath('src/content/taxonomy/template-allocation.ts');

function parseArgs(argv) {
  const check = argv.includes('--check');
  const write = argv.includes('--write');
  return { check, write };
}

/** Renders one state's generated questions the exact same way on every call. */
function renderGeneratedFile(questions) {
  return JSON.stringify(questions, null, 2) + '\n';
}

function renderAuditFile(audit) {
  return JSON.stringify(audit, null, 2) + '\n';
}

/**
 * @param {string[]} argv
 * @param {{
 *   log?: typeof console.log,
 *   error?: typeof console.error,
 *   generatedDir?: string,
 *   auditDir?: string,
 *   templates?: object[],
 *   states?: object[],
 *   allocation?: object[],
 *   verificationAudits?: object[],
 * }} options
 */
export async function run(
  argv = process.argv.slice(2),
  {
    log = console.log,
    error = console.error,
    generatedDir = GENERATED_DIR,
    auditDir = AUDIT_DIR,
    templates: suppliedTemplates,
    states: suppliedStates,
    allocation: suppliedAllocation,
    verificationAudits: suppliedVerificationAudits,
  } = {},
) {
  const { check, write } = parseArgs(argv);
  if (check === write) {
    error(
      'generate-templated.mjs requires exactly one of --check or --write ' +
        '(§4.5: regeneration must be explicit — there is no default mode).',
    );
    return 1;
  }

  if (!existsSync(ALLOCATION_PATH)) {
    error(`Missing ${ALLOCATION_PATH}; cannot generate without the template allocation table.`);
    return 1;
  }
  const { TEMPLATE_ALLOCATION } = await import(ALLOCATION_PATH);
  const allocation = suppliedAllocation ?? TEMPLATE_ALLOCATION;

  const { templates, missing } = suppliedTemplates
    ? { templates: suppliedTemplates, missing: false }
    : await loadTemplateRegistry();
  if (missing) {
    error('src/content/templates/registry.ts is missing; cannot generate.');
    return 1;
  }
  const validation = validateTemplateRegistry(templates);
  if (!validation.ok) {
    error('Template registry failed validation:\n' + validation.errors.map((e) => `  - ${e}`).join('\n'));
    return 1;
  }
  if (templates.length === 0) {
    log(
      'Template registry is empty (build order step 7 has not authored any T2 templates yet). ' +
        'Every category will report a full shortfall — this is expected, not an error.',
    );
  }
  const confirmedTemplateHashes = new Map();
  const confirmedSourceHashes = new Set();
  for (const rawAudit of suppliedVerificationAudits ?? loadVerifyAudits()) {
    if (Array.isArray(rawAudit)) continue;
    const { __file: _file, ...audit } = rawAudit;
    validateVerificationLedger(audit);
    if (audit.tier !== 'T2') continue;
    confirmedSourceHashes.add(audit.templateSourceHash);
    for (const entry of audit.templateEntries) {
      if (entry.verdict === 'confirmed') {
        confirmedTemplateHashes.set(`${entry.templateId}@${entry.templateVersion}`, entry.templateHash);
      }
    }
  }
  const verificationErrors = templateVerificationErrors(templates, confirmedTemplateHashes);
  if (templates.length && !confirmedSourceHashes.has(templateSourceBundleHash())) {
    verificationErrors.push('no confirmed verification ledger matches the current template source bundle');
  }
  if (verificationErrors.length) {
    error(
      'Templates require confirmed verification ledgers before generation:\n' +
      verificationErrors.map((entry) => `  - ${entry}`).join('\n'),
    );
    return 1;
  }

  const { records: loadedStates } = loadAllStates();
  const states = suppliedStates ?? loadedStates;
  if (states.length === 0) {
    error('No state records found under src/content/states; cannot generate.');
    return 1;
  }

  const sortedStates = [...states].sort((a, b) => String(a.code).localeCompare(String(b.code)));

  let totalGenerated = 0;
  let totalShortfall = 0;
  let mismatches = 0;
  const reportLines = [];

  if (write) {
    mkdirSync(generatedDir, { recursive: true });
    mkdirSync(auditDir, { recursive: true });
  }

  for (const state of sortedStates) {
    const result = generateForState({ state, templates, allocation });
    totalGenerated += result.questions.length;
    totalShortfall += result.shortfalls.reduce((sum, s) => sum + s.count, 0);

    const generatedPath = join(generatedDir, `${String(state.code).toLowerCase()}.json`);
    const freshBytes = renderGeneratedFile(result.questions);

    if (check) {
      const committedExists = existsSync(generatedPath);
      if (result.questions.length === 0) {
        // Missing output is drift too: --write would create an explicit empty
        // file, so --check must require it for a byte-identical round trip.
        if (!committedExists || readFileSync(generatedPath, 'utf8') !== freshBytes) {
          reportLines.push(
            `MISMATCH ${state.code}: fresh regeneration is empty but ${generatedPath} is missing or differs.`,
          );
          mismatches += 1;
        }
        continue;
      }
      if (!committedExists) {
        reportLines.push(
          `MISSING ${state.code}: ${result.questions.length} T2 question(s) regenerated in memory ` +
            `but no committed file exists at ${generatedPath}; run with --write.`,
        );
        mismatches += 1;
        continue;
      }
      const committedBytes = readFileSync(generatedPath, 'utf8');
      if (committedBytes !== freshBytes) {
        reportLines.push(
          `MISMATCH ${state.code}: ${generatedPath} differs from a fresh in-memory regeneration; ` +
            `run with --write (or it was hand-edited — §4.5).`,
        );
        mismatches += 1;
      }
    } else {
      writeFileSync(generatedPath, freshBytes, 'utf8');
      const audit = {
        code: state.code,
        ledger: result.ledger,
        categorySummary: result.categorySummary,
        shortfalls: result.shortfalls,
        tagShortfalls: result.tagShortfalls,
      };
      const auditPath = join(auditDir, `${String(state.code).toLowerCase()}.json`);
      writeFileSync(auditPath, renderAuditFile(audit), 'utf8');
    }
  }

  log(
    `generate-templated: ${totalGenerated} T2 question(s) generated across ${sortedStates.length} ` +
      `state(s) from ${templates.length} registered template(s); ${totalShortfall} instance(s) short of quota.`,
  );

  if (check) {
    if (mismatches > 0) {
      error(`${mismatches} state(s) out of sync with committed generated output:\n${reportLines.join('\n')}`);
      return 1;
    }
    log('check OK: committed generated output matches a fresh in-memory regeneration.');
    return 0;
  }

  log(`wrote generated output and generation audits for ${sortedStates.length} state(s).`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then((code) => {
    process.exitCode = code;
  });
}
