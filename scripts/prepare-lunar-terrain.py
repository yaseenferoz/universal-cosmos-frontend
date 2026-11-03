"""Extract bounded observed Moon terrain; no noise, craters, or detail are invented.

Requires existing NumPy, Pillow, tifffile. Large source row ranges remain in .local.
Run: python scripts/prepare-lunar-terrain.py
"""
import hashlib
import json
import math
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen
import numpy as np
from PIL import Image
import tifffile

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.local' / 'lunar-terrain-source'
OUT = ROOT / 'public' / 'terrain' / 'moon'
CACHE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
RADIUS = 1737400.0
LATITUDE, LONGITUDE = 20.1908, 30.7717
PDS = 'https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/'
DEM_URL = PDS + 'DATA/SDP/NAC_DTM/APOLLO17/NAC_DTM_APOLLO17.TIF'
IMAGE_URL = PDS + 'EXTRAS/BROWSE/NAC_DTM/APOLLO17/NAC_DTM_APOLLO17_MOSAIC_5M.TIF'
SOURCE_PAGE = 'https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_APOLLO17'


def read_range(url, start, end, filename):
    path = CACHE / filename
    expected = end - start + 1
    if path.exists() and path.stat().st_size == expected:
        return path.read_bytes()
    print('Downloading', filename, expected, 'bytes', flush=True)
    request = Request(url, headers={'Range': f'bytes={start}-{end}'})
    with urlopen(request, timeout=120) as response:
        if response.status != 206:
            raise RuntimeError('Source must honor HTTP Range; refusing a whole-raster download')
        with path.open('wb') as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
    if path.stat().st_size != expected:
        raise RuntimeError('Truncated source range')
    return path.read_bytes()


def raster_header(url, name):
    header = read_range(url, 0, 131071, name + '-header.bin')
    with tifffile.TiffFile(BytesIO(header)) as image:
        page = image.pages[0]
        if int(page.compression) != 1 or page.rowsperstrip != 1:
            raise RuntimeError('Expected independently addressable uncompressed source rows')
        scale = page.tags['ModelPixelScaleTag'].value
        tiepoint = page.tags['ModelTiepointTag'].value
        return dict(width=page.shape[1], height=page.shape[0], dtype=page.dtype,
                    offsets=page.dataoffsets, counts=page.databytecounts,
                    xmin=tiepoint[3], ymax=tiepoint[4], dx=scale[0], dy=scale[1])


def source_rows(url, header, row0, row1, name):
    start = header['offsets'][row0]
    end = header['offsets'][row1] + header['counts'][row1] - 1
    raw = read_range(url, start, end, f'{name}-rows-{row0}-{row1}.bin')
    return np.frombuffer(raw, dtype=header['dtype']).reshape(row1 - row0 + 1, header['width'])


def bounds_for(header, row0, row1, col0, col1):
    def longitude(col):
        x = header['xmin'] + (col + 0.5) * header['dx']
        return 180 + math.degrees(x / RADIUS / math.cos(math.radians(20)))
    def latitude(row):
        y = header['ymax'] - (row + 0.5) * header['dy']
        return math.degrees(y / RADIUS)
    return dict(west=longitude(col0), east=longitude(col1), south=latitude(row1), north=latitude(row0))


def write_grid(filename, array):
    path = OUT / filename
    array.astype('<f4').tofile(path)
    return path.stat().st_size


def make_tiles(array, bounds, tier, spacing, imagery):
    descriptors = []
    intervals = array.shape[0] - 1
    for y in range(4):
        for x in range(4):
            y0, x0 = y * 128, x * 128
            grid = array[y0:y0+129, x0:x0+129]
            tile_bounds = dict(
                west=bounds['west'] + (bounds['east'] - bounds['west']) * x0 / intervals,
                east=bounds['west'] + (bounds['east'] - bounds['west']) * (x0 + 128) / intervals,
                north=bounds['north'] - (bounds['north'] - bounds['south']) * y0 / intervals,
                south=bounds['north'] - (bounds['north'] - bounds['south']) * (y0 + 128) / intervals)
            tile_id = f'apollo17-{tier}-{x}-{y}'
            filename = tile_id + '.f32'
            byte_length = write_grid(filename, grid)
            descriptors.append(dict(id=tile_id, url='/terrain/moon/' + filename,
                bounds=tile_bounds, width=129, height=129, resolutionM=spacing,
                sourceId='lroc-apollo17-5m', byteLength=byte_length, tier=tier, imagery=imagery))
    return descriptors


print('Reading source projection and row geometry', flush=True)
dem_header = raster_header(DEM_URL, 'apollo17-dem')
image_header = raster_header(IMAGE_URL, 'apollo17-orthophoto')
for key in ['width', 'height', 'xmin', 'ymax', 'dx', 'dy']:
    if not math.isclose(dem_header[key], image_header[key], abs_tol=1e-6):
        raise RuntimeError('Orthophoto must share DEM grid registration')

x = RADIUS * math.radians(LONGITUDE - 180) * math.cos(math.radians(20))
y = RADIUS * math.radians(LATITUDE)
center_col = round((x - dem_header['xmin']) / dem_header['dx'] - 0.5)
center_row = round((dem_header['ymax'] - y) / dem_header['dy'] - 0.5)
row0, row1 = center_row - 2048, center_row + 2048
col0, col1 = center_col - 2048, center_col + 2048
if row0 < 0 or row1 >= dem_header['height'] or col0 < 0 or col1 >= dem_header['width']:
    raise RuntimeError('Requested context exceeds actual source coverage')

dem_rows = source_rows(DEM_URL, dem_header, row0, row1, 'apollo17-dem')
image_rows = source_rows(IMAGE_URL, image_header, row0, row1, 'apollo17-orthophoto')
dem = np.asarray(dem_rows[:, col0:col1+1], dtype=np.float32).copy()
dem[~np.isfinite(dem) | (dem < -15000) | (dem > 15000)] = np.nan
image = np.asarray(image_rows[:, col0:col1+1], dtype=np.uint8)
context = dem[::8, ::8]
local = dem[1792:2305, 1792:2305]
context_bounds = bounds_for(dem_header, row0, row1, col0, col1)
local_bounds = bounds_for(dem_header, center_row-256, center_row+256, center_col-256, center_col+256)
if not np.isfinite(local).all():
    raise RuntimeError('Landing region contains missing heights; choose a verified complete region')

sources = [
    dict(id='lola-global-4ppd', title='LOLA global elevation, 4 pixels per degree',
         sourceUrl='https://svs.gsfc.nasa.gov/4720/', assetUrl='https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_4.tif',
         attribution='NASA Scientific Visualization Studio / Ernie Wright / LOLA',
         license='NASA media usage guidelines; attribution, no endorsement.', nativeResolutionM=2*math.pi*RADIUS/1440,
         notes='Coarse global context only. Float kilometers converted to meters; no additional detail or claimed meter-scale accuracy.'),
    dict(id='lroc-apollo17-5m', title='LROC NAC Apollo 17 stereo DTM v1.9 and registered orthophoto',
         sourceUrl=SOURCE_PAGE, assetUrl=DEM_URL,
         attribution='NASA/GSFC/Arizona State University / LROC team',
         license='NASA PDS publicly released mission data; retain NASA/GSFC/ASU attribution.',
         nativeResolutionM=5, relativePrecisionM=2.55, lolaComparisonRmsM=1.77,
         notes='Planetocentric/east-positive; sphere radius1737400m. Relative precision and LOLA comparison are not a blanket absolute-accuracy guarantee. Source stereo artifacts/interpolation and baked orthophoto illumination remain. Context resampled40m; selected2.56km square retains5m posts. No rocks or subpixel relief fabricated.'),
]
global_path = ROOT / '.local' / 'asset-source' / 'moon-height.tif'
if not global_path.exists():
    with urlopen(sources[0]['assetUrl'], timeout=60) as response: global_path.write_bytes(response.read())
global_heights = np.asarray(Image.open(global_path), dtype=np.float32) * 1000
if not np.isfinite(global_heights).all(): raise RuntimeError('Unexpected missing global source values')
global_bytes = write_grid('lola-global-4ppd.f32', global_heights)
tiles = [dict(id='lola-global-4ppd', url='/terrain/moon/lola-global-4ppd.f32',
    bounds=dict(west=-179.875,east=179.875,south=-89.875,north=89.875),
    width=1440,height=720,resolutionM=sources[0]['nativeResolutionM'],sourceId='lola-global-4ppd',byteLength=global_bytes,tier='global')]

for tier, heights, bounds, spacing, pixels in [
    ('context', context, context_bounds, 40, image[::8, ::8]),
    ('local', local, local_bounds, 5, image[1792:2305, 1792:2305]),
]:
    filename = f'apollo17-{tier}-orthophoto.webp'
    Image.fromarray(pixels).save(OUT / filename, 'WEBP', quality=92, method=6)
    imagery = dict(url='/terrain/moon/' + filename, bounds=bounds, sourceResolutionM=spacing, sourceId='lroc-apollo17-5m')
    tiles.extend(make_tiles(heights, bounds, tier, spacing, imagery))

manifest = dict(id='moon-taurus-littrow',version='2026-11-02-v1',bodyId='moon',radiusM=RADIUS,
    minElevationM=float(min(np.nanmin(global_heights),np.nanmin(dem))),
    maxElevationM=float(max(np.nanmax(global_heights),np.nanmax(dem))),
    globalResolutionM=sources[0]['nativeResolutionM'],
    coordinates='Planetocentric latitude/east-positive longitude in degrees. Datum1737400m. Body-fixed +Y north,+X lon0,east-positive longitude toward -Z. Grids contain inclusive posts, row0 north. Global source pixel centers use wrapping longitude.',
    elevationUnits='meters',encoding='float32-le',
    landingRegion=dict(id='taurus-littrow',label='Taurus–Littrow · Apollo 17 region',latDeg=LATITUDE,lonDeg=LONGITUDE,radiusM=900,desiredResolutionM=5),
    sources=sources,tiles=tiles,contextBounds=context_bounds,localBounds=local_bounds,contextBlendM=1200,localBlendM=160)
payload = json.dumps(manifest,indent=2,ensure_ascii=False)
(OUT / 'manifest.json').write_text(payload+'\n',encoding='utf-8')
(ROOT / 'src/services/terrain/moonManifest.ts').write_text('import type { TerrainManifest } from "../../types/terrain";\n\n/** Generated by scripts/prepare-lunar-terrain.py; real measured source grids only. */\nexport const moonTerrainManifest: TerrainManifest = '+payload+';\n',encoding='utf-8')
audit = dict(landingSampleM=float(local[256,256]),localFiniteFraction=float(np.isfinite(local).mean()),contextFiniteFraction=float(np.isfinite(context).mean()),
    sourceRowRange=[row0,row1],sourceColumnRange=[col0,col1],sourceHeaderSha256=hashlib.sha256((CACHE/'apollo17-dem-header.bin').read_bytes()).hexdigest(),
    sources=dict(dem=DEM_URL,orthophoto=IMAGE_URL),files={p.name:dict(bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in OUT.iterdir() if p.suffix in ['.f32','.webp']})
(OUT / 'audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf-8')
print('Prepared',len(tiles),'height tiles. Landing post:',audit['landingSampleM'],'m; local valid:',audit['localFiniteFraction'],flush=True)
print('Context bounds',context_bounds,'local bounds',local_bounds,flush=True)
print('Total packaged bytes',sum(p.stat().st_size for p in OUT.iterdir()),flush=True)
