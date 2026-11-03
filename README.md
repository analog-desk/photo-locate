# Lumen — Worldwide Photography Location Atlas

A photography discovery and planning platform. It helps you find great places to shoot worldwide and nearby,
inspect them on satellite and terrain maps, see where parking is and how far you'll walk, and plan around golden and blue
hour, sun and moon positions, the Milky Way, live forecasts and webcams. A background pipeline runs **every six hours**
to discover new locations and refresh existing ones.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · Leaflet · Supabase (Postgres + PostGIS, Auth, Storage, pg_cron) · SunCalc.

---

## Data principles

* **Nothing invented.** All locations come from Wikidata (CC0) and OpenStreetMap (ODbL). Photos come from Wikimedia Commons
  (freely-licensed only), Flickr (Creative Commons / public domain only, optional) or user uploads. Weather comes from Open-Meteo, and webcams
  from the Windy Webcams API.
* Every access and parking field is a `Sourced<T>` value: `{ value, verified, source }`. If a fee, opening hours, capacity or difficulty
  isn't tagged in OSM, the UI shows **Unverified** instead of a guess. Walking distance and time are marked as *estimates*
  (straight line × 1.3 at 4.5 km/h) unless OpenRouteService routing is configured.
* Forecast ratings are labelled as *potential*, never as guaranteed outcomes.
* Popularity (attention) and photo opportunity (quality + conditions) are separate scores.
* Private or closed sites, protected areas, drone restrictions and hazards are surfaced. Private OSM features without a notable
  Wikidata entry are never indexed.

## Architecture

```
src/lib/
  astro.ts            Sun/moon times & positions, golden/blue hour, twilights, sun path, Milky Way core, lunar calendar (time-zone aware)
  weather/            Open-Meteo client + photography condition engine (sunrise/sunset/blue/astro/fog scoring, insights)
  providers/          wikidata · overpass (OSM POIs, parking, viewpoints, protected areas) · commons · flickr ·
                      nominatim · webcams (Windy) · routing (ORS) · pageviews (Wikimedia)
  dedupe.ts           Proximity + name-similarity duplicate detection
  scoring.ts          0-100 photo-opportunity score with breakdown; separate popularity & scenic scores; hidden-gem rule
  seasonal.ts         Best months (Milky Way months computed; other categories use labelled heuristics)
  enrich.ts           Candidate → full LocationDetail from real sources
  repo/               Database repository (PostGIS RPCs) with a live-provider fallback / top-up
  jobs/               Queue worker + handlers for the 6-hour pipeline; persistence with validation & dedupe
src/app/              Pages (Discover, Explore Map, Near Me, Trending, Sun & Moon, Weather, Community, Collections, Planner, Profile, location pages)
src/app/api/          nearby · search · route corridor · location detail · weather · geocode · webcams · elevation · status · cron · worker
supabase/migrations/  Schema, RLS + storage, geo/queue functions, pg_cron schedules
```

### The six-hour pipeline

`enqueue_refresh_cycle()` (SQL) is scheduled by **pg_cron at `0 */6 * * *`**, so it runs whether or not anyone has the app open.
Each cycle enqueues jobs into the `jobs` table:

| Job | What it does |
| --- | --- |
| `discover_region` | Scans the next least-recently-scanned tile of a global 5° grid via Wikidata (notable viewpoints, waterfalls, peaks, lakes, castles, lighthouses…). Dense tiles that time out are split into quadrants automatically. |
| `discover_around` | OSM + Wikidata around **user-demand hotspots** (areas people searched that are thinly covered) and around **trending/top spots** (hidden viewpoints nearby). |
| `refresh_location` | Re-validates identity and GPS against the source, then refreshes elevation, reverse geocode, description, OSM access tags, parking, viewpoints, protected areas, licensed photos (with new-photo counts), the 7-day forecast and condition scores, 7 days of sun/moon/night calculations, webcams, and popularity history (page-view momentum). It records a diff in `location_updates` and sets `last_refreshed_at`. |
| `check_webcams` | Marks expired or outdated webcams (no update in 6 h, inactive or removed). |
| `check_images` | HEAD-checks licensed images; clears dead hero images. |
| `compute_trending` | Blends provider momentum with in-app engagement (uploads, ratings, saves). |
| `evaluate_alerts` | Creates notifications for users whose sunrise, sunset or astro alert thresholds are met. |

Every candidate passes through a quality gate: valid coordinates (no Null Island), a sane name, a photographic category, a confidence
threshold, a stable source id, and not private. Then it goes through **dedupe** (same Wikidata/OSM id, or ≤150 m with name similarity ≥0.72, or ≤40 m with a shared category,
or ≤600 m with a near-identical name) before an insert or merge. Jobs retry with exponential backoff (2 → 8 → 32 min), then dead-letter.
Stuck jobs are reclaimed after 15 min. Each provider has a per-host rate limiter, retries that honour `Retry-After`, and a circuit breaker
(`provider_health`). Cycle status and stats are visible under **Profile → Data pipeline status** and `GET /api/status`.

**Queue draining** is serverless-friendly. pg_cron calls `kick_worker()` every 2 minutes, which POSTs to `/api/jobs/worker`
(through pg_net) only when jobs are waiting. Each invocation drains jobs for up to ~5 minutes.

**Other schedulers** are included as alternatives. `enqueue_refresh_cycle` won't start a second cycle while one is running.
* `vercel.json` cron → `GET /api/cron/refresh` (needs Vercel Pro for a 6-hour schedule; Hobby only allows daily runs).
* `.github/workflows/refresh.yml` runs `npm run refresh`, which enqueues and drains with no time limit.
* Any crontab can run `npm run refresh`.

## Setup

1. **Supabase project.** Enable the `postgis`, `pg_trgm`, `unaccent`, `pg_cron` and `pg_net` extensions (Dashboard → Database → Extensions).
2. **Migrations.** Run them in order: `supabase db push`, or paste `supabase/migrations/0001…0004` into the SQL editor.
   `0003` seeds the global discovery grid (1,872 tiles).
3. **Vault secrets** for the worker kick:
   ```sql
   select vault.create_secret('https://YOUR-DOMAIN/api/jobs/worker', 'lumen_worker_url');
   select vault.create_secret('<CRON_SECRET>', 'lumen_cron_secret');
   ```
4. **Environment.** Copy `.env.example` → `.env.local`. Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` (server only), `CRON_SECRET`, and `DATA_CONTACT` (a contact string required by OSM and Wikimedia policies).
   Optional: `WINDY_WEBCAMS_API_KEY` (webcams), `FLICKR_API_KEY` (CC photos and photo-activity signal), `OPENROUTESERVICE_API_KEY`
   (real walking routes and road routes for "along my route"), and `NEXT_PUBLIC_MAPBOX_TOKEN` (Mapbox satellite and outdoors layers).
5. **Auth.** Enable email (magic link) and add `https://YOUR-DOMAIN/auth/callback` to the redirect URLs.
6. **First admin** (for the moderation queue): `update profiles set is_admin = true where id = '<your user id>';`
7. `npm install && npm run build && npm start`. Deploy to Vercel or any Node host.
8. Kick off the first cycle with `select enqueue_refresh_cycle('manual');` or `npm run refresh`.

Without Supabase, the app still works in **live mode**. Near Me, Explore, location pages, Sun & Moon, Weather and the Planner query
Wikidata, OSM, Commons and Open-Meteo directly. Community features, trending and the background refresh need the database.
With a database, sparsely-indexed areas are topped up live, and that demand is logged so the next cycle indexes the area properly.

## Commands

```bash
npm run dev        # local dev
npm test           # unit tests (astronomy vs almanac values, geo, dedupe, scoring, conditions, quality gate)
npm run typecheck
npm run refresh    # run a full discovery/refresh cycle from the command line
```

## Licensing and provider terms

* **Map tiles.** The OSM standard tiles and OpenTopoMap are for light use only. For production traffic, set `NEXT_PUBLIC_TILES_STANDARD` and
  `NEXT_PUBLIC_TILES_TOPO` to a commercial provider (MapTiler, Stadia, Thunderforest) or set a Mapbox token.
* **Esri imagery and topo.** Esri World Imagery and World Topo basemaps require an ArcGIS account under Esri's terms for production apps. Use Mapbox if that doesn't fit your plan.
* **Required attributions** are shown in the map and footer: OSM (ODbL), Open-Meteo (CC BY 4.0), Wikipedia text (CC BY-SA), Copernicus DEM,
  Waymarked Trails (CC BY-SA), Windy.
* **Photos** always show the author, the license and a link back to the source. User uploads carry an explicit license choice and a rights declaration.

## Privacy and safety

* GPS is requested only after an explicit tap. Manual search and pin drop are always available, and device GPS is never sent to the database.
* Uploads: the photo's coordinates are hidden unless the user makes them public (the `photos_public` view nulls them).
  When coordinates are private, the file is **always re-encoded to strip EXIF/GPS** before upload.
* New uploads are `pending` until a moderator approves them. Users can't self-approve (database trigger). Content is auto-hidden after 3 reports.
* Private-property, protected-area, drone and hazard notices appear on location pages. Unsafe or abandoned sites carry explicit warnings.

## Known limitations and next steps

* Overpass, Wikidata and Nominatim are public community services. At scale, self-host Overpass and Nominatim, or use commercial equivalents.
* Rate limiting is per process. For many concurrent workers, move it to a shared store such as Redis.
* Webcam view direction isn't published by Windy, so it shows as "not published". Add another provider to fill this in.
* Web-push delivery of notifications (they're currently in-app), drag-to-reorder for itinerary stops, and community-suggested viewpoints
  (the table and RLS policy already exist) are natural next additions.
