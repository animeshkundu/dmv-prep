import { describe, expect, it } from 'vitest';
import {
  SourceExtractionUnsupportedError,
  hashNormalizedSourceText,
  normalizeSourceText,
} from '../../scripts/content/lib/source-normalizer.mjs';
import { collectSourcePlan, fetchSource } from '../../scripts/content/fetch-sources.mjs';
import { migrateStateFacts } from '../../scripts/content/migrate-facts.mjs';

describe('source and fact migration pipeline', () => {
  it('normalizes extracted text before hashing, removing URLs, page numbers, headers, and whitespace churn', () => {
    const source = 'DRIVER GUIDE\nPage 1\nSpeed LIMIT  \nhttps://example.test/rules\n\fDRIVER GUIDE\nPage 2\nSpeed limit';
    expect(normalizeSourceText(source)).toBe('speed limit speed limit');
    expect(hashNormalizedSourceText(source)).toBe(hashNormalizedSourceText('speed limit   speed LIMIT'));
  });

  it('never hashes raw PDF bytes when PDF extraction fails', async () => {
    const response = new Response('%PDF-1.7 bytes', { headers: { 'content-type': 'application/pdf' } });
    const result = await fetchSource('https://example.test/guide.pdf', async () => response);
    expect(result.sha256).toBeUndefined();
    expect(result.error).toMatch(/unsupported:|extraction failed:/);
    expect(SourceExtractionUnsupportedError).toBeDefined();
  });

  it('fetches each cited URL once while associating national citations with every applicable state', () => {
    const plan = collectSourcePlan(
      [
        {
          code: 'WA',
          handbookLandingUrl: 'https://example.test/wa-handbook',
          references: [{ url: 'https://example.test/shared-law' }],
        },
        { code: 'OR', handbookLandingUrl: 'https://example.test/or-handbook' },
      ],
      [
        { stateScope: 'all', references: [{ url: 'https://example.test/shared-law' }] },
        { stateScope: ['WA'], references: [{ url: 'https://example.test/wa-law' }] },
      ],
    );
    expect(plan.allUrls).toEqual([
      'https://example.test/or-handbook',
      'https://example.test/shared-law',
      'https://example.test/wa-handbook',
      'https://example.test/wa-law',
    ]);
    expect([...plan.byState.get('WA')!.keys()]).toContain('https://example.test/wa-law');
    expect([...plan.byState.get('OR')!.keys()]).toContain('https://example.test/shared-law');
  });

  it('marks only unambiguous legacy values inferred and preserves ambiguous text as unknown', () => {
    const migrated = migrateStateFacts({
      code: 'WA',
      lastVerified: '2025-01-01',
      references: [{ label: 'Guide', citation: 'Guide § 1', url: 'https://example.test/guide' }],
      facts: {
        bacLimitAdult: '0.08%',
        interstateMaxSpeed: '70 mph (where posted on rural interstates)',
        schoolZoneSpeed: '20 mph when children are present or as posted',
      },
      gdl: { permitMinAge: '15 (enrolled) / 15 yrs 6 mo' },
    });

    expect(migrated.typedFacts.bacAdult).toMatchObject({
      state: { status: 'value', value: 0.08 },
      confidence: 'inferred',
    });
    expect(migrated.typedFacts.ruralInterstateMaxMph).toMatchObject({
      state: { status: 'value', value: 70, conditions: [{ kind: 'posting', detail: 'where posted on rural interstates' }] },
      confidence: 'inferred',
    });
    expect(migrated.typedFacts.permitMinAgeMonths).toEqual(
      expect.objectContaining({
        state: { status: 'unknown', reason: '15 (enrolled) / 15 yrs 6 mo' },
        confidence: 'unknown',
      }),
    );
    expect(Object.values(migrated.typedFacts).every((fact: any) => fact.confidence !== 'verified')).toBe(true);
  });
});
