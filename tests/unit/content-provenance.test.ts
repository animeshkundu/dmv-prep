import { existsSync } from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { loadAllQuestions, loadAllStates, loadVerifyAudits, repoPath } from '../../scripts/content/lib/content-io.mjs';
import { canonicalQuestionHash } from '../../scripts/content/lib/canonical-hash.mjs';
import { validateVerificationLedger } from '../../scripts/content/lib/ledger-schema.mjs';

/**
 * docs/CHANGE_SPEC_COMPLETENESS.md §10, `content-provenance.test.ts` row + §9.4:
 * "no state still carries seed-pending-verification; every recorded hash
 * backed by a sources file; every non-draft item's content hash appears in a
 * passing audit file; effectiveDate never later than lastVerified."
 *
 * §9.2: "Refinement: reviewStatus !== 'draft' requires all three [verifiedBy,
 * verifiedAt, verificationAuditId], and content-integrity.test.ts asserts the
 * item's content hash appears in that audit file with a confirmed verdict.
 * Without the hash linkage the stamps are unfalsifiable decoration."
 *
 * Canonical content hashing is shared with the emit/ingest harness. It excludes
 * provenance fields so a stamp cannot change the bytes it claims to verify.
 */
describe('content provenance', () => {
  let questions: any[];
  let states: any[];
  let verifyAudits: any[];

  beforeAll(() => {
    questions = loadAllQuestions();
    states = loadAllStates().records;
    verifyAudits = loadVerifyAudits();
  });

  it('no state still carries the "seed-pending-verification" placeholder sourceSnapshotHash (§9.4)', () => {
    const placeholders = states.filter((s) => s.sourceSnapshotHash === 'seed-pending-verification').map((s) => s.code);
    expect(
      placeholders.length,
      `${placeholders.length}/${states.length} states still carry the literal placeholder hash. ` +
        `scripts/content/fetch-sources.mjs (§9.4, §11 build order step 3) has not run yet. States: ${placeholders.join(', ')}`,
    ).toBe(0);
  });

  it('every recorded sourceSnapshotHash is backed by a src/content/sources/<code>.sources.json file (§9.4)', () => {
    const withHash = states.filter((s) => s.sourceSnapshotHash && s.sourceSnapshotHash !== 'seed-pending-verification');
    const missingSourcesFile = withHash.filter((s) => !existsSync(repoPath(`src/content/sources/${s.code.toLowerCase()}.sources.json`)));
    expect(
      missingSourcesFile.length,
      `${missingSourcesFile.length}/${withHash.length} states with a real sourceSnapshotHash have no backing ` +
        `src/content/sources/<code>.sources.json file. src/content/sources/ ` +
        `${existsSync(repoPath('src/content/sources')) ? 'exists but is missing entries' : 'does not exist yet'}.`,
    ).toBe(0);

    // Non-vacuous gate: the whole check is meaningless while every state is
    // still on the placeholder (asserted by the previous test); state that
    // explicitly here too so a reader of just this test sees the real reason.
    if (withHash.length === 0) {
      expect(
        withHash.length,
        '0 states currently carry a real (non-placeholder) sourceSnapshotHash, so there is nothing yet ' +
          'to check a sources file against — see the "seed-pending-verification" test above for the root cause.',
      ).toBeGreaterThan(0);
    }
  });

  it("every non-draft item's content hash appears in a passing (verdict: 'confirmed') audit file (§9.2 refinement)", () => {
    const nonDraft = questions.filter((q) => q.reviewStatus !== 'draft');
    const confirmedHashes = new Set<string>();
    const confirmedTemplates = new Set<string>();
    for (const audit of verifyAudits) {
      if (Array.isArray(audit)) continue;
      if (audit.tier === 'T2') {
        for (const entry of audit.templateEntries ?? []) {
          if (entry.verdict === 'confirmed') {
            confirmedTemplates.add(`${entry.templateId}@${entry.templateVersion}`);
          }
        }
      } else {
        for (const entry of audit.entries ?? []) {
          if (entry.verdict === 'confirmed' && entry.canonicalHash) confirmedHashes.add(entry.canonicalHash);
        }
      }
    }
    // Non-vacuous gate: this is meaningless to assert clean while no audit
    // files exist at all (src/content/audits/verify/ is empty/absent).
    expect(
      verifyAudits.length,
      `0 verification-audit files found under src/content/audits/verify/. §9.2 requires every non-draft ` +
        `item's content hash to appear there with verdict "confirmed" before this can be verified. ` +
        `${nonDraft.length} non-draft items currently have no audit trail at all.`,
    ).toBeGreaterThan(0);

    const unconfirmed = nonDraft.filter((q) => {
      if (q.tier === 'T2') {
        return !q.templateId || !confirmedTemplates.has(`${q.templateId}@${q.templateVersion}`);
      }
      return !confirmedHashes.has(canonicalQuestionHash(q));
    }).map((q) => q.id);
    expect(unconfirmed.slice(0, 20)).toEqual([]);
  });

  it('verification ledgers use the fixed tier-branched contract', () => {
    const invalid: string[] = [];
    for (const audit of verifyAudits) {
      if (Array.isArray(audit)) {
        invalid.push('array audit payload');
        continue;
      }
      try {
        const { __file: _file, ...ledger } = audit;
        validateVerificationLedger(ledger);
      } catch (error: any) {
        invalid.push(`${audit.__file ?? audit.auditId ?? 'audit'}: ${error.message}`);
      }
    }
    expect(invalid).toEqual([]);
  });

  it('reviewStatus !== "draft" items record verifiedBy, verifiedAt, and verificationAuditId (§9.2 refinement — cross-checked with content-integrity.test.ts)', () => {
    const nonDraft = questions.filter((q) => q.reviewStatus !== 'draft');
    const missing = nonDraft.filter((q) => !q.verifiedBy || !q.verifiedAt || !q.verificationAuditId);
    expect(
      missing.length,
      `${missing.length}/${nonDraft.length} non-draft items are missing verifiedBy/verifiedAt/verificationAuditId.`,
    ).toBe(0);
  });

  it('effectiveDate is never later than lastVerified, for both questions and states (§9.4)', () => {
    const laterQuestions = questions.filter((q) => q.effectiveDate && q.lastVerified && q.effectiveDate > q.lastVerified);
    const laterStates = states.filter((s) => s.effectiveDate && s.lastVerified && s.effectiveDate > s.lastVerified);
    expect(laterQuestions.map((q) => `${q.id}: effectiveDate ${q.effectiveDate} > lastVerified ${q.lastVerified}`)).toEqual([]);
    expect(laterStates.map((s) => `${s.code}: effectiveDate ${s.effectiveDate} > lastVerified ${s.lastVerified}`)).toEqual([]);
  });
});
