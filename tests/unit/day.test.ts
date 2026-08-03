import { describe, expect, it } from 'vitest';
import { localDayKey, shiftDayKey } from '../../src/lib/day';

describe('localDayKey', () => {
  it('uses the requested local timezone rather than UTC', () => {
    const answer = new Date('2026-01-02T05:00:00.000Z');
    expect(localDayKey(answer, 'America/Los_Angeles')).toBe('2026-01-01');
    expect(localDayKey(answer, 'America/New_York')).toBe('2026-01-02');
  });

  describe('shiftDayKey', () => {
    it('moves across month and leap-day boundaries', () => {
      expect(shiftDayKey('2024-03-01', -1)).toBe('2024-02-29');
      expect(shiftDayKey('2026-12-31', 1)).toBe('2027-01-01');
    });
  });

  it('handles a daylight-saving transition', () => {
    expect(localDayKey(new Date('2026-03-08T09:30:00.000Z'), 'America/Los_Angeles')).toBe('2026-03-08');
    expect(localDayKey(new Date('2026-03-09T06:30:00.000Z'), 'America/Los_Angeles')).toBe('2026-03-08');
  });
});
