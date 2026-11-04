import { describe, expect, it } from 'vitest';
import { fmtElev, fmtMiles, fmtShort, fmtSpeed, miToKm } from '@/lib/units';

describe('imperial display units', () => {
  it('formats miles', () => {
    expect(fmtMiles(miToKm(5))).toBe('5.0 mi');
    expect(fmtMiles(100)).toBe('62 mi');
  });
  it('uses feet for short distances and miles beyond ~1000 ft', () => {
    expect(fmtShort(100)).toBe('330 ft');
    expect(fmtShort(1609.344)).toBe('1.0 mi');
  });
  it('elevation and speed', () => {
    expect(fmtElev(1000)).toBe('3,281 ft');
    expect(fmtSpeed(100)).toBe('62 mph');
  });
});
