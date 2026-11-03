# Planetary landing and scientific-sky architecture

Status: architecture and destination-capability foundation, 3 November 2026. This is a staged extension of the existing frontend, not a claim that every Solar System body can now be landed on.

## Current audit

| Concern | Current implementation | Reuse assessment |
| --- | --- | --- |
| Entry point and composition | `UniverseEngine.beginLunarDescent()` captures the main exploration pose, stops orbit controls, owns the local pass, and restores orbit after ascent. | Generalize orchestration; it is currently Moon-only in method names, selected-object guard, and `LunarExploration` construction. |
| Descent, surface input, and return | `LunarNavigationController` provides radial approach/descent/ascent, local camera, keyboard, pointer, touch-compatible movement input, altitude/collision, and safe listener teardown. | Reuse the state machine and radial interpolation. Rename its public concepts to body-neutral names and make altitude, walk-resolution, speed, and entry policy profile inputs. |
| Coordinates | `LunarFrame` converts camera-relative exploration units to Moon-fixed CPU meters, rotates local vectors, then converts back. `FloatingOrigin` keeps the orbital scene stable. | Generalize to a `BodyFixedFrame` that accepts body position, orientation, ellipsoid/reference surface, and body ID. Do not send large global positions to the GPU. |
| Terrain and LOD | `PlanetTerrainRenderer` is already cube-sphere, camera-relative, bounded by quality/mobile budgets, streams tiles, handles imagery, samples collision height, and disposes resources. | Reuse renderer and selection/geometry modules. Remove its Moon imagery lookup and Moon group name; feed imagery/material policy via a provider/profile. |
| Data provider | `TerrainDataProvider` supports initialization, regional prefetch, height samples, imagery, tiled loading, cache statistics, cancellation, and disposal. `LunarTerrainProvider` plus `moonManifest` implement one measured lunar package. | Retain the interface; generalize `TerrainManifest.bodyId` from the Moon literal and implement body-specific providers/manifests only after their datasets are vetted. |
| Lighting and eclipse | `LunarExploration` owns a local directional light, horizon-aware solar handling, quality-bound shadow maps, and receives solar visibility from `SolarScene`. | Extract body-neutral local illumination. Sun direction and irradiance must come from the active model in a documented body-fixed frame; terrain horizon must be distinct from planetary limb horizon. |
| Orbital planetary materials | `CelestialBody` and `PlanetShaders` provide orbital PBR, night-side/limb display approximations, and clouds where installed. | Do not reuse an orbital atmosphere shell as a surface sky. It is not a volumetric local atmosphere. |
| Sky | The global procedural `Starfield` is illustrative. Lunar surface currently has black sky and local solar altitude telemetry; it does not yet compute bodies/stars from an observer coordinate. | Build a dedicated local `SkyEngine`. It must be driven by observer/body frame, UTC, rotation/orientation, modeled or ephemeris positions, atmospheric profile, exposure, and terrain horizon. |
| UI/store | `lunarStore`, `LunarSurfaceControls`, and `LunarTelemetry` expose one Moon-only session. | Replace with body-neutral surface-session state only when at least a second destination has a working package; preserve an adapter so existing Moon controls continue to work during migration. |
| Backend | All object retrieval uses `CelestialService`. HTTP metadata is identity-oriented; local physical/reference data remains bundled. | Do not assume remote terrain or ephemerides. A future opt-in provider must identify source, frame, epoch, uncertainty, coverage, and offline/demo status. |
| Tests | Coordinate, navigation, terrain geometry/selection/renderer/provider, solar/eclipse, imagery, stores, and lifecycle tests exist. | Preserve Moon tests; add body-frame, profile-selection, altitude/collision, Sun direction, angular size, horizon, rotation, and atmosphere-profile tests per supported destination. |

## Destination capability contract

`src/data/explorationProfiles.ts` is the single data-driven authority for the ten catalogued bodies. It classifies each as `AIRLESS_SOLID`, `ATMOSPHERIC_SOLID`, `GAS_GIANT`, `ICE_GIANT`, `STAR`, or `SMALL_BODY`, and independently marks orbital, surface, and atmospheric modes as `available`, `planned`, or `not-supported`.

Only the Moon has an available surface package today. Mercury, Venus, Earth, and Mars are explicitly **planned**, not silently enabled. The Sun and every gas/ice giant have `surface: not-supported`; this makes a solid-surface landing impossible by policy, rather than by scattered UI conditionals. Titan, Io, Europa, Enceladus, and dwarf planets are not in the current ten-body catalog, so no profile asserts support for them.

Each profile includes terrain and sky provenance, reference epoch semantics, coverage, and reconstruction status. A profile is metadata, not a terrain dataset or proof of scientific accuracy.

## Target runtime design

```text
UniverseEngine
  └─ SurfaceSession (one active local session)
       ├─ DestinationProfile + capability guard
       ├─ BodyFixedFrame (global km <-> body-fixed local m)
       ├─ DescentController (approach / entry / descent / surface / ascent)
       ├─ TerrainDataProvider -> PlanetTerrainRenderer -> collision sampler
       ├─ LocalIllumination (Sun direction, inverse square, eclipse scalar)
       ├─ SkyEngine (directions, angular disks, horizon, atmosphere, stars)
       └─ EnvironmentRenderer (terrain, clouds/haze only where qualified)
```

The main engine remains owner of the request-animation-frame loop, resource lifecycle, global scene, orbital model, and picking. React only issues commands and receives throttled telemetry. A local session shares the existing renderer/HDR pipeline; it does not spin up a disconnected WebGL context or a second independent clock.

### Body-fixed coordinates

Model positions remain heliocentric CPU kilometers. At entry, subtract the selected body's modeled center in double precision, convert to meters, then transform by the inverse body orientation into a body-fixed frame. Terrain vertices are camera-relative meters. Returning to orbit reverses that transform before rejoining the main floating-origin scene.

The first generalization must support a spherical reference surface because that matches the current catalog. Ellipsoid semi-axes and datum/reference-radius metadata belong on the destination terrain profile before Earth or other ellipsoidal bodies are enabled. Latitude convention, east-positive longitude, height datum, epoch, and orientation provenance must travel with every terrain manifest.

### Descent controller states

`inactive -> approach -> entry? -> descending -> surface -> ascending -> inactive`.

Approach and ascent follow radial arcs, never a chord through the body. `entry` is optional and only enabled by an atmospheric profile. Descent waits for the required terrain resolution, samples collision height from both source data and rendered LOD, and holds safely at a coverage edge. It is guided exploration, not a spacecraft/ballistics simulator. State changes and returned telemetry are event/low-frequency updates, not React frame state.

### Scientific sky contract

The future `SkyEngine` input is: body-fixed observer latitude/longitude/altitude; UTC simulation time; body rotation/orientation; Sun and satellite/planet positions with explicit frame/epoch; atmospheric parameters; exposure; and terrain horizon. It returns directions, angular diameters, extinction/visibility, and provenance flags. Angular diameter always uses the physical-radius geometry already used by the solar system renderer; it never uses display radii.

The current circular orbit model can drive a clearly labelled **illustrative sky**. It cannot claim real-time satellite positions, planetary conjunctions, or eclipse prediction. Accurate sky/eclipses require an opt-in ephemeris with declared time scale, reference frame, light-time/aberration choice, coverage, and source. The procedural star field is not a star catalogue and must remain labelled illustrative until replaced by a sourced catalogue.

Atmospheres are profile-specific, quality-tiered approximations. A terrestrial Rayleigh/Mie parameterization, Martian dust, Venus/Titan haze, and gas/ice-giant cloud descent cannot share an Earth skybox. Daylight extinction must suppress stars; terrain and planetary horizons must hide below-horizon bodies. Measured clouds, plumes, and activity are only rendered when a declared dataset supports them; otherwise the UI states that they are reconstruction/illustration.

## Delivery sequence and gates

1. Generalize frame, terrain manifest, navigation, telemetry, and session interfaces while retaining a Moon compatibility adapter.
2. Add vetted Mercury and Mars terrain + airless/thin-atmosphere profiles, then validate local directions and collision.
3. Add Earth and Venus only with explicit terrain datum and atmospheric coverage/limits.
4. Expand the catalog before adding Titan, Io, Europa, Enceladus, or dwarf-body profiles; each needs sources and a capability status first.
5. Add giant atmospheric-only sessions with pressure/temperature/profile provenance. Never expose a ground landing control.
6. Add a source-backed star catalogue and optional ephemeris path before claiming scientific sky positions or eclipse predictions.

Every destination gate includes unit tests for frame transforms, rotation, altitude/collision, solar direction/diameter, horizon visibility, capability policy, profile provenance, and quality/mobile bounds; integration/browser checks cover approach, descent, surface, ascent, and disposal. Representative validation targets are Mercury, Venus, Earth, Mars, Moon, Titan, Europa, and Jupiter once they exist in the catalog. No destination is marked available merely because it has a visual texture.

## Present limitations

The active implementation is Moon-only at the surface. It has regional measured lunar terrain and a black airless local sky, but not a general body-fixed frame, scientific star catalogue, local atmosphere renderer, accurate ephemeris, other-satellite catalog, or planetary terrain packages. Orbital atmosphere/lights and simplified modeled trajectories must not be relabelled as surface-science output.
