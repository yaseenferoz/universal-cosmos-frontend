# Surface and sky audit — 16 November 2026

## Scope and result

The bundled catalog has eight planets and eleven natural satellites. Nine local environments exist: the eight planets and Earth's Moon. The other ten moons are orbit-only; their surface and local night sky cannot currently be inspected in the application. This audit does not cover every known Solar System satellite.

The local renderer is still an illustrative reconstruction. Improved rock and ground detail does not make the environments photorealistic or scientifically calibrated. Only the Moon has a measured regional elevation package; even there, scattered rocks and fine material detail are illustrative.

Run `npm run dev`, then open [the comparison page](http://localhost:5173/dev/appearance-audit.html). It uses the production `PlanetaryExploration`, terrain, material, sky-map and star rendering classes. It renders supported destinations sequentially in one WebGL context, disposes each scene, and leaves three static canvas captures per destination. The page is a development entry, not part of the production application entry.

## Planet-by-planet review

Expected appearances below describe broad physical constraints, not exact colors or camera exposure. Night-star visibility depends on optical depth, glare, eye/camera adaptation and the observing site.

| Destination | Surface or local environment | Day / sunset expectation | Night expectation | Current renderer / remaining gap |
| --- | --- | --- | --- | --- |
| Mercury | Gray-brown, rocky, cratered regolith | Black sky even in daylight; sharp lighting, no Earth-like blue haze | Black sky; stars after adaptation; dark ground without other illumination | Working reconstruction; black sky. Terrain is generic and too smooth at broad scales. [NASA Mercury facts](https://science.nasa.gov/mercury/facts/). |
| Venus | Barren rocky terrain beneath dense atmosphere | Dim, diffuse yellow/amber illumination; surface view should not resemble orbital cloud imagery | Cloud/haze obscures a clear star field | Working amber reconstruction. Direct-light treatment, soil repetition and lack of volumetric distance haze remain unrealistic. [NASA Venus facts](https://science.nasa.gov/venus/venus-facts/). |
| Earth | Site-dependent rock, soil, vegetation, water, snow or cities | Blue clear sky, warm low-Sun scattering; weather changes visibility | Dark sky and stars when clear; moonlight, clouds and light pollution vary | Working generic dry-land scene only. No georeferenced geography, vegetation, water, weather or moonlight illumination. |
| Mars | Dust, basaltic rocks, layered outcrops, dunes and craters | Dust-colored daylight; blue scattering concentrated around the low Sun | Stars can emerge through sufficiently thin dust; weather-dependent | Working tinted terrain and dusty sky; localized blue sunset approximation added. No measured terrain or dust profile. [NASA Mars sunset explanation](https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/). |
| Jupiter | Atmospheric exploration only; no solid ground | Layered clouds/haze; appearance depends on altitude and pressure | Cloud layers can block stars; lightning/aurora require separate models | Working opaque tan cloud demonstration at 25 km above catalog radius. No pressure-calibrated cloud structure, storms or lightning. [NASA Jupiter facts](https://science.nasa.gov/jupiter/jupiter-facts/). |
| Saturn | Atmospheric exploration only; no solid ground | Layered cloud/haze; rings are not guaranteed visible from within clouds | Stars/rings depend on altitude, geometry and opacity | Working opaque yellow-tan haze at fixed reference altitude. No volumetric layers or local ring-lighting model. [NASA Saturn facts](https://science.nasa.gov/saturn/facts/). |
| Uranus | Atmospheric exploration only; no solid ground | Methane-bearing atmosphere; local sky color cannot simply be inferred from disk color | Visibility depends on optical depth and altitude | Working pale cyan illustrative haze. Not a measured view from a pressure level. [NASA giant-atmosphere overview](https://ntrs.nasa.gov/citations/20020049847). |
| Neptune | Atmospheric exploration only; no solid ground | Methane-bearing atmosphere/clouds; local color and illumination vary with depth | Visibility depends on cloud layers; no universal clear star field | Working blue-cyan illustrative haze. No measured local scattering profile or storms. [NASA Neptune facts](https://science.nasa.gov/neptune/neptune-facts/). |

For all four giants, the current dense cloud-level choice hides stars both day and night. That is a display scenario, not a claim about every altitude. Their internal heat must not be represented as a uniformly luminous visible-blue night sky. The audit uses exposure compensation, so outer-planet thumbnails are not a comparison of absolute solar brightness.

## Every catalogued natural satellite

For optically thin/exospheric bodies, a black sky with no broad Earth-like blue dome is the expected baseline. This is an inference from their tenuous atmospheres, not a statement that they contain no gas. Visible stars depend on exposure; a sunlit foreground and dense bright star field should not automatically be equally exposed. Parent-planet visibility depends on hemisphere, terrain, orbital geometry and illumination. Parent shine is not currently included in local terrain lighting.

| Satellite | Surface appearance target | Day / night sky target | Installed local capability |
| --- | --- | --- | --- |
| Moon | Gray regolith, impact features and angular rocks | Black day sky; stars at night after adaptation; Earth only where geometry permits | Measured Taurus–Littrow elevation/imagery with illustrative detail. Distant hills remain too smooth and show a brightness mismatch with nearby terrain. [NASA Moon facts](https://science.nasa.gov/moon/facts/). |
| Phobos | Dark, irregular, cratered dusty rock | Predominantly black sky; Mars prominent on the facing hemisphere | **Orbit-only**. Requires an irregular shape and appropriate low-gravity navigation, not a generic round desert. [NASA Phobos](https://science.nasa.gov/mars/moons/phobos/). |
| Deimos | Dark small irregular body with dusty terrain | Predominantly black sky; Mars on the facing hemisphere | **Orbit-only**. Same shape/navigation gap. [NASA Martian moons](https://science.nasa.gov/mars/moons/facts/). |
| Io | Volcanic plains, mountains and colored deposits | Predominantly black sky; local plumes and glowing lava would need separate effects | **Orbit-only**. No volcanic surface or plume simulation. [NASA Jovian moons](https://science.nasa.gov/jupiter/jupiter-moons/). |
| Europa | Fractured icy terrain, ridges and contrasting deposits | Predominantly black sky; Jupiter conditional on hemisphere | **Orbit-only**. Requires ice/ridge materials and terrain. [NASA surface comparison](https://science.nasa.gov/science-research/europa-ganymede-and-callisto-surface-comparison-at-high-spatial-resolution/). |
| Ganymede | Mixed dark cratered and brighter grooved icy terrain | Predominantly black sky; Jupiter conditional on hemisphere | **Orbit-only**. No local ice/rock geology. [NASA surface comparison](https://science.nasa.gov/science-research/europa-ganymede-and-callisto-surface-comparison-at-high-spatial-resolution/). |
| Callisto | Dark, heavily cratered icy/rocky terrain | Predominantly black sky; Jupiter conditional on hemisphere | **Orbit-only**. No cratered local terrain. [NASA surface comparison](https://science.nasa.gov/science-research/europa-ganymede-and-callisto-surface-comparison-at-high-spatial-resolution/). |
| Enceladus | Bright icy terrain and fractured south-polar regions | Predominantly black sky; Saturn/rings conditional on geometry; localized plumes | **Orbit-only**. No ice, fracture or plume environment. [NASA Enceladus](https://science.nasa.gov/saturn/moons/enceladus/). |
| Titan | Water-ice substrate, dark organic dunes, channels and hydrocarbon lakes | Hazy orange daylight; no unobscured clear star field beneath the thick haze | **Orbit-only**. Needs its own terrain, liquids and atmosphere; ordinary gray rocks are inadequate. [NASA Titan facts](https://science.nasa.gov/saturn/moons/titan/facts/). |
| Titania | Dedicated icy-moon terrain package needed; no local appearance has been qualified | An optically thin baseline would need qualification; do not reuse Titan's orange haze | **Orbit-only**; local terrain/sky unverified. [NASA Titania overview](https://science.nasa.gov/uranus/moons/titania/). |
| Triton | Icy terrain with nitrogen frost and active surface processes | Thin nitrogen atmosphere; mostly dark sky with subtle scattering, not a thick terrestrial blue dome | **Orbit-only**. Classification corrected to atmospheric solid; still no local rendering package. [NASA Triton](https://science.nasa.gov/neptune/moons/triton/). |

The three other catalogued small bodies, **Ceres, Vesta and Bennu**, are also orbit-only; no local surface/day/night render is available. The Sun has no landing mode. Pluto and other unlisted destinations are outside this catalog audit.

## Corrections made during this audit

- Removed the solar-colored night radiance floor (previously 4.5% for clear profiles and 12% for opaque haze). Solar sky radiance now reaches zero below the illustrative twilight interval. Atmospheric extinction remains active: dark clouds do not become transparent to stars.
- Added a directional warm Earth / blue Mars low-Sun tint. Its colors, angular spread and twilight interval are illustrative shader parameters, not measured spectral scattering.
- Applied the same daylight star-adaptation rule to optically airless Mercury and the Moon.
- Corrected Triton's capability classification to acknowledge its tenuous atmosphere, without advertising an unimplemented landing mode.
- Added a repeatable local-render comparison and per-profile day/twilight/night regressions.

## Validation and practical limits

The comparison runs nine environments at Sun elevations **+45°, 0°, −45°**, in body-fixed coordinates, at a fixed 600×360 capture size and low quality. Solid destinations use eye height 1.7 m; giants use the existing 25 km hover. A fixed near-horizontal camera faces the Sun's azimuth. Solar distance is normalized to 1 AU and exposure fixed to 1, equivalent here to comparing after distance compensation. These are controlled lighting inputs, not epochs or ephemeris predictions. The Moon uses its installed landing region; other solid bodies use the equatorial prime-meridian reconstruction.

The native Chrome comparison completed **9 environments × 3 angles, 0 environment failures**. This exercises real terrain preparation/descent and shaders, but not the main application's travel buttons, orbital disks, eclipse composition, HDR adaptation controller or every terrain location. The page omits those intentionally and labels its scope. The source-derived sky is static with illustrative body orientation; it is not a location-and-date planetarium.

The initial inspection showed repetitive/flat reconstructed terrain, grazing-light speckling in fine ground detail, coarse bright lunar hills, simple atmospheric gradients and cloud patterns, and no terrain illumination from parent planets/moons. The follow-up below addresses image continuity and speckling; the broader realism limitations remain. The Milky Way and enhanced H-alpha map are display imagery, not naked-eye brightness predictions. Airglow, aurora, lightning and weather are absent. Therefore this audit does **not** certify any destination as photorealistic.

Initial audit checks: `npm run typecheck`, `npm run lint`, `npm test -- --maxWorkers=2` (**245 tests / 44 files**), and `npm run build` passed. Reduced test workers avoid local CPU contention; no tests were skipped.

## Follow-up terrain corrections

After the visual audit, the following code changes were implemented:

- The renderer previously kept only the finest regional image. At the Moon's landing site this discarded the 20.48 km context orthophoto when the 2.56 km landing image arrived, exposing a differently processed global mosaic on nearby hills. It now keeps both registered overlays, applies context before detail, and clips/blends each only within its measured coverage. No source pixels, heights or radiometric calibration were changed. Baked source shadows and coarse distant geometry remain limitations.
- Fine bump height is differentiated before its display fade is applied, with bounded slopes, screen-footprint filtering and grazing-angle attenuation. Ground detail amplitude is reduced from 45 mm to 6 mm as a display choice, not a measured regolith property. Photographic albedo detail remains visible.
- Texture ownership tests cover parent-layer retention, stale asynchronous loads, teardown and missing fine imagery. Provider tests verify context/fine ordering and unavailable coverage.
- The comparison page now offers low, medium, high and auto quality links. Each selection reruns the scenes; the default is low.

### Visual follow-up — 17 November 2026

After Windows was unlocked, the comparison completed **nine environments × three solar angles in both low and high quality**, with **zero environment failures** in each pass. The high-quality pass uses the main application's PCF shadow type and quality-dependent shadow-map enablement; the diagnostic previously left renderer shadows disabled regardless of preset. The final Chrome console showed no shader/WebGL errors.

Native browser inspection confirmed that the bright grazing-light speckling is substantially reduced on Mercury, Venus, Earth, Moon and Mars, while daylight albedo detail remains. The lunar hills now show regional orthophoto texture rather than the smooth global fallback. The pronounced bright-hill/dark-valley contrast remains visible: the imagery contains baked lighting and exposure differences, and the geometry remains coarse at distance. This is improved continuity, not a completed lunar photometric correction. Giant cloud views remain opaque and dark at night; unimplemented satellite environments remain explicitly orbit-only.

These checks use fixed 600×360 captures and controlled lighting. Medium/auto, mobile performance, walking motion and arbitrary sites were not separately visually qualified in this follow-up. Type checking, lint, **249 tests / 45 files**, and the production build passed again on 17 November.

### Moon and Mars realism pass — 18 November 2026

Mars now uses a deterministic body-fixed relief field with layered uplands, rounded benches, erosion variation and shallow sand undulations. Mesh generation and collision sample the same field, continuous across longitude wrap and poles. Ground material blends dusty sand with darker exposed slopes, and stones have flatter fractured silhouettes. Terrain and stones share distance-dependent aerial perspective before tone mapping; solar haze radiance reaches zero at deep night. These are illustrative parameters, not measured Mars topography or aerosol/weather data.

Visual references include NASA's [Curiosity sulfate-region and streambed view](https://science.nasa.gov/resource/curiositys-view-of-sulfate-bearing-region-and-streambed-rocks/) and [dune texture comparison](https://science.nasa.gov/resource/textures-where-curiosity-rover-studied-a-martian-dune/). They guide morphology, not exact geography or calibrated color; white-balanced rover pictures are not used as natural-color standards. No new image assets or dependencies were added.

The Moon retains its measured elevations and spatial imagery. A monotonic display contrast remap reduces excessive bright-hill/dark-valley differences; [LUNAR_DATA.md](LUNAR_DATA.md) records the formula and the remaining baked-lighting limitation. Ground reflectance uses a restrained specular lobe to avoid mirror-like grazing highlights on porous terrain. Reconstruction edge skirts extend below steep adjacent mesh chords; they remain excluded from shadow casting and collision.

Terrain tile and stone-count budgets remain unchanged. New elevation/slope vertex attributes are included in GPU memory accounting, and shared haze uniforms create no additional textures or render targets. Source resolution, generated feature scale, and rendered triangle spacing remain separate quantities. The pass does not enable additional satellite environments or certify photorealism.

Final low/high comparisons each completed nine environments at three Sun angles with zero failures. Inspection confirmed reduced lunar brightness mismatch and removed the pronounced white Martian sunset bands. Live Mars descent, drag-to-look and short forward-control inputs were exercised at a separate daylight site, with 1.7 m eye height and no shader/WebGL errors in the final console. Repetition, coarse distant geometry, and unmeasured local geology remain limitations; long walking traverses and physical mobile performance are unqualified. All four required checks passed, including 256 tests in 48 files; details are in [VALIDATION.md](VALIDATION.md).

## Recommended implementation order

### 23 November 2026 implementation update

All five solid local destinations (Mercury, Venus, Earth, Moon, Mars) now support the optional original 2K detail tier. Mercury uses an irregular cellular crater field with a compact bowl/rim profile; Earth uses hills/ridges at multiple scales; Venus uses broader plains/uplands with subdued small relief. All generated elevations are sampled identically for geometry and collision and remain bounded by their manifests. The Moon's measured elevation and imagery package is unchanged. No additional satellite landing capabilities are advertised.

The qualitative terrain choices follow [NASA Mercury facts](https://science.nasa.gov/mercury/facts/) and [NASA Venus facts](https://science.nasa.gov/venus/venus-facts/). No radar/geodetic landing data was acquired for these planets. Their meter scales, slope colors and placements remain author-selected reconstructions.

Local lighting now attenuates direct sunlight with a bounded spherical-shell air-mass approximation and a per-body display optical depth. Venus uses strong direct attenuation and diffuse daylight, avoiding hard airless-style surface shadows. Earth and Venus gain shared terrain/stone aerial perspective, while Mercury and Moon remain optically airless. The unqualified constant solar ambient floor is removed. Night-side terrain can consequently be black: parent-body illumination, airglow and thermal emission are still not modeled. Eclipse handling remains the existing direct-light approximation; no multiple scattering calculation is claimed.

All atmospheric skies use a bounded forward-scattering angular lobe and finite horizon path length. Venus and the four giant demonstrations replace repetitive sine cloud patterns with three octaves of continuous three-dimensional noise; this remains a sky dome, not volumetric clouds or a weather simulation. Giant sessions retain their groundless 25 km hover and opaque cloud-level nights. The cyan/blue-green distinction remains qualitative, informed by [NASA Hubble observations](https://science.nasa.gov/asset/hubble/uranus-and-neptune/), not calibrated local radiance.

High-quality detail is optional and bounded; geometry budgets, pixel-ratio caps and rock counts are unchanged. A live tier upgrade can briefly retain both old/new map pairs (about 107 MiB for those RGBA8 texture pairs including mipmaps), then releases the old tier. Automatic quality does not select HD maps. Source downloads and provenance are recorded in [ASSET_SOURCES.md](ASSET_SOURCES.md). Visual checks and final automated results belong in [VALIDATION.md](VALIDATION.md).

1. Extend the verified low/high fixed-view checks to movement, medium/auto and mobile; address lunar baked-lighting contrast without inventing calibrated reflectance.
2. Give Mercury, Venus, Earth and Mars distinct terrain morphology and atmosphere-aware lighting instead of relying primarily on tint changes.
3. Add icy-moon, volcanic-moon and small-body terrain families, with explicit source/procedural labels and shape-aware navigation.
4. Implement Titan and Triton separately, with atmosphere parameters and provenance, before enabling their descent buttons.
5. Add parent-planet/moonlight, qualified local sky orientation, pressure-dependent giant clouds and validated exposure presets.
