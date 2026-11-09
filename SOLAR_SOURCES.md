# Solar model, sources, and approximations

Source audit: 2 November 2026. This document distinguishes physical inputs from display choices for the first solar-rendering milestone. Implementation and browser verification are recorded separately in `VALIDATION.md`; a source listed here does not imply that every associated phenomenon is implemented.

## Physical inputs

| Quantity | Adopted value | Provenance and meaning |
| --- | --- | --- |
| Photospheric radius | 695,700 km | [IAU 2015 Resolution B3](https://www.iau.org/common/Uploaded%20files/IAUGA2015-Resolution-B3-recommended-nominal-conversion.pdf), nominal solar radius. |
| Total solar irradiance at 1 au | 1,361 W/m² | Same resolution, nominal irradiance integrated over all wavelengths, outside an atmosphere, on a surface normal to the incoming radiation. |
| Effective temperature | 5,772 K | Same resolution, nominal effective temperature; not a single temperature for every solar layer. |
| Astronomical unit | 149,597,870.7 km | [IAU definition](https://iauarchive.eso.org/public/themes/measuring/) and [Observatoire de Paris account of Resolution B2 (2012)](https://syrte.obspm.fr/IAU_resolutions/IAUResol_2012.html), an exact conventional unit of length. |

IAU nominal solar values are exact conversion standards chosen near measured values. They do not describe the instantaneous Sun or its activity. This application adopts them as parameters of an idealized, spherical, steady Sun. The existing catalog radius already agrees with the adopted nominal radius.

All solar geometry uses CPU positions and radii in kilometers in one common frame. Subtract the observer position before normalizing directions. Floating-origin render units and exaggerated Overview positions are not physical distances.

The exterior-sphere angular diameter is `2 * asin(radiusKm / distanceKm)`. Distance is from the observer to the solar center. The exterior illumination model is `1361 / distanceAu²` W/m²; its relative multiplier is `1 / distanceAu²`. Clamp valid interior distances to the nominal photosphere, because the exterior model does not describe travel through the Sun. Invalid, negative, or nonfinite inputs must not produce NaN or infinity. There is no artificial 0.1-au brightness ceiling.

The correction brief's approximate 696,340 km radius differs by about 0.092% from the adopted nominal radius. [NASA's Sun Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html) also lists 695,700 km. The sphere's tangent limb requires `asin(R/d)` for its angular radius, as used by [JPL NAIF](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/edterm_c.html). The equivalent arctangent form is `atan(R / sqrt(d*d - R*R))`; `atan(R/d)` is the flat-disk approximation. The exact spherical formula matters during close approach. The rationale and pre-correction findings are recorded in [SOLAR_RENDERING_AUDIT.md](SOLAR_RENDERING_AUDIT.md).

| Fixed test distance | Angular diameter | Nominal irradiance |
| --- | --- | --- |
| 0.387 au | 1.377046821° | 9,087.327818 W/m² |
| 1 au | 0.532906214° | 1,361 W/m² |
| 1.524 au | 0.349675276° | 585.987283 W/m² |
| 5.2 au | 0.102481609° | 50.332840 W/m² |
| 30 au | 0.017763477° | 1.512222 W/m² |

These are derived checks at specified distances, not predictions of planetary positions or eclipse dates. The application's simplified orbit model remains distinct from an ephemeris.

## Visible appearance

[NASA's explanation of solar colors](https://svs.gsfc.nasa.gov/vis/a010000/a013800/a013859/script_31299_00.html) distinguishes combined visible sunlight, which appears white, from the assigned colors used to display invisible SDO wavelengths. The visible photosphere is represented with near-neutral white emission. Orange ultraviolet imagery is not treated as a true-color photospheric texture.

[NASA Marshall's photosphere description](https://solarscience.msfc.nasa.gov/surface.shtml) explains why the visible disk darkens toward its limb: oblique rays emerge from higher, cooler layers. The gray law is `I(mu) / I(1) = 1 - u * (1 - mu)`, with `u = 0.6` and `mu` the surface-normal/view cosine. The coefficient is an illustrative broad-visible approximation, not a measured spectral fit or a radiative-transfer solution. Its integrated brightness and eclipse attenuation are not calibrated spectrophotometry.

[NASA Marshall's feature overview](https://solarscience.msfc.nasa.gov/feature1.shtml) describes granules about 1,000 km across and lifetimes around 20 minutes. Any generated granulation in this milestone is a deterministic visualization of this scale, not observed solar imagery. It must fade when its projected scale cannot be resolved. A static pattern does not simulate the observed time evolution. Sunspots, flares, and prominences are not supplied by an observational dataset and must not be presented as current observations.

[ESA's Proba-3 explanation](https://www.esa.int/Enabling_Support/Space_Engineering_Technology/Proba-3/Eclipse-maker_How_Proba-3_subtracts_the_Sun) describes the white-light corona as roughly a million times fainter than the photosphere. A faint analytic corona can illustrate that contrast; it does not reproduce measured density, magnetic topology, streamers, or a particular eclipse. Its baseline brightness is approximately `1e-6` of the photospheric display value, with any visibility enhancement identified as a display choice. It should respond to the same exposure and foreground occultation as the photosphere. No observation-derived prominence map is installed for this milestone.

## HDR, exposure, and optical glare

`SOLAR_DISPLAY_RADIANCE = 16384` is a relative scene brightness chosen to bridge the renderer's lighting scale and tone mapping. It is not radiance in W/(m² sr), luminance in cd/m², or a camera calibration. The previous display value of 100,000 exceeded the largest finite half-float value of 65,504; the shared normalization was reduced for the HDR framebuffer. Photosphere, corona, sampling, and exposure use the same constant. This change does not alter physical radius or irradiance.

The world scene and active lunar terrain pass compose into one linear-sRGB RGBA16F target with depth, followed by one `OutputPass` applying ACES tone mapping, exposure, and sRGB output conversion. Material output is kept linear while rendering into that target. This follows Three.js's [color-management guidance](https://threejs.org/manual/pages/color-management.html) and [OutputPass contract](https://threejs.org/docs/pages/OutputPass.html). There is no full-frame bloom pyramid or duplicate final tone-mapping stage. If floating-point color buffers are unavailable or framebuffer validation fails, the renderer falls back to direct output and reports that state; additive effects then lack the same linear HDR composition.

The drawing-buffer budgets are 750,000 pixels at Low, 1,800,000 at Medium, and 3,000,000 at High, also bounded by device pixel ratio, adaptive limits, and texture-size capability. Medium and High request at most two supported multisamples; Low uses none. Buffers and the output pass are resized and disposed with the renderer. These budgets are safeguards, not measured performance guarantees for every GPU.

Ordinary automatic exposure prioritizes the selected world's illumination. A visible Sun can reduce that exposure by at most one EV relative to the selected-world estimate. **Solar filter** is a separate, optional inspection setting, off by default, that permits much lower exposure to reveal photospheric detail. The resulting dim surroundings are an intentional global exposure change rather than reduced physical sunlight. Manual exposure remains an explicit global override; the reset action restores ordinary automatic exposure and disables the filter.

Exposure adaptation uses a time-based exponential in EV, with ordinary brightening/darkening time constants of 1.2/0.3 seconds and a 0.2-second recovery when leaving filtered or manual inspection for an unfiltered automatic view. Effective exposure is bounded to −20 through +12 EV. These time constants, selected-world metering, and limits are display choices, not calibrated photographic settings or a model of human vision. Physical irradiance and displayed pixel brightness remain separate quantities. Solar visibility for metering is checked against the actual projection frustum, including asymmetric camera view offsets, rather than a larger diagonal cone.

When the physical solar diameter becomes smaller than the drawing-buffer pixel scale, a two-pixel Gaussian optical sample carries a disk-area-weighted signal. A smooth transition between 0.75 and 1.5 pixels blends that sample with the resolved photosphere; the physical radius, angular-size readout, and picking geometry are unchanged. This is a display sampling approximation, not a measured telescope point-spread function. Its brightness uses the projected disk area, the gray limb-law mean `1 - u/3`, and an approximate Gaussian normalization.

Automatic solar-filter metering accounts for this unresolved sample's peak. It blends the resolved-disk weight with the area-weighted Gaussian peak, using a kernel area of `4 * 0.2543` pixels and a weight capped at 1. This raises the filtered exposure for a distant subpixel Sun instead of applying the same resolved-surface setting at every apparent size. It does not enlarge the solar sphere, change the raw disk-area signal, or override manual exposure. A fully occulted Sun contributes no photosphere signal to the meter, which then falls back to the selected scene's illumination estimate. This compensation is an analytic display choice, not absolute radiometric calibration; it does not establish visual correctness without inspecting the rendered result.

The **Optical bloom / glare** control drives an analytic camera-optics effect around the Sun, rather than a full-frame image convolution. Its default strength is 0.35 on a range from 0 to 1. The compact halo assigns 2% of the visible, limb-averaged disk signal to a disk-plus-Gaussian profile and caps its exposed peak at 2 before applying control strength. Its width is limited to 12/24/40 drawing-buffer pixels at Low/Medium/High. A blue-toned veil and mixed broad/fine directional lobes extend at most 150/650/900 pixels by quality and at most 75% of drawing-buffer height; they contract for a large close-up disk. Medium and High additionally draw eight small, colored lens reflections in one point draw call when the Sun is on screen. Low quality omits these reflections. These are display heuristics and do not obey a calibrated energy budget. All components taper to zero at their boundaries. The Sun's physical sphere and angular-size telemetry remain unchanged.

Glare is distinct from the much fainter analytic corona: glare represents camera optics; corona represents an approximate solar atmosphere. Foreground angular masks and scene depth suppress halo leakage over opaque blockers, and a completely occulted photosphere supplies no glare or lens-reflection signal. The screen-space reflections test scene depth at the projected solar distance, so a foreground planet hides them where it covers their screen positions. They do not model internal lens elements or sample a depth pyramid. This is an eclipse-aware visibility approximation, not a diffraction or scattered-light solution. No solar activity is inferred from either effect.

Exploration illumination uses physical distance and inverse-square falloff. Overview normalizes lighting to keep its explicitly exaggerated, diagrammatic presentation readable. An object's own emission and texture color must not be mistaken for incident sunlight. The illustrative starfield is dimmed by exposures below 1, but its exposure multiplier is capped at 1: increasing exposure does not brighten these synthetic points without limit. This readability policy is not a stellar flux or limiting-magnitude model.

## Eclipse and lunar-horizon approximations

A finite solar disk permits partial, annular, and total occultation. The CPU visibility helper uses analytic circle overlap when a single, fully foreground disk and the Sun each subtend an angular radius no greater than 0.05 radians. This is a planar apparent-disk approximation. For larger disks, intersecting depth ranges, or multiple occulters, it traces 512 deterministic rays distributed uniformly in solid angle across the solar cone. Each ray compares its first solar-surface intersection with foreground sphere intersections. Overlapping blockers form a union rather than multiplied visibility fractions. Sampling is approximate and quantizes the returned fraction to steps of 1/512; this is not a guaranteed error bound. Objects behind the camera or beyond the solar surface do not eclipse the photosphere.

The camera's visible solar fraction controls solar visibility and exposure metering. Illumination at a receiving body uses a separate calculation. A camera eclipse must not dim every planet. The planet material computes the incoming direction and eclipse attenuation at each fragment, using up to four CPU-filtered opaque spherical blockers. Its bounded shader uses the strongest single angular-disk overlap, not the union of simultaneous blockers. Its foreground-center gate and planar disk overlap are simpler than the CPU camera meter's ray intersections. Thus simultaneous overlapping eclipses and near-Sun geometry can differ between metering and surface shading. Per-body inverse-square intensity is evaluated at the body's center. Existing shadow maps and solar silhouettes serve different purposes.

The lunar camera horizon uses a local spherical radius derived from sampled ground: observer distance from the lunar center minus altitude above terrain. This avoids treating an observer in a measured valley below the mean-radius sphere as buried inside an opaque Moon. The local radius applies during surface navigation, descent, and early ascent while altitude is at most 10 km; other phases use the catalog sphere. This analytic horizon is a spherical approximation for camera visibility and metering. Actual rendered terrain can hide the solar image behind hills, but the CPU meter does not trace the detailed terrain silhouette.

Lunar terrain illumination is attenuated only by external bodies, excluding the Moon's own horizon from the shared light multiplier. The representative receiving point is the observer during the local-horizon phases above and the Moon's center otherwise. This keeps the observer's sunset from incorrectly dimming the entire visible lit crescent. Terrain normals and available shadow rendering determine local shading; external eclipse attenuation remains one representative value for the terrain pass, not a spatially resolved penumbra over every terrain patch. This is distinct from the planet-material per-fragment approximation.

The visibility scalar is geometric rather than limb-weighted flux. The model excludes ring transmission, irregular occulting shapes, refraction, diffraction, scattering through atmospheres, relativistic light deflection, light-travel time, and terrain-resolved eclipse silhouettes. It is not an eclipse prediction service.

## Provenance and validation boundaries

No solar image, video, or observational texture is downloaded or redistributed by this milestone. The cited agency material supplies facts and interpretation; generated visual patterns remain explicitly illustrative. This document does not grant a project license or reuse rights to linked imagery.

Meaningful automated checks cover angular size, inverse-square scaling, near-photosphere limits, invalid inputs, finite-disk overlap, foreground depth, overlapping occulting disks, observer independence, and frame-rate-independent exposure adaptation. Final check results and inspected browser screenshots belong in [VALIDATION.md](VALIDATION.md).
