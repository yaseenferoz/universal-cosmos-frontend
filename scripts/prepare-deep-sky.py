"""Build the galaxy and nebula catalogues for the star map (standard library only).

  python scripts/prepare-deep-sky.py            # use the cached tables
  python scripts/prepare-deep-sky.py --refresh  # download them again

Galaxies (public/deep/galaxies.bin + galaxies.json):
  * Local Volume: Karachentsev et al. 2013, Updated Nearby Galaxy Catalog (UNGC), with
    redshift-independent distances (TRGB, Cepheids, Tully-Fisher, ...) where measured.
  * Beyond: Huchra et al. 2012, 2MASS Redshift Survey (2MRS, Ks <= 11.75). Distances from
    Cosmicflows-4 (Tully et al. 2023; group average when the group has several measured
    members) where the galaxy is in it, otherwise from the Hubble law in the CMB frame.
  * Shapes: OpenNGC (optical size, axis ratio, position angle), else 2MASS XSC.
Nebulae (public/deep/nebulae.json):
  * Planetary nebulae: Chornay & Walton 2021 Gaia EDR3 central-star distances.
  * HII regions: Anderson et al. 2014 WISE catalog (parallax and kinematic distances).
  * Supernova remnants: Green 2025 catalogue; distances from SIMBAD's literature list.
  * Named NGC/IC/Messier/Barnard nebulae from OpenNGC, distances from the catalogues above,
    the Gaia parallaxes OpenNGC lists, or SIMBAD.

Positions: heliocentric, parsecs, engine axes (+X equinox, +Y ecliptic north), like the stars.
"""
from __future__ import annotations

import datetime
import importlib.util
import json
import math
import re
import statistics
import struct
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import deep_sky_sources as sources  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "deep"
# Cosmicflows-4's Hubble constant, so redshift distances share its distance scale.
H0 = 74.6
C_KMS = 299_792.458
# Deceleration parameter of flat LCDM with Omega_m = 0.315 (Planck 2018): comoving distance.
Q0 = 0.315 / 2 - 0.685
# Solar motion relative to the CMB (Planck 2018 I): 369.82 km/s toward l = 264.021, b = 48.253.
CMB_SPEED, CMB_L, CMB_B = 369.82, 264.021, 48.253
MIN_HUBBLE_VELOCITY = 600.0
# Equatorial (ICRS) -> galactic rotation (Hipparcos, ESA 1997, eq. 1.5.11).
GALACTIC = (
    (-0.0548755604, -0.8734370902, -0.4838350155),
    (0.4941094279, -0.4448296300, 0.7469822445),
    (-0.8676661490, -0.1980763734, 0.4559837762),
)
RECORD = struct.Struct("<4fh3bBbBBB")
UNKNOWN_TYPE = -128

# Typical colours by T-type (RC3-era averages); visual magnitudes from B or Ks are estimates.
def b_minus_v(t: float | None) -> float:
    if t is None: return 0.75
    if t <= -4: return 0.95
    if t <= 0: return 0.90
    if t <= 2: return 0.80
    if t <= 4: return 0.68
    if t <= 6: return 0.55
    if t <= 8: return 0.50
    return 0.42


def v_minus_k(t: float | None) -> float:
    if t is None: return 3.0
    if t <= 0: return 3.25
    if t <= 3: return 3.1
    if t <= 5: return 2.85
    if t <= 8: return 2.5
    return 2.2


def load_star_script():
    spec = importlib.util.spec_from_file_location("prepare_stars", ROOT / "scripts" / "prepare-stars.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


engine_axes = load_star_script().engine_axes
Vec = tuple[float, float, float]


def number(value: str | None) -> float | None:
    try:
        result = float(value) if value not in (None, "") else None
    except ValueError:
        return None
    return result if result is not None and math.isfinite(result) else None


def unit_vector(ra_deg: float, dec_deg: float) -> Vec:
    ra, dec = math.radians(ra_deg), math.radians(dec_deg)
    return math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)


def galactic_unit(l_deg: float, b_deg: float) -> Vec:
    """Galactic (l, b) -> equatorial unit vector."""
    l, b = math.radians(l_deg), math.radians(b_deg)
    g = (math.cos(b) * math.cos(l), math.cos(b) * math.sin(l), math.sin(b))
    return tuple(sum(GALACTIC[row][col] * g[row] for row in range(3)) for col in range(3))  # type: ignore[return-value]


def sexagesimal(text: str, hours: bool) -> float | None:
    parts = re.split(r"[\s:]+", text.strip())
    if not parts or parts == [""]:
        return None
    sign = -1.0 if parts[0].startswith("-") else 1.0
    values = [abs(float(p)) for p in parts]
    value = values[0] + (values[1] if len(values) > 1 else 0) / 60 + (values[2] if len(values) > 2 else 0) / 3600
    return sign * value * (15 if hours else 1)


def dot(a: Vec, b: Vec) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def separation(a: Vec, b: Vec) -> float:
    return math.acos(max(-1.0, min(1.0, dot(a, b))))


class SkyGrid:
    """Unit-vector hash grid for positional matching (cell ~ 0.06 deg by default)."""

    def __init__(self, cell: float = 0.001) -> None:
        self.cell = cell
        self.cells: dict[tuple[int, int, int], list[tuple[int, Vec]]] = defaultdict(list)

    def key(self, v: Vec) -> tuple[int, int, int]:
        return tuple(math.floor(c / self.cell) for c in v)  # type: ignore[return-value]

    def add(self, index: int, v: Vec) -> None:
        self.cells[self.key(v)].append((index, v))

    def near(self, v: Vec, radius: float):
        """Entries within `radius` radians (radius may span several cells)."""
        reach = max(1, math.ceil(radius / self.cell))
        kx, ky, kz = self.key(v)
        for dx in range(-reach, reach + 1):
            for dy in range(-reach, reach + 1):
                for dz in range(-reach, reach + 1):
                    for index, w in self.cells.get((kx + dx, ky + dy, kz + dz), ()):
                        if separation(v, w) <= radius:
                            yield index, w


def engine_position(direction: Vec, distance_pc: float) -> list[float]:
    x, y, z = engine_axes(*direction)
    return [x * distance_pc, y * distance_pc, z * distance_pc]


def sky_basis(s: Vec) -> tuple[Vec, Vec]:
    """North and east unit vectors on the sky at direction s (equatorial)."""
    pole = (0.0, 0.0, 1.0)
    east = (pole[1] * s[2] - pole[2] * s[1], pole[2] * s[0] - pole[0] * s[2], pole[0] * s[1] - pole[1] * s[0])
    length = math.sqrt(dot(east, east)) or 1.0
    east = (east[0] / length, east[1] / length, east[2] / length)
    north = (s[1] * east[2] - s[2] * east[1], s[2] * east[0] - s[0] * east[2], s[0] * east[1] - s[1] * east[0])
    return north, east


def disk_normal(s: Vec, position_angle_deg: float, inclination_deg: float) -> Vec:
    """Disk normal (equatorial) from the sky position angle of the major axis and the inclination.

    The minor axis on the sky is perpendicular to the major axis; the normal tilts from the
    line of sight toward it. Which side of the disk is nearer is not known from the shape,
    so one of the two solutions is chosen.
    """
    north, east = sky_basis(s)
    pa, inc = math.radians(position_angle_deg), math.radians(inclination_deg)
    minor = tuple(-math.sin(pa) * n + math.cos(pa) * e for n, e in zip(north, east))
    toward = (-s[0], -s[1], -s[2])
    return tuple(math.cos(inc) * t + math.sin(inc) * m for t, m in zip(toward, minor))  # type: ignore[return-value]


def intrinsic_ratio(t: float | None) -> float:
    """Edge-on axis ratio by type, as HyperLEDA uses: log r0 = 0.43 + 0.053 T (T <= 7), 0.38 beyond."""
    if t is None:
        t = 3
    log_r0 = 0.43 + 0.053 * max(-5.0, t) if t <= 7 else 0.38
    return 10 ** -log_r0


def inclination_from_ratio(ratio: float, intrinsic: float = 0.2) -> float:
    """Oblate disk (Hubble 1926; HyperLEDA form): cos^2 i = (q^2 - q0^2) / (1 - q0^2)."""
    q = max(0.0, min(1.0, ratio))
    value = (q * q - intrinsic * intrinsic) / (1 - intrinsic * intrinsic)
    return math.degrees(math.acos(math.sqrt(max(0.0, min(1.0, value)))))


def stable_angle(name: str) -> float:
    """A repeatable stand-in position angle for galaxies without one (flagged as unknown)."""
    return (sum((i + 1) * ord(c) for i, c in enumerate(name)) * 37) % 180


def catalogue_name(raw: str) -> str | None:
    """'MESSIER_031' -> 'M 31', 'NGC0024' -> 'NGC 24', 'ESO409-015' -> 'ESO 409-15'."""
    text = raw.strip().replace("_", " ")
    if not text or re.match(r"^[g\d]", text) or text.startswith("2MASX"):
        return None
    m = re.match(r"^MESSIER\s*0*(\d+)([a-z]?)$", text, re.I)
    if m:
        return f"M {int(m.group(1))}{m.group(2)}"
    m = re.match(r"^(NGC|IC|UGC|UGCA|DDO|KDG|KKH|KK|PGC|AGC|LEDA|MCG|CGCG|KKS|KKR|HIPASS|UGC)\s*0*(\d+)\s*([A-Za-z]?)$", text)
    if m:
        return f"{m.group(1)} {int(m.group(2))}{m.group(3)}"
    m = re.match(r"^ESO\s*0*(\d+)-\s*[G]?0*(\d+)([A-Za-z]?)$", text)
    if m:
        return f"ESO {int(m.group(1))}-{int(m.group(2))}{m.group(3)}"
    m = re.match(r"^([A-Za-z]+)0*(\d+)$", text)
    if m:
        return f"{m.group(1)} {int(m.group(2))}"
    return text


def unique_names(names: list[str]) -> list[str]:
    """Normalised designations, first occurrence kept (case-insensitive)."""
    seen, out = set(), []
    for name in names:
        clean = GALAXY_NAMES.get(name, name)
        clean = catalogue_name(clean) or clean if re.match(r"^(UGC|PGC|NGC|IC|ESO|DDO)\s", clean) else clean
        if clean.lower() not in seen:
            seen.add(clean.lower())
            out.append(clean)
    return out


GALAXY_NAMES = {"Sculptor Filament": "Sculptor Galaxy"}


ALIASES = {
    "SMC": "Small Magellanic Cloud", "LMC": "Large Magellanic Cloud", "Sculptor": "Sculptor Dwarf",
    "Cetus": "Cetus Dwarf", "Fornax": "Fornax Dwarf", "Carina": "Carina Dwarf", "Draco": "Draco Dwarf",
    "UMi": "Ursa Minor Dwarf", "Sextans": "Sextans Dwarf", "Sgr dSph": "Sagittarius Dwarf", "Bootes": "Boötes I",
    "Tucana": "Tucana Dwarf", "Phoenix": "Phoenix Dwarf", "Pegasus": "Pegasus Dwarf", "Aquarius": "Aquarius Dwarf",
}
UNGC_METHODS = {
    "TRGB": "Tip of the red giant branch", "Cep": "Cepheid variables", "TF": "Tully-Fisher relation",
    "mem": "Group membership", "h": "Hubble flow (velocity)", "h'": "Hubble flow (velocity)", "BS": "Brightest stars",
    "SBF": "Surface brightness fluctuations", "HB": "Horizontal branch", "CMD": "Colour-magnitude diagram",
    "SN": "Supernova", "RR": "RR Lyrae variables", "geom": "Geometric (maser)", "PNLF": "Planetary nebula luminosity function",
    "FP": "Fundamental plane", "txt": "Literature estimate",
}


def zcat_type(code: str) -> tuple[int | None, int, bool]:
    """ZCAT morphology 'T[bar]...' -> (T-type or None, bar 0/1/2, peculiar)."""
    m = re.match(r"^\s*(-?\d+)([ABX_]?)", code or "")
    if not m:
        return None, 0, False
    t = int(m.group(1))
    bar = {"X": 1, "B": 2}.get(m.group(2), 0)
    # 11 = compact, 12+ = peculiar / unclassified; 98 = no type.
    if t > 11 or t < -7:
        return None, bar, "P" in code
    return t, bar, "P" in code[2:]


def hubble_type(text: str) -> tuple[int | None, int]:
    """OpenNGC Hubble string ('SBb', 'E3', 'IB(s)m') -> (T-type, bar)."""
    s = (text or "").strip()
    if not s:
        return None, 0
    bar = 2 if s.startswith("SB") or s.startswith("IB") else 1 if s.startswith("SAB") else 0
    if s.startswith("E") or s.startswith("cE"):
        return -5, 0
    if s.startswith("S0") or s.startswith("SB0") or s.startswith("SAB0") or s.startswith("SA0"):
        return -2, bar
    m = re.match(r"^S(?:A|B|AB)?(?:\([rs]+\))?(a|ab|b|bc|c|cd|d|dm|m)", s)
    if m:
        return {"a": 1, "ab": 2, "b": 3, "bc": 4, "c": 5, "cd": 6, "d": 7, "dm": 8, "m": 9}[m.group(1)], bar
    if s.startswith("I"):
        return 10, bar
    return None, bar


def mpc_from_modulus(modulus: float) -> float:
    return 10 ** ((modulus - 25) / 5)


def comoving_mpc(velocity: float) -> float:
    z = velocity / C_KMS
    return velocity / H0 * (1 - (1 + Q0) * z / 2)


def openngc_entries(rows):
    """OpenNGC rows with parsed positions, names and shapes."""
    entries = []
    for row in rows:
        ra, dec = sexagesimal(row["RA"], True) if row["RA"] else None, sexagesimal(row["Dec"], False) if row["Dec"] else None
        if ra is None or dec is None or row["Type"] in ("Dup", "NonEx"):
            continue
        names = [n.strip() for n in row["Common names"].split(",") if n.strip()]
        if row["M"]:
            names.append(f"M {int(row['M'])}")
        primary = catalogue_name(row["Name"])
        m = re.match(r"^B0*(\d+)$", row["Name"])
        if m:
            primary = f"Barnard {int(m.group(1))}"
        elif re.match(r"^C\d+$", row["Name"]):
            primary = f"Caldwell {int(row['Name'][1:])}"
        if primary:
            names.append(primary)
        for other in row["Identifiers"].split(","):
            other = other.strip()
            if other.startswith(("UGC ", "PGC ", "Sh2-", "LBN ", "RCW ", "Gum ")):
                names.append(other)
        entries.append({
            "row": row, "dir": unit_vector(ra, dec), "names": list(dict.fromkeys(names)),
            "major": number(row["MajAx"]), "minor": number(row["MinAx"]), "pa": number(row["PosAng"]),
            "pax": number(row["Pax"]),
        })
    return entries


def build_galaxies(refresh: bool, ngc: list[dict]) -> tuple[bytes, dict]:
    ungc = sources.vizier_rows("ungc", refresh)
    mrs = sources.vizier_rows("2mrs", refresh)
    xsc = {row["2MASX"]: row for row in sources.vizier_rows("xsc", refresh)}
    cf4 = sources.vizier_rows("cf4", refresh)
    groups = {row["1PGC"]: row for row in sources.vizier_rows("cf4groups", refresh)}
    apex = galactic_unit(CMB_L, CMB_B)

    ngc_galaxies = [e for e in ngc if e["row"]["Type"] in ("G", "GPair", "GTrpl", "GGroup")]
    ngc_grid = SkyGrid(0.0005)
    for i, entry in enumerate(ngc_galaxies):
        ngc_grid.add(i, entry["dir"])

    def ngc_match(direction: Vec, radius_arcmin: float) -> dict | None:
        best, best_sep = None, math.radians(max(0.5, radius_arcmin) / 60)
        for i, w in ngc_grid.near(direction, best_sep):
            sep = separation(direction, w)
            if sep <= best_sep:
                best, best_sep = ngc_galaxies[i], sep
        return best

    cf4_grid = SkyGrid(0.0005)
    for i, row in enumerate(cf4):
        ra, dec = number(row["RAJ2000"]), number(row["DEJ2000"])
        if ra is not None and dec is not None:
            cf4_grid.add(i, unit_vector(ra, dec))

    methods: list[str] = []

    def method_index(label: str) -> int:
        if label not in methods:
            methods.append(label)
        return methods.index(label)

    galaxies: list[dict] = []
    ungc_grid = SkyGrid(0.0005)
    for row in ungc:
        ra, dec, distance = sexagesimal(row["RAJ2000"], True), sexagesimal(row["DEJ2000"], False), number(row["Dist"])
        if ra is None or dec is None or distance is None or distance <= 0.02:
            continue  # The Milky Way's own satellites closer than 20 kpc are inside our galaxy's model.
        direction = unit_vector(ra, dec)
        t = number(row["TT"])
        t = int(t) if t is not None else None
        b_abs = number(row["BMag"])
        k_lum = number(row["KLum"])
        absolute_v = b_abs - b_minus_v(t) if b_abs is not None else (3.27 - 2.5 * k_lum + v_minus_k(t) if k_lum is not None else None)
        if absolute_v is None:
            continue
        diameter_kpc = number(row["A26"]) or (number(row["a26"]) or 1.0) / 60 * math.pi / 180 * distance * 1000
        ratio = number(row["b/a"]) or 1.0
        names = [catalogue_name(row["Name"]) or row["Name"]]
        if row["Name"] in ALIASES:
            names.insert(0, ALIASES[row["Name"]])
        match = ngc_match(direction, (number(row["a26"]) or 1) * 0.3)
        pa, bar, oriented = None, 0, False
        if match:
            names = match["names"] + names
            pa = match["pa"]
            if t is None:
                t, bar = hubble_type(match["row"]["Hubble"])
            else:
                bar = hubble_type(match["row"]["Hubble"])[1]
        galaxies.append({
            "dir": direction, "distance_mpc": distance, "radius_pc": diameter_kpc * 500, "ratio": ratio,
            "inclination": number(row["i"]), "pa": pa, "t": t, "bar": bar, "peculiar": False, "abs_v": absolute_v,
            "method": method_index(UNGC_METHODS.get(row["f_Dist"], "Literature estimate")), "error": None,
            "ungc": True, "redshift": row["f_Dist"] in ("h", "h'"), "names": names, "apparent": absolute_v + 5 * math.log10(distance * 1e5),
        })
        ungc_grid.add(len(galaxies) - 1, direction)

    size_ratios: list[float] = []
    skipped = defaultdict(int)
    pending = []
    for row in mrs:
        ra, dec, cz = number(row["RAJ2000"]), number(row["DEJ2000"]), number(row["cz"])
        if ra is None or dec is None:
            continue
        direction = unit_vector(ra, dec)
        rext = number(row["Rext"])
        semi_arcmin = 10 ** rext / 60 if rext is not None else 0.3
        duplicate = next((i for i, _ in ungc_grid.near(direction, math.radians(max(0.75, semi_arcmin * 0.5) / 60))), None)
        t, bar, peculiar = zcat_type(row["type"])
        xsc_row = xsc.get(row["ID"])
        match = ngc_match(direction, semi_arcmin * 0.5)
        if match and match["major"] and rext is not None:
            size_ratios.append(match["major"] / 2 / semi_arcmin)
        if duplicate is not None:
            # Same galaxy as a Local Volume entry: borrow its orientation and bar.
            target = galaxies[duplicate]
            if target["pa"] is None:
                target["pa"] = (match["pa"] if match and match["pa"] is not None else number(xsc_row["Spa"]) if xsc_row else None)
            target["bar"] = target["bar"] or bar
            if target["t"] is None:
                target["t"] = t
            skipped["in UNGC"] += 1
            continue
        pending.append((row, direction, semi_arcmin, t, bar, peculiar, xsc_row, match, cz))

    factor = statistics.median(size_ratios) if size_ratios else 1.5
    for row, direction, semi_arcmin, t, bar, peculiar, xsc_row, match, cz in pending:
        v_cmb = cz + CMB_SPEED * dot(direction, apex) if cz is not None else None
        best, best_sep = None, math.radians(20 / 3600)
        for i, w in cf4_grid.near(direction, best_sep):
            candidate = cf4[i]
            velocity = number(candidate["Vcmb"])
            if v_cmb is not None and velocity is not None and abs(velocity - v_cmb) > 600:
                continue
            sep = separation(direction, w)
            if sep <= best_sep:
                best, best_sep = candidate, sep
        distance, method, error, redshift = None, None, None, False
        if best is not None:
            group = groups.get(best["1PGC"])
            if group and (number(group["Ngal"]) or 0) >= 2 and number(group["DMzp"]):
                distance, method = mpc_from_modulus(number(group["DMzp"])), "Cosmicflows-4 group distance"
                error = number(group["e_DMav"])
            elif number(best["DM"]):
                distance, method, error = mpc_from_modulus(number(best["DM"])), "Cosmicflows-4 distance", number(best["e_DM"])
        if distance is None:
            if v_cmb is None:
                skipped["no redshift"] += 1
                continue
            if v_cmb < MIN_HUBBLE_VELOCITY:
                skipped["too slow for the Hubble law"] += 1
                continue
            distance, method, redshift = comoving_mpc(v_cmb), "Hubble law (redshift, CMB frame)", True
        k = number(row["Ktmag"])
        if k is None:
            skipped["no magnitude"] += 1
            continue
        luminosity_mpc = distance * (1 + (v_cmb or 0) / C_KMS)
        absolute_v = k - 5 * math.log10(luminosity_mpc * 1e5) + v_minus_k(t)
        names: list[str] = []
        pa, ratio = None, number(row["b/a"]) or 1.0
        if match:
            names += match["names"]
            pa = match["pa"]
            if match["major"] and match["minor"]:
                ratio = match["minor"] / match["major"]
            if t is None:
                t, bar = hubble_type(match["row"]["Hubble"])
        if pa is None and xsc_row and number(xsc_row["Spa"]) is not None:
            pa = number(xsc_row["Spa"]) % 180
        listed = catalogue_name(row["CAT"])
        if listed:
            names.append(listed)
        if not names:
            names.append(f"2MASX J{row['ID']}")
        semi_optical = (match["major"] / 2) if match and match["major"] else semi_arcmin * factor
        galaxies.append({
            "dir": direction, "distance_mpc": distance, "radius_pc": math.radians(semi_optical / 60) * distance * 1e6, "ratio": ratio,
            "inclination": None, "pa": pa, "t": t, "bar": bar, "peculiar": peculiar, "abs_v": absolute_v,
            "method": method_index(method), "error": error, "ungc": False, "redshift": redshift,
            "names": list(dict.fromkeys(names)), "apparent": k + v_minus_k(t),
        })

    galaxies.sort(key=lambda g: g["apparent"])
    blob = bytearray()
    names_out = []
    for index, g in enumerate(galaxies):
        t = g["t"]
        disk = t is None and g["ratio"] < 0.5 or (t is not None and t > -4)
        oriented = g["pa"] is not None
        pa = g["pa"] if oriented else stable_angle(g["names"][0])
        if disk:
            intrinsic = 0.12 if t is None or 0 < t < 9 else 0.25 if t <= 0 else 0.35
            inclination = g["inclination"] if g["inclination"] is not None else inclination_from_ratio(g["ratio"], intrinsic_ratio(t))
        else:
            # Ellipticals: an oblate spheroid seen edge-on reproduces the apparent shape from Earth.
            intrinsic = max(0.3, min(1.0, g["ratio"]))
            inclination = 90.0
        normal = engine_axes(*disk_normal(g["dir"], pa, inclination))
        distance_pc = g["distance_mpc"] * 1e6
        x, y, z = engine_position(g["dir"], distance_pc)
        flags = g["bar"] | (4 if oriented else 0) | (8 if g["ungc"] else 0) | (16 if g["peculiar"] else 0) | (32 if g["redshift"] else 0)
        error_pct = 255 if g["error"] is None else min(254, round(g["error"] * 0.4605 * 100))
        blob += RECORD.pack(
            x, y, z, max(50.0, g["radius_pc"]), max(-32000, min(32000, round(g["abs_v"] * 100))),
            *(max(-127, min(127, round(c * 127))) for c in normal), round(intrinsic * 255),
            UNKNOWN_TYPE if t is None else t, flags, g["method"], error_pct,
        )
        names_out.append(unique_names(g["names"]))
    meta = {
        "count": len(galaxies), "recordBytes": RECORD.size, "methods": methods, "names": names_out,
        "hubbleConstant": H0, "sizeFactor": round(factor, 3), "skipped": dict(skipped),
        "retrieved": datetime.date.today().isoformat(),
        "sources": [
            "Karachentsev, Makarov & Kaisina 2013, AJ 145, 101 (Updated Nearby Galaxy Catalog; VizieR J/AJ/145/101)",
            "Huchra et al. 2012, ApJS 199, 26 (2MASS Redshift Survey; VizieR J/ApJS/199/26)",
            "Tully et al. 2023, ApJ 944, 94 (Cosmicflows-4; VizieR J/ApJ/944/94)",
            "Skrutskie et al. 2006 / 2MASS Extended Source Catalog (VizieR VII/233)",
            "OpenNGC by Mattia Verga (CC BY-SA 4.0), https://github.com/mattiaverga/OpenNGC",
        ],
    }
    print(f"galaxies: {len(galaxies)} (UNGC {sum(1 for g in galaxies if g['ungc'])}), optical/K size factor {factor:.2f}, skipped {dict(skipped)}")
    by_method = defaultdict(int)
    for g in galaxies:
        by_method[methods[g["method"]]] += 1
    print("  distances:", dict(by_method))
    return bytes(blob), meta


def year(bibcode: str) -> int:
    return int(bibcode[:4]) if bibcode[:4].isdigit() else 0


def simbad_distance(entries: list[dict]) -> tuple[float, float | None, float | None, str, str] | None:
    """Most recent parallax-based distance listed in SIMBAD, else the most recent one: (pc, lo, hi, method, bibcode)."""
    scale = {"pc": 1.0, "kpc": 1e3, "Mpc": 1e6}
    usable = []
    for entry in entries:
        value, unit = number(entry["dist"]), entry["unit"].strip()
        if value is None or value <= 0 or unit not in scale:
            continue
        minus, plus = number(entry["minus_err"]), number(entry["plus_err"])
        f = scale[unit]
        usable.append((entry, value * f, value * f + minus * f if minus is not None else None, value * f + plus * f if plus is not None else None))
    if not usable:
        return None
    parallax = [u for u in usable if entry_method(u[0]) in ("plx", "paral")]
    entry, value, lo, hi = max(parallax or usable, key=lambda u: year(u[0]["bibcode"]))
    label = "Parallax" if entry_method(entry) in ("plx", "paral") else {"kin": "Kinematic", "ST-L": "Spectroscopic"}.get(entry_method(entry), "Literature")
    return value, lo, hi, label, entry["bibcode"].strip()


def entry_method(entry: dict) -> str:
    return entry["method"].strip()


# Well-known nebulae missing from the catalogues' and SIMBAD's distance lists, with the
# published distance of the object or of the cloud/cluster it belongs to.
ORION_B = (420.0, None, None, "VLBA parallax toward NGC 2024 (approximate)", "2017ApJ...834..142K")
PLEIADES = (135.4, None, None, "Parallax of the Pleiades", "2022ApJ...939...94M")
CURATED = {
    "SNR G074.0-08.5": (735.0, 710.0, 760.0, "Gaia stellar distances", "2018MNRAS.481.1786F"),  # Cygnus Loop, Fesen et al. 2018
    "SNR G263.9-03.3": (287.0, 270.0, 306.0, "Pulsar parallax (VLBI)", "2003ApJ...596.1137D"),  # Vela, Dodson et al. 2003
    "SNR G004.5+06.8": (5100.0, 4400.0, 5900.0, "Shock proper motion and velocity", "2016ApJ...817...36S"),  # Kepler, Sankrit et al. 2016
    "SNR G327.6+14.6": (2180.0, 2100.0, 2260.0, "Shock proper motion and velocity", "2003ApJ...585..324W"),  # SN 1006, Winkler et al. 2003
    "NGC 2024": ORION_B, "IC 434": ORION_B, "Barnard 33": ORION_B,  # Kounkel et al. 2017
    "NGC 1499": (452.0, 441.0, 467.0, "Dust-extinction distance of the California cloud (Gaia)", "2020A&A...633A..51Z"),
    "Caldwell 99": (189.0, 183.0, 195.0, "Dust-extinction distance (Gaia)", "2020A&A...633A..51Z"),  # Coalsack, Zucker et al. 2020
    "NGC 1435": PLEIADES, "IC 349": PLEIADES,
}
# Angular sizes (arcmin) where OpenNGC lists none.
CURATED_SIZE = {"Caldwell 99": (420.0, 300.0)}
# Popular names OpenNGC does not list.
NICKNAMES = {"IC 1805": "Heart Nebula", "IC 1848": "Soul Nebula", "Barnard 33": "Horsehead Nebula", "IC 434": "Horsehead region (IC 434)"}
# Members of the Magellanic Clouds take the galaxy's distance: (RA, Dec, radius deg, distance).
MAGELLANIC = (
    (80.894, -69.756, 6.0, (49_590.0, 49_050.0, 50_130.0, "Distance of the Large Magellanic Cloud (eclipsing binaries)", "2019Natur.567..200P")),
    (13.187, -72.829, 3.0, (62_440.0, 61_150.0, 63_730.0, "Distance of the Small Magellanic Cloud (eclipsing binaries)", "2020ApJ...904...13G")),
)


KIND_OVERRIDE = {"NGC 1435": "reflection", "IC 349": "reflection"}
PREFERRED_FIRST = ("Orion Nebula", "Omega Nebula", "Tarantula Nebula", "Little Dumbbell Nebula", "Cygnus Loop")


def kind_for(record: dict) -> str:
    return next((KIND_OVERRIDE[n] for n in record["names"] if n in KIND_OVERRIDE), record["kind"])


def preferred(names: list[str]) -> list[str]:
    parts = [clean_name(p) for n in names for p in n.split(";") if p.strip()]
    unique = list(dict.fromkeys(parts))
    first = [n for n in PREFERRED_FIRST if n in unique]
    return first + [n for n in unique if n not in first]


def clean_name(name: str) -> str:
    """'the Witch Head Nebula' -> 'Witch Head Nebula', 'omega Nebula' -> 'Omega Nebula', 'Vela (XYZ)' -> 'Vela'."""
    text = re.sub(r"\s*\([^)]*\)$", "", name.strip())
    if text.lower().startswith("the "):
        text = text[4:]
    return text[:1].upper() + text[1:] if text[:1].islower() else text


def build_nebulae(refresh: bool, ngc: list[dict]) -> dict:
    pne = sources.vizier_rows("pne", refresh)
    hii = sources.vizier_rows("hii", refresh)
    snr = sources.vizier_rows("snr", refresh)
    kinds = {"PN": "planetary", "SNR": "supernova", "RfN": "reflection", "DrkN": "dark", "HII": "emission", "EmN": "emission", "Neb": "emission", "Cl+N": "emission"}
    named = [e for e in ngc if e["row"]["Type"] in kinds]

    def simbad_id(entry: dict) -> str | None:
        for name in entry["names"]:
            if re.match(r"^(NGC|IC) \d+[A-Z]?$|^Barnard \d+$|^M \d+$", name):
                return name
        return None

    ids = [i for i in (simbad_id(e) for e in named) if i] + ["SNR " + row["SNR"] for row in snr]
    distances: dict[str, list[dict]] = defaultdict(list)
    for start in range(0, len(ids), 120):
        chunk = ids[start:start + 120]
        condition = " OR ".join("i.id = '" + i.replace("'", "''") + "'" for i in chunk)
        rows = sources.simbad_query(
            "SELECT i.id AS qid, d.dist, d.unit, d.minus_err, d.plus_err, d.method, d.bibcode FROM ident AS i "
            f"JOIN mesDistance AS d ON d.oidref = i.oidref WHERE {condition}",
            f"simbad-distances-{start // 120}.csv", refresh)
        for row in rows:
            distances[" ".join(row["qid"].split())].append(row)

    nebulae: list[dict] = []
    grid = SkyGrid(0.002)

    def add(kind: str, direction: Vec, radius_arcmin: float, names: list[str], distance, ratio=1.0, pa=None, source="") -> dict:
        record = {"kind": kind, "dir": direction, "radius": radius_arcmin, "names": names, "distance": distance, "ratio": ratio, "pa": pa, "sources": [source]}
        nebulae.append(record)
        grid.add(len(nebulae) - 1, direction)
        return record

    def same(kind_group: set[str], direction: Vec, radius_arcmin: float) -> dict | None:
        best, best_sep = None, math.radians(max(0.5, radius_arcmin) / 60)
        for i, w in grid.near(direction, best_sep):
            if nebulae[i]["kind"] in kind_group:
                sep = separation(direction, w)
                if sep <= best_sep:
                    best, best_sep = nebulae[i], sep
        return best

    # 1. Named nebulae from OpenNGC (sizes and position angles); distances filled in below.
    for entry in named:
        kind = kinds[entry["row"]["Type"]]
        size = next((CURATED_SIZE[n] for n in entry["names"] if n in CURATED_SIZE), None)
        major = size[0] if size else entry["major"] or 1.0
        minor = size[1] if size else entry["minor"]
        ratio = (minor / major) if minor else 1.0
        names = [NICKNAMES[n] for n in entry["names"] if n in NICKNAMES] + entry["names"]
        curated = next((CURATED[n] for n in names if n in CURATED), None)
        record = add(kind, entry["dir"], major / 2, names, curated, ratio, entry["pa"], "OpenNGC")
        record["pax"] = entry["pax"]
        sid = simbad_id(entry)
        record["simbad"] = simbad_distance(distances.get(sid, [])) if sid else None

    # 2. Planetary nebulae with Gaia central-star distances.
    for row in pne:
        rcomb, ra, dec = number(row["rcomb"]), number(row["pnRAdeg"]), number(row["pnDEdeg"])
        if rcomb is None or ra is None or dec is None or row["pnStat"] != "T" or (number(row["Rel"]) or 0) < 0.5:
            continue
        direction, radius = unit_vector(ra, dec), (number(row["pnRad"]) or 5) / 60
        distance = (rcomb, number(row["b_rcomb"]), number(row["B_rcomb"]), "Gaia EDR3 central-star parallax", "2021A&A...656A.110C")
        existing = same({"planetary"}, direction, max(0.4, radius))
        if existing:
            existing["distance"] = existing["distance"] or distance
            existing["names"] = list(dict.fromkeys(existing["names"] + [row["Name"]]))
            existing["sources"].append("Chornay & Walton 2021")
        else:
            add("planetary", direction, radius, [row["Name"], "PN G" + row["PNG"]], distance, source="Chornay & Walton 2021")

    # 3. HII regions with WISE-catalogue distances.
    for row in hii:
        dist, ra, dec = number(row["Dist"]), number(row["_RAJ2000"]), number(row["_DEJ2000"])
        if dist is None or ra is None or dec is None or row["Cl"] != "K":
            continue
        direction, radius = unit_vector(ra, dec), (number(row["Rad"]) or 30) / 60
        error = number(row["e_Dist"])
        method = "Maser parallax" if row["Meth"] == "Parallax" else "Kinematic (radial velocity)"
        distance = (dist * 1e3, (dist - error) * 1e3 if error else None, (dist + error) * 1e3 if error else None, method, "2014ApJS..212....1A")
        existing = same({"emission"}, direction, max(1.0, radius * 0.6))
        name = row["HIIName"].strip() or None
        names = [n for n in [name, "WISE " + row["WISE"]] if n]
        if existing:
            existing.setdefault("wise", distance)
            existing["names"] = list(dict.fromkeys(existing["names"] + names))
            existing["radius"] = max(existing["radius"], radius) if existing["radius"] < 1.5 else existing["radius"]
            existing["sources"].append("Anderson et al. 2014")
        else:
            add("emission", direction, radius, names, distance, source="Anderson et al. 2014")

    # 4. Supernova remnants (Green 2025).
    for row in snr:
        ra, dec = sexagesimal(row["RAJ2000"], True), sexagesimal(row["DEJ2000"], False)
        major = number(row["MajDiam"])
        if ra is None or dec is None or major is None:
            continue
        direction = unit_vector(ra, dec)
        minor = number(row["MinDiam"]) or major
        names = [n.strip() for n in row["Names"].split(",") if n.strip() and not n.strip().startswith("(")] + ["SNR " + row["SNR"]]
        distance = CURATED.get("SNR " + row["SNR"]) or simbad_distance(distances.get("SNR " + row["SNR"], []))
        existing = same({"supernova"}, direction, major / 2)
        if existing:
            existing["distance"] = existing["distance"] or CURATED.get("SNR " + row["SNR"])
            existing["simbad"] = existing.get("simbad") or distance
            existing["names"] = list(dict.fromkeys(names[:-1] + existing["names"] + names[-1:]))
            existing["radius"], existing["ratio"] = major / 2, minor / major
            existing["filled"] = row["type"].strip() == "F"
            existing["sources"].append("Green 2025")
        elif distance:
            record = add("supernova", direction, major / 2, names, distance, minor / major, source="Green 2025")
            record["filled"] = row["type"].strip() == "F"

    out = []
    by_method: dict[str, int] = defaultdict(int)
    for record in nebulae:
        # Priority: Gaia central-star distance (PNe) or curated; parallax from SIMBAD; OpenNGC's
        # Gaia parallax; WISE maser parallax; WISE kinematic; other literature values.
        candidates = [record["distance"]]
        simbad = record.get("simbad")
        wise = record.get("wise")
        if simbad and simbad[3] == "Parallax":
            candidates.append(simbad)
        if record.get("pax") and record["pax"] > 0.1:
            candidates.append((1000 / record["pax"], None, None, "Gaia parallax (OpenNGC)", "OpenNGC"))
        if wise and wise[3] == "Maser parallax":
            candidates.append(wise)
        candidates += [wise, simbad]
        for ra, dec, radius, cloud in MAGELLANIC:
            if separation(record["dir"], unit_vector(ra, dec)) < math.radians(radius):
                candidates.append(cloud)
        chosen = next((c for c in candidates if c), None)
        if chosen is None or not (10 < chosen[0] < 2e5):
            continue
        distance_pc, lo, hi, method, reference = chosen
        by_method[method] += 1
        radius_pc = math.radians(record["radius"] / 60) * distance_pc
        position = engine_position(record["dir"], distance_pc)
        north, east = sky_basis(record["dir"])
        pa = math.radians(record["pa"] if record["pa"] is not None else 0)
        major_axis = engine_axes(*(math.cos(pa) * n + math.sin(pa) * e for n, e in zip(north, east)))
        out.append({
            "names": preferred(record["names"]), "kind": kind_for(record), "p": [round(c, 3) for c in position],
            "r": round(max(0.005, radius_pc), 4), "q": round(max(0.1, min(1.0, record["ratio"])), 3),
            "axis": [round(c, 4) for c in major_axis], "d": round(distance_pc, 1),
            "lo": round(lo, 1) if lo else None, "hi": round(hi, 1) if hi else None,
            "method": method, "ref": reference, "src": list(dict.fromkeys(record["sources"])),
            "angle": round(record["radius"] * 2, 3),
            **({"filled": True} if record.get("filled") else {}),
        })
    print(f"nebulae: {len(out)}", dict(defaultdict(int, {k: sum(1 for n in out if n['kind'] == k) for k in set(kinds.values())})))
    print("  distances:", dict(by_method))
    return {
        "meta": {
            "retrieved": datetime.date.today().isoformat(),
            "sources": [
                "Chornay & Walton 2021, A&A 656, A110 (Gaia EDR3 planetary-nebula distances; VizieR J/A+A/656/A110)",
                "Anderson et al. 2014, ApJS 212, 1 (WISE catalog of Galactic HII regions; VizieR J/ApJS/212/1)",
                "Green 2025, catalogue of Galactic supernova remnants (VizieR VII/297)",
                "SIMBAD astronomical database (Wenger et al. 2000), CDS, Strasbourg: published distances",
                "OpenNGC by Mattia Verga (CC BY-SA 4.0), https://github.com/mattiaverga/OpenNGC",
            ],
        },
        "nebulae": out,
    }


def main() -> None:
    refresh = "--refresh" in sys.argv
    ngc = openngc_entries(sources.openngc_rows(refresh))
    blob, galaxy_meta = build_galaxies(refresh, ngc)
    nebulae = build_nebulae(refresh, ngc)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "galaxies.bin").write_bytes(blob)
    (OUT / "galaxies.json").write_text(json.dumps(galaxy_meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT / "nebulae.json").write_text(json.dumps(nebulae, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for name in ("galaxies.bin", "galaxies.json", "nebulae.json"):
        print(f"  {name}: {(OUT / name).stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
