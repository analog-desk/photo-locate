/** Centralised environment access. Server-only values are read lazily so they never get bundled client-side. */
export const publicConfig = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '',
  tilesStandard: process.env.NEXT_PUBLIC_TILES_STANDARD || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tilesTopo: process.env.NEXT_PUBLIC_TILES_TOPO || 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
};

export const hasSupabase = () => Boolean(publicConfig.supabaseUrl && publicConfig.supabaseAnonKey);

export function serverConfig() {
  if (typeof window !== 'undefined') throw new Error('serverConfig() called in the browser');
  return {
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    cronSecret: process.env.CRON_SECRET ?? '',
    contact: process.env.DATA_CONTACT ?? 'lumen-photo-atlas (self-hosted)',
    windyKey: process.env.WINDY_WEBCAMS_API_KEY ?? '',
    flickrKey: process.env.FLICKR_API_KEY ?? '',
    orsKey: process.env.OPENROUTESERVICE_API_KEY ?? '',
    overpassUrl: process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter',
    regionsPerCycle: Number(process.env.DISCOVERY_REGIONS_PER_CYCLE ?? 6),
    locationsPerCycle: Number(process.env.REFRESH_LOCATIONS_PER_CYCLE ?? 150),
  };
}
