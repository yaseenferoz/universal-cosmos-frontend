"""Package NASA ISS assets locally; no runtime third-party requests.

Interior: NASA Astrobee / IGOAL, pinned Git revision in sources.json.
Retain original mesh geometry and UVs; downsample imagery to <= 2048 pixels.
Run with Python + Pillow. Downloads are cached outside the repository.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import io
import json
import re
import tempfile
import urllib.request
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / 'public/models/iss-interior'
CACHE = Path(tempfile.gettempdir()) / 'universal-cosmos-iss-assets'
ROOT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)

def get(url):
    path = CACHE / hashlib.sha256(url.encode()).hexdigest()
    if not path.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'UniversalCosmos-asset-preparation'})
        with urllib.request.urlopen(request, timeout=120) as response:
            path.write_bytes(response.read())
    return path.read_bytes()

tree = json.loads(get('https://api.github.com/repos/nasa/astrobee_media/git/trees/1cb0620121099cc848f5a3db480464188dc91ea3?recursive=1'))
revision = tree['sha']
base = f'https://raw.githubusercontent.com/nasa/astrobee_media/{revision}/'
entries = [item for item in tree['tree'] if item['path'].startswith('astrobee_iss/') and item['path'].endswith(('.dae', '.png', '.urdf'))]

def prepare(item):
    data = get(base + item['path'])
    name = Path(item['path']).name
    if name.endswith('.png'):
        image = Image.open(io.BytesIO(data)).convert('RGBA')
        image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
        name = name.replace('.png', '.webp')
        image.save(ROOT / name, format='WEBP', quality=90, method=6)
    elif name.endswith('.dae'):
        xml = data.decode('utf-8')
        xml = re.sub(r'<init_from>([^<]+\.png)</init_from>', lambda m: '<init_from>' + m[1].replace('\\', '/').split('/')[-1].replace('.png', '.webp') + '</init_from>', xml)
        (ROOT / name).write_text(xml, encoding='utf-8')
    else:
        (ROOT / name).write_bytes(data)
    return {'file': name, 'source': base + item['path'], 'sourceSha256': hashlib.sha256(data).hexdigest()}

with ThreadPoolExecutor(max_workers=6) as executor:
    sources = list(executor.map(prepare, entries))
(ROOT / 'sources.json').write_text(json.dumps({'revision': revision, 'credit': 'NASA Astrobee / NASA JSC IGOAL', 'usage': 'https://www.nasa.gov/nasa-brand-center/images-and-media/', 'note': 'Historic simulator geometry, not a current scan. Texture resolution capped at 2048; converted to WebP retaining alpha.', 'assets': sources}, indent=2) + '\n')
print(f'Prepared {len(sources)} assets at revision {revision}; {sum(p.stat().st_size for p in ROOT.iterdir()) / 1e6:.1f} MB')
