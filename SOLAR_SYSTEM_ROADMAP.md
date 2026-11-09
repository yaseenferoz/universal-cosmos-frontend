# Solar System expansion: audit and implementation roadmap

**Status update, 9 November 2026:** The baseline below records the 2 November audit. The local catalog now includes ten additional moons and three named asteroids/dwarf planets, with nine historical moon maps. This is an initial catalog expansion; scientific ephemerides, comprehensive satellite/asteroid ingestion, shape models, and surface terrain remain open work.

Audit date: 2026-11-02. This is the **pre-Milestone 1 baseline and a proposal**, not a statement that the full Solar System upgrade has been implemented. This implementation turn is limited to the audit and Milestone 1 (Sun rendering, apparent size, illumination and exposure). Milestones 2–9 require subsequent implementation and validation. Preserve the working application, backend contracts and lunar slice.

## 1. Repository audit

| Area | Existing implementation at audit | Gap / consequence |
| --- | --- | --- |
| Object catalog | `src/types/celestial.ts` defines a ten-member `ObjectId` union; `src/data/catalog.ts` contains Sun, eight planets and Moon. | Every other moon, dwarf planet, asteroid, comet and trans-Neptunian object is absent from the frontend catalog. Unknown objects cannot become destinations merely because the backend returns them. |
| HTTP compatibility | `CelestialService` is the application boundary. `HttpCelestialService` reads `/api/v1/systems/solar`, object details by UUID, and paginated search. `backendCatalog.ts` joins backend identities to bundled physical/display values and filters supported slugs. | The system parser requires the ten bundled bodies. Search fetches pages of 100 with a ten-page guard, then filters unsupported records. This is bounded backend search, not an extensible catalog ingestion pipeline. |
| Ephemerides | Backend window types describe TDB/ICRF geometric vectors and provenance. Both service adapters return an explicit unavailable result for the UI's UTC single-position contract. | No scientific vector window is requested or used by animation. Time conversion, interpolation, reference-center handling and body orientation need explicit adapters. Current circular trajectories must remain labeled illustrative. |
| Scale and precision | Exploration preserves physical radius/distance ratios at 10,000 km per rendering unit; Overview deliberately compresses distances and exaggerates radii. CPU doubles and `FloatingOrigin` separate absolute positions from GPU transforms. | The frame is an illustrative hierarchical model, not an astronomical ephemeris. New bodies need explicit physical frames, epochs, units and nullable measurements; existing display parameters must not become scientific data. |
| Sun geometry | Catalog radius is 695,700 km. Exploration already applies the same scale to Sun radius and orbital distances. | The physical radius does not need decorative enlargement. Apparent angular size needs direct tests and distant-pixel handling that never changes the geometric disc radius. |
| Sun appearance | `CelestialBody` uses a plain `MeshBasicMaterial`, color `#fff5e8`, `toneMapped: false`; no verified photosphere map is installed. | No solar limb darkening, granulation, corona, prominences, HDR radiance model or adaptive exposure. A dedicated renderer must identify modeled solar detail honestly. |
| Lighting | Main scene uses a directional source of intensity 3.1, ambient 0.015, and a shadow camera fitted to the selected body. The separate lunar pass already transforms Sun direction into Moon-fixed coordinates and scales illumination by inverse square distance. | Main-scene intensity is not distance dependent. A shared solar state is needed; a selected-body shadow volume is not a general Solar System eclipse solver. Illumination direction, occultation and display exposure are separate concerns. |
| Exposure | `RendererManager` uses ACES filmic tone mapping, sRGB output and exposure 1. Settings apply relative EV compensation as `2 ** EV`, bounded to −3…+3. | Manual compensation exists; temporal adaptation does not. Values are not calibrated camera exposure or physical luminance measurements. Sun's current untone-mapped material bypasses exposure. |
| Planet materials | Sphere LODs and bounded progressive texture leases; separate Earth day/cloud/night layers; derived Moon normal map; partial Hubble/OPAL maps; observed Saturn radial ring profile. See `ASSET_SOURCES.md`. | Coverage and observation epochs differ. Venus lacks a verified global visible-light cloud mosaic. Most bodies have no measured normals/roughness, terrain or shape mesh. Ring brightness-derived alpha is not calibrated optical depth. |
| Terrain and descent | `LunarTerrainProvider`, cube-sphere quadtree geometry, frustum/horizon culling, skirts, bounded caches and a separate meter camera. Taurus–Littrow uses a 1,737,400 m datum, coarse global LOLA context, 40 m regional data and a local 5 m DEM. | This is one prepared lunar region, not global detailed Moon terrain or a reusable multi-body descent system. The navigation/provider/coordinator classes and manifest are Moon-specific. Collision uses both source DEM and visible triangle height. |
| Atmospheres | Earth has an approximate view-dependent limb shader and cloud layer; Moon has black sky. | No integrated Rayleigh/Mie optical-depth atmosphere, pressure profile, Venus/Titan haze, Mars dusty sky, or gas-giant atmospheric descent. Existing Earth limb is not a ground-to-space scattering model. |
| Navigation and UI | Orbit/free camera, focus/travel, search, separate Overview, time controls, keyboard/pointer/touch handling, lunar descent/walking/ascent, source notices and accessible panels. | Discovery and render readiness must become independent. No Sun landing, no solid giant-planet landing, and no travel to a missing orbit may be offered as if supported. |
| Mobile and lifecycle | Bounded DPR, explicit quality presets, adaptive DPR, adaptive terrain budget, disposed meshes/maps/listeners, cancellation and late-result guards. Low/Medium/High terrain budgets are 72/120/192 selected tiles and 16/24/32 segments. | WebP compresses downloads but is not GPU-native texture compression. No KTX2/Basis pipeline or general GPU budget across all future providers. Physical-device sustained thermal/memory measurements remain required. |

The recorded baseline is 106 tests in 22 files, typecheck, lint and production build, with desktop and responsive-emulation lunar browser checks in `VALIDATION.md`. This document does not independently repeat those browser observations or claim new Sun verification. Each new milestone must append its actual results.

Local mode is available through environment configuration. **HTTP mode currently reports backend failure; it does not automatically fall back to the local catalog.** Transparent, visibly labeled fallback is a future provider change, not an existing feature.

## 2. Object coverage matrix

“Present” means searchable and represented by the current application, not fully observed or landable. “Absent” means no frontend catalog entry and no installed object-specific rendering package. The proposed major-moon selection below is a release-priority set, not a permanent definition or an exhaustive moon inventory. Import remaining satellites from a versioned authoritative catalog rather than hardcoding a changing total. [JPL planetary satellites](https://ssd.jpl.nasa.gov/sats/)

| Class / system | Present now | Proposed coverage and current gaps | Intended mode when its data supports it |
| --- | --- | --- | --- |
| Sun | Sun; plain emissive sphere | Dedicated solar renderer is Milestone 1. No observational photosphere/corona time series installed. | Solar approach; never landing |
| Terrestrial planets | Mercury, Venus, Earth, Mars | Catalog and orbital sphere imagery/placeholder only; no solid surface descent except Moon in its separate class. | Solid terrain; atmosphere where applicable |
| Giant planets | Jupiter, Saturn, Uranus, Neptune | Observed, partly incomplete atmospheric maps; no pressure/depth exploration. | Cloud tops and atmospheric descent; never a fictional solid surface |
| Earth satellite | Moon | One prepared Taurus–Littrow landing region; global coarse context is not global 5 m coverage. | Measured regional landing, orbit elsewhere |
| Mars satellites | None | Phobos, Deimos absent. | Orbit; shape/surface modes only after data review |
| Jovian major satellites | None | Io, Europa, Ganymede, Callisto absent. Smaller regular and irregular satellites also absent. | Object-specific solid-body modes with measured coverage labels |
| Saturnian priority satellites | None | Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus; also Hyperion and Phoebe absent. Remaining small satellites absent. | Solid-body modes; Titan additionally requires atmospheric descent |
| Uranian major satellites | None | Miranda, Ariel, Umbriel, Titania, Oberon absent; other satellites absent. | Orbit initially; data-qualified solid surfaces later |
| Neptunian priority satellites | None | Triton, Proteus, Nereid absent; other satellites absent. | Orbit initially; object-specific environment only when justified |
| Recognized dwarf planets | None | Ceres, Pluto, Haumea, Makemake, Eris absent. Classification is sourced, not inferred from a large radius. | Orbit; solid-body descent only with measured or explicitly reconstructed coverage |
| Dwarf-planet satellites | None | Pluto system (Charon, Styx, Nix, Kerberos, Hydra); Haumea system (Hiʻiaka, Namaka); Dysnomia; Makemake's satellite are ingestion targets. Verify exact identifiers and current source metadata during import. | Catalog/orbit first; no blanket terrain claim |
| Major / mission-target asteroids | None | Candidate first batches: Vesta, Pallas, Hygiea, Eros, Itokawa, Bennu, Ryugu, Didymos and Dimorphos. This list is prioritization, not an assertion that their shape/terrain packages are installed. | Orbit; irregular shape support before local surface exploration |
| Comets | None | Candidate first batches: 1P/Halley, 67P/Churyumov–Gerasimenko, 81P/Wild, 9P/Tempel, 103P/Hartley. Remaining known comets require paginated ingestion. | Orbit; observed nucleus where available; explicitly modeled activity/tails |
| TNOs and Kuiper Belt objects | None | Candidate first batches: Arrokoth, Quaoar, Orcus, Sedna, Gonggong, plus cataloged companions where validated. Do not label every candidate a recognized dwarf planet. These classes overlap and must not create duplicate entries. | Discoverable catalog; orbit or clearly labeled low-detail representation |
| Smaller moons and small-body satellites | None beyond Moon | Ingest source snapshots and aliases, including unnamed/provisional designations. Availability and classification can change. | Discovery even when orbit, shape or imagery is missing |
| Planetary rings | Saturn radial visual layer only | Jupiter, Uranus and Neptune ring rendering absent; Saturn diffuse/outer structures and calibrated optical-depth data absent. Rings are components of a body system, not solid landing destinations. | Non-landable volume/radial structure with sourced limits |

NASA identifies five recognized dwarf planets and distinguishes them from candidates; the roadmap follows that classification rather than promoting additional bodies. [NASA dwarf planets](https://science.nasa.gov/dwarf-planets/)

Use source-backed identifiers and aliases at ingestion. Existing slugs and backend UUIDs remain compatibility identities; new canonical identifiers should carry their namespace. A body center and its system barycenter are different records (for example, Earth center `399` versus Earth–Moon barycenter `3`). Never derive one from the other by name matching. [NAIF identifier conventions](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/naif_ids.html)

## 3. Missing scientific dataset inventory

Installed products are enumerated in `ASSET_SOURCES.md`, `src/data/imagery.ts`, `LUNAR_DATA.md` and `moonTerrainManifest.ts`. The following are **requirements or candidate acquisition paths, not downloaded/validated assets**. Archive membership alone does not establish usable coverage, projection, licensing, uncertainty or resolution.

| Needed dataset / metadata | Installed baseline | Required work and honest fallback |
| --- | --- | --- |
| Solar photosphere observations, granulation statistics, limb law and spectral interpretation | No solar image/map or solar parameter manifest | Review appropriate NASA solar observations and scientific model parameters. Milestone 1 may use labeled analytic limb darkening and stochastic granulation; these are not observations of current solar features. Do not manufacture a complete historical globe from one image. |
| Solar corona/prominence geometry and time | None | Record observation date, bandpass, observer and projection if using imagery. Otherwise expose a labeled illustrative corona; prominence visualization is disabled or explicitly illustrative. A photograph is not a three-dimensional coronal density field. |
| Body identities, aliases, taxonomy, discovery status and parent systems | Ten bundled identity/physical records | Build reproducible JPL/authoritative ingestion with snapshot version, conflicts, pagination and provenance. Unknown properties stay null; missing radius must not become zero or an invented Earth-like value. |
| Position/velocity windows and rotation/orientation kernels | Backend type contract only; no active scientific playback | Validate target, center, time scale, frame, units, coverage and source version. Add UTC/TDB conversion and bounded interpolation before using the data for placement. Keep modeled trajectories as a separately labeled fallback. [JPL Horizons documentation](https://ssd.jpl.nasa.gov/horizons/manual.html) |
| Mercury, Mars, Earth and Venus elevation/imagery | Orbital Mercury/Mars/Earth imagery; no installed terrain products for these bodies | Candidate acquisition through NASA PDS/USGS and mission products. Confirm datum, map projection, no-data, seam behavior and source resolution per region. Venus radar and visible cloud imagery must remain different layers. |
| Moon beyond the prepared region | Coarse global LOLA and a limited LROC regional package | Add measured regions and manifests incrementally; do not relabel interpolated global context as detailed coverage. |
| Europa, Io, Enceladus and other satellite terrain/shape/albedo | None | Audit mission archives per object. Partial images do not imply a complete shape or elevation model. Allow catalog/orbital representation without enabling landing. |
| Titan/Earth/Venus/Mars atmosphere profiles | Earth approximate limb/cloud rendering only | Need sourced composition, density/pressure profiles, wavelength assumptions, scattering/extinction/cloud models and uncertainty. Distinguish surface elevation from atmosphere altitude and pressure levels. |
| Giant-planet atmosphere/depth profiles | Static partial cloud imagery | No measured global three-dimensional weather or deep interior field is installed. Define reference pressure/radius, valid altitude/depth range and explicit model limits; never add a rocky collision shell. |
| Dwarf planets and distant-object imagery/shape/terrain | None | Audit observation coverage separately for each body; a detected object or fitted diameter is not a resolved surface. Unknown regions remain unavailable or clearly reconstructed. |
| Asteroid/comet shapes, spin states and local terrain | None | Import source meshes with units, frame, epoch, topology and uncertainty. Cube-sphere heightfields alone cannot express overhangs/contact binaries; use a shape renderer/collider where needed. Activity and dust require distinct modeled layers. |
| Ring optical depth, particle scattering, dimensions and pole orientation | Saturn brightness-derived alpha profile | Acquire measured radial/vertical information if justified. Keep existing approximate alpha labeled; avoid treating brightness as calibrated transparency. |
| GPU-native compressed variants and measured device budgets | WebP download assets and bounded caches | Evaluate KTX2/Basis only after visual/data-channel correctness tests. Retain a compatible fallback; measure texture, geometry and render-target memory rather than reporting compressed file size as GPU memory. |

JPL's SBDB query API supports requested fields, constraints and offset/limit paging, and warns that the underlying database can change between requests. A reproducible ingestion job should preserve the source snapshot/retrieval time and identifiers rather than treating an unversioned paged crawl as an atomic snapshot. [SBDB Query API](https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html)

## 4. Architecture proposal — not implemented by this document

Keep React, Zustand, Vite, direct Three.js and the existing renderer/animation ownership. Extend boundaries rather than replacing the application.

1. **Catalog registry versus scene registry.** A paged catalog holds lightweight scientific identities and capabilities. A separate bounded scene registry instantiates only selected/nearby/visible objects. Search does not require a mesh, texture or terrain allocation. Missing orbit permits discovery and a data page, but not a fabricated physical location.
2. **Canonical identity and compatibility.** Add a namespace-aware identifier plus aliases, source IDs, parent relationship and optional existing backend UUID. Retain existing ten slugs as aliases throughout migration. Replace assumptions in `ObjectId`, `objectById`, imagery indexing, system validation and GPU iteration together; merely widening the TypeScript union is insufficient.
3. **Independent capabilities per dataset.** Store `catalogued`, orbit availability/coverage, measured shape, measured terrain regions, imagery coverage, atmospheric model and reconstruction status independently. Each product includes source/version, epoch, coordinate frame, units/datum, uncertainty/resolution, geographic coverage, attribution and transformation notes. UI labels distinguish observed, observation-derived, explicitly procedural, and unavailable. A body can have a known orbit and no resolved imagery.
4. **Providers.** Keep `CelestialService` as the catalog-facing compatibility boundary. Add composable `CatalogProvider`, `EphemerisProvider`, `TerrainDataProvider`, `TextureProvider`, `AtmosphereProvider` and `ReferenceProvider`. Existing texture lease and lunar terrain interfaces are foundations. All asynchronous requests accept cancellation; caches have byte/count bounds and immutable dataset versions. No simulated network requests.
5. **Navigation policies.** Introduce capability-selected `solid-surface`, `atmosphere`, `gas-atmosphere`, `solar-approach` and `orbit-only` policies. Reuse a body-local meter pose, flight phases, pointer/touch inputs and collision interface. Generalize the current Moon coordinator only after preserving its behavior in tests. Sun has no landing; giants have no solid collider. Terrain coverage, not a broad body category, determines where measured landing is available.
6. **Frames and scale.** Keep physical km/CPU doubles, body-fixed meter frames and GPU-relative transforms explicit. Add source frame/time transforms without changing Overview's display mapping. Distinguish body centers from barycenters. Camera speed, clipping and tile selection adapt to local scale. Rotation models and positions must share compatible time conventions. No silent switch from scientific to illustrative positions.
7. **Rendering components.** Dedicated solar renderer and shared solar illumination/exposure state; per-body atmosphere profile; sphere/heightfield or irregular-shape geometry chosen by evidence; optional ring/coma/plume layers with separate provenance. Unknown terrain can use a clearly labeled demonstration model, but such a model must not acquire a measured-data badge or reuse measured uncertainty values.
8. **Offline/failure behavior.** Add an explicit fallback decorator around the catalog provider. On remote unavailability, present the bundled snapshot with a persistent coverage/source notice and retry action. Never claim remote completeness or silently mix conflicting identities. Authentication/configuration/schema errors remain distinguishable from temporary network failure. Local mode must remain directly selectable.

### Backward-compatible API contract proposal

No backend response format or endpoint is changed by Milestone 1. Keep the current `{ success, data, meta }` envelope, UUID identities, `/api/v1/systems/solar`, `/api/v1/objects/:uuid` and `/api/v1/search?q=&page=&pageSize=` behavior. The existing `CelestialService` methods remain valid for the bundled compatibility set.

For Milestone 2, agree additive optional provider capabilities with the backend before implementation:

| Proposed operation | Required contract | Compatibility rule |
| --- | --- | --- |
| `catalogCapabilities()` | Supported filters, page mode, schema version, source snapshot and completeness/coverage | If unavailable, use the current adapter with an explicit ten-body coverage label. |
| `listObjects({query, kinds, parentId, page, pageSize}, signal)` | Lightweight entries, stable source identifiers/aliases, nullable physical fields, source snapshot and existing `meta.pagination` semantics | Do not change `getObjects()` into an unbounded full-catalog download. A new additive catalog route can be negotiated; no proposed URL is claimed to exist today. |
| `getObjectCapabilities(id, signal)` | Dataset manifests and availability by orbit/shape/terrain/imagery/atmosphere, with references and limits | Unknown fields can be added in a new optional metadata resource; do not require old servers to return them. |
| `getEphemerisWindow(request, signal)` | Target and center IDs; explicit frame/plane, TDB sample epochs, km/km/s vectors, correction convention, source version and coverage | Preserve the existing backend window schema. A tested adapter converts to application time/frame; never reinterpret TDB strings as UTC dates. |
| `getTerrainManifest`, `getTextureManifest`, `getAtmosphereProfile`, `getReferences` | Immutable versioned products, provenance, bounds/units/no-data, cache policy and supported representation | Existing local static manifests implement the same interfaces. Assets are fetched only on demand. |

Names above are proposed provider methods, not implemented API promises. Optional cursor paging may be negotiated later, but page/cursor semantics must be explicit and never silently mixed. Snapshot consistency, duplicate suppression, malformed records, cancellation, unknown parents and partial results require contract tests. An unknown object from search must remain discoverable even if its detailed render asset is missing.

## 5. Staged implementation and acceptance gates

Every milestone requires typecheck, lint, relevant meaningful tests, production build, and actual browser inspection of changed rendering. Record screenshots, defects and limitations in `VALIDATION.md`; distinguish desktop emulation from physical mobile testing. A passing formula test is not visual verification, and a rendered sphere is not proof of complete dataset coverage.

### Milestone 1 — Sun rendering, apparent size and exposure (current scope)

- Preserve physical radius and use `angularDiameter = 2 * asin(radius / observerDistance)` outside the photosphere. Keep all values in one physical unit system. Test at Mercury-like, 1 AU, Jupiter-like and outer-system distances; at 1 AU the existing radius implies about 0.53 degrees. Distinguish angular geometry from optional optical glare.
- Add a dedicated photosphere renderer with near-white visible-light interpretation, linear HDR-style emissive values, approximate limb darkening and resolution-aware granulation. Label generated detail as a model; no fabricated current sunspots or observational metadata.
- Share Sun direction and inverse-square illumination with main and lunar rendering. Add bounded, frame-rate-independent exposure adaptation plus manual EV compensation and reset behavior. Document the exposure heuristic and lack of absolute radiometric calibration.
- Make corona appearance exposure/occultation aware. Prominences require verified data or an explicit illustrative label; otherwise omit them. Optional glare must not alter the physical photosphere edge or obscure the viewport with excessive bloom.
- Handle opaque foreground occultation of the solar disc and test illumination attenuation/visibility limits. Analytic spherical overlap is an approximation; ring transparency, irregular-body shadows and scientifically timed eclipse prediction need separate data/models. Current circular trajectories cannot predict real eclipses.
- Provide solar-approach behavior without a landing action. Retain explicit Overview exaggeration, all existing destinations and lunar surface navigation.
- Acceptance: angular-size and Sun-direction tests; inverse-square and stable exposure tests; visible full/partial/total occultation cases; no glare leaking through an occulting disc; inspected Sun views from inner, Earth-distance, Jupiter-distance and distant viewpoints; quality/mobile layout checks; Moon orbit/surface/return and backend regression checks. Record any incomplete solar effects rather than calling the entire brief complete.

### Milestone 2 — Extensible catalog and major moons

Implement identifier migration, paginated ingestion/search, capability badges and initial major-moon systems from the matrix. Keep data-only entries discoverable. Resolve parent/barycenter relationships and aliases without duplicating objects. Acceptance: more than ten destinations discoverable, all prioritized major moons searchable, unknown assets visibly limited, bounded scene allocations independent of catalog size, pagination/cancellation/duplicate tests, existing backend payloads still accepted, explicit offline coverage.

### Milestone 3 — Reusable descent architecture

Extract body-local navigation, coordinate/datum policy, collision, tile-provider selection and flight lifecycle from the Moon implementation. Add explicit solid/atmosphere/giant/solar/orbit-only policies. Acceptance: existing Moon controls and visual result preserved; unit/frame changes round-trip; transitions cancel safely; no Sun or giant landing; unsupported coverage disables measured landing with a reason.

### Milestone 4 — Moon and Mars surface exploration

Expand verified Moon regional coverage and add a sourced Mars region with datum, DEM, imagery and qualified dusty-environment model. “Complete” means the declared release regions and supported controls, not invented global high-resolution terrain. Acceptance: documented coverage/accuracy, orbit-to-ground-to-orbit on both, cross-tile seams and altitude/collision tests, correct airless lunar sky, Mars-specific documented atmosphere assumptions, no fabricated fine detail.

### Milestone 5 — Earth, Venus and Titan environments

Implement configurable density/scattering/extinction/cloud profiles with explicit wavelength and approximation limits; combine only with available surface datasets. Keep Earth ocean/clouds, Venus radar terrain versus visible atmosphere, and Titan haze/surface observations distinct. Acceptance: body-specific altitude/day/night behavior, solar attenuation and horizon tests, source-qualified material/terrain regions, responsive controls and bounded atmospheric cost. Color fog alone does not satisfy the milestone.

### Milestone 6 — Remaining solid-body destinations

Add measured or explicitly reconstructed Mercury and major-moon environments incrementally: icy, volcanic, airless and thin-atmosphere profiles as appropriate. Add irregular shape/collision support where a sphere/heightfield is insufficient. Acceptance: every shipped mode has documented evidence and coverage; parent bodies appear in the correct modeled/scientific direction for the selected frame; unavailable regions retain visible status; no generic Earth-like sky or invented measured landscape.

### Milestone 7 — Giant-planet atmospheric descent

Implement cloud-top and pressure/depth navigation for Jupiter, Saturn, Uranus and Neptune with bounded atmospheric opacity and declared reference pressure/radius. Acceptance: no solid landing or ground collider, clear model-depth limits, distinct profiles/cloud observations, smooth return, unit-tested pressure/altitude conventions and inspected transitions at all quality presets.

### Milestone 8 — Dwarf planets, asteroids, comets and smaller moons

Use the ingestion pipeline for the matrix's remaining classes and source-validated satellite systems. Add shape/texture packages only where reviewed; comet activity, plumes and unobserved terrain remain separately labeled models. Acceptance: complete discovery of the imported snapshot even when detailed rendering is unavailable; canonical IDs and aliases retained; no all-object GPU allocation; shape frame/scale tests; provenance for each rendered layer and no false global terrain claim.

### Milestone 9 — Mobile optimization and scientific/performance validation

Measure representative physical mobile devices, weak GPUs and desktop browsers. Add GPU-native compressed assets only where supported and visually correct; test fallback shaders, low-power mode, memory pressure, lifecycle and repeated travel. Validate all eight planets, major-moon discovery, Sun angular size/exposure/eclipses, terrain transitions, frames and source labels. Acceptance: published test conditions and sustained frame-time/memory results, reliable touch/keyboard access, bounded assets/render targets, graceful missing-data/unsupported-feature behavior and a clear remaining-gap list. No universal mobile performance claim from desktop emulation.

## 6. Release reporting

Update this baseline with dated milestone results without rewriting proposals as completed features. The current task may mark only the verified portions of Milestone 1 complete. Maintain a machine-readable capability inventory as catalog support expands, and keep source provenance adjacent to every observed/derived/reconstructed product. Scientific data scarcity is a product state to expose, not a visual hole to conceal with unlabelled fabrication.

### 2026-11-02 — Milestone 1 implementation and validation

The dedicated solar photosphere/corona, physical angular size and irradiance, global exposure controls, bounded eclipse rendering, distance presets and lunar-lighting integration are implemented. Strict TypeScript, lint, 169 tests and the production build pass. Actual browser inspection includes the distance presets, close procedural granulation, manual/automatic exposure, responsive controls, synthetic full/partial/total solar occultation, and Moon descent/return. [VALIDATION.md](VALIDATION.md) records screenshots, resolved defects and remaining observational/device limits; [SOLAR_SOURCES.md](SOLAR_SOURCES.md) records the scientific and display approximations. This milestone does not add catalog objects, ephemerides, additional landing destinations or atmospheric descent. Milestone 2 is the next implementation stage.
