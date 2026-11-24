"""Repack NASA GLB with <=2048px textures; keep original geometry/materials.
No geometry simplification or invented detail. Original is cached in TEMP.
"""
from pathlib import Path
from PIL import Image
import io, json, struct, tempfile, urllib.request, hashlib

root = Path(__file__).resolve().parents[1] / 'public/models'
source = 'https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/i/ISS_stationary.glb'
cache = Path(tempfile.gettempdir()) / 'universal-cosmos-iss-original.glb'
if not cache.exists():
    # Never mistake an already repacked repository asset for the original source.
    cache.write_bytes(urllib.request.urlopen(source, timeout=120).read())
raw = cache.read_bytes()
n = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20+n])
binary = raw[28+n:]
images = {image['bufferView']: image for image in doc['images']}
output = bytearray()
for index, view in enumerate(doc['bufferViews']):
    data = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
    if index in images:
        image = Image.open(io.BytesIO(data))
        image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
        has_alpha = 'A' in image.getbands() and image.getchannel('A').getextrema()[0] < 255
        stream = io.BytesIO()
        image.convert('RGBA' if has_alpha else 'RGB').save(stream, format='PNG' if has_alpha else 'JPEG', quality=90, optimize=True)
        data = stream.getvalue()
        images[index]['mimeType'] = 'image/png' if has_alpha else 'image/jpeg'
    output.extend(b'\0' * (-len(output) % 4))
    view['byteOffset'], view['byteLength'] = len(output), len(data)
    output.extend(data)
doc['buffers'][0]['byteLength'] = len(output)
output.extend(b'\0' * (-len(output) % 4))
encoded = json.dumps(doc, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
packed = struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(output)) + struct.pack('<I4s', len(encoded), b'JSON') + encoded + struct.pack('<I4s', len(output), b'BIN\0') + output
(root / 'iss-nasa.glb').write_bytes(packed)
(root / 'iss-exterior-source.json').write_text(json.dumps({'source': source, 'page': 'https://science.nasa.gov/resource/international-space-station-3d-model/', 'credit': 'NASA Visualization Technology Applications and Development (VTAD)', 'sourceSha256': hashlib.sha256(raw).hexdigest(), 'outputSha256': hashlib.sha256(packed).hexdigest(), 'processing': 'Original geometry/materials; texture cap 2048px, opaque textures JPEG quality 90. Historical configuration, not a live model.'}, indent=2) + '\n')
print(f'Exterior {len(raw)/1e6:.1f} -> {len(packed)/1e6:.1f} MB')
