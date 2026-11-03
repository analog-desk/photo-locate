import { describe, expect, it } from 'vitest';
import { astroNight, galacticCentrePosition, lightPhaseAt, localNoon, moonDay, phaseName, seasonOf, sunDay, tzOffsetMinutes } from '@/lib/astro';

const mins = (iso: string | null) => (iso ? new Date(iso).getUTCHours() * 60 + new Date(iso).getUTCMinutes() : NaN);

describe('timezones', () => {
  it('computes IANA offsets including DST', () => {
    expect(tzOffsetMinutes('Europe/London', new Date('2024-06-21T12:00:00Z'))).toBe(60);
    expect(tzOffsetMinutes('Europe/London', new Date('2024-01-15T12:00:00Z'))).toBe(0);
    expect(tzOffsetMinutes('America/New_York', new Date('2024-01-15T12:00:00Z'))).toBe(-300);
    expect(tzOffsetMinutes('Asia/Kolkata', new Date('2024-01-15T12:00:00Z'))).toBe(330);
  });
  it('local noon resolves to the right instant', () => {
    expect(localNoon('2024-06-21', 'Europe/London').toISOString()).toBe('2024-06-21T11:00:00.000Z');
  });
});

describe('sun', () => {
  // London, summer solstice 2024: sunrise 04:43 BST (03:43Z), sunset 21:21 BST (20:21Z) — HM Nautical Almanac
  const d = sunDay('2024-06-21', 51.5074, -0.1278, 'Europe/London');
  it('sunrise/sunset within 3 minutes of almanac', () => {
    expect(Math.abs(mins(d.sunrise) - (3 * 60 + 43))).toBeLessThanOrEqual(3);
    expect(Math.abs(mins(d.sunset) - (20 * 60 + 21))).toBeLessThanOrEqual(3);
  });
  it('orders light windows correctly', () => {
    const t = (s: string | null) => Date.parse(s!);
    expect(t(d.blueMorning.start)).toBeLessThan(t(d.blueMorning.end));
    expect(t(d.blueMorning.end)).toBe(t(d.goldenMorning.start));
    expect(t(d.goldenMorning.start)).toBeLessThan(t(d.sunrise));
    expect(t(d.sunrise)).toBeLessThan(t(d.goldenMorning.end));
    expect(t(d.goldenEvening.start)).toBeLessThan(t(d.sunset));
    expect(t(d.sunset)).toBeLessThan(t(d.goldenEvening.end));
    expect(t(d.goldenEvening.end)).toBe(t(d.blueEvening.start));
  });
  it('solstice sunrise azimuth is north-east in London', () => {
    expect(d.sunriseAzimuth!).toBeGreaterThan(45);
    expect(d.sunriseAzimuth!).toBeLessThan(55);
  });
  it('handles polar day', () => {
    const tromso = sunDay('2024-06-21', 69.65, 18.96, 'Europe/Oslo');
    expect(tromso.polar).toBe('day');
    expect(tromso.sunrise).toBeNull();
  });
  it('classifies light phases', () => {
    expect(lightPhaseAt(new Date('2024-06-21T12:00:00Z'), 51.5, 0)).toBe('day');
    expect(lightPhaseAt(new Date('2024-12-21T00:00:00Z'), 51.5, 0)).toBe('night');
  });
  it('season respects hemispheres', () => {
    expect(seasonOf(new Date('2024-07-10'), 45)).toBe('summer');
    expect(seasonOf(new Date('2024-07-10'), -33)).toBe('winter');
  });
});

describe('moon', () => {
  it('2024-04-08 is a new moon (total solar eclipse)', () => {
    const m = moonDay('2024-04-08', 32.0, -97.0, 'America/Chicago');
    expect(m.illumination).toBeLessThan(0.02);
    expect(m.phaseName).toBe('New Moon');
  });
  it('2024-04-23 is close to full', () => {
    expect(moonDay('2024-04-23', 51.5, 0, 'Europe/London').illumination).toBeGreaterThan(0.97);
  });
  it('phase names', () => {
    expect(phaseName(0.25)).toBe('First Quarter');
    expect(phaseName(0.75)).toBe('Last Quarter');
  });
});

describe('milky way', () => {
  it('galactic centre is near zenith from the Atacama at local midnight in June', () => {
    const p = galacticCentrePosition(new Date('2024-06-15T04:30:00Z'), -23.0, -68.0);
    expect(p.elevation).toBeGreaterThan(70);
  });
  it('core is never high from 65°N', () => {
    const p = galacticCentrePosition(new Date('2024-06-15T23:00:00Z'), 65, 0);
    expect(p.elevation).toBeLessThan(0);
  });
  it('a moonless June night in Atacama shows the core', () => {
    const n = astroNight('2024-06-06', -23.0, -68.0, 'America/Santiago');
    expect(n.darkStart).not.toBeNull();
    expect(n.milkyWay.bestElevation!).toBeGreaterThan(60);
  });
});
