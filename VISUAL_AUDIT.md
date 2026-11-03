# Visual correction audit — 2026-11-02

## Observed baseline

The running app was inspected in Chrome before modification. Earth had angular painted continent outlines and curved brushstroke clouds, a thick blue silhouette, and a crowded scene including an oversized Moon and a very large striped Sun. The interface still said Exploration while a separate breadcrumb said Overview. Navigation, destination miniatures, captions, and controls occupied substantial viewport space.

## Causes in the original code

- `ProceduralTextures.ts` draws invented geography, bands, craters, and cloud strokes. These are illustrations rather than observational maps.
- `CelestialBody.ts` applies the same compressed display radius and orbit model in every view. Its atmospheric rim is not tied to sunlight. Saturn has a vertex-colored annulus rather than a sourced ring-opacity profile.
- `UniverseEngine.ts` shares one compressed scene between closeups and overview, with strong blue ambient light and a decaying point source. Reset/selection state does not define a distinct representation mode.
- The Sun's additive sprite produces a broad colored background glow. The original stars remain conspicuous behind a sunlit planet.
- The permanent navigation and planet dock obscure the primary exploration task. Expanded information is the startup default.

## Correction sequence and contracts

1. Establish Earth-orbit startup and explicit Exploration / Solar System Overview modes.
2. Replace Earth albedo with verified observational imagery and progressive texture variants.
3. Use directional sunlight, low ambient fill, a sun-dependent thin atmospheric approximation, separate clouds and night emission, and physically based planet materials.
4. Replace Moon albedo with a verified LRO map.
5. Collapse navigation and detailed information by default; show the destination list only in Overview and use a compact mobile bottom sheet.
6. Replace other textures only where an appropriate, licensed, verified scientific map is available. Disclose missing maps rather than inventing them.
7. Apply a sourced Saturn ring profile with transparency and shadow support when obtainable.
8. Reduce the synthetic background starfield's size and luminance. Keep its procedural origin explicit.
9. Keep nonphysical scaling confined to clearly labeled Overview. Exploration uses a uniform kilometer-to-render-unit mapping of approximate physical radii and modeled positions, with camera-relative GPU transforms.
10. Run the existing automated suite/build and inspect actual desktop/mobile layouts and render output where browser controls permit.

Measured reference properties, time-tagged observational composites, circular modeled positions, exposure/scattering approximations, and synthetic background stars must remain distinct. Model phases are not real ephemerides. Source, license, attribution, resolutions, and processing belong in `ASSET_SOURCES.md` and the typed imagery manifest. Failed asset loads must be visible to the user.

## Verification

Baseline GPU appearance was inspected in Chrome. Subsequent verification results and any remaining limits are recorded in `VALIDATION.md`; passing a build alone does not verify visual quality.

The implemented correction removes generated planetary paintings and the solar glow sprite, starts at physical-scale Earth, and confines compressed geometry to Overview. Historical scientific maps, partial-coverage masks, derived lunar normals and the Cassini ring profile now replace those illustrations. Browser inspection drove additional fixes for Saturn's initial ring-plane angle and short/narrow HUD spacing. Detailed source exclusions, including fictitious maps hosted on legacy NASA/JPL pages, are documented in `ASSET_SOURCES.md`.
