# Universal Cosmos

An immersive, browser-based Solar System explorer built with React, TypeScript, Vite, and direct Three.js. Start in Earth orbit, visit the Moon, descend into measured terrain in the Taurus–Littrow region, walk locally, and return to orbit. Solar System navigation, time controls, search, and mouse, keyboard, and touch controls are available.

The local catalog includes the Sun, eight planets, Earth's Moon, ten additional named moons, and three named asteroids or dwarf planets. Search can reach every object; Overview offers a separate moons and asteroids list and an illustrative asteroid-belt cue. Nine of the added moons have local, historically sourced cartographic maps. HTTP mode currently supports its original ten bodies. Additional surface destinations remain future milestones in [SOLAR_SYSTEM_ROADMAP.md](SOLAR_SYSTEM_ROADMAP.md).

This is an educational visualization, not an astronomical ephemeris or navigation instrument. The default clock follows current UTC, while positions still follow chosen phases on simplified circular paths. Exploration uses a uniform physical distance/radius scale; the separate Solar System Overview deliberately exaggerates sizes and compresses distances. Orbit and landing views use a locally stored NASA celestial Milky Way map, source-derived stars, and enhanced measured H-alpha gas emission with approximate orientation and analytic day/night visibility. Nebulae and galaxies have no separate distance-aware catalog or volume data; planetary atmospheric descent uses labeled reconstructions rather than measured local weather.

## Run locally

Use Node.js 24 LTS (or a compatible Node.js release at least 22.12) and npm. A browser with WebGL 2 and hardware acceleration is required for the 3D viewport.

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. The dev server uses this fixed origin to match the backend's default CORS configuration. For a production build:

```sh
npm run build
npm run preview
```

No backend, API key, paid service, or external texture download is required in local data mode. The backend integration below is opt-in through local environment configuration. For a phone on the same trusted local network, run `npm run dev -- --host 0.0.0.0` and open the development computer's LAN address and printed port. HTTP data mode also requires a backend URL reachable from the phone and a matching backend `FRONTEND_ORIGIN`; `localhost` on a phone refers to the phone itself.

## Controls

| Action                      | Desktop       | Touch                                     |
| --------------------------- | ------------- | ----------------------------------------- |
| Rotate / look               | Left-drag     | One-finger drag                           |
| Zoom                        | Mouse wheel   | Pinch with two fingers                    |
| Pan                         | Right-drag    | Two-finger drag                           |
| Select a body               | Click         | Tap                                       |
| Travel to a body            | Double-click  | Double-tap                                |
| Move                        | W / A / S / D | Use rotate, pan, zoom, and focus controls |
| Move vertically             | Q / E         | Two-finger pan                            |
| Leave focus / close a panel | Escape        | Close or reset-view button                |

The default view opens in Earth orbit with navigation and detailed information collapsed. The table above describes orbital and Solar System controls; surface movement is described below. Search is always available; the destination strip appears only in Solar System Overview. The navigation menu toggles on desktop and mobile, while object details open as a side panel or compact mobile bottom sheet. Selecting an object in the overview enters Exploration Mode and travels toward it. The Stars, Galaxies, Nebulae, and Deep Space collections explain the future scope; they do not pretend to load unavailable catalogs.

Click or tab into the viewport before using movement keys. Orbit camera rotates around the selected body; Free flight supports looking, translating, panning, and zooming. The explorer starts at current UTC in Real time mode; the time menu also provides 0.01, 0.1, 1, 10, and 100 simulated days per second. Real time resynchronizes after a hidden tab resumes. Pause freezes orbital and axial motion while navigation remains available. Reset time returns to current UTC. Reset view restores the current mode: the selected or last exploration target, or the full overview. Search opens with `/`, and the flight manual opens with `?`.

## Solar observation and exposure

Select the Sun through search or Solar System Overview to open its observation controls. The Sun retains its 695,700 km nominal radius. Its panel reports distance from the solar center, apparent diameter, unobscured irradiance, and the visible photosphere fraction. Distance presets place the observer at Mercury-, Earth-, Jupiter-, or Neptune-like mean orbital distances; they do not move to those planets' observed locations. The Sun supports approach and observation, with no landing mode.

**Settings** provides global automatic exposure, exposure compensation, manual exposure, a faint-corona toggle, and bounded optical-glare strength for the explorer. **Solar detail filter** is an explicit, off-by-default automatic-exposure mode for inspecting the photosphere; it intentionally dims the rest of the scene and never changes physical illumination. These controls also apply to the Moon surface view. Ordinary automatic exposure prioritizes the selected world's illumination and limits the effect of a visible Sun to one EV; it is not a GPU image histogram or calibrated camera meter. Switching to manual preserves the current exposure. Each +1 EV doubles exposure. Overview normalizes illumination for its diagrammatic presentation.

In Exploration Mode, **Look at Sun** rotates in place without moving the camera, and **Go to Day Side** travels around the selected world to its illuminated hemisphere. The rendering-diagnostics button exposes low-rate model-space camera/Sun distance, angular diameter, positions, directions, FOV, phase, and exposure. These are modeled values; the simplified orbit system is not an ephemeris.

In physical Exploration Mode, sunlight follows inverse-square distance, normalized to 1,361 W/m² at 1 AU. When supported, the world and lunar pass compose in one bounded linear HDR target followed by a single output transform; unsupported devices use an identified direct-output fallback. The white HDR photosphere has approximate limb darkening and synthetic, resolution-aware granulation. The optional corona is an analytic visualization and is omitted at Low quality; the separate glare control is a bounded camera-optics approximation. Neither pattern represents observed solar activity; no prominence or current sunspot dataset is installed. Finite-disk occultation affects solar visibility and receiving-body illumination separately, so a camera eclipse does not darken the entire Solar System. The eclipse model has documented geometric and shading limits and cannot predict real eclipses from the application's simplified orbits.

See [SOLAR_SOURCES.md](SOLAR_SOURCES.md) for authoritative sources, nominal constants, exposure choices, and approximation limits. Final automated and inspected browser results are recorded in [VALIDATION.md](VALIDATION.md).

## Moon orbit-to-surface exploration

1. In Moon Exploration Mode, choose **Descend to surface** on the Taurus–Littrow card.
2. The application loads measured regional data, approaches the selected Apollo 17 region, and descends to the surface. Loading can be canceled; failed requests expose a retry action.
3. Drag the viewport or use keyboard arrow keys to look around. Use **W / A / S / D**, or hold the on-screen directional arrows, to walk within the prepared region. Hold Shift for faster walking. Select an observer eye height from 1.2 to 2.5 meters.
4. Read latitude/longitude, datum elevation, height above terrain, modeled Sun altitude, source spacing, and loading/cache status in the surface panel. Collapse the panel with its chevron to clear the view. The Moon has a black, airless sky.
5. Choose **Return to orbit** to ascend and resume ordinary exploration. Search and navigation to other bodies remain part of the existing application.

This is a Moon vertical slice with one detailed landing region. The selected position is 20.1908° N, 30.7717° E. Real NASA LROC stereo elevation and registered orthophotos supply a 2.56 km square at five-meter sampling, surrounded by a 20.48 km square of context sampled at 40 meters. A coarse global LOLA grid supplies distant terrain. The packaged terrain data is approximately 6.52 MB and loads through bounded requests and caches; high-resolution global rasters are not loaded into browser memory.

Five-meter sampling does not resolve individual rocks, footprints, or centimeter-scale soil. No invented detail fills that gap. Source stereo artifacts, missing context coverage, and baked lighting in the orthophotos remain disclosed. Terrain source resolution and the geometry chosen for the current rendering quality are separate quantities. See [LUNAR_DATA.md](LUNAR_DATA.md) for coverage, accuracy qualifications, attribution, and reproducible preparation, and [PLANETARY_ENGINE.md](PLANETARY_ENGINE.md) for the coordinate, rendering, and navigation architecture.

Surface exploration on other rocky bodies, arbitrary lunar landing sites, gas-giant atmospheric flight, and full Rayleigh/Mie scattering are deferred. The giant planets have no invented solid landing surfaces. Existing planetary atmospheric-limb effects remain visual approximations.

## Scientific model and provenance

The catalog contains the Sun, Mercury, Venus, Earth, Earth's Moon, Mars, Jupiter, Saturn, Uranus, and Neptune. The frontend's bundled physical quantities are rounded reference values with explicit units from NASA's [Planetary Fact Sheets](https://nssdc.gsfc.nasa.gov/planetary/factsheet/). In HTTP mode, object identities and parent relationships come from the backend; the displayed physical properties and visualization settings still come from this bundled reference catalog. The backend seed intentionally supplies no physical measurements, so those values are not presented as backend observations.

- Solar System exploration uses **10,000 km per render unit** for both modeled orbital distances and object radii. This preserves distance-to-radius ratios. The Moon terrain pass uses a separate local meter coordinate system for orbital-to-ground navigation.
- Physical model positions in kilometers, overview display positions, and camera-relative render coordinates are separate. Parent relationships are resolved on the CPU; a floating origin keeps nearby GPU geometry precise.
- Lunar terrain elevations refer to a **1,737,400 m sphere**, separately from the rounded catalog radius. Planetocentric latitude and east-positive longitude map to double-precision Moon-fixed coordinates; GPU vertices are relative to tile centers and the observer. Terrain collision follows the displayed ground surface derived from those measurements.
- Solar System Overview uses the exaggerated display table below. Its scale notice and orbital paths are specific to that mode.
- Planetary positions use simplified circular motion and chosen initial phases. They do not reproduce the real sky at the displayed date.
- The orbit model's fixed phase reference is `2026-01-01T00:00:00.000Z`. The clock defaults to current UTC; the phase reference is not a measured orbital epoch.
- Surface and cloud maps now use verified NASA, ESA/STScI, and USGS imagery or documented derivatives. They are historical composites, with source processing, missing coverage, and non-natural-color products identified in [ASSET_SOURCES.md](ASSET_SOURCES.md).
- The starfield remains procedural, not a star catalog. Atmospheric scattering, exposure, roughness, cloud opacity, night-light emission, ring transparency, and shadow rendering are approximations rather than calibrated observations.
- A catalog body's mean orbital distance is not the current distance from the camera or from another selected body.
- Of planetary satellites, only Earth's Moon is modeled. Finite-disk eclipses use the application's modeled geometry; real-date eclipse prediction, other moons, relativistic effects, scientific ephemerides, and deep-space exploration remain outside the implemented scope.

The **overview-only** visualization scale is:

| Body    | Display radius | Display orbital radius | Orbital parent |
| ------- | -------------: | ---------------------: | -------------- |
| Sun     |              5 |                      0 | —              |
| Mercury |           0.48 |                     10 | Sun            |
| Venus   |           0.85 |                     14 | Sun            |
| Earth   |           0.90 |                     19 | Sun            |
| Moon    |          0.245 |                    2.3 | Earth          |
| Mars    |           0.65 |                     25 | Sun            |
| Jupiter |           2.50 |                     37 | Sun            |
| Saturn  |           2.10 |                     49 | Sun            |
| Uranus  |           1.35 |                     61 | Sun            |
| Neptune |           1.30 |                     73 | Sun            |

These choices preserve recognizable size ordering while keeping small bodies visible and travel distances usable. They intentionally do not preserve true size or distance ratios.

## Imagery and rendering context

Earth uses Blue Marble daytime geography and cloud composites plus Black Marble night lights. The orbital Moon globe uses NASA's LRO color product and a normal map derived from LOLA elevation without relief amplification; its surface exploration pass adds actual regional LROC elevation and registered orthophotos. Mercury and Mars use MESSENGER and Viking mosaics. Jupiter, Saturn, Uranus, and Neptune use historical Hubble imagery; Saturn's radial ring color profile comes from Cassini.

Missing observations are not filled with invented geography or bands. Hubble maps have partial coverage, with unavailable regions rendered neutrally. No verified full-sphere visible-light Venus cloud map or solar photosphere texture is installed. Venus retains an identified visual approximation; the Sun uses the explicitly synthetic photosphere and corona model described above. Mercury's installed map is monochrome, and some Hubble composites are not calibrated natural color. See [ASSET_SOURCES.md](ASSET_SOURCES.md), [SOLAR_SOURCES.md](SOLAR_SOURCES.md), and the object information panel for provenance, transformations, and limitations.

Planets use lit, non-metallic materials, directional sunlight, and a dark night hemisphere. Earth has a separate cloud layer, night-side-only emission, and a sunlight-aware atmospheric limb approximation. Medium and High quality enable shadow maps, including alpha-tested cloud and ring shadows. These effects do not constitute eclipse prediction or full atmospheric radiative transfer.

## Architecture

```text
src/
  app/                  React application composition
  components/           Navigation, controls, search, and information panels
  data/                 Sourced catalog and imagery provenance manifest
  engine/               Direct Three.js scene and animation lifecycle
    coordinates/        Scientific/display coordinate separation and floating origin
    core/               Renderer and universe orchestration
    effects/            Efficient procedural starfield
    navigation/         Camera movement and cinematic travel
    terrain/            Cube-sphere quadtree, visibility, terrain meshes, and local rendering
    loaders/            Progressive scientific texture loading and resource leases
    objects/            Celestial geometry, PBR materials, and atmosphere/night shaders
    solar/              Photosphere, eclipse geometry, solar lighting, and exposure
  services/             Local and HTTP catalog adapters
    terrain/            Measured elevation provider, tile manifest, sampling, and cache
  stores/               Zustand selection, settings, and playback state
  styles/               Responsive interface styling
  types/                Catalog, API, terrain, lunar navigation, and solar telemetry contracts
```

React handles interface changes. The engine owns animation and rendering without a React update for every frame. Keep future scientific ephemeris calculations behind the data/coordinate interfaces instead of mixing them into display transforms.

Solar math, rendering, and exposure are separate modules. Global exposure preferences and bounded solar telemetry live in the rendering store rather than the lunar navigation store. Existing catalog and backend response contracts remain unchanged by the solar milestone.

The lunar pass reuses the main renderer and animation loop. Cube-sphere patches subdivide through a bounded quadtree, retain parents while detail loads, cull against the horizon/frustum, and use skirts across unequal LOD edges. Camera-relative tile geometry preserves local precision. The measured-height provider is separate from the catalog/API adapter, so lunar terrain works in both local and HTTP catalog modes without changing the backend contract.

## Rendering quality

The renderer uses one buffered point cloud for subtle synthetic stars and sphere levels of detail. Locally bundled WebP textures load progressively: a small map first, then the selected body's quality tier. Source resolution is never invented through upscaling. The quality presets are:

| Preset | Maximum pixel ratio | Base star count | Maximum surface width | Shadow map |
| ------ | ------------------: | --------------: | --------------------: | ---------: |
| Low    |                   1 |           1,000 |              1,024 px |        Off |
| Medium |                 1.5 |           1,600 |              2,048 px |   1,024 px |
| High   |                   2 |           2,400 |              4,096 px |   2,048 px |

Auto starts at Low for coarse-pointer devices and Medium otherwise, then can reduce pixel ratio when frame rate drops. The star-density setting multiplies the base count. Shared texture leases prevent duplicate loads and release GPU textures when no longer used; stale results cannot overwrite a newer selection, and results arriving after teardown are released. WebP reduces transferred file size; it is not a GPU-native compressed texture format. Expensive post-processing is not enabled. Actual performance depends on device, browser, viewport, and quality; these presets are not frame-rate guarantees.

Moon terrain also has quality-specific visible-patch, cached-geometry, segment-count, and per-frame build budgets. Mobile uses fewer concurrent data requests and a smaller data-cache budget. Lower quality changes rendered geometry and texture choices, not the provenance or claimed resolution of the observations. Teardown cancels requests and releases terrain buffers, textures, and resident grids.

## Backend integration

Start the separate `universal-cosmos-backend` service with its database migrated and seeded, following its README. It defaults to `http://localhost:4000`. Then create `.env.local` in this frontend repository:

```dotenv
VITE_DATA_SOURCE=http
VITE_API_BASE_URL=http://localhost:4000
```

Restart `npm run dev` after changing environment variables, and visit **`http://localhost:5173`**. The backend's default `FRONTEND_ORIGIN` allows that exact origin; `http://127.0.0.1:5173` is a different origin and is rejected. Development and production-preview scripts both use port 5173 with strict-port behavior instead of silently choosing a different port. Stop the development server before starting `npm run preview`; only one can occupy that port at a time.

Set `VITE_DATA_SOURCE=local` to use the offline catalog. `.env.example` documents the local default; `.env.local` is ignored by Git. Vite environment variables are public build-time configuration, so never put secrets in `VITE_*` values. `VITE_API_BASE_URL` is an origin or same-origin prefix; the adapter appends `/api/v1`.

The adapter consumes the backend's real `{ "success": true, "data": ..., "meta": ... }` response envelope and reports HTTP, network, and invalid-response errors. It maps supported backend slugs to the renderer's ten stable IDs, while retaining the backend UUIDs for object requests. The backend catalog may contain additional types, but this release only renders the supported Solar System bodies.

| Backend endpoint             | Frontend use                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/systems/solar`  | Load the stored hierarchy rooted at the Sun and map supported object identities.                                                                    |
| `GET /api/v1/search?q=Earth` | Search the backend for queries of at least two characters; shorter queries filter the loaded catalog because the backend requires 2–100 characters. |
| `GET /api/v1/objects/:uuid`  | Request an object's backend details using its UUID; HTTP 404 maps to `null`.                                                                        |
| `GET /api/v1/objects`        | Backend paginated catalog route; the initial explorer loads the complete supported hierarchy through `systems/solar` instead.                       |

Scientific ephemeris playback is not connected yet. The backend's `/api/v1/ephemeris/:uuid` takes `start`, `stop`, `step`, and `center` and returns an ICRF vector window with TDB dates. The frontend clock starts at current UTC, but its displayed body positions still follow chosen phases on simplified circular paths. Until time-scale conversion and vector interpolation are implemented, the frontend service returns `status: "unavailable"` for scientific ephemerides rather than sending an incompatible `?at=` request or treating circular display paths as measured positions. See the backend's [OpenAPI contract](http://localhost:4000/api/v1/docs/) for its full API.

## Validation and contribution

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Read [AGENTS.md](AGENTS.md) for project rules, [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for implementation history, and [SOLAR_SYSTEM_ROADMAP.md](SOLAR_SYSTEM_ROADMAP.md) for the current audit, coverage matrix, dataset gaps, and future milestones. Keep generated build output, dependencies, local environment files, and secrets out of Git. The owner has not chosen a project license; no license is implied by the absence of a `LICENSE` file.

Automated checks cover the backend contract, coordinate mapping, camera framing and mode transitions, texture lifecycle, terrain coordinates and LOD, shared tile edges, measured-height sampling, collision/navigation, resource cleanup, solar angular size and irradiance, eclipse geometry, and exposure adaptation. The existing live API checks cover the ten-object catalog, Earth details, search, and CORS. Final test/build results and actual solar, lunar, and responsive browser inspection status are recorded in [VALIDATION.md](VALIDATION.md); browser inspection does not establish performance or gesture correctness on every physical device.

Dependency audit on 2026-11-02: `npm audit --omit=dev` reported no vulnerabilities. The development toolchain reports 12 moderate entries originating from one [minimatch glob-pattern advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249). Its fix is in minimatch 11; the selected ESLint toolchain currently depends on minimatch 10. These packages are not part of the browser runtime. Do not run `npm audit fix --force` without reviewing its incompatible dependency changes.
