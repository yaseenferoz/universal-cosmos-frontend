# Implementation plan

The repository was empty except for Git metadata when inspected on 2026-11-02.

## Architecture

- `app/`, `components/`, and `styles/`: responsive React shell, exploration rail, information, dialogs, and controls.
- `engine/`: direct Three.js scene, sourced imagery loading, PBR celestial bodies, subtle procedural starfield, navigation, floating origin, picking, rendering quality, and the Moon cube-sphere terrain pass.
- `data/` and `types/`: sourced catalog with physical units, separate visualization parameters, and service contracts.
- `services/`: interchangeable local and HTTP catalog adapters, including explicit ephemeris limitations; a separate measured-terrain provider supplies regional tiles, sampling, and caching.
- `stores/`: Zustand settings, selection, playback, and coarse engine telemetry. Per-frame animation stays outside React.
- `tests/`: deterministic coordinate, orbital, search, state, and quality checks.

## Milestones and verification gates

1. Vite/React/TypeScript setup, accessible responsive shell, full-screen canvas. Run typecheck, lint, tests, and production build.
2. Efficient procedural starfield, Sun, all eight planets, Moon, rings, atmospheres, and simplified orbital/rotation animation. Repeat checks.
3. Mouse/keyboard navigation, camera flight, picking, information, and local search. Repeat checks.
4. Touch gestures, collapsible panels, portrait/landscape layouts, bounded device pixel ratio. Repeat checks and inspect browser layouts.
5. Playback, time reset/speed, settings, quality presets, and local/HTTP service abstraction. Repeat checks.
6. Integration regression review, browser interaction checks where available, production build, and README documenting controls, scientific limitations, architecture, and next steps.

Parallel work is bounded by file ownership: engine; catalog/types/services; application UI/configuration. Integration is validated in milestone order even when supporting modules are prepared concurrently.

## Scientific scope

This is an interactive educational visualization, not a navigation instrument. Physical values cite NASA sources. Solar System exploration uses a uniform 10,000 km per render unit for modeled distances and physical radii; only Solar System Overview uses compressed orbits and exaggerated bodies. The Moon surface pass uses local meters and a separate 1,737,400 m terrain datum. Circular motion, chosen initial phases, approximate atmospheric/material effects, and the synthetic star background are disclosed. Verified planetary imagery and missing coverage are documented in [ASSET_SOURCES.md](ASSET_SOURCES.md); measured lunar terrain and its limitations are documented in [LUNAR_DATA.md](LUNAR_DATA.md).

## Implementation outcome

- Milestone 1: implemented the Vite/React/TypeScript shell and direct Three.js canvas.
- Milestone 2: implemented all ten catalog bodies, starfield, rings, atmospheres, orbital paths, and animation. The original procedural planetary surfaces were subsequently replaced by the scientific imagery correction below.
- Milestone 3: implemented navigation, picking, flights, information, local search, and keyboard shortcuts.
- Milestone 4: implemented touch handling, responsive panels, narrow-screen controls, LOD, and adaptive pixel ratio. Real device validation remains outstanding.
- Milestone 5: implemented time controls, all quality settings, and validated local/HTTP service adapters.
- Milestone 6: completed automated checks, independent code review, regression fixes, dependency review, formatting, and documentation. Initial browser QA was blocked; browser inspection became available during the visual correction. Current verification scope is recorded in `VALIDATION.md`.

Verification gates run during scaffold, renderer/UI integration, navigation review, visual correction, and final polish. See `VALIDATION.md` for the latest suite count and practical limits.

## Scientific visual correction

The audit identified invented continent shapes, procedural cloud/band patterns, excessive ambient light, compressed coordinates shared by closeups, and a permanently crowded HUD as the causes of the previous appearance.

1. **Physical orbital composition:** Exploration is the default. It uses physical radius/distance ratios, CPU kilometer coordinates, camera-relative transforms, portrait-aware framing, and the existing floating-origin strategy. The visual correction initially opened at Earth; the Moon vertical slice below now opens in lunar orbit. Overview remains an explicit, separately labeled mode.
2. **Earth imagery and illumination:** Install verified Blue Marble day/cloud maps and Black Marble night lights. Use directional sunlight, a day/night terminator, a separate cloud shell, night-side emission, and a documented atmospheric-limb approximation.
3. **Moon imagery:** Install the LRO color product and a normal map derived from measured LOLA elevation. Preserve its source-specific processing and resolution limits.
4. **Minimal HUD:** Collapse navigation and detailed information by default, remove the destination strip from exploration, retain essential controls, and use a compact mobile information sheet. Reset restores the current mode and last target.
5. **Other bodies and rings:** Use MESSENGER, Viking, Hubble, and Cassini products. Keep unobserved coverage neutral; explicitly report unavailable Venus and solar maps. Record every asset, transform, attribution, usage term, and resolution.
6. **Sky and quality:** Keep the background predominantly black, render a subtle synthetic starfield before planetary geometry, load small textures before larger variants, bound pixel ratio and shadow resolution, and release asynchronous/GPU resources correctly.
7. **Verification:** Run TypeScript, lint, tests, and production builds during integration. Inspect actual browser rendering before making visual-quality claims. Treat real-device performance and physical touch testing separately from CPU regression tests.

Existing backend configuration, UUID catalog/search integration, playback, targeting, keyboard controls, and touch navigation remain part of the application. Scientific ephemeris playback and a full star/deep-space catalog remain deferred.

## Moon orbit-to-surface vertical slice

The existing application was audited before implementation, and [PLANETARY_ENGINE.md](PLANETARY_ENGINE.md) records the coordinate, data, renderer, navigation, and future-atmosphere architecture. This milestone adds one measured lunar exploration region while preserving the Solar System application and its backend boundary.

Implemented scope:

1. **Moon startup and entry:** Open in lunar orbit. The Taurus–Littrow card starts data preparation, regional approach, and descent; loading can be canceled or retried after a failure.
2. **Observed terrain package:** Use the LROC Apollo 17 stereo DTM and registered orthophoto at native 5 m sampling within a 2.56 km square centered near 20.1908° N, 30.7717° E. A 20.48 km context square uses 40 m posts, with coarse global LOLA elevations beyond it. The packaged data is about 6.52 MB; large source rasters stay outside the browser and repository outputs. Provenance, missing data, source accuracy qualifications, and reproduction are recorded in [LUNAR_DATA.md](LUNAR_DATA.md).
3. **Precision and rendering:** Use a 1,737,400 m datum, CPU Moon-fixed doubles, observer-relative tile centers, and local GPU vertices. Cube-sphere quadtree patches have distance-dependent LOD, bounded construction/cache budgets, parent retention, frustum/horizon culling, and edge skirts. Source resolution remains distinct from interpolated geometry detail.
4. **Data provider:** Stream bounded Float32 grids through a typed terrain interface with request deduplication, concurrency limits, source/unit validation, LRU eviction, cancellation, and disposal. Missing fine measurements fall back to identified coarse observations. Explicit dataset-edge blends prevent abrupt transitions without adding fictional features.
5. **Ground navigation:** Approach and descend smoothly, maintain an adjustable observer height over rendered terrain, walk in a local tangent frame within prepared coverage, and ascend back to orbit. Desktop drag/WASD and accessible on-screen movement buttons share the same controls and telemetry.
6. **Lunar light and sky:** Keep an airless black sky. Transform sunlight from the modeled Sun–Moon geometry and retain quality-dependent shadows/exposure. The orbital model remains illustrative, and source orthophoto shadows are baked into the observations.
7. **Integration and lifecycle:** Reuse the application's renderer and animation loop, suspend conflicting orbital controls during local flight, preserve search and other destinations, update UI telemetry at a bounded cadence, and release terrain data/GPU/input resources on exit.

Automated validation covers coordinate round trips, datum/height units, tile-edge continuity, quadtree stability/budgets, terrain sampling, collision and navigation, request failures, and teardown. Final suite/build results and actual browser verification are maintained in [VALIDATION.md](VALIDATION.md), including the distinction between responsive emulation and physical-device testing.

Deferred scope remains explicit: arbitrary lunar landing locations, other rocky bodies' terrain, individual rocks/footprints, scientific ephemerides, gas/ice-giant atmospheric exploration, and a calibrated Rayleigh/Mie or multiple-scattering atmosphere implementation. Existing planetary limb effects are approximations. Gas and ice giants receive no solid surface. This milestone establishes the Moon vertical slice rather than claiming a complete all-planet surface engine.

## Solar System upgrade: audit and Milestone 1

The new upgrade has its own milestone sequence, separate from the original application milestones above. [SOLAR_SYSTEM_ROADMAP.md](SOLAR_SYSTEM_ROADMAP.md) records the implementation audit, ten-body coverage matrix, missing scientific datasets, compatible provider/API proposals, and staged release plan. The current implementation scope is the audit and **Milestone 1: Sun rendering, apparent size, and exposure**. Milestones 2–9 remain future work; this change does not expand the catalog or complete the all-planet descent brief.

Implemented scope:

1. **Dedicated Sun renderer:** Preserve the nominal 695,700 km physical radius and correct angular-size geometry. Render a near-white HDR photosphere with approximate limb darkening and resolution-aware synthetic granulation. An optional faint analytic corona follows exposure and foreground occultation; Low quality omits it. No observed solar-activity texture, prominence dataset, or current sunspot map is installed. [SOLAR_SOURCES.md](SOLAR_SOURCES.md) records the authoritative facts and explicit display approximations.
2. **Shared solar math and lighting:** Use physical kilometer positions, nominal irradiance of 1,361 W/m² at 1 AU, and inverse-square falloff in Exploration Mode. Clamp the exterior illumination model at the photosphere rather than imposing the previous 0.1-AU brightness ceiling. Keep normalized lighting in the exaggerated Overview. Separate physical irradiance from renderer-relative emission and displayed pixel brightness.
3. **Finite-disk eclipses:** Compute observer-specific solar visibility with finite angular disks and foreground depth. The CPU camera meter uses analytic overlap for a small single disk and bounded ray unions for larger or multiple blockers. Planet materials use a bounded per-fragment approximation with up to four opaque spherical candidates and the strongest individual overlap. These are distinct approximations: camera occultation is not applied as a global lighting multiplier, and the current trajectories do not predict real-date eclipses.
4. **Global exposure:** Move automatic/manual exposure preferences out of lunar navigation state into the shared rendering store. Use selected-view analytic metering, frame-rate-independent EV adaptation, manual compensation, and a manual mode that preserves the current exposure when enabled. Main exploration and lunar surface rendering share these controls. Metering is a display policy, not calibrated photometry or a GPU histogram.
5. **Solar observation controls:** Provide center-distance, angular-diameter, unobscured-irradiance, and visible-disk readouts. Fixed-distance presets use the mean orbital distances of Mercury, Earth, Jupiter, and Neptune without claiming their observed positions. Expose exposure/corona settings and source limitations. Solar approach has no landing action.
6. **Preserved application boundary:** Retain Moon startup and its measured Taurus–Littrow surface slice, all ten existing destinations, local/HTTP catalog adapters, backend response formats, search, playback, navigation, and bounded quality/resource lifecycles. No additional scientific dataset is implied by a supported render effect.

Automated validation targets angular size at inner/Earth/outer-system distances, inverse-square scaling, finite-disk partial/annular/total overlap, foreground depth, overlapping blockers, observer independence, frame-rate-independent exposure, shader assembly, state transitions, and lifecycle behavior. Final check results and actual browser screenshots/defects are maintained in [VALIDATION.md](VALIDATION.md); this implementation status does not assert unrecorded visual verification or physical-device performance.

Catalog ingestion and major moons, reusable descent for other bodies, Mars surface data, Earth/Venus/Titan atmospheres, giant-planet atmospheric flight, dwarf planets and small bodies, and expanded mobile/scientific validation remain the subsequent roadmap milestones. Existing visual atmosphere approximations and the Moon's single measured landing region retain their documented limits.
