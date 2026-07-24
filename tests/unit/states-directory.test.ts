import { describe, it, expect } from 'vitest';
import { STATES, byCode, stateSlug } from '../../src/lib/states-directory';

describe('states directory', () => {
  it('covers all 50 states + DC', () => {
    expect(STATES).toHaveLength(51);
    expect(byCode('DC')).toBeDefined();
  });

  it('has unique codes', () => {
    const codes = new Set(STATES.map((s) => s.code));
    expect(codes.size).toBe(51);
  });

  it('slugs codes to lowercase', () => {
    expect(stateSlug('CA')).toBe('ca');
    expect(byCode('ca')?.name).toBe('California');
  });
});
