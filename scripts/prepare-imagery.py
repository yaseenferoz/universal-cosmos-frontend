"""Reproduce local, resized NASA imagery. No synthetic surface features are generated.

Requires Pillow and NumPy. Source downloads stay in ignored .local/asset-source.
Run from the repository root: python scripts/prepare-imagery.py
"""
import json
import os
import ssl
import subprocess
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen
from PIL import Image, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.local' / 'asset-source'
OUT = ROOT / 'public' / 'textures'
CACHE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
NASA_LICENSE = 'NASA media usage guidelines: educational/informational use with attribution; no endorsement.'
MAST_LICENSE = 'NASA/ESA Hubble public data; MAST data-use policy. Credit NASA, ESA, STScI and OPAL team; no endorsement.'
ASSETS = [
    dict(body='earth', slot='surface', id='earth-day', filename='earth-day.png',
         title='Blue Marble land, ocean and sea ice',
         assetUrl='https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_8192.png',
         sourceUrl='https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/',
         attribution='NASA Goddard Space Flight Center / Reto Stockli / Robert Simmon / MODIS teams',
         notes='Satellite-derived 2002 Blue Marble composite, not a single exposure or current weather. Ocean color is enhanced in the published source. Resampled without added features.',
         kind='observational', colorSpace='srgb', maximum=4096),
    dict(body='earth', slot='clouds', id='earth-clouds', filename='earth-clouds.jpg',
         title='Blue Marble cloud composite',
         assetUrl='https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg',
         sourceUrl='https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/',
         attribution='NASA Goddard Space Flight Center / Reto Stockli / MODIS Atmosphere Group',
         notes='Historical visible-light cloud composite with infrared polar data. Grayscale brightness is used as an approximate opacity mask, not calibrated cloud optical depth or live weather.',
         kind='observational', colorSpace='linear', maximum=2048),
    dict(body='earth', slot='night', id='earth-night', filename='earth-night.jpg',
         title='Black Marble 2016 night lights',
         assetUrl='https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg',
         sourceUrl='https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/',
         attribution='NASA Earth Observatory / NASA Goddard / Suomi NPP VIIRS',
         notes='2016 cloud-free night-light composite with a darkened land background. Display intensity is illustrative and is masked to the night hemisphere; not real-time illumination.',
         kind='observational', colorSpace='srgb', maximum=3600),
    dict(body='moon', slot='surface', id='moon-surface', filename='moon.tif',
         title='LRO lunar color mosaic (2019 CGI Moon Kit)',
         assetUrl='https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif',
         sourceUrl='https://svs.gsfc.nasa.gov/4720/',
         attribution='NASA Scientific Visualization Studio / Ernie Wright / LROC / LOLA',
         notes='LROC 643/566/415 nm mosaic adapted for visual rendering; polar coverage uses LOLA albedo and source processing fills small gaps. NASA describes it as optimized for aesthetics, not scientific analysis. Centered on 0 degrees longitude.',
         kind='derived', colorSpace='srgb', maximum=4096),
    dict(body='moon', slot='normal', id='moon-normal', filename='moon-height.tif',
         title='LOLA measured-elevation normal map',
         assetUrl='https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_4.tif',
         sourceUrl='https://svs.gsfc.nasa.gov/4720/',
         attribution='NASA Scientific Visualization Studio / Ernie Wright / Lunar Orbiter Laser Altimeter',
         notes='Derived from LOLA floating-point elevation in kilometers relative to radius 1737.4 km. Spherical east/north gradients, no relief amplification. OpenGL tangent normal; poles bounded to avoid coordinate singularity. No invented crater detail.',
         kind='derived', colorSpace='linear', maximum=1440),
    dict(body='jupiter', slot='surface', id='jupiter-surface', filename='jupiter.tif',
         title='Hubble Jupiter global map, 2015 rotation A',
         assetUrl='https://svs.gsfc.nasa.gov/vis/a010000/a012000/a012021/Hubble_Jupiter_color_global_map_2015a.tif',
         sourceUrl='https://svs.gsfc.nasa.gov/12021/',
         attribution="NASA's Goddard Space Flight Center / Space Telescope Science Institute / A. Simon, M. Wong, G. Orton",
         notes='Observed Hubble WFC3 cloud mosaic from 2015. Atmospheric features are historical, not current. Missing polar coverage is transparent; no invented fill.',
         kind='observational', colorSpace='srgb', maximum=2048, partialCoverage=True, coverageMargin=0),
    dict(body='mars', slot='surface', id='mars-surface', filename='mars.jpg',
         title='Viking Mars global mosaic',
         assetUrl='https://maps.jpl.nasa.gov/tmaps/pix/mar0kuu2.jpg',
         sourceUrl='https://maps.jpl.nasa.gov/tmaps/mars.html',
         attribution='Courtesy NASA/JPL-Caltech / USGS / Viking',
         license='JPL image use policy: reuse permitted with attribution; no endorsement.',
         notes='Historical Viking images processed by USGS. Source is 1440 x 720; higher quality settings retain that actual resolution. Published visualization mosaic, not calibrated albedo or a current dust/weather map.',
         kind='observational', colorSpace='srgb', maximum=1440),
    dict(body='mercury', slot='surface', id='mercury-surface', filename='mercury-usgs.jpg',
         title='MESSENGER MDIS low-incidence monochrome mosaic',
         assetUrl='https://astrogeology.usgs.gov/ckan/dataset/9d047a09-a10d-4e2a-865a-9b5e1b465315/resource/a2c4cef5-1e14-4f1c-92b0-cb7da9808c35/download/mercury_messenger_mdis_basemap_loi_mosaic_global_1024.jpg',
         sourceUrl='https://astrogeology.usgs.gov/search/map/mercury_messenger_mdis_basemap_loi_global_mosaic_166m',
         attribution='NASA / JHU Applied Physics Laboratory / Arizona State University / Carnegie Science / ACT / USGS',
         license='USGS source: no access constraints; cite authors.',
         notes='MESSENGER 2012-2015 MDIS low-incidence mosaic published in 2016; 750 nm monochrome reflectance displayed in gray, not natural color. Uses the verified 1024 x 512 USGS preview rather than the 92160 x 46080 science raster. No upscaling. Source illumination remains baked in.',
         kind='observational', colorSpace='srgb', maximum=1024),
    dict(body='saturn', slot='surface', id='saturn-surface', filename='saturn.tif',
         title='Hubble OPAL Saturn atmospheric mosaic, 2021 A',
         assetUrl='https://archive.stsci.edu/hlsps/opal/cycle28/saturn/hlsp_opal_hst_wfc3-uvis_saturn-2021a_f395n-f502n-f631n_v1_globalmap.tif',
         sourceUrl='https://archive.stsci.edu/hlsp/opal/opal-saturn-cycle-28',
         attribution='NASA / ESA / STScI / OPAL program (PI: Amy Simon)', license=MAST_LICENSE,
         notes='Historical Hubble OPAL F395N/F502N/F631N preview composite, not current or calibrated natural color. Large ring-obscured and southern regions have no observations. Black no-data pixels and a 10-pixel edge margin are transparent over a neutral placeholder; no cloud bands filled or invented.',
         kind='observational', colorSpace='srgb', maximum=1800, partialCoverage=True, coverageMargin=10),
    dict(body='uranus', slot='surface', id='uranus-surface', filename='uranus.tif',
         title='Hubble OPAL Uranus atmospheric mosaic, 2014 A',
         assetUrl='https://archive.stsci.edu/hlsps/opal/cycle22/uranus/hlsp_opal_hst_wfc3-uvis_uranus-2014a_f467m-f547m-f658n_v1_globalmap.tif',
         sourceUrl='https://archive.stsci.edu/hlsp/opal/opal-uranus-cycle-22',
         attribution='NASA / ESA / STScI / OPAL program (PI: Amy Simon)', license=MAST_LICENSE,
         notes='Historical Hubble F467M/F547M/F658N preview composite; native resolution only 721 x 361. Unobserved south polar area and a 12-pixel registration-edge margin are transparent over a neutral placeholder. No invented features or upscaling; not calibrated natural color.',
         kind='observational', colorSpace='srgb', maximum=721, partialCoverage=True, coverageMargin=12),
    dict(body='neptune', slot='surface', id='neptune-surface', filename='neptune.tif',
         title='Hubble OPAL Neptune atmospheric mosaic, 2015 A',
         assetUrl='https://archive.stsci.edu/hlsps/opal/cycle22/neptune/hlsp_opal_hst_wfc3-uvis_neptune-2015a_f467m-f547m-f657n_v1_globalmap.tif',
         sourceUrl='https://archive.stsci.edu/hlsp/opal/opal-neptune-cycle-22',
         attribution='NASA / ESA / STScI / OPAL program (PI: Amy Simon)', license=MAST_LICENSE,
         notes='Historical Hubble F467M/F547M/F657N preview composite; native resolution only 721 x 361. Unobserved north polar area and a 12-pixel registration-edge margin are transparent over a neutral placeholder. No invented features or upscaling; not calibrated natural color.',
         kind='observational', colorSpace='srgb', maximum=721, partialCoverage=True, coverageMargin=12),
    dict(body='saturn', slot='rings', id='saturn-rings', filename='saturn-rings.jpg',
         title='Cassini PIA08389 measured ring-color scan',
         assetUrl='https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia08/pia08389/PIA08389.jpg',
         sourceUrl='https://science.nasa.gov/photojournal/expanse-of-ice/',
         attribution='NASA/JPL/Space Science Institute',
         license='JPL image use policy: educational/personal use with full source credit; no endorsement.',
         notes='Observed May 9, 2007 natural-color scan of the unilluminated rings. Cropped to main C/B/A rings; central 20 rows averaged into a radial profile. Approximate radius registration uses C inner and A outer boundaries. Alpha is source luminance, a visual transparency approximation, NOT measured optical depth. Original source shading remains; azimuthal variations and D/F/G/E rings are not represented.',
         kind='derived', colorSpace='srgb', maximum=2048, radialRangeKm=[74658,136780]),
]

def prepare(asset):
    source = CACHE / asset['filename']
    if not source.exists() or source.stat().st_size == 0:
        try:
            with urlopen(asset['assetUrl'], timeout=90) as response:
                source.write_bytes(response.read())
        except URLError as error:
            # Windows curl uses the native trust store; never disable TLS verification.
            if os.name != 'nt' or not isinstance(error.reason, ssl.SSLCertVerificationError):
                raise
            subprocess.run(['curl.exe', '--fail', '--location', '--max-time', '120', asset['assetUrl'], '--output', str(source)], check=True)
    original = Image.open(source)
    original.load()
    source_size = list(original.size)
    if asset['slot'] == 'normal':
        height_km = np.asarray(original, dtype=np.float64)
        h, w = height_km.shape
        latitude = (0.5 - (np.arange(h) + 0.5) / h) * np.pi
        east = (np.roll(height_km, -1, axis=1) - np.roll(height_km, 1, axis=1)) / (2 * 1737.4 * np.maximum(np.cos(latitude[:, None]), 0.02) * 2 * np.pi / w)
        north = -np.gradient(height_km, axis=0) / (1737.4 * np.pi / h)
        normals = np.stack((-east, -north, np.ones_like(east)), axis=-1)
        normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
        original = Image.fromarray(np.clip(np.round((normals + 1) * 127.5), 0, 255).astype(np.uint8))
    elif asset['slot'] == 'rings':
        # Pixel registration against the published annotated scan. No synthetic bands.
        scan = np.asarray(original.convert('RGB'), dtype=np.float64)[480:500, 434:10308]
        rgb = np.round(scan.mean(axis=0)).astype(np.uint8)
        opacity = np.round(rgb @ np.array([0.2126, 0.7152, 0.0722])).astype(np.uint8)
        original = Image.fromarray(np.concatenate([rgb, opacity[:, None]], axis=1)[None, :, :])
    else:
        original = original.convert('L' if asset['colorSpace'] == 'linear' else 'RGB')
        if asset.get('partialCoverage'):
            no_data = np.asarray(original).min(axis=2) <= 12
            mask = Image.fromarray((no_data * 255).astype(np.uint8))
            margin = asset.get('coverageMargin', 0)
            if margin:
                mask = mask.filter(ImageFilter.MaxFilter(margin * 2 + 1))
            original.putalpha(Image.fromarray(255 - np.asarray(mask)))
    record = {key: asset[key] for key in ['id', 'title', 'assetUrl', 'sourceUrl', 'attribution', 'notes', 'kind', 'colorSpace']}
    record['license'] = asset.get('license', NASA_LICENSE)
    record['sourceResolution'] = source_size
    if asset.get('partialCoverage'): record['partialCoverage'] = True
    if asset.get('radialRangeKm'): record['radialRangeKm'] = asset['radialRangeKm']
    record['variants'], record['resolutions'] = {}, {}
    widths = {'low': 1024, 'medium': 2048, 'high': asset['maximum']}
    saved = {}
    for quality, target in widths.items():
        width = min(target, original.width)
        height = max(1, round(original.height * width / original.width))
        if width not in saved:
            resized = original.resize((width, height), Image.Resampling.LANCZOS)
            filename = f"{asset['id']}-{width}.webp"
            resized.save(OUT / filename, 'WEBP', quality=90, method=6, lossless=asset['slot'] == 'normal')
            saved[width] = '/textures/' + filename
        record['variants'][quality] = saved[width]
        record['resolutions'][quality] = [width, height]
    print(asset['id'], original.size, record['variants'], flush=True)
    return record

catalog = {body: {'missing': ['Verified global surface map not yet available.']} for body in ['sun','mercury','venus','earth','moon','mars','jupiter','saturn','uranus','neptune']}
for asset in ASSETS:
    catalog[asset['body']][asset['slot']] = prepare(asset)
    if asset['slot'] == 'surface': catalog[asset['body']]['missing'] = []

catalog['sun']['missing'] = ['The white-light photosphere, granulation and corona are modeled approximations, not an observed solar activity map. No prominence dataset is installed.']
catalog['venus']['missing'] = ['No verified global visible-light Venus cloud mosaic is installed; the plain cloud color is a visual approximation. Magellan radar is not a visible-light cloud map.']
catalog['earth']['missing'] = ['No measured normal or surface-roughness map is installed; surface roughness is a constant approximation.']
catalog['moon']['missing'] = ['No measured roughness map is installed. The normal map resolves only LOLA elevation at 1440 x 720.']
catalog['mercury']['missing'] = ['Natural-color, normal and measured roughness maps are not installed; the observed monochrome preview is limited to 1024 x 512.']
catalog['mars']['missing'] = ['No normal or measured roughness maps are installed; Viking surface imagery is limited to 1440 x 720.']
catalog['jupiter']['missing'] = ['Polar coverage is absent from the Hubble map and is shown as a neutral placeholder.']
catalog['saturn']['missing'] = ['Ring-obscured and south polar atmospheric coverage is absent and shown as a neutral placeholder.', 'Ring opacity is derived from image brightness, not a calibrated optical-depth profile; D/F/G/E rings are omitted.']
catalog['uranus']['missing'] = ['Unobserved south polar atmosphere and source registration edges are shown as a neutral placeholder; source imagery is only 721 x 361.']
catalog['neptune']['missing'] = ['Unobserved north polar atmosphere and source registration edges are shown as a neutral placeholder; source imagery is only 721 x 361.']

type_header = '''import type { ObjectId } from "../types/celestial";

export interface TextureAsset {
  id: string;
  title: string;
  variants: { low: string; medium: string; high: string };
  colorSpace: "srgb" | "linear";
  sourceUrl: string;
  assetUrl: string;
  attribution: string;
  license: string;
  sourceResolution: [number, number];
  resolutions: { low: [number, number]; medium: [number, number]; high: [number, number] };
  kind: "observational" | "derived";
  notes: string;
  partialCoverage?: boolean;
  radialRangeKm?: [number, number];
}
export interface ObjectImagery {
  surface?: TextureAsset;
  clouds?: TextureAsset;
  night?: TextureAsset;
  normal?: TextureAsset;
  roughness?: TextureAsset;
  rings?: TextureAsset;
  missing: string[];
}

/** Verified provenance and local variants; generated by scripts/prepare-imagery.py. */
export const imageryById: Record<ObjectId, ObjectImagery> = '''
(ROOT / 'src/data/imagery.ts').write_text(type_header + json.dumps(catalog, indent=2, ensure_ascii=False) + ';\n', encoding='utf-8')
