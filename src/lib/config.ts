/** Centralised environment access. Only NEXT_PUBLIC_* values exist in the browser build. */
export const publicConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '',
  tilesStandard: process.env.NEXT_PUBLIC_TILES_STANDARD || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tilesTopo: process.env.NEXT_PUBLIC_TILES_TOPO || 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  overpassUrl: process.env.NEXT_PUBLIC_OVERPASS_URL || '',
};

export const hasSupabase = () => Boolean(publicConfig.supabaseUrl && publicConfig.supabaseAnonKey);
export const isBrowser = () => typeof window !== 'undefined';

/**
 * Provider settings. Secret keys are read only in Node (the GitHub Actions refresh job);
 * in the static browser build they are always empty, so keyed providers switch off there.
 */
export function serverConfig() {
  const env = isBrowser() ? ({} as Record<string, string | undefined>) : process.env;
  return {
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    contact: env.DATA_CONTACT ?? 'varos-eye (self-hosted)',
    windyKey: env.WINDY_WEBCAMS_API_KEY ?? '',
    flickrKey: env.FLICKR_API_KEY ?? '',
    orsKey: env.OPENROUTESERVICE_API_KEY ?? '',
    overpassUrl: env.OVERPASS_URL || publicConfig.overpassUrl || 'https://overpass-api.de/api/interpreter',
    regionsPerCycle: Number(env.DISCOVERY_REGIONS_PER_CYCLE ?? 6),
    locationsPerCycle: Number(env.REFRESH_LOCATIONS_PER_CYCLE ?? 150),
  };
}
