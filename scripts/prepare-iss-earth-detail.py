"""Prepare a local 500 m Blue Marble Next Generation crop for the ISS Cupola.

NASA's global 8K mosaic has roughly 5 km pixels at the equator. A 20° square
crop over central Africa keeps detail near 500 m without a giant GPU texture.
The downloaded source tiles stay in the ignored .local cache.
"""
from pathlib import Path
from urllib.request import urlopen
import gc
import hashlib
import json
import numpy as np
from PIL import Image

# The two documented NASA 21600² tiles exceed Pillow's generic image guard.
Image.MAX_IMAGE_PIXELS = 500_000_000

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / ".local/asset-source"
SOURCE_DIR.mkdir(parents=True, exist_ok=True)
BASE = "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-base/july"
TILES = {
    "C1": f"{BASE}/world.200407.3x21600x21600.C1.jpg",
    "C2": f"{BASE}/world.200407.3x21600x21600.C2.jpg",
}


def download_tile(name: str, url: str) -> Path:
    target = SOURCE_DIR / f"iss-earth-200407-{name}.jpg"
    if target.exists():
        return target
    part = target.with_suffix(".part")
    with urlopen(url, timeout=180) as response, part.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
    part.replace(target)
    return target


def digest(path: Path) -> str:
    checksum = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            checksum.update(chunk)
    return checksum.hexdigest()


# C1: 90°N–0°, C2: 0°–90°S; each tile covers 0°–90°E at 240 px/degree.
# Crop longitude 10°–30°E and latitude 10°N–10°S, keeping native 4800 px.
atlas = Image.new("RGB", (4800, 4800))
source_hashes = {}
for name, url in TILES.items():
    path = download_tile(name, url)
    with Image.open(path) as source:
        if source.size != (21600, 21600):
            raise ValueError(f"Unexpected {name} dimensions: {source.size}")
        box = (2400, 19200, 7200, 21600) if name == "C1" else (2400, 0, 7200, 2400)
        crop = source.crop(box)
        atlas.paste(crop, (0, 0 if name == "C1" else 2400))
    source_hashes[name] = digest(path)
    gc.collect()

detail = atlas.resize((4096, 4096), Image.Resampling.LANCZOS).convert("RGBA")
edge = np.minimum(np.arange(4096), np.arange(4095, -1, -1)).astype(np.float32)
edge = np.clip(edge / 256, 0, 1)
edge = edge * edge * (3 - 2 * edge)
alpha = (np.minimum.outer(edge, edge) * 255).astype(np.uint8)
detail.putalpha(Image.fromarray(alpha, "L"))
destination = ROOT / "public/textures/iss-earth-africa-4096.webp"
detail.save(destination, format="WEBP", quality=95, method=6)
metadata = {
    "sourcePage": "https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-map/",
    "sources": TILES,
    "sourceSha256": source_hashes,
    "outputSha256": digest(destination),
    "credit": "NASA Earth Observatory / Reto Stöckli and the Blue Marble Next Generation team",
    "sourceMonth": "July 2004",
    "extentDegrees": {"west": 10, "east": 30, "north": 10, "south": -10},
    "sourceResolution": "500 m at equator; 4800 x 4800 native pixels in this crop",
    "outputResolution": [4096, 4096],
    "processing": "Cropped and joined native NASA C1/C2 JPEG tiles, reduced to 4096 pixels and feathered at edges; no invented detail or upscaling.",
}
(ROOT / "public/textures/iss-earth-africa-source.json").write_text(
    json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
)
print(f"{destination.name}: {destination.stat().st_size / 1e6:.1f} MB")
