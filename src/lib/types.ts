export const CATEGORIES = [
  'landscape', 'mountains', 'waterfalls', 'lakes', 'beaches', 'coastlines', 'forests', 'wildlife',
  'architecture', 'cityscapes', 'street', 'abandoned', 'night', 'astro', 'drone', 'hidden-gem',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  landscape: 'Landscape', mountains: 'Mountains', waterfalls: 'Waterfalls', lakes: 'Lakes', beaches: 'Beaches',
  coastlines: 'Coastlines', forests: 'Forests', wildlife: 'Wildlife', architecture: 'Architecture',
  cityscapes: 'Cityscapes', street: 'Street', abandoned: 'Abandoned places', night: 'Night',
  astro: 'Astrophotography', drone: 'Drone', 'hidden-gem': 'Hidden gems',
};

export const RADII_KM = [5, 10, 25, 50, 100, 250] as const;

export const SORTS = [
  'score', 'popularity', 'distance', 'sunrise', 'sunset', 'golden', 'blue', 'astro', 'new', 'hidden',
] as const;
export type SortKey = (typeof SORTS)[number];
export const SORT_LABELS: Record<SortKey, string> = {
  score: 'Highest photo score', popularity: 'Most popular', distance: 'Closest to me', sunrise: 'Best sunrise',
  sunset: 'Best sunset', golden: 'Best golden hour', blue: 'Best blue hour', astro: 'Best astrophotography',
  new: 'New discoveries', hidden: 'Hidden gems',
};

/** A value that may or may not have been verified against a reliable source. */
export interface Sourced<T> {
  value: T | null;
  verified: boolean;
  source?: string;
  sourceUrl?: string;
  updatedAt?: string;
}

export interface SourceRef {
  provider: 'wikidata' | 'osm' | 'commons' | 'flickr' | 'community' | 'windy' | 'open-meteo';
  id: string;
  url?: string;
}

export interface ScoreBreakdown {
  scenic: number;
  diversity: number;
  weather: number | null;
  golden: number | null;
  clouds: number | null;
  seasonal: number;
  accessibility: number;
  viewpoints: number;
}

export interface ConditionScores {
  sunrise: number | null;
  sunset: number | null;
  golden: number | null;
  blue: number | null;
  astro: number | null;
  computedAt: string;
}

export interface LocationSummary {
  id: string;
  slug: string;
  name: string;
  lat: number;
  lng: number;
  country: string | null;
  region: string | null;
  nearestTown: string | null;
  categories: Category[];
  heroImage: PhotoRef | null;
  photoScore: number;        // 0-100 dynamic photography opportunity
  popularityScore: number;   // 0-100, kept separate from quality on purpose
  scenicScore: number;
  conditions: ConditionScores | null;
  hiddenGem: boolean;
  communityRating: number | null;
  ratingCount: number;
  discoveredAt: string | null;
  updatedAt: string | null;
  confidence: number;        // 0-1 data confidence
  sources: SourceRef[];
  distanceKm?: number;
}

export interface Parking {
  id: string;
  name: string | null;
  lat: number;
  lng: number;
  fee: Sourced<string>;
  capacity: Sourced<number>;
  access: Sourced<string>;
  surface: string | null;
  distanceToSpotM: number;
  walkingDistanceM: Sourced<number>;
  walkingTimeMin: Sourced<number>;
  route: [number, number][] | null; // [lat,lng]
  source: SourceRef;
}

export interface Viewpoint {
  id: string;
  name: string | null;
  lat: number;
  lng: number;
  direction: number | null; // degrees, if tagged
  elevation: number | null;
  source: SourceRef;
}

export interface AccessInfo {
  openingHours: Sourced<string>;
  fee: Sourced<string>;
  access: Sourced<string>; // e.g. yes / private / permissive / no
  wheelchair: Sourced<string>;
  hikingDifficulty: Sourced<string>; // sac_scale etc.
  privateProperty: boolean;
  protectedArea: Sourced<string>;
  droneRestriction: Sourced<string>;
  safetyNotes: string[];
}

export interface PhotoRef {
  id: string;
  url: string;          // display url
  thumbUrl: string;
  width?: number;
  height?: number;
  title?: string;
  author: string;
  authorUrl?: string;
  license: string;
  licenseUrl?: string;
  sourceUrl: string;
  provider: 'commons' | 'flickr' | 'community';
  takenAt?: string | null;
  lat?: number | null;
  lng?: number | null;
  lightPhase?: LightPhase | null;
  season?: Season | null;
  camera?: string | null;
  lens?: string | null;
  focalLength?: number | null;
  aperture?: number | null;
  shutter?: string | null;
  iso?: number | null;
}

export type LightPhase = 'night' | 'astronomical' | 'nautical' | 'blue' | 'golden' | 'day';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface LocationDetail extends LocationSummary {
  description: string | null;
  descriptionSource?: SourceRef;
  elevation: Sourced<number>;
  timezone: string | null;
  wikipediaUrl: string | null;
  bestMonths: { months: number[]; reason: string; heuristic: boolean } | null;
  viewpoints: Viewpoint[];
  parking: Parking[];
  access: AccessInfo;
  photos: PhotoRef[];
  scoreBreakdown: ScoreBreakdown | null;
  focalHints: { focal: string; count: number }[];
  osmTags?: Record<string, string>;
}

export interface GeoPoint { lat: number; lng: number }
