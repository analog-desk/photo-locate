# Varo’s Eye — Worldwide Photography Location Atlas

A photography discovery and planning platform. It helps you find great places to shoot worldwide and nearby,
inspect them on satellite and terrain maps, see where parking is and how far you'll walk, and plan around golden and blue
hour, sun and moon positions, the Milky Way, live forecasts and webcams. A background pipeline runs **every six hours**
to discover new locations and refresh existing ones.

**Stack:** Next.js 15 static export · React 19 · TypeScript · Tailwind · Leaflet · SunCalc · Supabase (Postgres + PostGIS, Auth, Storage) · GitHub Pages + GitHub Actions.

The site is fully static, like the other analog-desk apps. Every push to `main` builds it and publishes it to GitHub Pages. The browser talks directly to the open-data providers and to Supabase (anon key + row-level security), and the six-hour refresh runs in GitHub Actions.

---

## Data principles

* **Nothing invented.** All locations come from Wikidata (CC0) and OpenStreetMap (ODbL). Photos come from Wikimedia Commons
  (freely-licensed only) and Flickr (Creative Commons / public domain only, optional). Weather comes from Open-Meteo, and webcams
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
  providers/          wikidata · overpass (OSM POIs, parking, viewpoints, protected areas) · commons · nominatim · pageviews
                      + server-only (refresh job): flickr · webcams (Windy) · routing (ORS)
  data.ts             What the pages call: nearby, search, detail, weather, elevation, along-a-route
  repo/               Supabase/PostGIS reads with a live-provider fallback and top-up
  dedupe.ts, scoring.ts, seasonal.ts, enrich.ts
  jobs/               Queue worker + handlers for the six-hour pipeline; validation & dedupe on write
src/app/              Static pages (location pages use ?id=…, e.g. /location/?id=wd-Q1135473)
scripts/run-refresh.ts  The six-hour cycle (enqueue + drain), run by GitHub Actions
supabase/migrations/  Schema, RLS + storage, geo/queue functions, browser-callable functions
.github/workflows/    deploy.yml (GitHub Pages) · refresh.yml (every 6 h)
```

### The six-hour pipeline

`.github/workflows/refresh.yml` runs at `7 */6 * * *` on GitHub's servers, whether or not anyone has the site open.
It calls `enqueue_refresh_cycle()` and then drains the `jobs` queue:

| Job | What it does |
| --- | --- |
| `discover_region` | Scans the next least-recently-scanned tile of a global 5° grid via Wikidata (notable viewpoints, waterfalls, peaks, lakes, castles, lighthouses…). Dense tiles that time out are split into quadrants. |
| `discover_around` | OSM + Wikidata around **user-demand hotspots** (areas people searched that are thinly covered) and around **trending/top spots** (hidden viewpoints nearby). |
| `refresh_location` | Re-validates identity and GPS against the source, then refreshes elevation, place names, description, OSM access tags, parking, viewpoints, protected areas, licensed photos, the 7-day forecast and condition scores, sun/moon/night data, webcams, and popularity history. It records a diff in `location_updates`. |
| `check_webcams` / `check_images` | Expired or outdated webcam detection, and broken image detection. |
| `compute_trending` | Popularity momentum, used to prioritise what gets refreshed and explored next. |

Every candidate passes a quality gate (valid coordinates, name, category, confidence, stable source id, not private), then dedupe
(same Wikidata/OSM id, or ≤150 m with name similarity ≥0.72, or ≤40 m with a shared category, or ≤600 m with a near-identical name).
Jobs retry with backoff, then dead-letter. Providers are rate-limited and retried, with a circuit breaker.


**Keys stay private.** Windy (webcams), Flickr and OpenRouteService keys exist only as GitHub Actions secrets. The refresh job uses them
and stores the results (webcams, CC photos, routed walking paths) in the database, and the public site only reads those results.

## Setup

**Already working:** pushing to `main` publishes the site to `https://analog-desk.github.io/photo-locate/`, provided GitHub Pages is
set to *Deploy from branch → `gh-pages`* (Settings → Pages), the same as your other apps. Without Supabase the site runs in **live mode**:
Near Me, Explore, location pages, Sun & Moon, Weather and the Planner all work directly against the open-data providers.

**To enable the database and the six-hour refresh** (more spots indexed ahead of time, stored webcams, routed walking paths):
1. Create a Supabase project. Enable the `postgis`, `pg_trgm` and `unaccent` extensions (Database → Extensions).
2. Run `supabase/migrations/0001…0004` in order in the SQL editor. `0003` seeds the global discovery grid.
3. In GitHub → Settings → Secrets and variables → Actions:
   * **Variables:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (both public). Optionally add `NEXT_PUBLIC_MAPBOX_TOKEN` and `DATA_CONTACT`.
   * **Secrets:** `SUPABASE_SERVICE_ROLE_KEY`. Optionally add `WINDY_WEBCAMS_API_KEY`, `FLICKR_API_KEY` and `OPENROUTESERVICE_API_KEY`.
4. Re-run the **Deploy** workflow so the site is built with the Supabase variables. Then run **6-hourly location refresh** once from the Actions tab to start indexing.

Until step 3 is done, the refresh workflow simply logs "Supabase not configured" and exits successfully.

## Commands

```bash
npm run dev        # local dev (http://localhost:3000)
npm run build      # static site → out/
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
* **Photos** always show the author, the license and a link back to the source.

## Privacy and safety

* GPS is requested only after an explicit tap. Manual search and pin drop are always available. Device GPS stays in the browser; only a coarse 1° search-demand counter is recorded.
* Private-property, protected-area, drone and hazard notices appear on location pages. Unsafe or abandoned sites carry explicit warnings.

## Known limitations and next steps

* Overpass, Wikidata and Nominatim are public community services. At scale, self-host Overpass and Nominatim, or use commercial equivalents.
* Rate limiting runs per browser tab and per refresh job. Popular deployments should point `NEXT_PUBLIC_OVERPASS_URL` / tiles at their own or commercial instances.
* Route search on the public site follows straight segments between the stops you enter (road routing needs a private key).
* GitHub pauses scheduled workflows after 60 days without repository activity. Re-enable it from the Actions tab if that happens.
* Webcam view direction isn't published by Windy, so it shows as "not published". Add another provider to fill this in.

## No accounts

There is no sign-in. Favourites, collections, itineraries and saved shoot plans are stored **on the device** (browser local storage).
My Collections has *Export backup* / *Import backup* to move them between devices. Distances are shown in miles and feet, wind in mph,
and elevation in feet. Temperatures and rainfall are still °C and mm.
