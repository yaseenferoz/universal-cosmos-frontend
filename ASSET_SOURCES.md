# Scientific imagery audit

## ISS models (24 November 2026)

- **Exterior:** [NASA / VTAD International Space Station model](https://science.nasa.gov/resource/international-space-station-3d-model/). Local `public/models/iss-nasa.glb`, 247,547 triangles, original geometry/materials retained. Source 44.5 MB repacked to 17.8 MB by capping embedded textures at 2048 px and converting opaque images to JPEG. Transparent imagery retains alpha. Reference span normalized to 109 m; no current-configuration claim. Exact download URL and input/output SHA-256 in `public/models/iss-exterior-source.json`.
- **Interior:** [NASA Astrobee media / NASA JSC IGOAL](https://github.com/nasa/astrobee_media), pinned revision `1cb0620121099cc848f5a3db480464188dc91ea3`. Seven COLLADA meshes in `public/models/iss-interior` retain original geometry and UVs, native meter units, and registered visual transforms from `model.urdf` (including its corrected Destiny scale). Textures are capped at 2048 px and encoded as WebP retaining alpha. Cupola diffuse-alpha cutouts and lightly transparent glass reveal the Earth backdrop. Lighting and glass opacity are display approximations. `sources.json` records every original URL and SHA-256. Original configuration is historical; storage/equipment today may differ.
- **Navigation:** NASA Astrobee `IssWorld/keepins/keepin.json`, pinned URL in `src/data/issKeepins.json`. Union of simulator free-flight volumes with a 12 cm camera-clearance approximation and bounded swept movement. Source frame: +X forward, +Y starboard, +Z nadir; render frame: +Y zenith, origin at corridor elevation 4.85 m. These volumes do not model astronaut body mechanics.
- **Cupola adaptation:** the original diffuse atlas includes two painted star-field pane islands and two closed-shutter face islands. The renderer hides these four islands for an open-window observation view, retaining the surrounding NASA frames and equipment. This is a rendering adaptation, not measured glass transmission, a shutter mechanism simulation or a real-time camera view.
- **ISS Earth and Sun view:** Earth uses the native 8192 × 4096 NASA Blue Marble cloud-free land/ocean/ice source on capable desktop High/Auto, 4096 × 2048 on Medium or limited hardware, and 2048 × 1024 on Low. The 2K historic cloud layer is omitted in this ISS view because it visibly obscured the higher-resolution land/ocean image. High/Auto desktop overlays a feathered 4096 × 4096 crop of NASA Blue Marble Next Generation July 2004 over 10–30°E and 10°N–10°S. Its 500 m source tiles C1/C2 are cropped from 4800 × 4800 native pixels; this close detail does not extend to the rest of Earth. The simulated visit starts near 20°E so the detailed region is initially visible, then follows an illustrative 400 km, 51.6° circular orbit with sidereal Earth rotation. Its separate elapsed clock supports pause, speed, phase scrub, successive orbits, and nearest daylight passes by region. The geographic track, Sun direction and Earth shadow change together, but the chosen initial node, station attitude and Sun phase are illustrative and there is no dated orbital epoch; this is not a live position or ephemeris. The separate planetary view retains its cloud layer. `scripts/prepare-iss-earth.py` and `scripts/prepare-iss-earth-detail.py` reproduce these WebP assets; `public/textures/iss-earth-source.json` and `public/textures/iss-earth-africa-source.json` record source/output hashes. The Sun retains a 0.53° analytic disk with broader illustrative glare and a screen label, aligned to both station and Earth directional lighting.
- **Orbit model references:** [NASA Space Station Orbit Tutorial](https://eol.jsc.nasa.gov/Tools/orbitTutorial.htm) documents 51.6° inclination, a 90–93 minute period, westward ground-track shift, and daylight changes. The 400 km altitude is a nominal value within [NASA's 370–460 km operating range](https://www.nasa.gov/reference/international-space-station/). Earth's 6378.137 km equatorial radius and sidereal rotation are from the [NASA Earth Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html); the gravitational parameter 398600.4355 km³/s² is rounded from [JPL DE440](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440_and_de441.pdf). The model assumes a spherical Earth, constant altitude, no drag, precession, reboost, or dated orbital elements. Its coordinate frame and arbitrary elapsed-zero crossing are documented in `src/engine/station/StationOrbit.ts`.
- NASA assets follow [NASA images and media guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/); no endorsement is implied. Earth backdrop reuses the already credited NASA Blue Marble imagery. No third-party runtime requests or paid services are introduced.

Base imagery verified and downloaded on **2026-11-02**; additional moon maps downloaded on **2026-11-09**. Orbital surface maps originate in the observations linked below, though some source mosaics include gap processing. Ground-level Earth and Mars detail textures are separately identified as generated illustrations below. Observed map pixels are never altered: there are no invented continents, copied storms, or painted craters over observed terrain. Regions a mission never imaged (for example the northern hemispheres of Titania and Triton, the southern hemispheres of Pluto and Charon) show an **illustrative continuation** in the shader: the map's own mean colour with procedural mottling and, only for heavily cratered moons, a generic crater field. The information panel labels these regions. These are historical mosaics for an educational visualization, not live observations, ephemerides, or calibrated scientific measurements.

The executable inventory is [`src/data/imagery.ts`](src/data/imagery.ts). It contains each exact download URL, source page, attribution, usage terms, source dimensions, local variants, color space, processing notes, and limitations. Static files live in `public/textures/`; runtime loading requires no third-party image server. Source downloads remain in ignored `.local/asset-source/`.

## Installed inventory

Dimensions below are pixels. Variant sizes are widths; heights retain the source aspect ratio except the one-row ring profile. A repeated size means the source supplies no additional detail; nothing is upscaled.

| Layer | Observation / source | Downloaded dimensions | Low / medium / high | Interpretation |
|---|---|---:|---:|---|
| Earth day | [NASA Blue Marble](https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/) | 8192 × 4096 | 1024 / 2048 / 4096 | Satellite composite of land, ocean, and ice; published ocean-color enhancement retained. |
| Earth clouds | [NASA Blue Marble cloud composite](https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/) | 2048 × 1024 | 1024 / 2048 / 2048 | Historical cloud pattern, including infrared polar data. Grayscale is an approximate opacity mask. |
| Earth night | [NASA Black Marble 2016](https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/) | 3600 × 1800 | 1024 / 2048 / 3600 | VIIRS nighttime-light composite; source includes a darkened land background. Display emission intensity is illustrative. |
| Moon color | [NASA LRO CGI Moon Kit, 2019 color product](https://svs.gsfc.nasa.gov/4720/) | 4096 × 2048 | 1024 / 2048 / 4096 | LROC color mosaic with NASA's polar albedo substitution and gap processing; explicitly a derived visualization product. |
| Moon normal | [NASA LOLA elevation, `ldem_4.tif`](https://svs.gsfc.nasa.gov/4720/) | 1440 × 720 | 1024 / 1440 / 1440 | Tangent normal derived from measured lunar elevation, without relief amplification. |
| Mercury | [USGS MESSENGER MDIS low-incidence mosaic](https://astrogeology.usgs.gov/search/map/mercury_messenger_mdis_basemap_loi_global_mosaic_166m) | 1024 × 512 | 1024 / 1024 / 1024 | USGS preview of 2012–2015 observations, published in 2016. Monochrome 750 nm reflectance; not natural color. |
| Mars | [JPL/USGS Viking mosaic](https://maps.jpl.nasa.gov/tmaps/mars.html) | 1440 × 720 | 1024 / 1440 / 1440 | Historical observed mosaic, with source processing retained. |
| Jupiter | [NASA Hubble 2015 global map A](https://svs.gsfc.nasa.gov/12021/) | 3600 × 1800 | 1024 / 2048 / 2048 | Observed cloud morphology and Great Red Spot; absent polar coverage is transparent. |
| Saturn atmosphere | [Hubble OPAL 2021 A](https://archive.stsci.edu/hlsp/opal/opal-saturn-cycle-28) | 1800 × 900 | 1024 / 1800 / 1800 | F395N/F502N/F631N preview composite. Ring-obscured and southern coverage is missing. |
| Uranus atmosphere | [Hubble OPAL 2014 A](https://archive.stsci.edu/hlsp/opal/opal-uranus-cycle-22) | 721 × 361 | 721 / 721 / 721 | F467M/F547M/F658N preview composite. Southern polar coverage is missing. |
| Neptune atmosphere | [Hubble OPAL 2015 A](https://archive.stsci.edu/hlsp/opal/opal-neptune-cycle-22) | 721 × 361 | 721 / 721 / 721 | F467M/F547M/F657N preview composite. Northern polar coverage is missing. |
| Saturn rings | [Cassini PIA08389, Expanse of Ice](https://science.nasa.gov/photojournal/expanse-of-ice/) | 11298 × 980 | 1024 / 2048 / 2048 | May 9, 2007 observed natural-color radial scan, reduced to a one-row RGBA profile. Alpha is derived, not measured optical depth. |

## Ground-level landing materials

The Moon landing pass uses the measured Apollo 17 regional DEM and LROC orthophoto described in the terrain documentation. The small stones added near the camera on Moon, Earth, and Mars are generated display geometry, with generated placement and scale; they are not mapped boulders or measured rock locations. The Earth and Mars elevation outside the lunar measured region is analytic reconstruction, not site geography.

`public/textures/earth-ground-illustrative.webp` and `public/textures/mars-ground-illustrative.webp` were generated with OpenAI ImageGen on 2026-11-09 as repeatable eye-level material illustrations, then downsampled to 1024 × 1024 and encoded as WebP quality 85. The Earth prompt requested dry upland soil, sparse muted grass, and gravel viewed straight down in diffuse light. The Mars prompt requested rust-colored Jezero-inspired regolith with fine dust, small basaltic pebbles, and shallow ripple traces viewed straight down. Neither texture is a NASA observation, a calibrated color measurement, or a georeferenced site image. They appear only in the reconstructed landing terrain, not on the orbital planet maps. At larger camera distances the detail fades back to the broad terrain color.

## Additional moon maps

The following JPL/USGS maps use Voyager, Galileo, or Viking imaging. Each local image is a bounded 1024 or 1440 pixel WebP conversion of the linked 1440 x 720 JPL source. The JPL catalog describes several as "cleaned up" or color derived, so these are historical visualization products rather than original single photographs. Rotation and illumination remain approximations; most moons still use spherical geometry. See [JPL's map disclaimer](https://maps.jpl.nasa.gov/tmaps/).

**Small-body shape models (26 November 2026):** `scripts/prepare-shape-models.py` installs NASA 3D visualization models for Eros, Bennu, Itokawa, Vesta, Hyperion and Arrokoth ([NASA VTAD](https://science.nasa.gov/3d-resources/)) and for Phobos and Deimos (NASA/JPL-Caltech) as `public/models/<id>-nasa.glb`. Geometry is unchanged; embedded PNG textures are re-encoded as JPEG (2048 px cap), shrinking the eight files from 17 MB to 5.6 MB. `src/data/generated/shapeModels.json` records each source page, download URL, credit, vertex/triangle counts, and the principal semi-axes and extent measured from the mesh. At load the renderer centres each mesh on its volume centroid, rotates it to its principal axes (shortest = spin axis, longest = prime-meridian axis; a proper rotation, never mirrored) and scales it to the catalog's volume-equivalent radius, so source units do not matter. The models' long/short axis ratios agree with JPL SBDB/Horizons dimensions within 25% (tested). Their textures are brightness-normalized visualization atlases with baked illumination, so the renderer rescales them to each body's measured geometric albedo and colour (below). Prime meridians and spin phases are approximate; Hyperion's chaotic tumbling is not modeled. If a model fails to load, Phobos and Deimos fall back to their JPL maps and the others to a seeded illustrative shape.

**New global maps (26 November 2026):** `scripts/prepare-body-maps.py` installs Cassini 2014 global maps of Mimas, Tethys, Dione, Rhea, Iapetus and Enceladus ([PIA18437](https://photojournal.jpl.nasa.gov/catalog/PIA18437), [PIA18439](https://photojournal.jpl.nasa.gov/catalog/PIA18439), [PIA18434](https://photojournal.jpl.nasa.gov/catalog/PIA18434), [PIA18438](https://photojournal.jpl.nasa.gov/catalog/PIA18438), [PIA18436](https://photojournal.jpl.nasa.gov/catalog/PIA18436), [PIA18435](https://photojournal.jpl.nasa.gov/catalog/PIA18435); NASA/JPL-Caltech/SSI/LPI), the New Horizons colour map of Pluto ([PIA11707](https://photojournal.jpl.nasa.gov/catalog/PIA11707); NASA/JHUAPL/SwRI), and USGS Astrogeology previews of the New Horizons Charon mosaic, the Dawn/DLR Ceres mosaic and the Voyager 2 Triton colour mosaic. Every map is re-projected to 0 deg longitude at the image centre with east to the right; each source convention comes from its USGS/PDS label where available and was confirmed by circular cross-correlation against a labelled map of the same body (the Cassini PIA maps and PIA11707 are centred on 180 deg and are rolled half a turn). The Cassini maps are IR3/green/UV enhanced-colour products: their chroma is reduced to 12% so they read at roughly natural saturation; Iapetus instead receives a luminance-dependent reddish-brown tint for the dark Cassini Regio material. Unobserved pixels stay transparent (eroded and feathered) for the illustrative continuation. Each record stores the mean linear luminance of its observed pixels so the renderer scales the map to the body's measured albedo. Charon, Ceres and Triton use 1024-pixel previews; the others 2048 pixels.

**Uranus and Neptune colour (26 November 2026):** the Hubble OPAL 2014/2015 filter composites (F467M/F547M with F658N or F657N) are not natural colour. `prepare-body-maps.py` keeps their brightness structure and 30% of their relative colour variation, re-centred on the true colour measured from Irwin et al. 2024 ([MNRAS 527:11521](https://doi.org/10.1093/mnras/stad3761)) in their reprocessed Voyager 2 comparison image (University of Oxford; [The Planetary Society](https://www.planetary.org/space-images/the-true-colors-of-uranus-and-neptune)): linear R/G = 0.721 and B/G = 0.998 for Uranus, 0.605 and 1.195 for Neptune (pale greenish-cyan; Neptune only slightly bluer). Unobserved and registration-fringe latitudes use a zonal-mean continuation. Weather features are historical.

**Small bodies without maps or models (26 November 2026):** about 490 moons, asteroids, comets and dwarf planets use a seeded, illustrative shape (`src/engine/objects/IrregularShape.ts`: a Gaussian-random-sphere log-radius field after Muinonen 1998 plus power-law simple craters, stretched to measured triaxial proportions where published; large unexplored worlds get no craters) and a colour from `src/data/generated/bodyAppearance.json` (`scripts/prepare-body-appearance.py`): geometric albedo and triaxial radii from JPL Horizons satellite data and the JPL Small-Body Database, SMASSII/Tholen classes and B-V from SBDB, irregular-satellite colours from Graykowski & Jewitt 2018 (AJ 155:184), TNO colours from MBOSS-2 (Hainaut et al. 2012, A&A 546:A115), and cited literature values. Colour indices are converted to reflectance relative to the Sun (B-V 0.64, V-R 0.354; Holmberg et al. 2006). Display brightness uses 0.62*(p/0.6)^0.6, which keeps the order of albedos but compresses their range so very dark bodies stay legible. Missing measurements fall back to family-typical values that the information panel marks as illustrative.

| Bodies | Source page | Coverage note |
|---|---|---|
| Phobos, Deimos | [Mars moons](https://maps.jpl.nasa.gov/tmaps/mars.html) | Viking cartographic mosaics. |
| Io, Europa, Ganymede, Callisto | [Jupiter moons](https://maps.jpl.nasa.gov/tmaps/jupiter.html) | Io blends Voyager and Galileo color; the other selected maps are cleaned Voyager mosaics. Io no-data pixels are masked. |
| Enceladus | [Saturn moons](https://maps.jpl.nasa.gov/tmaps/saturn.html) | Cleaned Voyager mosaic; no current plume activity is depicted. |
| Titania | [Uranus moons](https://maps.jpl.nasa.gov/tmaps/uranus.html) | Voyager monochrome map; the unobserved northern hemisphere (sunlit since the 2007 equinox) is an illustrative continuation. |
| Triton | Superseded by the USGS Voyager 2 colour mosaic above | Mainly southern-hemisphere coverage; the rest is an illustrative continuation. |

Titan uses a plain haze colour (its surface is hidden in visible light). Ceres has the Dawn map; Vesta and Bennu use NASA shape models. The asteroid-belt point cloud is an overview-only spatial illustration, not a set of cataloged or measured asteroid positions. The thirteen added objects' approximate physical properties use [JPL satellite physical parameters](https://ssd.jpl.nasa.gov/sats/phys_par/), [JPL satellite mean elements](https://ssd.jpl.nasa.gov/sats/elem/), [JPL small-body elements](https://ssd.jpl.nasa.gov/sb/elem_tables.html), and [NASA Bennu facts](https://science.nasa.gov/solar-system/asteroids/101955-bennu/facts/). JPL explicitly warns that mean elements are not suitable for ephemeris computation; this explorer still uses chosen circular phases.

## Celestial sky background

The background in orbit and at landing uses the celestial-coordinate [NASA SVS Deep Star Maps 2020 Milky Way layer](https://svs.gsfc.nasa.gov/4851/), specifically `milkyway_2020_4k.exr`. It omits bright Hipparcos and Tycho stars but retains broad galactic light and dark dust lanes. The red emission is a restrained enhancement of the measured [NASA LAMBDA Finkbeiner full-sky H-alpha survey](https://lambda.gsfc.nasa.gov/product/foreground/fg_halpha_info.html), version 1.1, nested HEALPix Nside 512 in Rayleighs. `scripts/prepare-sky.py` reprojects that Galactic-coordinate survey into the SVS J2000 celestial projection, thresholds and scales it for display, and converts the linear background into sRGB WebP tiers at 2048 x 1024 and 4096 x 2048 pixels. H-alpha is much fainter to the eye than this enhanced visualization implies, and the result is not a photometric exposure model. Up to 24,000 small star points come from peaks in the aligned, celestial-coordinate [2012 NASA SVS map](https://svs.gsfc.nasa.gov/3895/). These are source-map pixel locations rather than an independent astrometric catalog. The sky is a two-dimensional image at effectively infinite distance, not volumetric gas or individual nebula geometry. Credit: NASA/Goddard Space Flight Center Scientific Visualization Studio / Ernie Wright; 2020 map also credits ESA/Gaia/DPAC. The H-alpha survey combines WHAM, VTSS, and SHASSA data by Douglas Finkbeiner. The star sources use J2000 celestial coordinates. Planetary and satellite spin axes and prime meridians follow the IAU WGCCRE 2015 rotation models where published (see `EPHEMERIS.md`), so local sky directions match the IAU model's accuracy for those bodies; bodies without a published model keep an illustrative pole and spin phase. The rendered glow samples a fixed coarse mip level (about 0.35 deg per texel) so unresolved stars in the survey image read as smooth Milky Way light instead of magnified grain; stars are drawn separately as crisp points. Stellar proper motion, parallax, atmospheric refraction, clouds, and individual nebula distances are omitted. Daylight and thick haze suppress the surface sky with analytic approximations.

## Processing and scientific limits

Run `python scripts/prepare-imagery.py` with Python, Pillow and NumPy to reproduce the local WebP assets and TypeScript inventory. Images are decoded, resampled with Lanczos, and encoded at WebP quality 90. Normal maps use lossless WebP. Source RGB values are otherwise retained. RGB color textures are tagged sRGB; cloud opacity and normal vectors are linear data.

Run `python scripts/prepare-sky.py` with Python, Pillow, NumPy, OpenCV with OpenEXR support, Astropy, and astropy-healpix to reproduce the sky WebP tiers and point file. Its 2020 source EXR is linear; the script applies the standard sRGB transfer before WebP encoding. Survey source downloads remain in ignored `.local/asset-source`.

- **Earth:** day, cloud and night layers are separate historical products from different dates. Their simultaneous display is a visualization approximation. Cloud brightness does not measure optical depth; clouds do not depict present weather. No invented ocean or land roughness map is supplied.
- **Moon:** NASA's color product uses LROC 643/566/415 nm channels, LOLA polar albedo and limited gap processing. NASA describes this product as optimized for appearance, not scientific analysis. The normal derives from floating-point LOLA heights in kilometers relative to a 1737.4 km sphere. Longitude derivatives wrap; north/east surface gradients include spherical pixel spacing. The tangent vector is `normalize(-eastSlope, -northSlope, 1)` and uses OpenGL +Y. `cos(latitude)` is bounded at 0.02 near the coordinate singularity. There is no added noise, artificial crater detail, or height amplification.
- **Mercury/Mars:** source mosaics contain baked illumination and are not pure physically calibrated albedo maps. Their displayed normal and roughness parameters remain constant approximations.
- **Gas giants:** these show the observation epoch's atmosphere. They are not a forecast or the current planet. Hubble filter composites are not guaranteed eye-equivalent natural color. Source no-data pixels with any channel ≤12 become transparent. For OPAL maps, no-data masks expand by 10 source pixels for Saturn and 12 for Uranus/Neptune to exclude registration fringes. This conservatively discards edge data; it never fills missing features. The renderer shows an explicitly neutral base in those areas. Jupiter's black polar margins are masked without expansion. Source coverage gaps must remain disclosed.
- **Saturn rings:** crop columns `[434,10308)` and average rows `[480,500)` of the original Cassini scan. Color values remain observed. The C-to-A profile is approximately registered to 74,658–136,780 km from Saturn's center using the observed boundaries and [NASA ring dimensions](https://nssdc.gsfc.nasa.gov/planetary/factsheet/satringfact.html); it is not a precision radial measurement. Alpha uses `0.2126 R + 0.7152 G + 0.0722 B`, divided by 255 when sampled. Brightness-to-opacity is a visual approximation, particularly because the source views the unilluminated side. No calibrated transmittance or phase function is claimed. Rotating this profile around Saturn assumes azimuthal symmetry. D, F, G and E rings, temporal changes and small azimuthal structures are omitted.

## Attribution and use terms

This audit records the source providers' terms; it does **not** add a license to the application or claim ownership of their images.

- NASA Earth products: NASA Goddard Space Flight Center, Reto Stöckli, Robert Simmon, MODIS teams; night lights: NASA Earth Observatory / NASA Goddard / Suomi NPP VIIRS. See [NASA media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). Credit is included; no agency endorsement is implied.
- Moon products: NASA Scientific Visualization Studio / Ernie Wright / LROC / LOLA. Source page links NASA reproduction guidelines; retain NASA attribution and the distinction between measured elevations and the derived visualization map.
- Mercury: NASA / Johns Hopkins Applied Physics Laboratory / Arizona State University / Carnegie Science / Applied Coherent Technology / USGS. The USGS catalog specifies no access constraints and requests author citation. The downloaded preview is hosted by USGS.
- Mars: Courtesy NASA/JPL-Caltech / USGS / Viking. [JPL image policy](https://www.jpl.nasa.gov/jpl-image-use-policy/) permits reuse with attribution subject to its exceptions and prohibits implied endorsement.
- Jupiter: NASA's Goddard Space Flight Center / Space Telescope Science Institute; scientists Amy Simon, Michael Wong and Glenn Orton. [STScI content policy](https://www.stsci.edu/copyright) describes NASA-funded STScI material as freely usable unless otherwise noted and requests attribution.
- OPAL maps: NASA / ESA / STScI / OPAL program, PI Amy Simon. [MAST data use policy](https://archive.stsci.edu/publishing/data-use) and [OPAL archive](https://archive.stsci.edu/hlsp/opal), DOI [10.17909/T9G593](https://doi.org/10.17909/T9G593). Data acquired with NASA/ESA Hubble, archived by STScI, operated by AURA under NASA contract NAS 5-26555. Scientific publications should also cite the papers listed by OPAL, including Simon et al. 2015 and Wong et al. 2020. No restrictive copyright notice was present for these products; they are outside MAST's identified DSS/Guide Star Catalog exceptions.
- Ring source: **NASA/JPL/Space Science Institute**, exactly as credited in PIA08389. This local educational/personal visualization retains the full credit. JPL's policy notes additional restrictions can apply to third-party material; this audit does not assert an unrestricted commercial license for Space Science Institute contributions.

## Missing and rejected imagery

### Illustrative close-up surface materials (16 November 2026)

**23 November 2026 HD tier:** four original 2048 × 2048 JPEGs from the same two CC0 Poly Haven assets are now available as `*-{color,height}-2048.jpg`. Desktop High quality loads this tier; low/medium/auto/mobile retain the existing 1K files. The new tier totals **8,519,918 bytes**. These are native source downloads, not AI upscales. Diffuse uses sRGB; displacement is linear data used only for bounded bump shading. Neither modifies measured Moon elevations or camera collision. `scripts/prepare-surface-detail.ps1` reproduces downloads and checks source byte counts/MD5; `public/textures/surface-detail-sources.json` records exact URLs, SHA-256 and attribution links. Both color and height switch atomically, old/stale textures are disposed, and an unsuccessful upgrade preserves the last complete pair.

The local `dry_ground_rocks-{color,height}.jpg` and `rock_boulder_dry-{color,height}.jpg` files are unmodified 1024 px JPEG diffuse/displacement downloads from Poly Haven: [Dry Ground Rocks, Rob Tuytel](https://polyhaven.com/a/dry_ground_rocks) and [Rock Boulder Dry](https://polyhaven.com/a/rock_boulder_dry). Poly Haven distributes these assets under [CC0](https://polyhaven.com/license). Together the four files total 2,200,449 bytes. They are fetched locally only when entering a surface session.

These terrestrial photographs supply representative soil/stone detail, not geographic observations of a landing site. Non-Earth albedo uses grayscale/tint adaptation in the shader. Moon close-up detail modulates its existing measured regional macro imagery; no DEM elevations or collision samples are modified. Ground textures use a nominal four-meter repeat with a sixteen-meter modulation octave and fade at distance. The displacement image affects lighting normals only. Stones have generated placements/shapes, smoothed normals, and representative photographed material. All added detail is illustrative.

Fine material coordinates are wrapped on the CPU at 4096 meters before GPU interpolation; all repeat periods divide that interval, preventing camera-rebase seams while avoiding planet-radius precision loss. Textures use mipmaps, bounded anisotropy, and explicit disposal. The older `*-ground-illustrative.webp` placeholders are no longer used by the renderer.

- **Sun:** no verified full-sphere photosphere texture is installed. The emissive globe is a plain visual approximation.
- **Venus:** no verified global visible-light cloud mosaic is installed. A plain cloud-colored globe is explicitly approximate. Magellan radar must never be described as visible cloud imagery.
- **Earth:** no verified normal or measured roughness texture is installed.
- **Moon:** no measured roughness map is installed; elevation-derived normals are limited to their 1440 × 720 source.
- **Mercury/Mars:** no normal or measured roughness map is installed. Mercury is explicitly monochrome and limited to 1024 × 512; Mars has only 1440 × 720 source detail. An 11520 × 5760 Mercury browse from NASA's legacy PDS `/test/` host was rejected after pixel inspection found it over 99% blank.
- **Jupiter/Uranus/Neptune:** incomplete atmospheric coverage remains disclosed and uses plain fill regions. Neptune additionally blends from 18° to 28.8° N into a blue-green reconstruction, excluding the preview's residual colored registration fringe and missing northern coverage. This display fill is not measured cloud color.
- **Saturn (24 November 2026):** the orbital renderer reduces valid OPAL pixels to a twelve-sample longitudinal average, retaining muted latitude contrast in a warm reconstructed palette. Longitude-local storms and original filter-composite colors are not reproduced. Sparse southern coverage and ring-obscured regions use low-contrast analytic bands; this is illustrative cloud fill, not measured weather. The body uses the [NASA PDS 1-bar equatorial/polar radii](https://pdsatmospheres.nmsu.edu/data_and_services/atmospheres_data/Cassini/sci-saturn.html), 60,268/54,364 km. Ring boundaries follow the [NSSDCA ring fact sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/satringfact.html); representative normal optical depths are C 0.18, B 1.6, Cassini Division 0.045, A 0.65. These are modeling choices within published ranges, not an occultation profile. The unlit-side Cassini scan supplies subtle RGB modulation, with its stored luminance alpha ignored. Filtered procedural ringlets add illustrative radial variation. Viewing-angle transmission, bounded back-side scattering and analytic oblate-planet/ring-plane shadows are approximations. Calibrated photometry, fine named gaps and D/F/G/E rings remain absent. No source bitmap was altered or upscaled in this pass.

The legacy JPL simulator [Saturn](https://maps.jpl.nasa.gov/tmaps/saturn.html) and [Neptune](https://maps.jpl.nasa.gov/tmaps/neptune.html) maps describe fictional artwork, and the legacy [Venus visible texture](https://maps.jpl.nasa.gov/tmaps/venus.html) repeats/clones a limited observation. They were rejected. NASA hosting alone is not evidence that a texture is observational. The [JPL texture collection](https://maps.jpl.nasa.gov/tmaps/) itself warns that some images contain gaps, aesthetic alterations or representative atmosphere artwork.

## Landing environments (26 November 2026)

Every solid moon, asteroid, comet and dwarf planet now offers a **demonstration** descent; none is a measured landing site except the Moon's LOLA terrain.

- **Airless worlds** (`src/data/planetaryEnvironments.ts`, synthesized per body): black sky, unfiltered sunlight, stars at night, and the parent planet and sibling moons drawn by the main scene at their ephemeris positions and true sizes (a "Look at <planet>" control turns toward the planet; from the far hemisphere of a tidally locked moon it never rises). Ground colour comes from the body's measured albedo and colour (or its installed map's mean colour). Terrain is `src/services/terrain/crateredRelief.ts`: seeded simple craters (depth/diameter ≈ 0.2, raised rims) at several size octaves over gentle undulation, with relief and landform scale growing with body size and a per-body crater density from imaged geology (saturated Callisto, Rhea, Mimas; resurfaced Europa, Triton; none on volcanic Io). It sits on a spherical datum, so small bodies' real irregular shapes are not represented at ground level.
- **Titan:** an orange-haze environment informed by Huygens (no solar disk, dim diffuse light, dark pebble plains); lakes, dunes and weather are not modeled.
- **Giant planets** (`src/engine/effects/GiantPlanetAtmosphere.ts`): cloud-level flight about 15 km (Jupiter, Saturn) or 20 km (Uranus, Neptune) above the visible deck. One full-sky shader ray-traces the deck sphere: band colours are the zonal mean of the installed global map at that latitude; finer cloud structure is procedural (tileable noise, zonally stretched); haze uses each planet's atmospheric scale height (NSSDCA: Jupiter 27 km, Saturn 59.5 km, Uranus 27.7 km, Neptune 19.7 km) with a Chapman-limited airmass, so nadir views stay clear and the horizon hazes out. The sky is a translucent single-scattering approximation (bluish H₂ Rayleigh light over Jupiter and Saturn, cyan where methane absorbs red over Uranus and Neptune); it dims, but does not hide, the Sun, moons and Saturn's rings behind it. Night sides show stars, faint moon/ring light and stochastic lightning glows (observed on Jupiter and Saturn; inferred from radio bursts on Uranus and Neptune). Colours and optical depths are illustrative choices informed by these regimes, not radiative-transfer results.

### Surface classes at landing sites (26 November 2026)

Synthesized landing sites no longer share one look. `src/data/surfaceProfiles.ts` assigns each body a surface class from its imaged geology, and the class drives three things: relief features (`src/services/terrain/surfaceRelief.ts`), ground material (`SurfaceDetailMaterial.ts`) and the rock population (`SurfaceScatter.ts`).

| Class | Bodies | Reference observation | Landing view |
|---|---|---|---|
| Rubble pile | asteroids under 1.5 km (Bennu, Ryugu, Itokawa, Didymos, Apophis) | OSIRIS-REx, Hayabusa2, Hayabusa | dense boulders up to ~9 m, partly buried; smooth fine-gravel "seas" |
| Rocky regolith | larger asteroids, Phobos, Deimos, Ceres, Vesta, captured irregular moons, red TNOs | NEAR at Eros, Dawn | dusty cratered plains, brighter fresh slopes, scattered blocks |
| Comet | periodic comets | Rosetta at 67P | terraces and cliffs, active pits, dust ponds, rare bright ice glints |
| Icy cratered | Saturn's, Uranus's and Pluto's mid-size moons | Cassini, Voyager 2, New Horizons | bright ice saturated with craters, angular ice blocks, glossier surface |
| Ridged ice | Europa, Enceladus | Galileo, Cassini | double ridges with sparse reddish-brown lineae, chaos blocks |
| Grooved ice | Ganymede | Galileo | swaths of ~3 km grooves beside dark, older terrain |
| Dark lag | Callisto, Phoebe | Galileo, Cassini | dark lag deposit, frost-capped knobs, saturated craters |
| Volcanic | Io | Galileo, Voyager | yellow sulphur plains, white SO2 frost, black lava in paterae; no impact craters |
| Pebble plain | Titan | Huygens | flat dark plain with rounded 3–16 cm ice pebbles, damp channels |
| Volatile ice | Pluto, Eris, Makemake | New Horizons at Pluto | convection cells, sublimation pits, tholin-stained troughs |
| Cantaloupe | Triton | Voyager 2 | dimpled terrain, dark plume streaks |

Landform sizes are compressed so each class's signature features fall inside the few-kilometre landing view. Landform heights scale with the body's landform size; Europa's ridges, for example, are 100–300 m high.

Where the body has an installed global map, the ground colour at the landing site is sampled from that map: the site's colour relative to the map mean, at the measured-albedo level (`src/engine/terrain/siteColor.ts`). Landing on Pluto's bright plains or in its dark red region therefore differs. The map's kilometre-scale pixels set only the site colour. All landforms, patterns and rocks are seeded and procedural; they illustrate each class's observed geology and are not a map of the actual site.

## Stars: 3D stellar neighbourhood (26 November 2026)

**Catalogue.** `scripts/prepare-stars.py` converts the [HYG Database v4.1](https://codeberg.org/astronexus/hyg) (David Nash, astronexus.com) into `public/stars/`:
- `hyg-v41.bin`: 109,401 stars with valid distances (2.2 MB);
- `hyg-v41-names.json`: 6,767 named stars, with IAU proper names, Bayer/Flamsteed and Gliese designations, and multiple-system links;
- `hyg-v41-spect.txt`: spectral types.

HYG merges the Hipparcos (new reduction), Yale Bright Star and Gliese catalogues. **Licence: CC BY-SA 4.0.** The derived files are therefore also CC BY-SA 4.0 and must keep this attribution; this does not change the licence of the application code. The source checksum is recorded in `hyg-v41-names.json`.

**Positions and distances.**
- Positions are J2000 heliocentric Cartesian parsecs, rotated into the engine frame (equatorial → ecliptic → engine axes).
- Distances come from parallaxes and carry their catalogue uncertainties, which grow quickly beyond a few hundred parsecs.
- Proper motion is not applied (epoch J2000); for example, Barnard's Star has moved about 4′ since then.

**Rendering.** Star mode (`src/engine/stars/`) is a separate parsec-scale engine with a floating origin, swapped in like the ISS visit.
- **Brightness:** each star's brightness comes from its absolute magnitude and the camera's true distance: m = M + 5 log₁₀ d − 5, with a user-set limiting magnitude (6.5 = naked eye).
- **Colour:** B−V gives effective temperature (Ballesteros 2012). That temperature's blackbody spectrum is integrated against the CIE 1931 observer (Wyman et al. 2013).
- **Physical estimates:** luminosity uses the Torres 2010 bolometric correction and M_bol,☉ = 4.74; radius follows from the Stefan–Boltzmann law. The information panel labels these as estimates.
- **Resolved disks:** linear limb darkening (u = 0.6) plus an eye/camera glare; there is no granulation, and no corona or stellar atmosphere model.
- **Not modelled:** binary orbits (companions sit at catalogue positions); stars outside the catalogue (most stars beyond a few hundred parsecs are fainter than its limit); interstellar extinction.
- **Milky Way:** the background stays the NASA SVS map at infinite distance, so the galaxy's own parallax is not modelled. That matters only over thousands of light-years.

**Sky orientation correction.** The NASA SVS sky assets were built in three.js sphere coordinates, which map equatorial (x, y, z) to (x, z, y): a mirror image with the celestial pole on the ecliptic pole. Before this release the background sky was therefore mirror-reversed and tilted 23.44° relative to the planets: bright stars were 2.5–16° from their true directions as seen from any planet. `DeepSky` now mirrors the texture coordinate and rotates the dome by the obliquity, and `BrightStarField` converts its directions (`src/engine/effects/skyOrientation.ts`). Tests check Sirius, Canopus, Arcturus, Vega, Capella and Rigil Kentaurus against their J2000 RA/Dec, within 0.3° for the map peaks and 0.05° for the catalogue.

## Exoplanet systems (26 November 2026)

**Source.** `scripts/prepare-exoplanets.py` reads the NASA Exoplanet Archive's *Planetary Systems Composite Parameters* table (`pscomppars`: one row per confirmed planet) through its TAP service. It writes `public/stars/exoplanets.json`: 6,447 planets in 4,837 systems from the archive table retrieved on 26 November 2026, about 430 kB gzipped. The query, retrieval date and source checksum are recorded in the file. Run `python scripts/prepare-exoplanets.py --refresh` to update it. The archive asks for this acknowledgement:

> This research has made use of the NASA Exoplanet Archive, which is operated by the California Institute of Technology, under contract with the National Aeronautics and Space Administration under the Exoplanet Exploration Program.

**Hosts.**
- **HYG hosts:** 909 archive host names match HYG stars, by Hipparcos number (802), HD number (53) or position (54). The position match uses HYG proper motion carried to epoch 2016, within 1.5′, with distance and magnitude agreement. Two pairs of host names are the same HYG star, so these give 907 systems, which keep their HYG position.
- **Archive-only hosts:** the other 3,930 hosts are mostly faint Kepler, K2, TESS and M-dwarf hosts that are not in HYG. They are added after the HYG stars, placed from the archive's RA, Dec and distance. Their absolute magnitude is computed from V and distance, or from luminosity, radius and temperature, Gaia G, or (for 276 microlensing hosts with no photometry) a main-sequence mass relation; the star panel says which.
- **Stellar parameters:** for every host, the star panel shows the archive's temperature, radius and mass instead of the B−V estimates.
- **Not placed:** 26 hosts without a distance are left out.

**What is measured and what is not.** The orbit model is in `src/engine/stars/keplerOrbit.ts`.
- **Orbit size and shape:** semi-major axis, eccentricity and period come from the archive, with values the archive calculated flagged as such. Kepler's third law fills a missing semi-major axis or period.
- **Inclination:** measured relative to the plane of the sky, so transiting systems appear edge-on from the Sun's direction. When it is unknown, the orbit is drawn at 60° and the panel says so.
- **Rotation about the line of sight:** the longitude of the ascending node is almost never known. Orbits are drawn with the node toward celestial north, so this rotation is illustrative.
- **Position along the orbit:** follows the published transit or conjunction time, or periastron time, where there is one. Otherwise it is illustrative, and the panel says which.
- **Argument of periastron:** used as published. Host and planet conventions can differ by 180°, which can flip which end of an eccentric orbit faces us.
- **Not modelled:** planet–planet interactions, including TRAPPIST-1's transit-timing variations.
- **Planet size:** archive radius; otherwise Chen & Kipping 2017 from mass.
- **Planet appearance is illustrative.** No exoplanet has been imaged as a disk. Colours follow broad classes: rocky planets below the 1.75 R⊕ radius valley, sub-Neptunes, Neptune-like planets and giants. Giants follow the Sudarsky, Burrows & Hubeny 2000 cloud classes by equilibrium temperature, and hot planets get a night-side thermal glow. Every planet is lit by its star's blackbody colour.

**Navigation aids.** The optional rings around stars with planets, the orbit outlines and the planet markers are navigation overlays, not depictions of anything physical.

### Exoplanet descents and the Sun's planets in star mode (26 November 2026)

Every planet with a known orbit can be visited. The descent reuses the Solar System's exploration stack (terrain, rocks, sky domes, cloud-deck flight, navigation). The landing data comes from `src/engine/stars/exoplanetLanding.ts`, registered for the duration of the descent (`src/data/landingRegistry.ts`).

**Measured, from the archive:**
- size and mass, and so surface gravity (minimum or estimated masses are flagged);
- orbit, and so where the star and sibling planets stand in the sky on the date shown;
- the star's angular size;
- the colour of its light, from the star's temperature.

**Assumed, and stated in the descent panel:**
- **Surface or atmosphere.** Rocky planets are those below the 1.75 R⊕ radius valley, or up to 2.5 R⊕ when a measured mass and radius give at least 70% of Earth-like rock density (Zeng et al. 2016). They get a bare, airless surface: regolith, dark basalt above 1,100 K, or frosted rock below 180 K. This is conservative: JWST finds no thick atmospheres on hot rocky M-dwarf planets, and for the rest it is unknown. Larger planets are flown above an illustrative cloud deck. The scale height is H = kT/(μ m_u g) with μ = 2.3, and deck colours follow the Sudarsky et al. (2000) temperature classes.
- **Rotation.** Planets inside ≈ 0.4 AU × (M★/M☉)^⅓ are drawn tidally locked (Kasting et al. 1993), so the star stays fixed in their sky. Others get an illustrative 24-hour day (rocky) or 10-hour day (giants). The spin axis is drawn along the orbit normal, with zero obliquity.
- **Brightness.** Lighting is eye-adapted, as in Solar System descents. The light keeps the star's hue at the luminance of sunlight, so a red dwarf's planet is lit orange. The starlight relative to Earth's is shown as a number.
- **Siblings in the sky.** Sibling planets appear as disks when resolved. Otherwise they are points whose brightness is computed from reflected starlight: a Lambert sphere, with distances and phase angle from the orbits, on the stars' magnitude scale.

**Our own planets in star mode.** The Sun's eight planets are placed with JPL's approximate Keplerian elements (Standish), the same analytic model the Solar System view falls back on. Their mean colours and sizes come from the bundled catalogue. Visiting one hands over to the Solar System view, which has the full ephemerides, global maps and surface descents.

## Galaxies, nebulae and the Milky Way model (27 November 2026)

`scripts/prepare-deep-sky.py` (with `scripts/deep_sky_sources.py`, standard library only) builds `public/deep/galaxies.bin` + `galaxies.json` (about 1.4 MB gzipped) and `public/deep/nebulae.json` (about 100 kB gzipped). Tables were retrieved on 27 November 2026 through the VizieR and SIMBAD mirrors at the Harvard-Smithsonian CfA, plus the OpenNGC repository. They are cached in the ignored `.local/asset-source/deep`; `--refresh` downloads them again. Positions are heliocentric parsecs in the stars' engine axes.

**Galaxies (44,200).**
- **Local Volume (859):** Karachentsev, Makarov & Kaisina 2013, *Updated Nearby Galaxy Catalog* (VizieR J/AJ/145/101). Each galaxy keeps its catalogued distance and method: TRGB, Cepheids, Tully–Fisher, surface-brightness fluctuations, group membership, and so on. It also keeps its Holmberg diameter, inclination and absolute B magnitude. Milky Way satellites closer than 20 kpc are left out; they lie inside our Galaxy's model.
- **Beyond:** Huchra et al. 2012, *2MASS Redshift Survey* (VizieR J/ApJS/199/26, Ks ≤ 11.75). Galaxies matched within 20″ to Cosmicflows-4 (Tully et al. 2023, VizieR J/ApJ/944/94) get its distance. That is the group average when the group has at least two measured members (5,852 galaxies), otherwise the galaxy's own distance (5,681).
  - **Redshift distances (31,808 galaxies):** the rest use the Hubble law with H₀ = 74.6 km/s/Mpc, Cosmicflows-4's own scale (Planck's 67.4 would place them about 10% farther). Velocities are taken in the CMB frame (Planck 2018 dipole), and distances are comoving, to first order with q₀ = −0.53. Each galaxy's own motion (a few hundred km/s) shifts these by several Mpc, and stretches clusters along the line of sight.
  - **Left out:** 1,064 entries without a redshift and 33 too slow for the Hubble law. 161 duplicates of Local Volume galaxies only lend them their position angles.
- **Shapes:**
  - **Size, axis ratio and position angle:** from OpenNGC (M. Verga, CC BY-SA 4.0) where listed, otherwise from 2MASS (XSC position angles). The 2MASS K-band extent is scaled by 0.85, the median optical/K ratio of galaxies with both.
  - **Inclination:** from the axis ratio with HyperLEDA's type-dependent edge-on thickness (log r₀ = 0.43 + 0.053 T). Bulge-dominated galaxies can come out less tilted than they are.
  - **Orientation:** which side of a disk is nearer is not known, so one of the two orientations is drawn. Galaxies without a position angle are drawn at a stand-in angle, and the panel says so.
- **Brightness:** an estimate. The visual absolute magnitude comes from B (Local Volume) or Ks, with typical colours by Hubble type.

**Nebulae (1,671).**
- **Planetary nebulae (669):** Chornay & Walton 2021 (VizieR J/A+A/656/A110), Gaia EDR3 central-star distances. Only reliable matches of confirmed planetary nebulae with a distance are used.
- **HII regions (886):** Anderson et al. 2014, *WISE catalog of Galactic HII regions* (VizieR J/ApJS/212/1), known HII regions with maser-parallax or kinematic distances.
- **Supernova remnants (110):** Green 2025 (VizieR VII/297) for positions and sizes. Distances come from SIMBAD's literature list, preferring the most recent parallax-based value.
- **Named nebulae:** NGC, IC, Messier and Barnard objects from OpenNGC take the best available distance. The order of preference is a catalogue above, SIMBAD's most recent parallax, then OpenNGC's Gaia parallax, then WISE.
- **Curated distances:** a few well-known objects missing from those lists use their parent cloud's published distance, with the reference shown in the panel:
  - Orion B objects (Flame, IC 434, Horsehead): Kounkel et al. 2017;
  - the California and Coalsack clouds: Zucker et al. 2020;
  - the Pleiades nebulosity;
  - the Cygnus Loop: Fesen et al. 2018;
  - Vela: Dodson et al. 2003;
  - Kepler: Sankrit et al. 2016;
  - SN 1006: Winkler et al. 2003;
  - nebulae in the Large and Small Magellanic Clouds: Pietrzyński et al. 2019 and Graczyk et al. 2020.
- **Size:** the catalogued angular outline at the adopted distance.
- **Left out:** nebulae with no published distance (most dark and reflection nebulae).

**Milky Way model** (`src/data/deep/milkyWay.ts`).
- **Measured inputs:**
  - Sun–centre distance R₀ = 8.15 kpc and the log-periodic spiral arms with kinks: Reid et al. 2019, Table 2. Arms are drawn at full strength over their maser-measured azimuths, then extrapolated more faintly.
  - Sun's height 20.8 pc: Bennett & Bovy 2019.
  - Thin and thick disk scales, the 5 kpc bar at 27°, and the stellar mass: Bland-Hawthorn & Gerhard 2016.
  - Frame: the IAU Galactic pole and centre, rotated into the engine axes with the Hipparcos matrix.
- **Illustrative:** star clouds, dust filaments and HII knots.
- **Photographic sky:** within about 300 pc of the Sun the NASA SVS sky is shown; it fades out by 1.5 kpc, and the model fades in between 0.6 and 2.5 kpc.

**Rendering.**
- **Appearance is illustrative.** No galaxy or nebula is drawn from an image.
  - Galaxies use face-on archetype maps generated on the GPU (Sa–Sc, barred, irregular, S0) chosen by Hubble type, exponential disk heights, and closed-form truncated-isothermal bulges.
  - Nebulae use procedural interiors in approximate emission-line colours: Hα + [N II] red, [O III] teal, scattered blue.
- **Brightness:** galaxies and nebulae are drawn 5 magnitudes brighter than the eye sees them, like a long exposure. Far from every large galaxy, an automatic exposure brightens the view by up to 9 more magnitudes (shown in the caption). Surface brightness does not change with distance.
- **Not exact:** nebula brightness is illustrative; the catalogues give no uniform integrated photometry.

### Star clusters (27 November 2026)

`scripts/deep_sky_clusters.py` (run by `prepare-deep-sky.py`) writes `public/deep/clusters.json`: 4,004 open and 139 globular clusters, about 300 kB gzipped.
- **Open clusters:** Hunt & Reffert 2023 (VizieR J/A+A/673/A114), the Gaia DR3 all-sky catalogue. Only open clusters that pass the authors' quality cuts are kept: astrometric significance at least 5 and median CMD class at least 0.5; moving groups are left out. Distances are the maximum-likelihood values from members' parallaxes (16th–84th percentile). Ages, extinctions, radii and member counts come from the same catalogue.
- **Globular clusters:** the Harris catalogue (VizieR VII/202) supplies integrated magnitude, colour, metallicity, core and half-light radii and concentration. Distances are Gaia EDR3 parallaxes (Vasiliev & Baumgardt 2021, VizieR J/MNRAS/505/5978) where better than 5%, otherwise Harris's distance. The age is a typical 12.6 Gyr, assumed.
- **Names:** OpenNGC names (Messier numbers, common names) go to the nearest cluster centre within its half-member radius, one cluster per object. A short list adds popular names such as Pleiades, Hyades and Omega Centauri.

**Stars drawn for a cluster are a statistical sample, not the real members** (`src/engine/deep/clusterPopulation.ts`).
- **How many:** open clusters are scaled from their Gaia member count, taken as the stars brighter than V ≈ 18 at their distance and extinction. Globulars are scaled from their integrated magnitude. Both use the Kroupa (2001) initial mass function from 0.1 M☉.
- **Brightness and colour:** main-sequence stars follow textbook mass–luminosity and mass–radius relations, converted to V with the Torres (2010) bolometric correction.
- **Turnoff and giants:** the main-sequence lifetime is 10 Gyr × M^−2.5, which sets the turnoff mass. Stars up to 4% heavier are giants: a giant branch with dN/dL ∝ L^−1.6, the red clump, a blue horizontal branch for metal-poor globulars, or supergiants in young clusters. Heavier stars are remnants and are not drawn.
- **Positions:** Plummer profiles with the catalogued radii (globulars add a core component), truncated at the tidal radius.
- **Avoiding duplicates:** stars brighter than V = 7.5 from Earth are left out, because HYG already has them as the real stars (e.g. the Pleiades' bright members).
- **What is drawn:** each cluster's brightest sampled stars are always drawn; clusters seen up close get a deeper sample of up to 3,000 (open) or 20,000 (globular) stars. The unresolved rest of the light is a glow with the cluster's profile, on the stars' brightness scale (no long-exposure gain).
