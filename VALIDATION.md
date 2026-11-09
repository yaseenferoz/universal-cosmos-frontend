# Validation record

Implementation session: 2026-11-02. Platform: Windows, Node.js 24.15.0, npm 11.12.1.

## Automated checks

| Check                       | Result                                                                           |
| --------------------------- | -------------------------------------------------------------------------------- |
| `npm run typecheck`         | Pass: strict TypeScript                                                          |
| `npm run lint`              | Pass: ESLint and React hooks rules                                               |
| `npm test`                  | Pass: 169 tests in 29 files (final Sun milestone gate)                           |
| `npm run build`             | Pass: production output; engine and renderer dependencies split into lazy chunks |
| Local Vite HTTP response    | 200 at `http://localhost:5173/`                                                  |
| Production dependency audit | No reported vulnerabilities                                                      |

## Solar rendering correction — 3 November 2026

The correction gate passed after the HDR, exposure, illumination, camera, and diagnostics changes: `npm run typecheck`, `npm run lint`, `npm test` (**202 tests in 35 files**), and `npm run build`. The latter produced the expected lazy engine and Three.js chunks; no runtime dependency was added.

Chrome inspection at `http://localhost:5173/` confirmed the active GPU scene, populated rendering diagnostics, and a working **Go to Day Side** control. Before the action, the Moon diagnostics reported a 149,840,910 km Sun-center distance, 31.923 arcmin apparent solar diameter, and a 54.94 degree phase (78.7% lit); the action visibly moved the view to the bright hemisphere. Diagnostics report the camera, modeled object position, directions, FOV, phase, and effective exposure at the existing 400 ms telemetry cadence. The panel remains responsive after a full browser reload.

The correction also fixed a residual OrbitControls-damping path that could rotate a newly focused world away from its requested hemisphere. The renderer now composes the world and lunar pass in a bounded linear HDR target before one output transform when supported; it falls back explicitly to direct output when a floating-point target is unavailable. The optional solar-detail filter is separate from ordinary automatic exposure, and the bounded glare control is an optical display approximation rather than a change to the Sun's physical disk.

During the gate, an already-installed `node_modules/typescript/lib/typescript.js` was found corrupted. It was restored from the lockfile-verified TypeScript 5.9.3 package; no package manifest or lockfile changed. The repair is local tooling state, not a repository artifact.

Tests cover coordinate hierarchies and reference epochs, orbital periodicity, floating-origin invariants, quality bounds, free-flight dolly continuation, focus-loss keyboard cleanup, camera-flight completion and cancellation, catalog/search behavior, adapter response validation, abort/error handling, incomplete remote systems, UTC display formatting, and independent selection/time/reset commands.

Visual-correction tests additionally protect uniform kilometer/radius ratios, independent overview scaling, portrait camera fitting, mode-specific resets, last-target restoration, night-side emission and atmosphere bounds, linear versus sRGB texture handling, request sharing, late-completion disposal, and timed-out texture fetches. Integration gates passed at 54, 58 and 59 tests as the Earth/material, coordinate/mode, and remaining-asset/loading changes landed. The final gate passed 62 tests including tilted-ring viewing geometry and repeated missing-imagery reporting. These were combined integration gates, not ten isolated browser benchmarks.

All 36 asset-variant references were decoded and checked against their declared dimensions. The final inventory contains 12 source/derived layers and 24 WebP files totaling approximately 7.6 MB. No source raster is upscaled to imply extra detail. See `ASSET_SOURCES.md` for source-specific pixel checks and exclusions.

Independent source review resulted in fixes for interrupted gestures, frame-loop failure handling, GPU context loss, premature camera distance constraints, initial camera placement, free-flight limits, dialog keyboard focus, invalid environment configuration, and incomplete backend catalogs.

## Running backend integration

On 2026-11-02, connected the frontend to the running backend at `http://localhost:4000` using the ignored `.env.local`. Dev and preview scripts use `http://localhost:5173` with a strict port to match the backend's exact allowed origin. The frontend dev server was left running at the user's request.

A live smoke test exercised the actual TypeScript HTTP adapter with an `Origin: http://localhost:5173` header. Solar System loading, Earth details by backend UUID, and Earth search returned HTTP 200 with the matching CORS header. The adapter returned all ten supported bodies; empty and single-character queries filtered that fetched catalog without invalid backend requests. Vite's served configuration was checked to contain HTTP mode and the correct backend URL.

Regression coverage includes the actual success/data/meta envelopes, UUID and parent consistency, bounded paginated search, short queries, missing bodies, error responses, independent cancellation, and preserving reference-data provenance. The API currently supplies identity records; physical/display values remain explicitly attributed bundled references. No backend files or database records were changed. Scientific TDB ephemeris playback remains deferred.

## Browser inspection

During the visual-correction session, native Windows control of Chrome became available. Actual GPU rendering was inspected at `http://localhost:5173`, with the running HTTP backend enabled. This supersedes the earlier backend-only session's unavailable-browser limitation.

- Inspected the original cartoon-style baseline and the corrected Earth closeup, cloud layer, thin limb, illuminated hemisphere, and dark space. Checked the final ImageBitmap loader orientation against recognizable Asia/Australia geography.
- Inspected the LRO Moon closeup and Hubble Jupiter map. Verified overview displays all major destinations with compressed-distance/exaggerated-size labeling, and destination selection returns to Exploration.
- Exercised backend Saturn search and Enter-to-travel. Inspected Saturn's partial map, neutral missing coverage, and loaded radial ring texture; the first view exposed a nearly edge-on ring composition. Rechecked the corrected 25-degree ring-plane view through overview-to-Saturn travel in the browser; the radial rings and gaps were clearly visible.
- Inspected Chrome responsive emulation at 400 × 844, 400 × 712, 320 × 712 and 740 × 400 landscape. Earth remained fully framed. Opened and dismissed the mobile information bottom sheet while essential controls remained visible. A 400 × 307 short-window check exposed crowded header controls, prompting a dedicated narrow/short layout rule.
- Switched Auto, Low, Medium and High through Settings in the live desktop browser. Sampled telemetry showed 60 fps for Auto/Low/Medium and 55 fps for High with the settings panel open at a roughly 1180 × 694 CSS-pixel viewport. These are brief observations on this machine, not sustained benchmarks or mobile performance claims. Restored Auto afterward.
- Paused simulation and dragged the camera around Earth. Inspected the VIIRS lights across the Americas on the dark hemisphere and their absence on the sunlit surface. Reset returned to the orbital composition; playback was resumed.

## Moon surface milestone — 2026-11-02

The final integrated Moon implementation passed `npm run typecheck`, `npm run lint`, `npm test` (106 tests in 22 files), and `npm run build`. No runtime dependency was added. The earlier 62-test visual-correction gate above remains a historical baseline.

New coverage protects lunar datum and coordinate conversion, cube-face boundaries, camera-relative centimeter precision, outward mesh winding, unequal-LOD skirts, horizon/frustum selection, budgets and hysteresis, depth-16 underfoot refinement, visible-triangle collision, parent fallback, eviction, asynchronous disposal, and shadow-pass exclusion of seam skirts. Provider tests exercise bilinear interpolation, missing data, concurrency, cancellation, byte budgets and the native-fetch receiver regression. Packaged data tests verify tile shapes, shared edges and the landing datum. Navigation tests exercise descent/ascent, tangent movement, eye height, missing fine coverage, input release and collision correction after refinement. Sun-frame and inverse-square tests protect the lighting transform.

Actual Chrome screenshots were inspected with the HTTP backend enabled:

- Lunar orbit starts with the sourced globe and the Taurus–Littrow descent action.
- Descent reaches the prepared region and settles at 20.1908° N, 30.7717° E, approximately −2627.0 m datum elevation and 1.7 m observer height. Intermediate readouts switch from coarse source spacing to 5 m; the settled data cache is about 6.0 MiB.
- Ground screenshots show measured hills and black sky. Pointer drag changes the look direction. Changing eye height to 2.5 m updates ground clearance. No invented rocks or footprints appear.
- The final arrival pitch faces slightly above the local tangent so the regional hills and black sky are both visible without a first drag. Medium quality was selected on the surface and inspected as additional meshes refined. Auto sampled 60 fps on this machine with the settings panel open; this is a brief observation, not a sustained benchmark.
- Inspected the lunar controls at 400 × 712 responsive emulation, including the surface movement pad, eye-height selector, return action and collapsible telemetry panel. Collapsing the panel leaves the viewport and persistent return control available.
- Completed an uninterrupted descent and return at 320 × 568. The compact panel scrolls independently above the movement pad; the persistent return button remains accessible. After ascent, the Moon globe, descent action and Orbit camera controls are restored.
- Browser testing caught an illegal native-fetch receiver on first descent; it was fixed and covered by a regression test. Orbital shadow acne prompted an altitude limit and meter-scaled bias. Seam skirts are now excluded from shadow casting while remaining in the color pass.

The detailed terrain is one regional slice, not global five-meter Moon coverage. Native sampling is 5 m; finer mesh spacing is interpolation. Stereo source errors and orthophoto baked illumination remain visible limitations. Low/Auto-mobile budgets preserve underfoot refinement and disable shadow maps; physical-device thermal, sustained frame-time and GPU-memory benchmarks remain unperformed. Lifecycle/cache budgets and disposal are covered by tests, not a claim of a measured long-duration GPU profile. See `LUNAR_DATA.md` and `PLANETARY_ENGINE.md`.

## Sun milestone — 2026-11-02

Completed the implementation audit and Milestone 1 of the Solar System upgrade. The final code gate passed `npm run typecheck`, `npm run lint`, `npm test` (169 tests in 29 files), and `npm run build`. No runtime dependency was added. The 106-test Moon gate above remains the prior milestone's historical result.

New coverage protects physical angular diameter, inverse-square irradiance through the near-Sun range, finite foreground depth, partial/total/annular and overlapping occultation, frame-rate-independent exposure, manual/automatic transitions, subpixel optical metering, quality budgets and disposal, per-fragment lighting hooks, floating-origin invariance, local lunar horizon/illumination separation, and Sun distance preservation across portrait/landscape resize. These tests exercise geometry, state and lifecycle; they are not a substitute for GPU inspection.

Actual Chrome rendering was inspected with the HTTP backend enabled:

- Sun search and travel opened the dedicated white photosphere. At the default close view, telemetry reported 0.0191 AU and 1687.20 arcminutes. Limb darkening was visible; unresolved granulation faded at full-disk scale. At approximately 0.0050 AU, procedural cells became visible. Lowering exposure made them clearer. These cells are an illustrative scale reconstruction, not observed solar imagery.
- Mean-distance controls reported Mercury 0.3870 AU / 82.61 arcminutes / 9,085.6 W/m²; Earth 1.0000 AU / 31.97 arcminutes / 1,361 W/m²; Jupiter 5.2040 AU / 6.14 arcminutes / 50.3 W/m²; and Neptune 30.1809 AU / 1.06 arcminutes / 1.5 W/m². These are the catalog's mean-distance presets, not date-specific planetary locations. The shrinking rendered disk and distant optical point were inspected.
- Changed exposure compensation to −2 EV and switched to manual: the current exposure was retained (about −17.6 EV). Restored automatic exposure with zero compensation. Switched High, Low and Auto in Settings; the scene remained available. Unit tests cover the Medium budget and resource replacement as well. Brief frame-rate samples are not a sustained benchmark.
- Inspected 320 × 568 and 400 × 712 responsive emulation. Solar telemetry scrolls independently, the distance selector works, and collapsing the panel exposes the viewport. The distant Sun remained a small visible point with the panel collapsed. Sun camera distance is retained across resize; its disk can consequently extend beyond a narrow viewport at a close approach. Reset/presets remain available.
- Used a local, clearly labeled synthetic-alignment fixture importing the production `SunRenderer`, `SolarExposure`, and visibility math. At 1 AU, the full disk and a 49.54%-visible partial crescent rendered under the same −16 EV filter. At total occultation, +2 EV exposed the faint analytic corona around a black foreground sphere, with no solar disk or halo leaking through its center. A separate 30.1-AU panel rendered the unresolved point with a physical diameter of 0.135 drawing-buffer pixels and automatic exposure near −9.13 EV. These artificial alignments validate the renderer, not real eclipse dates or a catalog-driven eclipse event.
- Rechecked the Moon's orbit-to-ground-to-orbit path with the shared solar lighting. Descent reached 20.1908° N, 30.7717° E, about −2627.0 m datum elevation and 1.7 m eye height. Measured hills and black sky remained visible; the source-spacing readout was 5 m and the cache about 6.0 MiB. Return restored the orbit camera and descent action. Earth's globe and other existing planetary materials were also inspected during integration; this was not a new exhaustive eight-planet benchmark.
- Rechecked frontend and backend HTTP responses: both returned 200, and the Solar System endpoint returned `Access-Control-Allow-Origin: http://localhost:5173`. The ignored local environment remains connected to the running backend.

Visual/review defects fixed during this milestone:

- The first distant-Sun check was excessively dim because automatic solar-target metering assumed a resolved photosphere at every distance. Metering now accounts for the same bounded two-pixel optical sample as the renderer, preserving radius and emitted flux; the corrected distant point was inspected again.
- Resize previously changed the physical distance of a selected Sun viewpoint. Sun views now retain distance while projection/composition update; ordinary world fitting is preserved and covered by regression tests.
- A near-photosphere view washed out overlay text. Solar observation now provides dark backing for the header and viewport annotations.
- Camera occultation could incorrectly dim the whole lunar terrain pass, and a below-mean-radius valley could be treated as an observer inside the Moon. External-body terrain attenuation and the sampled local horizon are now separate. Early ascent retains that local datum, and changed eclipse illumination applies before the current terrain frame renders.

Screenshots are saved under the ignored local directory `.local/qa/solar/`: `photosphere.png`, `granulation-manual.png`, `mobile-320.png`, `mobile-400.png`, `neptune-mobile.png`, `neptune-mobile-collapsed.png`, `eclipse-top.png`, `eclipse-bottom.png`, `lunar-surface.png`, and `lunar-return.png`. `neptune.png` records the earlier dim-point defect. The reproducible local fixture is `.local/qa/solar/eclipse.html`, served by Vite at `/.local/qa/solar/eclipse.html`; neither the fixture nor screenshots are production assets.

Remaining limits: the GPU eclipse check uses controlled synthetic alignments, not a real-date ephemeris or an end-to-end catalog alignment. Receiving-body eclipse shading has math/shader integration coverage but was not visually compared with an observational eclipse dataset. Corona structure, static granulation, ambient illumination and exposure are qualified display models. Simultaneous occluders differ between the CPU visibility union and the bounded material shader; detailed terrain horizons, rings and atmospheres are not included in analytic solar visibility. Physical-mobile performance, multi-touch and sustained GPU memory tests remain unperformed. See `SOLAR_SOURCES.md` for formulas, authoritative references and approximation boundaries. Catalog expansion and later descent/environment work remain Milestones 2–9 in `SOLAR_SYSTEM_ROADMAP.md`.

## Verification limits (all milestones)

The 9 November 2026 clock correction starts playback at current UTC, adds a Real time speed that resynchronizes after a hidden tab resumes, and makes Reset time return to current UTC. It also labels the date as current or simulated UTC while retaining the explicit modeled-orbit warning; a compact UTC time remains visible in the narrow-screen toolbar. Pure clock tests cover UTC conversion, real-time resynchronization, pausing, and accelerated playback. Nebulae and galaxies remain planned because no observed catalog or volume data is installed; the navigation now says "planned" directly. This clock change does not turn modeled circular paths into ephemerides. `npm run typecheck`, `npm run lint`, `npm test` (217 tests in 38 files), and `npm run build` passed.

A further user screenshot on 9 November 2026 exposed overstrong radial streaks, lens reflections drawn over Earth's opaque disk, and a large default planetary-descent panel. The correction reduces ray and veil intensity, depth-tests the reflections at the Sun's projected distance, and starts the planetary panel collapsed. The dark Earth in that image is a night-side view with visible city lights; a front-lit globe and an in-frame Sun cannot be obtained from the same exterior camera position without changing viewing geometry. The updated optical result still needs a fresh GPU screenshot.

The SpaceEngine side-by-side screenshot supplied on 9 November 2026 showed a wider blue optical glow, numerous soft rays, lens reflections, and a denser star field than the local view. In response, the analytic solar glare now has a broader quality-bounded screen footprint and mixed angular lobes; one small screen-space point cloud adds colored lens reflections at Medium and High only. The illustrative star draw range increased within the existing fixed geometry allocation. `npm run typecheck`, `npm run lint`, `npm test` (215 tests in 37 files), and `npm run build` passed. The browser access host remained unavailable, so the revised GPU image and mobile frame time still need direct inspection; no observational fidelity claim is made for these optics.

On 9 November 2026, a follow-up visual pass changed the opening focus from the Moon to Earth, raised the visibility of the illustrative background stars, softened the solar glare spokes into low-contrast directional scatter, and reorganized narrow-screen controls. Lunar and solar detail panels start collapsed at widths up to 720 px; their controls remain available when expanded. The gate passed `npm run typecheck`, `npm run lint`, `npm test` (215 tests in 37 files), and `npm run build`. The browser access host remained unavailable, so the user's supplied screenshot guided the changes and new desktop/mobile GPU screenshots remain to be inspected.

The 9 November 2026 solar optics refinement added bounded eight-direction glare streaks and a faint wide veil to the existing analytic halo. The optical effect remains separate from the physical solar disk and the approximate corona. `npm run typecheck`, `npm run lint`, `npm test` (215 tests in 37 files), and `npm run build` passed. The connected browser host was unavailable during this session, so a new GPU screenshot comparison with the supplied SpaceEngine reference remains outstanding.

Responsive emulation runs on the desktop GPU; it is not a physical phone benchmark. Physical multi-touch gestures, low-end mobile thermals, sustained memory/frame-time profiling, and GPU context loss were not exercised on real devices. Automated math/lifecycle tests do not replace those checks. Frame rate is available in Settings as sampled telemetry, not a performance guarantee.

Source maps contain historical observations and documented processing; they are not live spacecraft views. The coordinate phases, lighting/exposure, constant roughness, atmospheric limb, cloud opacity and ring transparency remain approximations. Ring/cloud shadow maps are approximate and are disabled at Low quality. Backend ephemeris integration and catalogs beyond the Solar System remain explicitly deferred.

## 9 November 2026: local moons and asteroid catalog

The local service now exposes 23 named bodies: the baseline ten, ten additional moons, and Ceres, Vesta, and Bennu. Nine added moons use downloaded JPL/USGS historical maps; Io, Titania, and Triton mask black no-data pixels. Source alpha coverage at 1440 x 720 is approximately 93.8%, 37.8%, and 20.3% respectively. The latter two remain visibly incomplete. Titan and the three asteroid/dwarf-planet bodies use explicitly labeled plain-color markers. Saturn's missing Hubble regions now use a warm uniform placeholder instead of a stark gray one; no observed data were invented. The Overview asteroid-belt points are illustrative, not individual catalog records or measured positions. The opt-in HTTP adapter retains its ten supported backend identities.

`npm run typecheck`, `npm run lint`, `npm test` (217 tests in 38 files), and `npm run build` passed. Vite returned HTTP 200 for a new local moon texture. The browser GPU view was not available for a new screenshot in this pass, so final rendered appearance and mobile frame time still need direct inspection.

## 9 November 2026: landing sky repair

The analytic atmospheric sphere now follows the meter-scale landing camera; previously it stayed at the planet center and could not cover the viewport. A NASA SVS J2000 celestial star map is stored locally in 2048 and 4096 WebP tiers. The engine centers it on the global camera during landing so physical Sun and planet renderers remain in front, then overlays analytic haze and local terrain. Daylight reduces the background; dense cloud-level haze obscures it. The source map is catalog-derived celestial sky data, while its alignment to modeled planetary axes and the day/night extinction are approximations. No individual three-dimensional nebula field is installed.

Both local texture URLs returned HTTP 200. A headless Chrome smoke run loaded the application UI without page errors, but its WebGL canvas was black, so that run cannot verify final GPU appearance. `npm run typecheck`, `npm run lint`, `npm test` (220 tests in 40 files), and `npm run build` passed.

## 9 November 2026: night-sky sharpness

The user's Earth surface screenshot and a live desktop inspection showed that individual stars in the stretched SVS sky texture appeared as soft blobs. The landing sky now draws 24,000 bright peaks extracted from the same NASA map as bounded screen-space points. A median-filtered copy of that map supplies broad Milky Way structure without enlarged star disks. This is a visual reconstruction from map pixels, not calibrated apparent magnitudes or local celestial coordinates. The binary source layer is 672,000 bytes; all point directions are finite and normalized. The local asset URL returned HTTP 200.

`npm run typecheck`, `npm run lint`, `npm test` (222 tests in 41 files), and `npm run build` passed. A second live screenshot after the final asset regeneration could not be captured because Windows Computer Use stopped when it could not verify the browser URL; final visual appearance still needs a browser refresh and inspection.

## 9 November 2026: visible Milky Way structure

The median-filtered 2012 star map did not retain enough diffuse structure to resemble the user's SpaceEngine reference. The orbit and landing background now uses NASA SVS's separate 2020 Milky Way layer in the same J2000 celestial projection, converted from its linear EXR to sRGB WebP. Its dark lanes and broad galactic light remain visible while bright stars use the existing small point layer. This is a static sky image with illustrative exposure, not volumetric nebula gas or calibrated local sky timing. The source asset is kept in ignored `.local/asset-source` and the shipped WebP tiers are 365 KB and 2.34 MB.

The background also blends a restrained red layer from NASA LAMBDA's measured Finkbeiner H-alpha survey (version 1.1, nested HEALPix Nside 512). The asset preparation reprojects Galactic survey coordinates to the J2000 celestial image, thresholds the faint signal, and softly scales it for visibility. The final 2048 WebP was inspected as a whole-sky image: gas regions follow the galactic band and the dust lanes remain distinguishable. H-alpha visibility is enhanced and is not a naked-eye or photometric prediction. Browser-based WebGL capture was unavailable because the browser access host did not connect; the live camera composition still needs direct visual inspection.

The local 2048 texture URL returned HTTP 200 (360,066 bytes). The point layer still contains 24,000 finite unit directions. `npm run typecheck`, `npm run lint`, `npm test` (222 tests in 41 files), and `npm run build` passed after the final sky changes.

The star-point layer now renders at far depth with depth testing, so opaque planet and moon disks occlude it. The same four required checks passed after this occlusion fix.

## 9 November 2026: overbright soft sky correction

The user's Moon-orbit screenshot showed the 2020 diffuse map filling the viewport as an overbright, enlarged soft texture. The default desktop view had been selecting the 2048-pixel tier even though a 4096-pixel tier existed. Desktop automatic, medium, and high quality now use the 4096-pixel tier; mobile and low quality keep the bounded 2048-pixel tier. The diffuse shader compresses bright source values and lowers its strength so the dark sky and sharp point stars remain dominant. The prepared H-alpha layer also uses less spatial smoothing. A native browser inspection after the shader change showed a darker, less intrusive background around the Moon, although a direct match to the user's exact camera orientation was unavailable.

The new 4096 asset URL returned HTTP 200. `npm run typecheck`, `npm run lint`, `npm test` (223 tests in 41 files), and `npm run build` passed.

## Dependency review

The locked runtime dependencies have no reported audit findings. Twelve moderate development-tool entries stem from the same minimatch glob-pattern advisory; they are not browser-runtime code. The current ESLint toolchain requires an older major than the patched minimatch major. This is documented in README; no force downgrade or unverified transitive override was applied.
