"""Reproduce bounded NASA SVS celestial sky assets.

Run from the repository root with Pillow, NumPy, OpenCV, Astropy, and astropy-healpix.
Source downloads stay in ignored .local/asset-source; outputs use the J2000 sky projection.
"""
import os
import ssl
import subprocess
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

from PIL import Image, ImageFilter
import numpy as np
os.environ["OPENCV_IO_ENABLE_OPENEXR"] = "1"
import cv2
from astropy.io import fits
from astropy import units as units
from astropy_healpix import HEALPix

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://svs.gsfc.nasa.gov/vis/a000000/a003800/a003895/starmap_4k.jpg"
BACKGROUND_URL = "https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/milkyway_2020_4k.exr"
HALPHA_URL = "https://lambda.gsfc.nasa.gov/data/foregrounds/halpha/lambda_halpha_fwhm06_0512.fits"
source_dir = ROOT / ".local" / "asset-source"
source_dir.mkdir(parents=True, exist_ok=True)

def download(url: str, path: Path) -> None:
    if path.exists() and path.stat().st_size > 0:
        return
    try:
        with urlopen(url, timeout=90) as response:
            path.write_bytes(response.read())
    except URLError as error:
        if not isinstance(error.reason, ssl.SSLCertVerificationError):
            raise
        subprocess.run(["curl.exe", "--fail", "--location", url, "--output", str(path)], check=True)

source = source_dir / "starmap_4k.jpg"
background_source = source_dir / "milkyway_2020_4k.exr"
halpha_source = source_dir / "lambda_halpha_fwhm06_0512.fits"
download(SOURCE_URL, source)
download(BACKGROUND_URL, background_source)
download(HALPHA_URL, halpha_source)
image = Image.open(source).convert("RGB")
if image.size != (4096, 2048):
    raise ValueError(f"Unexpected source dimensions: {image.size}")
output = ROOT / "public" / "textures"
output.mkdir(parents=True, exist_ok=True)
# The 2020 layer already omits bright Hipparcos/Tycho stars, preserving broad
# Milky Way light and dark dust lanes. Convert its linear EXR values to sRGB.
linear_bgr = cv2.imread(str(background_source), cv2.IMREAD_UNCHANGED)
if linear_bgr is None or linear_bgr.shape != (2048, 4096, 3):
    raise ValueError("Unexpected NASA SVS Milky Way background")
linear = cv2.cvtColor(linear_bgr, cv2.COLOR_BGR2RGB)
np.clip(linear, 0, 1, out=linear)

# Reproject the measured hydrogen-alpha emission from Galactic nested HEALPix
# to the same ICRF/J2000 plate-carree pixels as the SVS background. H-alpha is
# faint to human vision; the bounded red tint below is an explicit enhancement.
width, height = 2048, 1024
ra = (0.5 - (np.arange(width, dtype=np.float32) + 0.5) / width) * (2 * np.pi)
dec = (0.5 - (np.arange(height, dtype=np.float32) + 0.5) / height) * np.pi
cos_dec = np.cos(dec)[:, None]
x = cos_dec * np.cos(ra)[None, :]
y = cos_dec * np.sin(ra)[None, :]
z = np.sin(dec)[:, None]
# ICRS to Galactic rotation (IAU J2000 convention).
gal_x = -0.0548755604 * x - 0.8734370902 * y - 0.4838350155 * z
gal_y = 0.4941094279 * x - 0.4448296300 * y + 0.7469822445 * z
gal_z = -0.8676661490 * x - 0.1980763734 * y + 0.4559837762 * z
gal_lon = np.mod(np.arctan2(gal_y, gal_x), 2 * np.pi)
gal_lat = np.arcsin(np.clip(gal_z, -1, 1))
pixels = HEALPix(nside=512, order="nested").lonlat_to_healpix(gal_lon * units.rad, gal_lat * units.rad)
with fits.open(halpha_source, memmap=True) as survey:
    if survey[1].header["ORDERING"].strip() != "NESTED" or survey[1].header["NSIDE"] != 512:
        raise ValueError("Unexpected hydrogen-alpha HEALPix layout")
    emission = np.asarray(survey[1].data.field(0)[pixels], dtype=np.float32)
signal = np.clip(np.log1p(np.maximum(emission - 5.0, 0.0)) / np.log1p(160.0), 0, 1) ** 1.7
signal = cv2.GaussianBlur(signal, (0, 0), sigmaX=0.8)
signal = cv2.resize(signal, (4096, 2048), interpolation=cv2.INTER_LINEAR)
linear[:, :, 0] += 0.06 * signal
linear[:, :, 1] += 0.006 * signal
np.clip(linear, 0, 1, out=linear)
srgb = np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(linear, 1 / 2.4) - 0.055)
diffuse = Image.fromarray(np.rint(srgb * 255).astype(np.uint8), "RGB")
for width in (2048, 4096):
    variant = diffuse if width == 4096 else diffuse.resize((2048, 1024), Image.Resampling.LANCZOS)
    variant.save(output / f"deep-sky-{width}.webp", "WEBP", quality=88, method=6)

# Extract isolated bright peaks from the same source map for resolution-independent
# point rendering. This does not create or move stars; faint catalog stars and the
# Milky Way remain in the texture. Pixel positions are approximate, not a new catalog.
rgb = np.asarray(image, dtype=np.uint8)
gray_image = image.convert("L")
gray = np.asarray(gray_image)
local_max = np.asarray(gray_image.filter(ImageFilter.MaxFilter(5)))
ys, xs = np.where((gray == local_max) & (gray >= 55))
order = np.argsort(gray[ys, xs])[::-1]
selected: list[tuple[int, int]] = []
occupied = np.zeros(gray.shape, dtype=np.bool_)
for index in order:
    x, y = int(xs[index]), int(ys[index])
    if occupied[max(0, y - 2):y + 3, max(0, x - 2):x + 3].any():
        continue
    selected.append((x, y))
    occupied[max(0, y - 2):y + 3, max(0, x - 2):x + 3] = True
    if len(selected) == 24000:
        break

records = np.empty((len(selected), 7), dtype="<f4")
for index, (x, y) in enumerate(selected):
    u = (x + 0.5) / image.width
    theta = (y + 0.5) / image.height * np.pi
    phi = u * np.pi * 2
    records[index, 0:3] = (-np.cos(phi) * np.sin(theta), np.cos(theta), np.sin(phi) * np.sin(theta))
    records[index, 3:6] = (rgb[y, x] / 255.0) ** 1.4
    brightness = (float(gray[y, x]) - 55) / 200
    records[index, 6] = 1.25 + 1.35 * brightness ** 1.2
(output / "deep-sky-bright-stars.bin").write_bytes(records.tobytes())
print(f"Extracted {len(selected)} source-map bright peaks")
