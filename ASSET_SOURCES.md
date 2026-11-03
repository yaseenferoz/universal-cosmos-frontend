# Scientific imagery audit

Verified and downloaded on **2026-11-02**. All installed surface features originate in the observations linked below. No AI imagery, invented continents, procedural cloud bands, copied storms, or painted crater textures are included. These are historical mosaics for an educational visualization, not live observations, ephemerides, or calibrated scientific measurements.

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

## Processing and scientific limits

Run `python scripts/prepare-imagery.py` with Python, Pillow and NumPy to reproduce the local WebP assets and TypeScript inventory. Images are decoded, resampled with Lanczos, and encoded at WebP quality 90. Normal maps use lossless WebP. Source RGB values are otherwise retained. RGB color textures are tagged sRGB; cloud opacity and normal vectors are linear data.

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

- **Sun:** no verified full-sphere photosphere texture is installed. The emissive globe is a plain visual approximation.
- **Venus:** no verified global visible-light cloud mosaic is installed. A plain cloud-colored globe is explicitly approximate. Magellan radar must never be described as visible cloud imagery.
- **Earth:** no verified normal or measured roughness texture is installed.
- **Moon:** no measured roughness map is installed; elevation-derived normals are limited to their 1440 × 720 source.
- **Mercury/Mars:** no normal or measured roughness map is installed. Mercury is explicitly monochrome and limited to 1024 × 512; Mars has only 1440 × 720 source detail. An 11520 × 5760 Mercury browse from NASA's legacy PDS `/test/` host was rejected after pixel inspection found it over 99% blank.
- **Jupiter/Saturn/Uranus/Neptune:** incomplete atmospheric coverage remains missing and visible as neutral regions. No fabricated replacement bands, storms or stretched polar pixels were added.
- **Saturn:** calibrated ring optical depth and outer/diffuse rings remain absent.

The legacy JPL simulator [Saturn](https://maps.jpl.nasa.gov/tmaps/saturn.html) and [Neptune](https://maps.jpl.nasa.gov/tmaps/neptune.html) maps describe fictional artwork, and the legacy [Venus visible texture](https://maps.jpl.nasa.gov/tmaps/venus.html) repeats/clones a limited observation. They were rejected. NASA hosting alone is not evidence that a texture is observational. The [JPL texture collection](https://maps.jpl.nasa.gov/tmaps/) itself warns that some images contain gaps, aesthetic alterations or representative atmosphere artwork.
