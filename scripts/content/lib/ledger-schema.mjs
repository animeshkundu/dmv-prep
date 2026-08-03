/**
 * Dependency-free schemas for authoring and verification artifacts.
 *
 * These are deliberately runtime validators rather than Zod schemas: the
 * scripts are also used outside Astro and must fail closed when handed a
 * malformed model response.
 */
import { createHash } from 'node:crypto';

export const LEDGER_SCHEMA_VERSION = 1;
export const VERDICTS = Object.freeze([
  'confirmed',
  'wrong-answer',
  'ambiguous',
  'not-universal',
  'paraphrase-risk',
  'uncheckable',
]);
export const VERIFIED_TIERS = Object.freeze(['T1', 'T2', 'T3']);
export const ATTESTATION_NONE_NOTE =
  'Unattested: No cryptographic attestation was performed; this ledger records the requested reviewer response only.';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HASH = /^[a-f0-9]{64}$/;

export class LedgerValidationError extends Error {
  constructor(message, path = []) {
    super(path.length ? `${message} at ${path.join('.')}` : message);
    this.name = 'LedgerValidationError';
    this.path = path;
  }
}

function fail(message, path) {
  throw new LedgerValidationError(message, path);
}

function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('expected an object', path);
  }
  return value;
}

function string(value, path, { nonEmpty = true } = {}) {
  if (typeof value !== 'string' || (nonEmpty && value.trim() === '')) fail('expected a string', path);
  return value;
}

function integer(value, path, { min = 0 } = {}) {
  if (!Number.isInteger(value) || value < min) fail(`expected an integer >= ${min}`, path);
  return value;
}

function array(value, path, { min = 0 } = {}) {
  if (!Array.isArray(value) || value.length < min) fail(`expected an array with at least ${min} item(s)`, path);
  return value;
}

function oneOf(value, values, path) {
  if (!values.includes(value)) fail(`expected one of ${values.join(', ')}`, path);
  return value;
}

function hash(value, path) {
  string(value, path);
  if (!HASH.test(value)) fail('expected a lowercase SHA-256 hex digest', path);
  return value;
}

function noUnknown(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`unknown field "${key}"`, [...path, key]);
  }
}

function reviewer(value, path) {
  const result = object(value, path);
  noUnknown(result, ['model', 'harness', 'lab'], path);
  string(result.model, [...path, 'model']);
  string(result.harness, [...path, 'harness']);
  if (result.lab !== undefined) string(result.lab, [...path, 'lab']);
  return result;
}

function verdict(value, path, { template = false } = {}) {
  const result = object(value, path);
  const allowed = template
    ? ['templateId', 'templateVersion', 'templateHash', 'artifactHash', 'verdict', 'note', 'factKeys']
    : ['questionId', 'artifactHash', 'question', 'verdict', 'note'];
  noUnknown(result, allowed, path);
  const idKey = template ? 'templateId' : 'questionId';
  string(result[idKey], [...path, idKey]);
  if (template) {
    integer(result.templateVersion, [...path, 'templateVersion'], { min: 1 });
    if (result.templateHash === undefined && result.artifactHash === undefined) {
      fail('templateHash (or its artifactHash alias) is required', [...path, 'templateHash']);
    }

    if (result.templateHash !== undefined) hash(result.templateHash, [...path, 'templateHash']);
    if (result.artifactHash !== undefined) hash(result.artifactHash, [...path, 'artifactHash']);
    if (
      result.templateHash !== undefined &&
      result.artifactHash !== undefined &&
      result.templateHash !== result.artifactHash
    ) {
      fail('templateHash and artifactHash must match', [...path, 'templateHash']);
    }
    if (result.factKeys !== undefined) {
      array(result.factKeys, [...path, 'factKeys']);
      result.factKeys.forEach((key, i) => string(key, [...path, 'factKeys', i]));
    }
  } else {
    hash(result.artifactHash, [...path, 'artifactHash']);
    if (result.question !== undefined) questionArtifact(result.question, [...path, 'question']);
  }
  oneOf(result.verdict, VERDICTS, [...path, 'verdict']);
  string(result.note, [...path, 'note']);
  return result;
}

function ledgerVerdict(value, path) {
  const result = object(value, path);
  noUnknown(result, ['questionId', 'canonicalHash', 'verdict', 'note'], path);
  string(result.questionId, [...path, 'questionId']);
  hash(result.canonicalHash, [...path, 'canonicalHash']);
  oneOf(result.verdict, ['confirmed'], [...path, 'verdict']);
  string(result.note, [...path, 'note']);
  return result;
}

/**
 * Only the fields needed to calculate the canonical hash are accepted.  This
 * prevents a response from smuggling a second hashable representation into a
 * ledger.
 */
function questionArtifact(value, path) {
  const result = object(value, path);
  noUnknown(
    result,
    [
      'id',
      'category',
      'stateScope',
      'stateExceptions',
      'applicantVariants',
      'tags',
      'tier',
      'claims',
      'coversSigns',
      'replacesQuestionId',
      'templateId',
      'templateVersion',
      'universality',
      'prompt',
      'imageAsset',
      'options',
      'correctIndex',
      'explanation',
      'difficulty',
      'languages',
      'references',
      'effectiveDate',
      'expiryDate',
      'sourceSnapshotHash',
      'reviewStatus',
      'lastVerified',
      'contentVersion',
    ],
    path,
  );
  string(result.id, [...path, 'id']);
  string(result.prompt, [...path, 'prompt']);
  array(result.options, [...path, 'options'], { min: 2 });
  result.options.forEach((option, i) => string(option, [...path, 'options', i]));
  integer(result.correctIndex, [...path, 'correctIndex']);
  if (result.correctIndex >= result.options.length) fail('correctIndex is out of range', [...path, 'correctIndex']);
  string(result.explanation, [...path, 'explanation']);
  if (result.imageAsset !== undefined && result.imageAsset !== null) string(result.imageAsset, [...path, 'imageAsset']);
  if (result.reviewStatus !== undefined && result.reviewStatus !== 'draft') {
    fail('an ingested author artifact may not already claim a completed review', [...path, 'reviewStatus']);
  }
  return result;
}

export function validateAuthorRequest(value) {
  const result = object(value, []);
  noUnknown(
    result,
    [
      'schemaVersion',
      'kind',
      'requestId',
      'batchId',
      'stateCode',
      'category',
      'count',
      'tier',
      'requestedReviewer',
      'sources',
      'facts',
      'promptFingerprints',
      't1PromptFingerprints',
      'taxonomy',
      'authoringRules',
      'questions',
    ],
    [],
  );
  integer(result.schemaVersion, ['schemaVersion'], { min: 1 });
  if (result.schemaVersion !== LEDGER_SCHEMA_VERSION) fail(`unsupported schemaVersion ${result.schemaVersion}`, ['schemaVersion']);
  oneOf(result.kind, ['author-request'], ['kind']);
  string(result.requestId, ['requestId']);
  if (result.batchId !== undefined) string(result.batchId, ['batchId']);
  string(result.stateCode, ['stateCode']);
  string(result.category, ['category']);
  integer(result.count, ['count'], { min: 1 });
  oneOf(result.tier, ['T1', 'T3'], ['tier']);
  reviewer(result.requestedReviewer, ['requestedReviewer']);
  array(result.sources, ['sources'], { min: 1 });
  result.sources.forEach((source, i) => {
    object(source, ['sources', i]);
    noUnknown(source, ['origin', 'label', 'citation', 'url'], ['sources', i]);
    string(source.label, ['sources', i, 'label']);
    string(source.citation, ['sources', i, 'citation']);
    if (source.origin !== undefined) string(source.origin, ['sources', i, 'origin']);
    if (source.url !== undefined) {
      string(source.url, ['sources', i, 'url']);
      try {
        new URL(source.url);
      } catch {
        fail('expected an absolute URL', ['sources', i, 'url']);
      }
    }
  });
  array(result.promptFingerprints, ['promptFingerprints']);
  result.promptFingerprints.forEach((entry, i) => {
    object(entry, ['promptFingerprints', i]);
    noUnknown(entry, ['id', 'fingerprint', 'stateScope', 'tier'], ['promptFingerprints', i]);
    string(entry.id, ['promptFingerprints', i, 'id']);
    hash(entry.fingerprint, ['promptFingerprints', i, 'fingerprint']);
  });
  array(result.t1PromptFingerprints, ['t1PromptFingerprints']);
  result.t1PromptFingerprints.forEach((entry, i) => {
    object(entry, ['t1PromptFingerprints', i]);
    noUnknown(entry, ['id', 'fingerprint', 'stateScope', 'tier'], ['t1PromptFingerprints', i]);
    string(entry.id, ['t1PromptFingerprints', i, 'id']);
    hash(entry.fingerprint, ['t1PromptFingerprints', i, 'fingerprint']);
  });
  if (result.taxonomy !== undefined) {
    array(result.taxonomy, ['taxonomy']);
    result.taxonomy.forEach((tag, i) => string(tag, ['taxonomy', i]));
  }
  if (result.authoringRules !== undefined) object(result.authoringRules, ['authoringRules']);
  array(result.questions, ['questions']);
  result.questions.forEach((question, i) => questionArtifact(question, ['questions', i]));
  return result;
}

export function validateVerificationResponse(value) {
  const result = object(value, []);
  noUnknown(result, ['schemaVersion', 'kind', 'batchId', 'tier', 'requestedReviewer', 'verdicts', 'verifiedAt'], []);
  integer(result.schemaVersion, ['schemaVersion'], { min: 1 });
  if (result.schemaVersion !== LEDGER_SCHEMA_VERSION) fail(`unsupported schemaVersion ${result.schemaVersion}`, ['schemaVersion']);
  oneOf(result.kind, ['verification-response'], ['kind']);
  string(result.batchId, ['batchId']);
  oneOf(result.tier, VERIFIED_TIERS, ['tier']);
  reviewer(result.requestedReviewer, ['requestedReviewer']);
  array(result.verdicts, ['verdicts'], { min: 1 });
  result.verdicts.forEach((entry, i) => verdict(entry, ['verdicts', i], { template: result.tier === 'T2' }));
  string(result.verifiedAt, ['verifiedAt']);
  if (!DATE.test(result.verifiedAt)) fail('expected ISO date YYYY-MM-DD', ['verifiedAt']);
  return result;
}

export function validateVerificationLedger(value) {
  const result = object(value, []);
  noUnknown(
    result,
    [
      'schemaVersion',
      'hashVersion',
      'kind',
      'auditId',
      'batchId',
      'tier',
      'reviewerLab',
      'reviewerRequestedModel',
      'reviewerHarness',
      'reviewedAt',
      'attestation',
      'attestationNote',
      'entries',
      'templateEntries',
    ],
    [],
  );
  integer(result.schemaVersion, ['schemaVersion'], { min: 1 });
  if (result.schemaVersion !== LEDGER_SCHEMA_VERSION) fail(`unsupported schemaVersion ${result.schemaVersion}`, ['schemaVersion']);
  integer(result.hashVersion, ['hashVersion'], { min: 1 });
  if (result.hashVersion !== 1) fail(`unsupported hashVersion ${result.hashVersion}`, ['hashVersion']);
  oneOf(result.kind, ['verification-ledger'], ['kind']);
  string(result.auditId, ['auditId']);
  string(result.batchId, ['batchId']);
  oneOf(result.tier, VERIFIED_TIERS, ['tier']);
  string(result.reviewerLab, ['reviewerLab']);
  string(result.reviewerRequestedModel, ['reviewerRequestedModel']);
  string(result.reviewerHarness, ['reviewerHarness']);
  string(result.reviewedAt, ['reviewedAt']);
  if (!DATE.test(result.reviewedAt)) fail('expected ISO date YYYY-MM-DD', ['reviewedAt']);
  oneOf(result.attestation, ['none'], ['attestation']);
  string(result.attestationNote, ['attestationNote']);
  if (!/unattested|no cryptographic attestation/i.test(result.attestationNote)) {
    fail('attestationNote must explicitly say that the ledger is unattested', ['attestationNote']);
  }

  if (result.tier === 'T2') {
    if (result.entries !== undefined) fail('T2 ledgers must not contain question entries', ['entries']);
    array(result.templateEntries, ['templateEntries'], { min: 1 });
    result.templateEntries.forEach((entry, i) => verdict(entry, ['templateEntries', i], { template: true }));
    if (result.templateEntries.some((entry) => entry.verdict !== 'confirmed')) {
      fail('T2 template ledgers may contain only confirmed entries', ['templateEntries']);
    }
    const templateKeys = new Set(
      result.templateEntries.map((entry) => `${entry.templateId}@${entry.templateVersion}`),
    );
    if (templateKeys.size !== result.templateEntries.length) {
      fail('T2 template entries must be unique', ['templateEntries']);
    }
  } else {
    if (result.templateEntries !== undefined) fail('T1/T3 ledgers must not contain template entries', ['templateEntries']);
    array(result.entries, ['entries'], { min: 1 });
    result.entries.forEach((entry, i) => ledgerVerdict(entry, ['entries', i]));
    const questionIds = new Set(result.entries.map((entry) => entry.questionId));
    if (questionIds.size !== result.entries.length) fail('question entries must be unique', ['entries']);
  }
  const { auditId, ...withoutAuditId } = result;
  if (auditId !== ledgerId(withoutAuditId)) fail('auditId does not match the ledger contents', ['auditId']);
  return result;
}

export function ledgerId(value) {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

export function isSha256(value) {
  return typeof value === 'string' && HASH.test(value);
}

export const validateLedger = validateVerificationLedger;
export const validateAuthoringRequest = validateAuthorRequest;
export const validateReviewerResponse = validateVerificationResponse;
