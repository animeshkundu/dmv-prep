#!/usr/bin/env node
/**
 * Ingest and validate a reviewer response.  This command is deliberately not
 * a model client.  A response must be supplied by the caller; without one no
 * ledger is emitted and no question is stamped.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalQuestionHash } from './lib/canonical-hash.mjs';
import {
  ATTESTATION_NONE_NOTE,
  LedgerValidationError,
  ledgerId,
  validateAuthorRequest,
  validateVerificationLedger,
  validateVerificationResponse,
} from './lib/ledger-schema.mjs';

/**
 * @typedef {{
 *   schemaVersion: number,
 *   hashVersion: number,
 *   kind: string,
 *   auditId: string,
 *   batchId: string,
 *   tier: 'T1'|'T2'|'T3',
 *   reviewerLab: string,
 *   reviewerRequestedModel: string,
 *   reviewerHarness: string,
 *   reviewedAt: string,
 *   attestation: 'none',
 *   attestationNote: string,
 *   entries?: Array<{questionId:string, canonicalHash:string, verdict:'confirmed', note:string}>,
 *   templateEntries?: Array<{templateId:string, templateVersion:number, templateHash:string, verdict:'confirmed', note:string}>
 * }} VerificationLedger
 */

function readJson(path) {
  try {
    return JSON.parse(readFileSync(resolve(path), 'utf8'));
  } catch (error) {
    throw new Error(`cannot read JSON ${path}: ${error.message}`);
  }
}

function usage(message) {
  if (message) console.error(`verify-batch: ${message}`);
  console.error(
    'Usage: verify-batch.mjs --request REQUEST.json --response RESPONSE.json [--out LEDGER.json] ' +
      '[--apply QUESTIONS.json --verified-at YYYY-MM-DD]',
  );
  process.exitCode = 2;
}

function parseArgs(argv) {
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

function expectedEntries(request) {
  const records = request?.questions ?? request?.items ?? [];
  if (!Array.isArray(records)) throw new Error('request questions/items must be an array');
  const result = new Map();
  for (const record of records) {
    const item = record?.question ?? record;
    const id = record?.questionId ?? record?.id ?? item?.id;
    if (typeof id !== 'string' || !id) throw new Error('request contains an item without an id');
    if (result.has(id)) throw new Error(`request contains duplicate item "${id}"`);
    const artifactHash = record?.artifactHash ?? (item ? canonicalQuestionHash(item) : undefined);
    if (artifactHash !== undefined) result.set(id, { artifactHash, item });
    else result.set(id, { item });
  }
  return result;
}

function assertReviewerMatches(request, response) {
  if (!request?.requestedReviewer) return;
  const expected = request.requestedReviewer;
  const actual = response.requestedReviewer;
  if (actual.model !== expected.model || actual.harness !== expected.harness) {
    throw new Error('response requestedReviewer does not match the authoring request');
  }
}

function verifiedEntries(response, request) {
  const expected = expectedEntries(request);
  const seen = new Set();
  const entries = [];

  for (const entry of response.verdicts) {
    const id = entry.questionId;
    if (seen.has(id)) throw new Error(`duplicate verdict for question "${id}"`);
    seen.add(id);
    if (expected.size && !expected.has(id)) throw new Error(`unknown question "${id}" in verification response`);

    const expectedItem = expected.get(id);
    let artifactHash = entry.artifactHash;
    if (entry.question !== undefined) {
      if (entry.question.id !== id) throw new Error(`question id does not match verdict id "${id}"`);
      const computed = canonicalQuestionHash(entry.question);
      if (computed !== artifactHash) {
        throw new Error(`hash mismatch for question "${id}": response artifactHash is not canonical v1`);
      }
      if (expectedItem?.artifactHash && expectedItem.artifactHash !== computed) {
        throw new Error(`hash mismatch for question "${id}" against the authoring request`);
      }
    } else if (!expectedItem?.artifactHash) {
      throw new Error(`verdict for "${id}" has no question bytes to hash and no expected request hash`);
    }
    if (expectedItem?.artifactHash && expectedItem.artifactHash !== artifactHash) {
      throw new Error(`hash mismatch for question "${id}" against the authoring request`);
    }

    if (entry.verdict !== 'confirmed') {
      throw new Error(`non-confirmed verdict "${entry.verdict}" blocks "${id}"`);
    }
    entries.push({
      questionId: id,
      canonicalHash: artifactHash,
      verdict: 'confirmed',
      note: entry.note,
    });
  }

  if (expected.size) {
    for (const id of expected.keys()) {
      if (!seen.has(id)) throw new Error(`verification response is incomplete; missing "${id}"`);
    }
  }
  return entries;
}

function verifiedTemplates(response) {
  const seen = new Set();
  return response.verdicts.map((entry) => {
    const key = `${entry.templateId}@${entry.templateVersion}`;
    if (seen.has(key)) throw new Error(`duplicate template verdict "${key}"`);
    seen.add(key);
    if (entry.verdict !== 'confirmed') {
      throw new Error(`non-confirmed verdict "${entry.verdict}" blocks template "${entry.templateId}"`);
    }
    return {
      templateId: entry.templateId,
      templateVersion: entry.templateVersion,
      templateHash: entry.templateHash ?? entry.artifactHash,
      verdict: 'confirmed',
      note: entry.note,
      ...(entry.factKeys ? { factKeys: entry.factKeys } : {}),
    };
  });
}

/**
 * Validate a response against its request and return the immutable ledger
 * representation.  This is the public ingest API used by tests and other
 * pipeline jobs.
 */
/** @returns {VerificationLedger} */
export function ingestVerificationResponse({ request, response }) {
  if (!request || typeof request !== 'object') throw new Error('an authoring request is required');
  if (request.kind === 'author-request') validateAuthorRequest(request);
  else if (request.kind !== undefined) throw new Error(`unknown request kind "${request.kind}"`);
  const checked = validateVerificationResponse(response);
  if (
    (request.batchId && request.batchId !== checked.batchId) ||
    (request.requestId && request.requestId !== checked.batchId)
  ) {
    throw new Error('verification response batchId does not match the request');
  }
  assertReviewerMatches(request, checked);

  const base = {
    schemaVersion: 1,
    hashVersion: 1,
    kind: 'verification-ledger',
    batchId: checked.batchId,
    tier: checked.tier,
    reviewerLab: checked.requestedReviewer.lab ?? 'unknown',
    reviewerRequestedModel: checked.requestedReviewer.model,
    reviewerHarness: checked.requestedReviewer.harness,
    reviewedAt: checked.verifiedAt,
    attestation: 'none',
    attestationNote: ATTESTATION_NONE_NOTE,
  };
  const payload = checked.tier === 'T2'
    ? { ...base, templateEntries: verifiedTemplates(checked) }
    : { ...base, entries: verifiedEntries(checked, request) };
  /** @type {VerificationLedger} */
  const ledger = { ...payload, auditId: ledgerId(payload) };
  validateVerificationLedger(ledger);
  return ledger;
}

/**
 * Apply stamps only to a confirmed T1/T3 ledger.  T2 is intentionally a
 * template contract: generated instances stay untouched and carry no inline
 * review fields.
 */
export function applyConfirmedStamps(questions, ledger, { verifiedAt } = {}) {
  validateVerificationLedger(ledger);
  if (!Array.isArray(questions)) throw new Error('questions must be an array');
  if (ledger.tier === 'T2') return questions.map((question) => ({ ...question }));
  if (verifiedAt !== undefined && verifiedAt !== ledger.reviewedAt) {
    throw new Error('verifiedAt must match the immutable ledger reviewedAt date');
  }

  const byId = new Map(ledger.entries.map((entry) => [entry.questionId, entry]));
  return questions.map((question) => {
    const entry = byId.get(question.id);
    if (!entry) return { ...question };
    const actual = canonicalQuestionHash(question);
    if (actual !== entry.canonicalHash) throw new Error(`hash mismatch while stamping "${question.id}"`);
    return {
      ...question,
      reviewStatus: 'adversarially-verified',
      verifiedBy: ledger.reviewerRequestedModel,
      verifiedAt: ledger.reviewedAt,
      verificationAuditId: ledger.auditId,
    };
  });
}

function writeOutput(value, path) {
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  if (options) {
    try {
      if (!options.request || !options.response) throw new Error('--request and --response are required');
      const request = readJson(options.request);
      const response = readJson(options.response);
      const ledger = ingestVerificationResponse({ request, response });
      if (options.out) writeOutput(ledger, options.out);
      else process.stdout.write(`${JSON.stringify(ledger, null, 2)}\n`);

      if (options.apply) {
        const questions = readJson(options.apply);
        const stamped = applyConfirmedStamps(questions, ledger, { verifiedAt: options['verified-at'] });
        writeOutput(stamped, options.apply);
      }
    } catch (error) {
      if (error instanceof LedgerValidationError || error instanceof Error) usage(error.message);
      else usage(String(error));
    }
  }
}

export { expectedEntries };
