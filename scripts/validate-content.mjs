#!/usr/bin/env node
/**
 * Content validation beyond Astro's build-time Zod pass — enforces the editorial
 * rules that make content trustworthy and shippable:
 *   - every question has >=1 citation and a valid correctIndex
 *   - launch content is not left as reviewStatus: "draft" (warns; CI can harden to fail)
 *   - state files carry provenance (references + lastVerified)
 * Exits non-zero on hard failures so CI blocks the merge.
 *
 * Note: the strict schema of record is src/content.config.ts (Zod, enforced by `astro build`).
 * This script gives fast, targeted, human-readable errors and extra policy checks.
 */
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: on Windows the latter yields "/C:/...", which
// every fs call then misses, silently leaving the corpus loops with nothing to
// iterate and the validator reporting success without validating anything.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const Q_DIR = join(ROOT, 'src/content/questions');
const S_DIR = join(ROOT, 'src/content/states');

const errors = [];
const warnings = [];
const questions = [];
const states = [];
const QUESTION_CATEGORIES = [
  'road-signs',
  'traffic-signals',
  'pavement-markings',
  'right-of-way',
  'parking',
  'speed-limits',
  'alcohol-drugs',
  'sharing-the-road',
  'safe-driving',
  'traffic-laws',
  'penalties-points',
  'gdl-teen',
];
const FLOOR_PER_STATE_TOTAL = 500;
const FLOOR_PER_CATEGORY = 25;

async function jsonFiles(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { recursive: true });
  return entries.filter((f) => f.endsWith('.json')).map((f) => join(dir, f));
}

function hasCitations(refs) {
  return Array.isArray(refs) && refs.length > 0 && refs.every((r) => r && r.citation);
}

for (const file of await jsonFiles(Q_DIR)) {
  let data;
  try {
    data = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    errors.push(`${file}: invalid JSON — ${e.message}`);
    continue;
  }
  const items = Array.isArray(data) ? data : [data];
  for (const q of items) {
    const id = q.id ?? '(no id)';
    if (!q.prompt) errors.push(`${file} [${id}]: missing prompt`);
    if (!Array.isArray(q.options) || q.options.length < 2)
      errors.push(`${file} [${id}]: needs >=2 options`);
    if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex >= (q.options?.length ?? 0))
      errors.push(`${file} [${id}]: correctIndex out of range`);
    if (!q.explanation) errors.push(`${file} [${id}]: missing explanation`);
    if (!hasCitations(q.references)) errors.push(`${file} [${id}]: missing citation(s)`);
    if (!q.category) errors.push(`${file} [${id}]: missing category`);
    if (q.stateScope === undefined) errors.push(`${file} [${id}]: missing stateScope`);
    if (q.reviewStatus === 'draft' || q.reviewStatus === undefined)
      warnings.push(`${file} [${id}]: reviewStatus is draft/unset (not launch-verified)`);
    questions.push(q);
  }
}

for (const file of await jsonFiles(S_DIR)) {
  let data;
  try {
    data = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    errors.push(`${file}: invalid JSON — ${e.message}`);
    continue;
  }
  if (!data.code) errors.push(`${file}: missing state code`);
  if (!data.officialSiteUrl) errors.push(`${file}: missing officialSiteUrl`);
  if (!Array.isArray(data.examVariants) || data.examVariants.length === 0)
    errors.push(`${file}: missing examVariants`);
  else {
    const seenVariantIds = new Set();
    for (const variant of data.examVariants) {
      const variantId = variant?.variantId;
      if (!variantId) {
        errors.push(`${file}: exam variant missing variantId`);
      } else if (seenVariantIds.has(variantId)) {
        errors.push(`${file}: duplicate exam variantId "${variantId}"`);
      } else {
        seenVariantIds.add(variantId);
      }
    }
  }
  if (!hasCitations(data.references)) errors.push(`${file}: missing citation(s)`);
  if (!data.lastVerified) errors.push(`${file}: missing lastVerified`);
  states.push(data);
}

// §2's coverage floors, reported against the same raw corpus shape the content
// acceptance suite reads. These stay warnings until the corpus is authored:
// §11 build order step 11 is where they flip to hard failures, once steps 4-8
// have actually populated the pools. Failing here beforehand would halt CI at
// this step and skip the generation, unit-test and build gates behind it.
for (const state of states) {
  const applicable = questions.filter((question) =>
    question.stateScope === 'all'
      ? !question.stateExceptions?.includes(state.code)
      : Array.isArray(question.stateScope) && question.stateScope.includes(state.code),
  );
  if (applicable.length < FLOOR_PER_STATE_TOTAL) {
    warnings.push(
      `${state.code}: ${applicable.length} applicable questions (< ${FLOOR_PER_STATE_TOTAL} §2 floor)`,
    );
  }
  for (const category of QUESTION_CATEGORIES) {
    const count = applicable.filter((question) => question.category === category).length;
    if (count < FLOOR_PER_CATEGORY) {
      warnings.push(
        `${state.code}/${category}: ${count} applicable questions (< ${FLOOR_PER_CATEGORY} §2 floor)`,
      );
    }
  }
}

for (const w of warnings) console.warn('⚠️  ' + w);
if (errors.length) {
  console.error(`\n❌ Content validation failed (${errors.length}):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`✅ Content validation passed. ${warnings.length} warning(s).`);
