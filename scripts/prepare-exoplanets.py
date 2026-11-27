"""Build the exoplanet systems file from the NASA Exoplanet Archive (confirmed planets).

Standard library only. Run after scripts/prepare-stars.py (it reuses that catalogue's star
indices). The archive table is cached in the ignored .local/asset-source/stars.
  python scripts/prepare-exoplanets.py            # use the cached table
  python scripts/prepare-exoplanets.py --refresh  # download the current table

Source: NASA Exoplanet Archive, Planetary Systems Composite Parameters (pscomppars), one row
per confirmed planet, https://exoplanetarchive.ipac.caltech.edu/. The archive asks users to
acknowledge: "This research has made use of the NASA Exoplanet Archive, which is operated by
the California Institute of Technology, under contract with the National Aeronautics and
Space Administration under the Exoplanet Exploration Program."

The composite table mixes parameters from different publications and fills some gaps with
calculated values (flagged here). Host stars are matched to the HYG catalogue by Hipparcos
number, then HD number, then position (HYG proper motion applied to epoch 2016) with
distance and magnitude agreement. Hosts not in HYG (most Kepler, TESS and M-dwarf hosts) are
written with their own position from the archive's RA, Dec and distance.

Output: public/stars/exoplanets.json
"""
from __future__ import annotations

import csv
import hashlib
import importlib.util
import io
import json
import math
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".local" / "asset-source" / "stars"
OUT = ROOT / "public" / "stars" / "exoplanets.json"
TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
COLUMNS = [
    "pl_name", "hostname", "hip_name", "hd_name", "ra", "dec", "sy_dist", "sy_vmag", "sy_gaiamag",
    "sy_snum", "sy_pnum", "st_teff", "st_rad", "st_mass", "st_lum", "st_spectype",
    "pl_orbper", "pl_orbsmax", "pl_orbsmax_reflink", "pl_orbeccen", "pl_orbincl", "pl_orblper",
    "pl_tranmid", "pl_orbtper", "pl_rade", "pl_rade_reflink", "pl_bmasse", "pl_bmassprov",
    "pl_eqt", "pl_eqt_reflink", "pl_insol", "discoverymethod", "disc_year", "disc_facility",
    "tran_flag", "pl_controv_flag",
]
QUERY = f"select {','.join(COLUMNS)} from pscomppars order by hostname, pl_name"
ACKNOWLEDGEMENT = (
    "This research has made use of the NASA Exoplanet Archive, which is operated by the California "
    "Institute of Technology, under contract with the National Aeronautics and Space Administration "
    "under the Exoplanet Exploration Program."
)
OBLIQUITY = math.radians(23.4392911)
CALCULATED = "CALCULATED_VALUE"
MATCH_RADIUS = math.radians(1.5 / 60)


def load_star_script():
    spec = importlib.util.spec_from_file_location("prepare_stars", ROOT / "scripts" / "prepare-stars.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def archive_table(refresh: bool) -> tuple[bytes, str]:
    path = CACHE / "pscomppars.csv"
    stamp = CACHE / "pscomppars.retrieved"
    if refresh or not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        url = f"{TAP}?{urllib.parse.urlencode({'query': QUERY, 'format': 'csv'})}"
        request = urllib.request.Request(url, headers={"User-Agent": "UniversalCosmosDataPrep/1.0"})
        with urllib.request.urlopen(request, timeout=600) as response:
            path.write_bytes(response.read())
        stamp.write_text(date.today().isoformat(), encoding="utf-8")
    return path.read_bytes(), stamp.read_text(encoding="utf-8").strip() if stamp.exists() else "unknown"


def number(value: str | None) -> float | None:
    if value is None or value.strip() == "":
        return None
    try:
        result = float(value)
    except ValueError:
        return None
    return result if math.isfinite(result) else None


def sig(value: float | None, digits: int = 6) -> float | None:
    if value is None:
        return None
    if value == 0:
        return 0.0
    return float(f"{value:.{digits}g}")


def bolometric_correction(teff: float) -> float:
    """Torres 2010 (AJ 140:1158) BC_V from effective temperature."""
    t = math.log10(max(2000.0, min(60000.0, teff)))
    if t < 3.7:
        return -0.190537291496456e5 + 0.155144866764412e5 * t - 0.421278819301717e4 * t**2 + 0.381476328422343e3 * t**3
    if t < 3.9:
        return (-0.370510203809015e5 + 0.385672629965804e5 * t - 0.150651486316025e5 * t**2
                + 0.261724637119416e4 * t**3 - 0.170623810323864e3 * t**4)
    return (-0.118115450538963e6 + 0.137145973583929e6 * t - 0.636233812100225e5 * t**2
            + 0.147412923562646e5 * t**3 - 0.170587278406872e4 * t**4 + 0.788731721804990e2 * t**5)


def unit_vector(ra_deg: float, dec_deg: float) -> tuple[float, float, float]:
    ra, dec = math.radians(ra_deg), math.radians(dec_deg)
    return math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)


def engine_axes(x: float, y: float, z: float) -> tuple[float, float, float]:
    y_ecl = y * math.cos(OBLIQUITY) + z * math.sin(OBLIQUITY)
    z_ecl = -y * math.sin(OBLIQUITY) + z * math.cos(OBLIQUITY)
    return x, z_ecl, -y_ecl


class SkyGrid:
    """Unit-vector hash grid (~3.4 arcmin cells) for positional matching."""

    CELL = 0.001

    def __init__(self) -> None:
        self.cells: dict[tuple[int, int, int], list[tuple[int, tuple[float, float, float]]]] = defaultdict(list)

    def key(self, v: tuple[float, float, float]) -> tuple[int, int, int]:
        return tuple(math.floor(c / self.CELL) for c in v)  # type: ignore[return-value]

    def add(self, index: int, v: tuple[float, float, float]) -> None:
        self.cells[self.key(v)].append((index, v))

    def near(self, v: tuple[float, float, float]):
        kx, ky, kz = self.key(v)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    yield from self.cells.get((kx + dx, ky + dy, kz + dz), ())


def separation(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    dot = max(-1.0, min(1.0, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
    return math.acos(dot)


def mass_kind(provenance: str) -> str | None:
    """None for a measured true mass; s = minimum mass (M sin i); r = from a mass-radius relation."""
    return {"Mass": None, "Msini": "s", "M-R relationship": "r"}.get(provenance.strip(), "u")


def main_sequence_from_mass(mass: float) -> tuple[float, float]:
    """Rough main-sequence luminosity (log10 L/Lsun) and Teff from mass, for hosts with no
    photometry (mostly microlensing lenses). Piecewise L-M relation (Duric 2004) and R ~ M^0.8."""
    if mass < 0.43:
        lum = 0.23 * mass**2.3
    elif mass < 2:
        lum = mass**4
    else:
        lum = 1.4 * mass**3.5
    radius = mass**0.8 if mass < 1 else mass**0.57
    return math.log10(lum), 5772 * (lum / radius**2) ** 0.25


def main() -> None:
    stars_module = load_star_script()
    _, stars = stars_module.catalogue_rows()
    raw, retrieved = archive_table("--refresh" in sys.argv)
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8"))))
    if not rows or "pl_name" not in rows[0]:
        raise SystemExit("Archive response is not the expected CSV table.")

    by_hip: dict[int, int] = {}
    by_hd: dict[int, int] = {}
    grid = SkyGrid()
    for index, row in enumerate(stars):
        if row["hip"].isdigit():
            by_hip.setdefault(int(row["hip"]), index)
        if row["hd"].isdigit():
            by_hd.setdefault(int(row["hd"]), index)
        ra, dec = number(row["ra"]), number(row["dec"])
        if index == 0 or ra is None or dec is None:
            continue
        # HYG: RA in hours, J2000; proper motion (mas/yr) carried to the Gaia epoch, 2016.
        pmra, pmdec = number(row["pmra"]) or 0.0, number(row["pmdec"]) or 0.0
        dec16 = dec + pmdec * 16 / 3.6e6
        ra16 = ra * 15 + pmra * 16 / 3.6e6 / max(0.01, math.cos(math.radians(dec)))
        grid.add(index, unit_vector(ra16, dec16))

    def designation_number(value: str, prefix: str) -> int | None:
        value = value.strip()
        if not value.startswith(prefix):
            return None
        digits = value[len(prefix):].strip().split(" ")[0]
        return int(digits) if digits.isdigit() else None

    hosts: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        hosts[row["hostname"].strip()].append(row)

    methods: list[str] = []
    facilities: list[str] = []

    def table_index(table: list[str], value: str) -> int:
        if value not in table:
            table.append(value)
        return table.index(value)

    systems: dict[str, dict] = {}
    matched = {"hip": 0, "hd": 0, "position": 0, "archive": 0}
    skipped: list[str] = []
    for host, planets in hosts.items():
        first = planets[0]
        dist = number(first["sy_dist"])
        vmag = number(first["sy_vmag"])
        teff = number(first["st_teff"])
        star_index: int | None = None
        how = "archive"
        hip = designation_number(first["hip_name"], "HIP")
        hd = designation_number(first["hd_name"], "HD")
        if hip is not None and hip in by_hip:
            star_index, how = by_hip[hip], "hip"
        elif hd is not None and hd in by_hd:
            star_index, how = by_hd[hd], "hd"
        else:
            ra, dec = number(first["ra"]), number(first["dec"])
            if ra is not None and dec is not None:
                v = unit_vector(ra, dec)
                best = None
                for index, w in grid.near(v):
                    sep = separation(v, w)
                    if sep > MATCH_RADIUS:
                        continue
                    hyg = stars[index]
                    hyg_dist, hyg_mag = number(hyg["dist"]), number(hyg["mag"])
                    if dist and hyg_dist and not (0.7 < hyg_dist / dist < 1.43):
                        continue
                    if vmag is not None and hyg_mag is not None and abs(hyg_mag - vmag) > 1.0:
                        continue
                    if best is None or sep < best[0]:
                        best = (sep, index)
                if best:
                    star_index, how = best[1], "position"
        matched[how] += 1

        system: dict = {"host": host}
        if star_index is not None:
            system["star"] = star_index
        else:
            ra, dec = number(first["ra"]), number(first["dec"])
            if ra is None or dec is None or dist is None or dist <= 0:
                skipped.append(host)
                continue
            x, y, z = (c * dist for c in unit_vector(ra, dec))
            system["pos"] = [round(c, 5) for c in engine_axes(x, y, z)]
            lum = number(first["st_lum"])
            radius = number(first["st_rad"])
            bc = bolometric_correction(teff if teff else 5772.0)
            if vmag is not None:
                system["mv"], system["mvFrom"] = vmag - 5 * math.log10(dist) + 5, "V"
            elif lum is not None:
                system["mv"], system["mvFrom"] = 4.74 - 2.5 * lum - bc, "luminosity"
            elif radius and teff:
                system["mv"], system["mvFrom"] = 4.74 - 2.5 * math.log10(radius**2 * (teff / 5772) ** 4) - bc, "radius"
            elif number(first["sy_gaiamag"]) is not None:
                system["mv"], system["mvFrom"] = number(first["sy_gaiamag"]) - 5 * math.log10(dist) + 5, "gaia"
            elif number(first["st_mass"]):
                log_lum, ms_teff = main_sequence_from_mass(number(first["st_mass"]))
                teff = teff or ms_teff
                system["mv"], system["mvFrom"] = 4.74 - 2.5 * log_lum - bolometric_correction(teff), "mass"
                if not number(first["st_teff"]):
                    system["teffEst"] = round(ms_teff)
            else:
                skipped.append(host)
                continue
            system["mv"] = round(system["mv"], 3)
        for key, column in (("teff", "st_teff"), ("rad", "st_rad"), ("mass", "st_mass"), ("lum", "st_lum"), ("dist", "sy_dist")):
            value = sig(number(first[column]), 5)
            if value is not None:
                system[key] = value
        if first["st_spectype"].strip():
            system["spt"] = first["st_spectype"].strip()
        if number(first["sy_snum"]):
            system["stars"] = int(number(first["sy_snum"]))
        records = []
        for row in planets:
            name = row["pl_name"].strip()
            # Most names are "<host> <letter>": store the letter only.
            planet: dict = {"n": name[len(host) + 1:]} if name.startswith(host + " ") else {"name": name}
            for key, column in (("p", "pl_orbper"), ("a", "pl_orbsmax"), ("e", "pl_orbeccen"), ("i", "pl_orbincl"),
                                ("w", "pl_orblper"), ("tc", "pl_tranmid"), ("tp", "pl_orbtper"), ("r", "pl_rade"),
                                ("m", "pl_bmasse"), ("teq", "pl_eqt"), ("s", "pl_insol")):
                digits = {"tc": 12, "tp": 12, "p": 10, "a": 6}.get(key, 4)
                value = sig(number(row[column]), digits)
                if value is not None:
                    planet[key] = value
            if CALCULATED in row["pl_rade_reflink"]:
                planet["rCalc"] = 1
            if CALCULATED in row["pl_orbsmax_reflink"]:
                planet["aCalc"] = 1
            if CALCULATED in row["pl_eqt_reflink"]:
                planet["teqCalc"] = 1
            if "m" in planet and mass_kind(row["pl_bmassprov"]):
                planet["mk"] = mass_kind(row["pl_bmassprov"])
            planet["method"] = table_index(methods, row["discoverymethod"].strip())
            if number(row["disc_year"]):
                planet["year"] = int(number(row["disc_year"]))
            if row["disc_facility"].strip():
                planet["fac"] = table_index(facilities, row["disc_facility"].strip())
            if row["tran_flag"].strip() == "1":
                planet["tr"] = 1
            if row["pl_controv_flag"].strip() == "1":
                planet["controversial"] = 1
            records.append(planet)
        records.sort(key=lambda p: (p.get("a", p.get("p", 1e9) ** (2 / 3) * 1e-2), p.get("n", p.get("name", ""))))
        system["planets"] = records
        # Several archive host names can be one HYG star (e.g. "HD 41004 A" and "B" are separate
        # rows; circumbinary planets): merge them so a star has one system.
        key = f"star:{star_index}" if star_index is not None else f"host:{host}"
        if key in systems:
            # Keep full names for planets of the second host name.
            for planet in records:
                if "n" in planet:
                    planet["name"] = f"{host} {planet.pop('n')}"
            systems[key]["planets"].extend(records)
            systems[key].setdefault("alsoHosts", []).append(host)
        else:
            systems[key] = system

    output = {
        "meta": {
            "source": "NASA Exoplanet Archive, Planetary Systems Composite Parameters (pscomppars)",
            "sourceUrl": "https://exoplanetarchive.ipac.caltech.edu/",
            "query": QUERY,
            "retrieved": retrieved,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "acknowledgement": ACKNOWLEDGEMENT,
            "planets": sum(len(s["planets"]) for s in systems.values()),
            "systems": len(systems),
            "matched": matched,
            "skipped": skipped,
            "methods": methods,
            "facilities": facilities,
            "notes": (
                "Composite parameters mix publications; rCalc/aCalc/teqCalc mark archive-calculated values. "
                "n = letter after the host name (else name = full name); method/fac index the tables above. "
                "m = best mass (Earth masses); mk absent = true mass, s = minimum mass (M sin i), r = from a "
                "mass-radius relation. r = radius (Earth radii), a = AU, p = days, i/w = degrees, tr = transits. "
                "mvFrom: how a host's absolute V magnitude was obtained (V and distance, luminosity, radius and "
                "Teff, Gaia G as V, or a main-sequence mass relation). "
                "tc = transit midpoint / inferior conjunction (BJD), tp = periastron time (BJD). "
                "Host positions without 'star' are ICRS RA/Dec + archive distance in the engine axes (pc)."
            ),
        },
        "systems": list(systems.values()),
    }
    OUT.write_text(json.dumps(output, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"{output['meta']['planets']} planets in {len(systems)} systems; matched {matched}; skipped {len(skipped)}; "
          f"{OUT.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
