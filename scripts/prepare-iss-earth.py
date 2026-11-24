"""Prepare a full-resolution ISS Earth view from the verified NASA Blue Marble source.

This keeps the original 8192x4096 pixels; it does not upscale imagery.
The normal planetary renderer continues to use its own quality variants.
"""
from pathlib import Path
from urllib.request import urlopen
import hashlib
import json
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root / '.local/asset-source/earth-day.png'
url = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_8192.png'
if not source.exists():
    source.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(url, timeout=120) as response:
        source.write_bytes(response.read())
image = Image.open(source).convert('RGB')
if image.size != (8192, 4096):
    raise ValueError(f'Expected 8192x4096 NASA source, got {image.size}')
destination = root / 'public/textures/iss-earth-day-8192.webp'
image.save(destination, format='WEBP', quality=96, method=6)
(root / 'public/textures/iss-earth-source.json').write_text(json.dumps({
    'source': url,
    'sourcePage': 'https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/',
    'credit': 'NASA Goddard / Reto Stöckli / Robert Simmon / MODIS teams',
    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'outputSha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
    'resolution': list(image.size),
    'processing': 'Source pixels preserved; lossy WebP quality 96. Historical cloud-free composite, no upscaling.',
}, indent=2) + '\n')
print(f'{destination.name}: {destination.stat().st_size / 1e6:.1f} MB')
