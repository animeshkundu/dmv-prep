#!/usr/bin/env node
/**
 * Emit an authoring request.  This is intentionally an offline harness: it
 * gathers repository facts and fingerprints, but never calls a model, fetches
 * a source, or invents a question.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadAllQuestions,
  loadAllStates,
  loadTagVocabulary,
} from './lib/content-io.mjs';
import { QUESTION_CATEGORIES } from './lib/schema-constants.mjs';
import { validateAuthorRequest } from './lib/ledger-schema.mjs';
import { normalizePrompt, shingles, jaccard } from './lib/text-similarity.mjs';
import { buildJurisdictionNameRegex } from './lib/universality.mjs';

const DEFAULT_REVIEWER = Object.freeze({
  lab: 'OpenAI',
  model: 'gpt-5.6-terra',
  harness: 'copilot-cli-task-subagent',
});

function usage(message) {
  if (message) console.error(`author-batch: ${message}`);
  console.error(
    'Usage: author-batch.mjs --state CODE --category CATEGORY --count N [--tier T1|T3] ' +
      '[--reviewer-model MODEL] [--reviewer-harness HARNESS] [--response FILE] [--out FILE]',
  );
  process.exitCode = 2;
}

function args(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      usage(`unexpected argument "${arg}"`);
      return null;
    }
    const equal = arg.indexOf('=');
    const key = equal >= 0 ? arg.slice(2, equal) : arg.slice(2);
    const value = equal >= 0 ? arg.slice(equal + 1) : argv[++i];
    if (!value || value.startsWith('--')) {
      usage(`missing value for --${key}`);
      return null;
    }
    result[key] = value;
  }
  return result;
}

function hash(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function promptFingerprint(prompt) {
  const normalised = prompt
    .normalize('NFC')
    .toLocaleLowerCase('en-US')
    .replace(/\s+/g, ' ')
    .trim();
  return hash(normalised);
}

function withoutLoaderMetadata(value) {
  if (!value || typeof value !== 'object') return value;
  const copy = { ...value };
  delete copy.__file;
  delete copy.__index;
  return copy;
}

function uniqueSources(state, questions) {
  const seen = new Set();
  const sources = [];
  const add = (reference, origin) => {
    if (!reference || typeof reference !== 'object' || typeof reference.citation !== 'string') return;
    const key = `${reference.label ?? ''}\u0000${reference.citation}\u0000${reference.url ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    sources.push({
      origin,
      label: reference.label ?? reference.citation,
      citation: reference.citation,
      ...(reference.url ? { url: reference.url } : {}),
    });
  };

  for (const reference of state.references ?? []) add(reference, `state:${state.code}`);
  for (const [factKey, fact] of Object.entries(state.typedFacts ?? {})) {
    add(fact.citation, `fact:${state.code}.${factKey}`);
  }
  for (const question of questions) {
    for (const reference of question.references ?? []) add(reference, `question:${question.id}`);
  }
  return sources;
}

function suppliedQuestions(path, stateCode, category, tier, count) {
  if (!path) return [];
  let value;
  try {
    value = JSON.parse(readFileSync(resolve(path), 'utf8'));
  } catch (error) {
    throw new Error(`cannot read author response ${path}: ${error.message}`);
  }
  const questions = Array.isArray(value) ? value : value?.questions;
  if (!Array.isArray(questions)) throw new Error('author response must be an array or an object with a questions array');
  if (questions.length !== count) {
    throw new Error(`author response contains ${questions.length} question(s); expected ${count}`);
  }
  const ids = new Set();
  return questions.map((question, index) => {
    if (!question || typeof question !== 'object' || Array.isArray(question)) {
      throw new Error(`author response question ${index} is not an object`);
    }
    if (ids.has(question.id)) throw new Error(`author response contains duplicate id "${question.id}"`);
    ids.add(question.id);
    if (question.category !== category) {
      throw new Error(`author response question "${question.id}" has category "${question.category}"`);
    }
    if (tier === 'T1' && question.stateScope !== 'all') {
      throw new Error(`T1 question "${question.id}" must have stateScope "all"`);
    }
    if (
      tier === 'T3' &&
      question.stateScope !== 'all' &&
      (!Array.isArray(question.stateScope) || !question.stateScope.includes(stateCode))
    ) {
      throw new Error(`T3 question "${question.id}" does not apply to ${stateCode}`);
    }
    if (question.reviewStatus !== undefined && question.reviewStatus !== 'draft') {
      throw new Error(`author response question "${question.id}" cannot claim completed review`);
    }
    for (const stamp of ['verifiedBy', 'verifiedAt', 'verificationAuditId']) {
      if (question[stamp] !== undefined) {
        throw new Error(`author response question "${question.id}" contains a verification stamp`);
      }
    }
    // The response is an authored draft. Any existing completed-review stamp
    // is rejected above rather than silently preserved.
    return { ...question, reviewStatus: 'draft' };
  });
}

function rejectPromptCollisions(supplied, existing, stateNames) {
  const jurisdictionNameRegex = buildJurisdictionNameRegex(stateNames);
  const records = [
    ...existing.map((question) => ({ id: question.id, prompt: question.prompt })),
    ...supplied.map((question) => ({ id: question.id, prompt: question.prompt })),
  ];
  const normalised = records.map((record) => normalizePrompt(record.prompt, jurisdictionNameRegex));
  const shingleSets = normalised.map((prompt) => shingles(prompt, 3));
  // The batch is intentionally small.  Comparing it to the existing category
  // bank here gives the same fail-closed result as dedupe-report without
  // spawning another process or making a network call.
  for (let i = existing.length; i < records.length; i++) {
    for (let j = 0; j < i; j++) {
      const similarity = jaccard(shingleSets[i], shingleSets[j]);
      if ((normalised[i] && normalised[i] === normalised[j]) || similarity >= 0.6) {
        throw new Error(
          `author response prompt "${records[i].id}" collides with "${records[j].id}" ` +
            `(Jaccard ${similarity.toFixed(2)}; threshold 0.60)`,
        );
      }
    }
  }
}

function buildRequest(options) {
  const stateCode = String(options.state ?? '').toUpperCase();
  const category = String(options.category ?? '');
  const count = Number(options.count);
  const tier = String(options.tier ?? 'T3').toUpperCase();
  const states = loadAllStates();
  const state = states.byCode.get(stateCode);

  if (!state) throw new Error(`unknown state "${stateCode}"`);
  if (!QUESTION_CATEGORIES.includes(category)) throw new Error(`unknown category "${category}"`);
  if (!Number.isInteger(count) || count < 1) throw new Error('--count must be a positive integer');
  if (!['T1', 'T3'].includes(tier)) throw new Error('--tier must be T1 or T3');

  const allQuestions = loadAllQuestions();
  const categoryQuestions = allQuestions.filter((question) => question.category === category);
  const fingerprints = categoryQuestions
    .filter((question) => question.prompt)
    .map((question) => ({
      id: question.id,
      fingerprint: promptFingerprint(question.prompt),
      stateScope: question.stateScope,
      ...(question.tier ? { tier: question.tier } : {}),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const t1PromptFingerprints = fingerprints.filter((entry) => entry.tier === 'T1');
  const supplied = suppliedQuestions(options.response, stateCode, category, tier, count);
  if (supplied.length) {
    rejectPromptCollisions(
      supplied,
      categoryQuestions,
      states.records.map((record) => record.name),
    );
  }
  const tags = loadTagVocabulary() ?? [];
  const reviewer = {
    lab: String(options['reviewer-lab'] ?? DEFAULT_REVIEWER.lab),
    model: String(options['reviewer-model'] ?? DEFAULT_REVIEWER.model),
    harness: String(options['reviewer-harness'] ?? DEFAULT_REVIEWER.harness),
  };

  const requestWithoutId = {
    schemaVersion: 1,
    kind: 'author-request',
    stateCode,
    category,
    count,
    tier,
    requestedReviewer: reviewer,
    sources: uniqueSources(state, categoryQuestions),
    facts: withoutLoaderMetadata(state.typedFacts ?? {}),
    promptFingerprints: fingerprints,
    t1PromptFingerprints,
    taxonomy: tags,
    authoringRules: {
      style: 'docs/CONTENT_STRATEGY.md §3',
      bannedPhrases: [],
      originality: 'Write original prose; do not reproduce handbook or exam wording.',
      duplicateThreshold: 'Reject prompt similarity at or above Jaccard 0.60.',
    },
    // An empty array is deliberate.  The authoring harness does not fabricate
    // records when no external author response has been ingested.
    questions: supplied,
  };
  const requestId = hash(JSON.stringify(requestWithoutId));
  return { requestId, batchId: requestId, ...requestWithoutId };
}

function emit(request, output) {
  validateAuthorRequest(request);
  const encoded = `${JSON.stringify(request, null, 2)}\n`;
  if (output) writeFileSync(resolve(output), encoded, 'utf8');
  else process.stdout.write(encoded);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = args(process.argv.slice(2));
  if (options) {
    try {
      emit(buildRequest(options), options.out);
    } catch (error) {
      usage(error instanceof Error ? error.message : String(error));
    }
  }
}

export { buildRequest, promptFingerprint };
