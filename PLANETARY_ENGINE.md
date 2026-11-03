# Planetary engine: Moon orbit-to-surface slice

## Audit before implementation — 2026-11-02

The existing application remains the host. React owns controls and panels; `UniverseEngine` owns one animation loop, Three.js scene, picking, CPU kilometer positions, floating origin, and camera commands. Exploration maps 10,000 km to one rendering unit; Overview has independent exaggerated geometry. `CameraController` uses OrbitControls and keyboard translation, while `FlightController` animates travel between bodies. Its surface exclusion distance and kilometer-scale near plane cannot support a meter-height observer.

Bodies currently use sphere LOD, PBR materials and progressively loaded, reference-counted scientific maps. Earth has an approximate limb, clouds and night emission. Moon color comes from the LROC CGI product; its existing 1440 × 720 LOLA normal source resolves approximately 7.6 km per post. That map cannot supply meter-scale terrain. Sun lighting follows modeled geometry, not ephemerides. Auto quality bounds pixel ratio; Low disables shadows. The service adapter is the sole catalog boundary and HTTP mode remains opt-in. The baseline passes 62 tests, typecheck, lint and build.

## Scope and sequence

Implement one real-data Moon vertical slice: start in lunar orbit, select the Taurus–Littrow region, stream terrain, descend, walk at an adjustable eye height, and return to orbit. Preserve object search, other planets, Overview, time, camera controls and settings. Gas/ice giants receive no solid surface. Their atmospheric exploration, other planets' terrain, and a full atmospheric scattering integrator are subsequent milestones, not claims of this release.

1. Define shared coordinates, provider contracts and budgets.
2. Prepare attributed lunar elevation and imagery tiles offline.
3. Implement cube-sphere quadtree selection and camera-relative terrain meshes.
4. Add descent, surface movement/collision and ascent using the same terrain samples.
5. Integrate accessible desktop/touch controls, scientific context and measured rendering telemetry.
6. Run automated gates, inspect actual browser output, and document remaining limits.

## Coordinate and precision contract

- Solar-system positions: CPU double-precision numbers in kilometers, existing modeled frame and illustrative UTC epoch. Preserve the current floating origin.
- Lunar data: planetocentric latitude and east-positive longitude in degrees, elevation in meters relative to **1,737,400 m**, the dataset datum. The rounded catalog mean radius is separate and must not replace this datum.
- Moon-fixed Cartesian meters: `x = r cos(lat) cos(lon)`, `y = r sin(lat)`, `z = -r cos(lat) sin(lon)`. This matches the existing Three.js globe texture orientation; +Y is north, positive longitude turns toward -Z.
- Rendering: subtract the observer's double-precision Moon-fixed position from tile centers on the CPU. Each GPU Float32 vertex is relative to its tile center. The near-surface camera remains at the local origin. No million-meter absolute vertex is submitted near the observer.
- Transform the Moon-fixed pose through the existing modeled lunar spin/obliquity only for distant-scene composition. These rotations are illustrative, not an IAU orientation ephemeris.

Cube faces use indices +X, -X, +Y, -Y, +Z, -Z. For face coordinates `u,v` in [-1,1], normalize respectively `(1,v,-u)`, `(-1,v,u)`, `(u,1,-v)`, `(u,-1,v)`, `(u,v,1)`, `(-u,v,-1)`. Tile x/y increase with u/v. Shared face boundaries derive from the same normalized directions.

## Data boundary and preprocessing

`TerrainDataProvider` is independent of the object catalog adapter. It exposes a typed manifest, asynchronous tile requests, a synchronous resident height query and cancellation/disposal. Tiles carry a regular elevation grid in meters, coverage/resolution metadata, and optional observational imagery. Manifests include source URLs, attribution, usage terms, projection, reference radius, coordinate convention, vertical units, coverage, missing-data representation, and error/accuracy qualifications.

The initial regional source is NASA LROC `NAC_DTM_APOLLO17` v1.9 (5 m sampling). Published relative precision is 2.55 m and LOLA comparison RMS is 1.77 m; neither is a blanket absolute accuracy guarantee. Preprocessing reads the original GeoTIFF projection and nodata tags and extracts bounded regional tiles. A low-resolution LOLA global base supplies distant terrain; fine observations are limited to the selected region. Original large rasters stay in ignored `.local/`; browsers request only small packaged tiles. No invented craters, rocks or high-frequency height noise are presented as observations. Missing fine data remains visibly identified and is not silently fabricated.

The color mosaic and DEM are distinct products. Source imagery may contain baked lighting and registration uncertainty. Unavailable high-resolution imagery must not be represented as available; coarse imagery can be used with its effective resolution disclosed.

Implemented storage separates raster tiles from rendering tiles: the provider streams packaged global LOLA, 40 m regional context and 5 m local grids into a bounded cache. Cube-quadtree meshes sample these resident grids; they are generated under a per-frame budget rather than downloaded as separate mesh files. The complete packaged elevation/imagery slice is approximately 6.52 MB. See `LUNAR_DATA.md` for exact coverage and preprocessing.

## Terrain rendering

Six cube-sphere roots subdivide by projected geometric error/distance with hysteresis. Selection is bounded by quality-specific tile counts and depth, with conservative frustum and horizon culling. A parent remains visible until needed children are resident; failed children retain a coarser source and a visible status. Shared sampling plus edge skirts hide cracks between unequal levels; skirts are a visual seam technique, not additional terrain observations. No detached patch may remove the underlying globe before coverage exists.

Tile centers are calculated in doubles. Geometry, normals, imagery and GPU materials have explicit ownership; use bounded concurrent requests and an LRU cache with byte/tile budgets. Dispose evicted buffers/textures and cancel requests on exit or teardown. Low quality reduces tile budget, mesh resolution, imagery resolution and shadows. Adaptive pixel ratio remains available. Level subdivision cannot imply scientific detail finer than its source.

Low/Medium/High use 72/120/192 selected tiles and 160/260/400 resident mesh limits, with 16/24/32 segments per side. All preserve an underfoot path to level 16. Auto can reduce terrain and global imagery budgets when sampled frame rate falls below 28 fps; the regional orthophoto has one shared source resolution. A finer geometric grid interpolates the native 5 m DEM and adds no measured detail.

## Navigation and composition

A lunar navigation controller owns Moon-fixed observer position, heading/pitch, a smooth orbit-to-region descent, surface motion and ascent. The controller uses resident elevation for collision. Descent waits for the landing area's measured heights; unavailable data prevents landing and exposes retry/return controls. Movement follows the spherical tangent plane, clamps the observer above the rendered terrain, clears held input on blur, and uses a configurable meter eye height. Walking does not integrate orbital motion into a local position.

Collision uses the greater of the resident DEM height and the current visible triangle height, plus observer eye height. A second correction after refinement prevents a newly detailed triangle from rising through the observer. This can temporarily place the observer higher than the requested eye height relative to the source DEM; it does not alter the measured elevation.

The existing renderer is reused: render distant objects/stars with the existing solar-system camera, clear depth, then render the Moon terrain using the camera-relative meter camera. Hide the ordinary lunar sphere while the terrain pass owns it. Main orbit controls and object picking are suspended during local descent/walking; search and return-to-orbit remain available. State changes and telemetry cross the React bridge at command/400 ms cadence, never each frame.

Desktop uses pointer look and WASD; touch uses explicit movement controls plus viewport drag. All actions have button/keyboard alternatives, visible focus, safe pointer-release handling, and compact layouts. UI reports latitude/longitude, elevation, height above ground, phase, source resolution and loading/coverage limits.

## Light and future atmosphere boundary

Moon is airless: black sky, no blue fog, no atmospheric extinction or scattering. Surface sunlight direction is transformed from modeled Sun–Moon geometry into Moon-fixed coordinates; it is not a fixed decorative key light. Use nonmetallic rough terrain, bounded shadow maps and exposure expressed as exposure-value compensation. At roughly 1 AU sunlight strength is the baseline; geometric inverse-square scaling and per-body attenuation can be extended without baking them into terrain data.

The Moon slice implements inverse-square irradiance from the modeled Sun–Moon distance. Exposure is relative EV compensation, not a calibrated photographic exposure. Shadows are disabled at Low quality and above 20 km; near-surface shadow bias scales with texel size. Atmospheric attenuation remains a future per-body extension.

A future `AtmosphereProfile` will define reference radius/top altitude, exponential Rayleigh/Mie scale heights and spectral coefficients, absorption and aerosol anisotropy. A ground-to-space optical-depth integrator/LUT must use these parameters with explicit approximations. Moon/Mercury have no substantial scattering profile; Mars needs dust-dominated Mie behavior and Venus dense-cloud multiple scattering. Generic colored fog is not an acceptable substitute. Those atmospheres are outside this Moon slice.

## Validation criteria

Test face boundaries and latitude/longitude round trips, datum/height scaling, centimeter-scale camera-relative subtraction, quadtree budget and hysteresis, seam topology, conservative culling, tile failure/eviction/disposal, terrain sampling and collision, descent/ascent continuity, and lighting transforms. Preserve all previous tests. Each implementation milestone runs typecheck, lint, tests and production build. Browser screenshots must show lunar orbit, regional descent, ground horizon/black sky, local navigation and return; responsive emulation is recorded separately from physical mobile performance. See `VALIDATION.md` for actual results rather than treating this plan as completed validation.
