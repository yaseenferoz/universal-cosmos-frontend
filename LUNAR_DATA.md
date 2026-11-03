# Moon terrain data and limitations

This vertical slice uses measured lunar elevations and registered orbital imagery. Source files were inspected and prepared on **2026-11-02**. No procedural craters, rocks, soil relief, or AI imagery supplement the observations. A first-person camera does not turn five-meter source sampling into centimeter-scale surface knowledge.

## Packaged datasets

| Tier | Data | Packaged coverage | Sampling | Browser payload |
|---|---|---|---:|---:|
| Global parent | [NASA LOLA `ldem_4.tif`](https://svs.gsfc.nasa.gov/4720/) | Entire Moon | 4 posts/degree, about 7,581 m at equator | One 1440 × 720 Float32 grid, 4,147,200 bytes |
| Regional context | [LROC NAC Apollo 17 DTM v1.9](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_APOLLO17) | 20.48 × 20.48 km projected square around Taurus–Littrow | 40 m, sampled from the 5 m source | Sixteen 129 × 129 grids, 1,065,024 bytes total |
| Landing region | Same observed LROC stereo DTM | 2.56 × 2.56 km projected square | Original 5 m posts | Sixteen 129 × 129 grids, 1,065,024 bytes total |
| Regional/landing imagery | [LROC registered 5 m orthophoto](https://data.lroc.im-ldi.com/lroc/view_rdr_product/NAC_DTM_APOLLO17_MOSAIC_5M) | Same respective squares | 40 m and 5 m respectively | Two 513 × 513 grayscale WebP images |

The package is approximately **6.52 MB**, including manifests and audit metadata. Only requested grids enter the browser cache. No high-resolution global DEM is shipped or loaded. The coarse global grid is a separate, explicitly limited orbital parent.

The selected position is **20.1908° N, 30.7717° E**, labeled the Apollo 17 region rather than an exact reconstruction of the lander. Its nearest original DEM post is **−2627.088623 m** relative to the dataset sphere. Bilinear sampling at the position differs slightly from that nearest post. Walking is restricted to the prepared fine region; the manifest's nominal exploration radius is 900 m.

Bounds, in planetocentric degrees:

| Tier | West | East | South | North |
|---|---:|---:|---:|---:|
| Context | 30.4124214010 | 31.1311533510 | 19.8530997261 | 20.5284868358 |
| Landing | 30.7268666291 | 30.8167081229 | 20.1485815866 | 20.2330049753 |

## Datum, projection and units

Use **1,737,400 m** for the terrain reference sphere. The existing object catalog's rounded radius of 1,737.5 km is a different display/catalog property; substituting it creates a 100 m datum error.

The regional source is equirectangular, with standard parallel 20° N, center longitude 180°, origin latitude 0°, planetocentric latitude and east-positive longitude. Its GeoTIFF declares a spherical radius of 1,737,400 m, five-meter pixel spacing, and pixel-is-area registration. The upper-left outer corner is projected `(-4276879.9999999, 645989.99999999)` meters. Elevation posts are evaluated at pixel centers, adding half a source pixel before converting to latitude/longitude.

Body-fixed Cartesian conversion follows `x=r cos(lat) cos(lon)`, `y=r sin(lat)`, `z=−r cos(lat) sin(lon)`. Therefore +Y is north, +X is longitude 0, and +Z is longitude 90° west. GPU vertices and camera-relative rendering are the renderer's responsibility; the provider keeps meter elevations and double-precision angular calculations.

Packaged heights use little-endian Float32 **meters**, not normalized image brightness. The NASA global source is Float32 kilometers and is multiplied by 1000 once during preparation. Regional Float32 values are already meters. Arrays are north-to-south by row and west-to-east by column. Regional tile bounds describe inclusive posts; adjacent tiles share the same boundary row/column values. Global pixel centers instead use wrapping longitude and clamped polar sampling.

## Source quality and provenance

The [original 5 m DTM](https://data.lroc.im-ldi.com/lroc/view_rdr_product/NAC_DTM_APOLLO17) is 9985 × 11600 Float32 samples, a 463,397,471-byte GeoTIFF. Its [PDS label](https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/APOLLO17/NAC_DTM_APOLLO17.LBL) identifies product version v1.9, creation on 2020-10-13, and contributing observations from 2010–2016. The complete source footprint extends approximately 29.905747–31.657832° E and 19.390667–21.303385° N; the application packages a subset.

The [product readme](https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/APOLLO17/NAC_DTM_APOLLO17_README.TXT) reports a **2.55 m relative precision estimate** and **1.77 m RMS comparison with 30 LOLA orbit tracks**. These describe different quantities and are not a universal absolute vertical-accuracy guarantee. Stereo correlation can introduce seams, rectangular processing artifacts, shadow-related interpolation and noise. This release does not install or expose the separate per-pixel confidence product. Fine-region coverage is complete according to valid source heights, which is not a claim that every height has identical confidence.

The [LROC description of the mosaic](https://lroc.im-ldi.com/images/1112) explains its stereo observations and registered orthophotos. Imagery here is the grayscale observed orthophoto, not a colorized height/slope/shaded-relief illustration. Original lighting, shadows and mosaic exposure differences remain in that image. It is not calibrated diffuse albedo, and rendering it under a different Sun direction cannot remove baked source shadows. Source brightness is retained; the preprocessing adds no features or contrast-based relief.

Credits: **NASA/GSFC/Arizona State University / LROC team** for regional terrain and imagery; **NASA Scientific Visualization Studio / Ernie Wright / LOLA** for the global elevation product. Regional products are publicly released through NASA PDS. Retain these credits and the source-specific terms recorded in the manifest; no NASA, GSFC, ASU or instrument-team endorsement is implied. [NASA media-use guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/) applies to NASA material. This documentation does not grant a license to the application itself.

## Reproduction

Run `python scripts/prepare-lunar-terrain.py`. The existing Python environment needs NumPy, Pillow and tifffile; no browser geospatial dependency is added.

The script reads actual GeoTIFF headers and verifies that the image and DTM share grid registration. The source supports HTTP byte ranges; the script requires HTTP 206 and refuses an accidental whole-raster response. It caches only the header and rows 4699–8795 in `.local/lunar-terrain-source/`, then crops source columns 2887–6983. Approximate offline downloads are 164 MB of DEM rows and 41 MB of orthophoto rows. These source ranges remain ignored and are never delivered to a browser.

Context posts are sampled every eighth source post. The central 513 × 513 region retains every source post. Both split into four-by-four tiles, each with 129 × 129 posts and shared edges. The corresponding imagery uses matching registered posts and WebP quality 92. Source nodata and invalid height sentinels become Float32 NaN; they are never converted into terrain at zero elevation. The script refuses to prepare the selected landing region if any of its heights are missing.

Generated outputs:

- `public/terrain/moon/*.f32` and the two orthophotos.
- [`manifest.json`](public/terrain/moon/manifest.json), also exported as the typed [`moonTerrainManifest`](src/services/terrain/moonManifest.ts).
- [`audit.json`](public/terrain/moon/audit.json), recording source row/column ranges, header hash, per-output SHA-256 and byte counts, and finite-data coverage.

The landing grid is **100% finite**. Regional context is approximately **99.635% finite**. These are validity-mask statistics, not estimates of scientific accuracy.

## Runtime loading and missing data

[`LunarTerrainProvider`](src/services/terrain/LunarTerrainProvider.ts) exposes the shared [`TerrainDataProvider`](src/types/terrain.ts) contract. It loads the coarse parent first, limits concurrent fetches, deduplicates requests, validates grid byte counts and plausible meter values, and keeps a byte-bounded LRU of resident regional grids. Global context remains pinned. `dispose()` aborts requests and releases arrays. Presets can configure cache bytes and concurrency; the minimum cache accommodates the global parent plus 512 KiB.

`sampleHeight()` uses bilinear interpolation of resident measurements. Interpolation across NaN source corners is refused; the next available coarser observation supplies the surface and its actual resolution is reported. It never claims absent fine data. Landing preparation waits for measured local grids, and failures preserve the coarse parent rather than yielding an empty scene.

At dataset outer boundaries, measured context blends to its coarse parent across 1200 m and local heights blend to context across 160 m. These smooth transitions are explicit visualization approximations using the two measured grids, not new observations. Blended samples retain the coarser effective resolution and a `:boundary-blend` source marker. The camera collider and renderer use the same sampling function. A displayed source resolution describes the measurement grid; screen-space geometry may be coarser at low quality or distance.

Cube-root requests load only global context. Regional loading begins at finer cube levels, with full detail gated separately; `ensureRegion()` also permits predictable loading before descent. Imagery is returned with its coverage bounds. The renderer must use regional imagery only within those bounds and must not clamp-stretch it across unobserved terrain.

## Verification performed

Automated tests check bilinear samples, global antimeridian/pole behavior, cube orientation, source nodata, datum and meter scaling, request deduplication, fetch receiver binding, byte/height validation, failed-detail fallback, regional boundary transitions, concurrency limits, LRU eviction and disposal. Packaged data tests verify shared tile edge posts are identical and the selected location resolves to measured five-meter data with registered imagery.

Both generated orthophotos were visually inspected as decoded images. Actual scene screenshots and end-to-end navigation verification are recorded separately by the application validation work; source-image inspection alone does not verify the rendered terrain, collision or mobile experience.
