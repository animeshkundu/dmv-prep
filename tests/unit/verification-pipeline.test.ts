import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalHashInput,
  canonicalQuestionHash,
} from '../../scripts/content/lib/canonical-hash.mjs';
import { buildRequest } from '../../scripts/content/author-batch.mjs';
import {
  applyConfirmedStamps,
  ingestVerificationResponse,
} from '../../scripts/content/verify-batch.mjs';

const question = {
  id: 't3-wa-parking-001',
  prompt: 'Where may a driver leave a vehicle while observing the posted restriction?',
  options: ['At the marked location', 'In a travel lane', 'On a sidewalk', 'Across a driveway'],
  correctIndex: 0,
  explanation: 'Follow the posted restriction and do not block traffic or access.',
};

describe('verification pipeline', () => {
  it('uses the exact v1 NFC-normalized tuple for the canonical hash', () => {
    const composed = { ...question, prompt: 'Cafe\u0301 safely' };
    const expectedInput = JSON.stringify([
      composed.id,
      'Café safely',
      composed.options,
      composed.correctIndex,
      composed.explanation,
      null,
    ]);
    expect(canonicalHashInput(composed)).toBe(expectedInput);
    expect(canonicalQuestionHash(composed)).toBe(
      createHash('sha256').update(expectedInput, 'utf8').digest('hex'),
    );
  });

  it('emits an honest request with fingerprints and no fabricated questions', () => {
    const request = buildRequest({ state: 'WA', category: 'parking', count: '2' });
    expect(request.kind).toBe('author-request');
    expect(request.questions).toEqual([]);
    expect(request.promptFingerprints.length).toBeGreaterThan(0);
    expect(request.sources.length).toBeGreaterThan(0);
    expect(request.requestedReviewer).toMatchObject({
      model: expect.any(String),
      harness: expect.any(String),
    });
  });

  it('ingests only confirmed T1/T3 verdicts and records an explicitly unattested ledger', () => {
    const artifactHash = canonicalQuestionHash(question);
    const request = {
      requestId: 'batch-t3',
      questions: [{ id: question.id, artifactHash }],
      requestedReviewer: { model: 'review-model', harness: 'review-harness' },
    };
    const ledger = ingestVerificationResponse({
      request,
      response: {
        schemaVersion: 1,
        kind: 'verification-response',
        batchId: 'batch-t3',
        tier: 'T3',
        requestedReviewer: request.requestedReviewer,
        verifiedAt: '2026-07-27',
        verdicts: [{
          questionId: question.id,
          artifactHash,
          question,
          verdict: 'confirmed',
          note: 'Checked against the supplied citation.',
        }],
      },
    });
    expect(ledger.attestation).toBe('none');
    expect(ledger.attestationNote).toMatch(/unattested|no cryptographic attestation/i);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries?.[0].canonicalHash).toBe(artifactHash);
    expect(ledger.hashVersion).toBe(1);
    expect(ledger.reviewerRequestedModel).toBe('review-model');
  });

  it('rejects incomplete, unknown, hash-mismatched, and non-confirmed responses', () => {
    const artifactHash = canonicalQuestionHash(question);
    const request = {
      requestId: 'batch-t3',
      questions: [{ id: question.id, artifactHash }],
      requestedReviewer: { model: 'review-model', harness: 'review-harness' },
    };
    const response = (entry: any) => ({
      schemaVersion: 1,
      kind: 'verification-response',
      batchId: 'batch-t3',
      tier: 'T3',
      requestedReviewer: request.requestedReviewer,
      verifiedAt: '2026-07-27',
      verdicts: [entry],
    });
    expect(() => ingestVerificationResponse({
      request,
      response: response({
        questionId: question.id,
        artifactHash: '0'.repeat(64),
        question,
        verdict: 'confirmed',
        note: 'bad hash',
      }),
    })).toThrow(/hash mismatch/i);
    expect(() => ingestVerificationResponse({
      request,
      response: response({
        questionId: 'unknown',
        artifactHash,
        question: { ...question, id: 'unknown' },
        verdict: 'confirmed',
        note: 'unknown',
      }),
    })).toThrow(/unknown question/i);
    expect(() => ingestVerificationResponse({
      request,
      response: response({
        questionId: question.id,
        artifactHash,
        verdict: 'ambiguous',
        note: 'not confirmed',
      }),
    })).toThrow(/non-confirmed/i);
  });

  it('uses confirmed template entries for T2 and never stamps generated instances inline', () => {
    const ledger = ingestVerificationResponse({
      request: { requestId: 'batch-t2', requestedReviewer: { model: 'm', harness: 'h' } },
      response: {
        schemaVersion: 1,
        kind: 'verification-response',
        batchId: 'batch-t2',
        tier: 'T2',
        requestedReviewer: { model: 'm', harness: 'h' },
        verifiedAt: '2026-07-27',
        verdicts: [{
          templateId: 'tpl-parking',
          templateVersion: 1,
          templateHash: '1'.repeat(64),
          verdict: 'confirmed',
          note: 'Template and consumed fact checked.',
        }],
      },
    });
    expect(ledger.templateEntries).toHaveLength(1);
    expect((ledger as any).reviewStatus).toBeUndefined();
    expect(applyConfirmedStamps([question], ledger)).toEqual([question]);
  });

  it('stamps only a confirmed, hash-linked T1/T3 item when explicitly requested', () => {
    const artifactHash = canonicalQuestionHash(question);
    const ledger = ingestVerificationResponse({
      request: {
        requestId: 'batch-t3',
        questions: [{ id: question.id, artifactHash }],
        requestedReviewer: { model: 'm', harness: 'h' },
      },
      response: {
        schemaVersion: 1,
        kind: 'verification-response',
        batchId: 'batch-t3',
        tier: 'T3',
        requestedReviewer: { model: 'm', harness: 'h' },
        verifiedAt: '2026-07-27',
        verdicts: [{
          questionId: question.id,
          artifactHash,
          question,
          verdict: 'confirmed',
          note: 'confirmed',
        }],
      },
    });
    const stamped = applyConfirmedStamps([question], ledger);
    expect(stamped[0]).toMatchObject({
      reviewStatus: 'adversarially-verified',
      verifiedBy: 'm',
      verifiedAt: '2026-07-27',
      verificationAuditId: ledger.auditId,
    });
  });
});
