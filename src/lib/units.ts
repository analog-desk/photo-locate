/** Display units: miles / feet / mph. Data stays metric internally (providers and scoring use km, m, km/h). */
export const KM_PER_MI = 1.609344;
const FT_PER_M = 3.28084;
export const RADII_MI = [5, 10, 25, 50, 100, 150] as const;
export const miToKm = (mi: number) => mi * KM_PER_MI;
export const kmToMi = (km: number) => km / KM_PER_MI;

/** Kilometres → "4.2 mi" / "37 mi". */
export function fmtMiles(km: number): string {
  const mi = kmToMi(km);
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}
/** Metres → "650 ft" below ~0.2 mi, otherwise "1.3 mi". */
export function fmtShort(m: number): string {
  const ft = m * FT_PER_M;
  if (ft < 1000) return `${Math.round(ft / 10) * 10 || Math.round(ft)} ft`;
  const mi = m / 1609.344;
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}
export const fmtElev = (m: number) => `${Math.round(m * FT_PER_M).toLocaleString('en-US')} ft`;
export const fmtSpeed = (kmh: number) => `${Math.round(kmh / KM_PER_MI)} mph`;
