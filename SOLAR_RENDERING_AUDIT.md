# Solar rendering correction: baseline audit

Recorded 2 November 2026, before the production changes for the solar rendering, exposure, and illumination correction brief. This audit separates inspected behavior from code-supported failure paths and proposed corrections. Final implementation results, screenshots, and remaining defects belong in [VALIDATION.md](VALIDATION.md).

## Observed baseline and conclusion

The integration browser inspection of normal travel to Earth showed a clearly illuminated day hemisphere. The saved baseline is [.local/qa/solar-correction/earth-before.png](.local/qa/solar-correction/earth-before.png). The default arrival geometry has a phase angle of about 55°, corresponding to roughly 79% illuminated projected disk area under a spherical model. This observation does **not** establish a globally inverted sunlight direction, and the correction must not assume one or add ambient light to hide a night-side view.

The current Sun radius, physical distance conversion, and sphere angular-size calculation agree. A concrete navigation defect was reproduced: pending OrbitControls damping survives an instant focus/reset and can rotate the camera from a day-side arrival to a dark crescent after input has stopped. Separate contributors are a physically small distant solar disk, no optical bloom pass, a deliberately faint corona under strongly reduced solar exposure, and exposure settings that can leave a newly selected planet underexposed. Which combination produced the user's particular view cannot be established from the report alone. Diagnostics and repeatable camera actions are needed to distinguish viewing phase from illumination defects.

## Requested rendering checklist

| Area | Baseline finding | Inspected implementation |
| --- | --- | --- |
| Solar radius and geometry | Catalog and shared solar math both use 695,700 km; the dedicated photosphere is a sphere with bounded LOD. No arbitrary physical radius enlargement is present. | [catalog.ts](src/data/catalog.ts), [solarMath.ts](src/engine/solar/solarMath.ts), [SunRenderer.ts](src/engine/solar/SunRenderer.ts) |
| Sun/Earth positions | CPU positions follow the application's simplified parent-relative orbital model. The Sun is the heliocentric origin; these positions are not scientific ephemerides. | [CoordinateSystem.ts](src/engine/coordinates/CoordinateSystem.ts), [UniverseEngine.ts](src/engine/core/UniverseEngine.ts) |
| Coordinate conversion | Exploration uses 10,000 km per render unit for both radii and distances. Overview deliberately changes both and is separately labeled. Floating-origin subtraction keeps nearby GPU coordinates small. | [CoordinateSystem.ts](src/engine/coordinates/CoordinateSystem.ts), [FloatingOrigin.ts](src/engine/coordinates/FloatingOrigin.ts) |
| Camera FOV and distance | The main perspective camera starts at 38° vertical FOV. Solar measurements use actual camera-to-Sun center distance and effective FOV; pixel estimates use drawing-buffer height. FOV, viewport size, and distance all affect the visible disk. | [UniverseEngine.ts](src/engine/core/UniverseEngine.ts), [SolarScene.ts](src/engine/solar/SolarScene.ts), [SunRenderer.ts](src/engine/solar/SunRenderer.ts) |
| Focus/reset camera inertia | A reproduction against installed OrbitControls shows queued damping survives an instant focus/reset. With no further input, the camera can drift from the intended lit view into a dark crescent. | [CameraController.ts](src/engine/navigation/CameraController.ts), installed Three.js OrbitControls |
| Photosphere material | Dedicated white emission, gray limb darkening, and explicitly synthetic granulation already exist. Each solar shader feeds its linear value through the tone-mapping and output-color chunks once. | [SolarShaders.ts](src/engine/solar/SolarShaders.ts), [GranulationTexture.ts](src/engine/solar/GranulationTexture.ts) |
| Solar radiance units | `SOLAR_DISPLAY_RADIANCE = 100000` is a scene-relative normalization. It is not radiance in W/(m² sr) or calibrated luminance. | [solarMath.ts](src/engine/solar/solarMath.ts), [SOLAR_SOURCES.md](SOLAR_SOURCES.md) |
| Half-float migration constraint | The existing display value 100,000 exceeds binary16's largest finite value, 65,504. Moving untone-mapped values into a half-float target therefore requires a shared display renormalization or another supported format; the current direct-to-canvas path does not store this value in such a target. | [solarMath.ts](src/engine/solar/solarMath.ts), proposed HDR pipeline |
| Directional lighting | The primary white directional light supplies the shadow map. Planet shader extensions derive fragment-to-Sun direction from positions, with per-body inverse-square intensity and bounded eclipse attenuation. Direction is not intended to follow the camera. | [UniverseEngine.ts](src/engine/core/UniverseEngine.ts), [PlanetSolarLighting.ts](src/engine/solar/PlanetSolarLighting.ts), [SolarScene.ts](src/engine/solar/SolarScene.ts) |
| Tone mapping and color output | ACES filmic tone mapping and sRGB output are already configured. The main scene is rendered directly to the canvas, followed by the lunar pass when active. | [RendererManager.ts](src/engine/core/RendererManager.ts), [UniverseEngine.ts](src/engine/core/UniverseEngine.ts) |
| HDR composition and bloom | Shader values can exceed 1 before tone mapping, but there is no scene HDR render target, bloom chain, or optical-glare control at this baseline. A high-valued shader alone does not spread light across neighboring pixels. | [RendererManager.ts](src/engine/core/RendererManager.ts), [UniverseEngine.ts](src/engine/core/UniverseEngine.ts) |
| Exposure | Global automatic/manual exposure exists. The analytic meter combines selected-world irradiance with solar disk visibility. Manual solar exposure persists after travel; a bright in-frame Sun can also dominate the planet meter. | [SolarExposure.ts](src/engine/solar/SolarExposure.ts), [renderingStore.ts](src/stores/renderingStore.ts), [SettingsDialog.tsx](src/components/panels/SettingsDialog.tsx) |
| Planetary night side | Non-metallic lit materials preserve a dark night side. Earth separately adds observed night lights, clouds, and a sunlight-aware atmospheric-limb approximation. These layers must survive the correction. | [CelestialBody.ts](src/engine/objects/CelestialBody.ts), [PlanetSolarLighting.ts](src/engine/solar/PlanetSolarLighting.ts) |
| Corona versus optics | The analytic corona has about one-millionth of the photospheric display radiance and becomes nearly invisible under a solar-detail exposure. The two-pixel unresolved sampling point is not a full bloom/glare effect. | [SolarShaders.ts](src/engine/solar/SolarShaders.ts), [SunRenderer.ts](src/engine/solar/SunRenderer.ts) |
| Diagnostics and navigation | Existing solar readouts omit the full requested camera/position/direction diagnostics. Dedicated smooth “Look at Sun” and “Go to Day Side” actions are absent at the baseline. | [SolarObservationControls.tsx](src/components/controls/SolarObservationControls.tsx), [CameraController.ts](src/engine/navigation/CameraController.ts) |

## Radius and angular-size resolution

The brief's approximate radius of 696,340 km differs from the adopted 695,700 km by only 0.092%. The latter is supported both by the current [NASA Sun Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html) and the [IAU 2015 nominal solar radius](https://www.iau.org/common/Uploaded%20files/IAUGA2015-Resolution-B3-recommended-nominal-conversion.pdf). IAU nominal values are exact conventional conversion factors near measured values, not claims about instantaneous solar activity. Retaining the sourced nominal radius avoids an unnecessary inconsistency across catalog, geometry, eclipse calculations, and tests. A 640 km radius change cannot explain a substantially undersized or dim solar image.

For an exterior observer at center distance `d`, the silhouette of a sphere of radius `R` is bounded by tangent rays. Its exact angular diameter is:

```text
diameter = 2 * asin(R / d)
         = 2 * atan(R / sqrt(d*d - R*R))
```

The requested `2 * atan(R / d)` describes a flat disk perpendicular to the sightline at distance `d`; it is an excellent far-field approximation for the Sun but does not match a nearby sphere. [JPL NAIF's solar terminator example](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/edterm_c.html) uses `asin(radius / centerDistance)` for the solar angular radius. At 1 AU the two diameter formulas differ by only about 0.00000576°, whereas at `d = 2R` the sphere spans 60° and the flat-disk expression gives 53.13°. Preserve the exact spherical expression and explain this distinction rather than silently introducing a near-Sun mismatch.

The existing pixel-diameter expression is consistent with that sphere geometry:

```text
pixelDiameter = R / sqrt(d*d - R*R) * bufferHeight / tan(verticalFov / 2)
```

Illustrative fixed-distance checks, using the nominal radius, an 800-pixel drawing buffer, and the current 38° vertical FOV:

| Distance | Angular diameter | Physical disk diameter in pixels |
| --- | ---: | ---: |
| Mercury-like, 0.387 AU | 1.377047° | 27.92 |
| Earth-like, 1 AU | 0.532906° | 10.80 |
| Mars-like, 1.524 AU | 0.349675° | 7.09 |
| Jupiter-like, 5.2 AU | 0.102482° | 2.08 |
| Neptune-like, 30 AU | 0.017763° | 0.36 |

These are formula checks, not screenshot measurements or current planetary positions. A small distant disk is expected. Optical glare may increase the perceptual footprint while its geometric boundary and angular-size readout remain unchanged.

## Failure paths and confidence

1. **Verified navigation defect:** the camera agent reproduced residual damping with the installed OrbitControls. The intended arrival phase cosine was `+0.573`; queued rotation followed by instant focus yielded `+0.410` immediately and then drifted to `−0.724` after settling, without new input. The latter is a mostly dark crescent. Pending control deltas must be drained when stopping motion while preserving the intended camera pose and target. This is a camera-state failure, not evidence that physical lighting follows the camera.
2. **Verified baseline:** fresh normal Earth arrival renders a lit day hemisphere. A universal reversed light vector is not demonstrated. Camera orientation and phase still require regression checks from multiple directions and after floating-origin rebases.
3. **Code-supported exposure failure:** manual exposure frozen for solar detail can persist around −15 EV when traveling to a normally lit planet. That suppresses displayed surface brightness without changing sunlight geometry. Navigation must make the carried exposure clear and provide recovery, without silently defeating intentional manual settings.
4. **Code-supported metering limitation:** the current analytic meter lets a visible Sun drive the whole-frame exposure even while a planet is selected. A selected-world policy can protect surface readability while retaining explicit solar-detail and manual behavior. This is a display decision, not additional physical illumination.
5. **Verified implementation gap:** there is no configurable optical bloom. The weak physical corona cannot substitute for lens/sensor glare, especially under strong solar filtering. Any new glare must be identified as an optical display effect rather than solar plasma.
6. **Verified interaction gap:** absent camera/direction diagnostics and day-side actions make night-side geometry hard to distinguish from exposure or light errors. These controls should make the state observable and reproducible.

## Corrective sequence and acceptance

1. Preserve sourced sphere geometry and the uniform physical scale. Extend numerical checks to Mars distance, actual camera distance/FOV, and render-projection consistency. Avoid a minimum angular radius for the photosphere.
2. Fix motion stopping so stale OrbitControls deltas cannot alter a new focus/reset pose. Test the installed controls with queued rotation and no subsequent input. Verify modeled planet-to-Sun direction, day/night orientation, and camera-rotation invariance. Preserve Earth cloud, night-light, and atmospheric-limb layers. Add explicit smooth Sun-looking and day-side camera actions that operate in the existing coordinate system.
3. Correct exposure transitions and selected-world metering. Keep automatic adaptation bounded and frame-rate independent, expose the effective exposure, and retain an understandable manual override. Do not add ambient light to the night side.
4. Implement bounded, configurable optical glare/bloom separately from the physical photosphere and analytic corona. The rendering agent proposes a linear HDR framebuffer followed by one final output pass, with a bounded camera-optics glare model; this is still a plan at the audit boundary. For a half-float target, reduce the shared renderer-relative solar normalization to a safe value such as 16,384 and keep photosphere, exposure, unresolved sampling, and corona calculations consistent. This changes display units, not physical radius or irradiance. Compose in the appropriate linear HDR representation and apply final tone mapping/output conversion once. Three.js documents this role for [OutputPass](https://threejs.org/docs/pages/OutputPass.html); its [UnrealBloomPass](https://threejs.org/docs/pages/UnrealBloomPass.html) provides configurable strength, radius, and threshold. These references are implementation guidance, not a claim that either pass is already installed. The final pipeline choice and its approximations must be recorded after implementation.
5. Add the requested diagnostic readouts: camera-to-Sun distance, angular diameter, effective FOV, Sun direction, selected-body position and Sun direction, effective exposure, and scale mode. Distinguish scientific kilometer coordinates from camera-relative render coordinates and Overview display coordinates.
6. Inspect repeatable Mercury-, Earth-, Mars-, Jupiter-, and Neptune-distance views; inspect normal/day/night Earth travel and exposure recovery; check solar occultation, glare leakage, lunar descent/return, narrow layouts, quality degradation, and GPU-resource cleanup. Run typecheck, lint, meaningful tests, and build. Record browser screenshots and defects in [VALIDATION.md](VALIDATION.md). Desktop viewport emulation does not establish physical mobile performance.

The existing application, ten-body catalog, search, time controls, local/HTTP backend contract, lunar terrain, and mobile navigation remain within the preservation scope. No solar activity dataset or scientific ephemeris is added merely by improving the rendering pipeline. Scientific and display assumptions remain consolidated in [SOLAR_SOURCES.md](SOLAR_SOURCES.md).
