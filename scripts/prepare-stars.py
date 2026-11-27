"""Build the 3D star catalogue from the HYG database v4.1 (Hipparcos, Yale BSC, Gliese).

Standard library only. The source is cached in the ignored .local/asset-source/stars.
  python scripts/prepare-stars.py

Source: HYG Database v4.1, David Nash / astronexus.com, https://codeberg.org/astronexus/hyg
License: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). The derived files
written here are therefore also CC BY-SA 4.0 and must keep this attribution.

HYG positions are J2000 equatorial Cartesian parsecs (x → RA 0°, z → north celestial pole),
from Hipparcos (new reduction) parallaxes where available and Gliese/Yale otherwise. Stars
without a valid distance (HYG uses 100000 pc) are dropped. Proper motion is not applied:
positions are for epoch J2000.

Outputs (index i in every file is the same star; i = 0 is the Sun):
- public/stars/hyg-v41.bin: 16-byte header ("UCST", version, count, record bytes) then per
  star x, y, z (float32, parsecs, in the engine's axes: +X equinox, +Y ecliptic north,
  -Z ecliptic east), absolute V magnitude x100 (int16), B-V colour index x1000 (int16,
  32767 = unknown), Hipparcos number (int32, 0 = none).
- public/stars/hyg-v41-spect.txt: one spectral type per line (empty if unknown).
- public/stars/hyg-v41-names.json: designations of named stars (proper name, Bayer,
  Flamsteed, constellation, Gliese, HD) keyed by index, and multiple-system links.
"""
from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import math
import struct
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".local" / "asset-source" / "stars"
OUT = ROOT / "public" / "stars"
URL = "https://www.astronexus.com/downloads/catalogs/hygdata_v41.csv.gz"
OBLIQUITY = math.radians(23.4392911)
RECORD = struct.Struct("<fffhhi")


def source() -> bytes:
    path = CACHE / "hygdata_v41.csv.gz"
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(URL, headers={"User-Agent": "UniversalCosmosDataPrep/1.0"})
        with urllib.request.urlopen(request, timeout=300) as response:
            path.write_bytes(response.read())
    return path.read_bytes()


def engine_axes(x: float, y: float, z: float) -> tuple[float, float, float]:
    """J2000 equatorial -> J2000 ecliptic -> engine (x, z_ecl, -y_ecl)."""
    y_ecl = y * math.cos(OBLIQUITY) + z * math.sin(OBLIQUITY)
    z_ecl = -y * math.sin(OBLIQUITY) + z * math.cos(OBLIQUITY)
    return x, z_ecl, -y_ecl


def number(value: str) -> float | None:
    try:
        result = float(value)
    except ValueError:
        return None
    return result if math.isfinite(result) else None


def catalogue_rows() -> tuple[bytes, list[dict[str, str]]]:
    """The source bytes and the kept HYG rows in output order (row i is star index i)."""
    raw = source()
    rows = list(csv.DictReader(io.TextIOWrapper(gzip.GzipFile(fileobj=io.BytesIO(raw)), encoding="utf-8")))
    stars = []
    for row in rows:
        dist = number(row["dist"])
        absmag = number(row["absmag"])
        if dist is None or absmag is None or dist >= 100000 or (dist <= 0 and row["proper"] != "Sol"):
            continue
        stars.append(row)
    stars.sort(key=lambda row: (row["proper"] != "Sol", int(row["id"])))
    return raw, stars


def main() -> None:
    raw, stars = catalogue_rows()
    OUT.mkdir(parents=True, exist_ok=True)
    binary = bytearray(b"UCST" + struct.pack("<III", 1, len(stars), RECORD.size))
    spect_lines = []
    names: dict[str, dict] = {}
    index_by_hyg = {row["id"]: i for i, row in enumerate(stars)}
    for i, row in enumerate(stars):
        x, y, z = engine_axes(float(row["x"]), float(row["y"]), float(row["z"]))
        if row["proper"] == "Sol":
            x = y = z = 0.0
        ci = number(row["ci"])
        hip = int(row["hip"]) if row["hip"].isdigit() else 0
        binary += RECORD.pack(x, y, z, round(float(row["absmag"]) * 100),
                              32767 if ci is None else max(-32000, min(32000, round(ci * 1000))), hip)
        spect_lines.append(row["spect"].strip())
        entry = {key: row[key].strip() for key in ("proper", "bayer", "flam", "con", "gl", "hd") if row[key].strip()}
        primary = row["comp_primary"].strip()
        if primary and primary != row["id"] and primary in index_by_hyg:
            entry["primary"] = index_by_hyg[primary]
        if row["var"].strip():
            entry["var"] = row["var"].strip()
        if any(key in entry for key in ("proper", "bayer", "flam", "gl")):
            names[str(i)] = entry
    (OUT / "hyg-v41.bin").write_bytes(bytes(binary))
    (OUT / "hyg-v41-spect.txt").write_text("\n".join(spect_lines) + "\n", encoding="utf-8")
    meta = {
        "source": "HYG Database v4.1 (Hipparcos, Yale Bright Star, Gliese catalogues)",
        "sourceUrl": "https://codeberg.org/astronexus/hyg",
        "download": URL,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "attribution": "HYG Database by David Nash, astronexus.com",
        "license": "CC BY-SA 4.0",
        "epoch": "J2000.0; proper motion not applied",
        "count": len(stars),
        "names": names,
    }
    (OUT / "hyg-v41-names.json").write_text(json.dumps(meta, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"{len(stars)} stars, {len(names)} named; bin {len(binary)} B")


if __name__ == "__main__":
    main()
