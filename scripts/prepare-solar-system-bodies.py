"""Build src/data/generated/solarSystemBodies.json from NASA/JPL sources.

Run once (standard library only):
  python scripts/prepare-solar-system-bodies.py            # elements for every body
  python scripts/prepare-solar-system-bodies.py --samples  # sampled vectors (second pass)

The second pass stores Horizons positions, 2024–2030, for bodies whose fitted elements
miss the holdout epochs by more than SAMPLE_THRESHOLD_DEG (mostly solar-perturbed
irregular moons). They are interpolated at runtime; elements remain the fallback.

Sources
- JPL SSD planetary satellite mean elements (names, codes, reference frames, Laplace
  poles, precession periods): https://ssd.jpl.nasa.gov/sats/elem/
- JPL SSD planetary satellite physical parameters (GM, mean radius):
  https://ssd.jpl.nasa.gov/sats/phys_par/
- JPL Horizons API geometric state vectors (ecliptic J2000, ICRF):
  https://ssd.jpl.nasa.gov/api/horizons.api
- Horizons small-body headers (RAD, GM) for asteroids, dwarf planets and comets.

Method
For each body, Horizons vectors at four TDB epochs are requested in one call.
Elements are computed in the body's JPL reference plane (ecliptic, or the Laplace /
planet-equator plane from the JPL pole) at 2026-07-01, and the mean-longitude rate is
fitted over 2026-07-01..2027-07-01. Regular satellites precess node and apsis with
the JPL periods. The two outer epochs (2025-01-01, 2028-01-01) are held out and the
resulting angular error, seen from the parent, is stored per body.
"""
from __future__ import annotations

import datetime
import html
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "generated" / "solarSystemBodies.json"
HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"
# Fit epochs widen geometrically so whole revolutions are never ambiguous, even for
# Phobos (0.32 d); the first and last epochs are held out for validation.
EPOCHS = ["2025-01-01", "2026-07-01", "2026-07-02", "2026-07-04", "2026-07-11", "2026-08-01",
          "2026-10-01", "2027-01-01", "2027-07-01", "2028-01-01"]
FIT = tuple(range(1, 9))
HOLDOUT = (0, 9)
# IAU WGCCRE 2015 (Archinal et al. 2018) J2000 poles for planet-equator element frames.
# Uranus: JPL's equatorial frame uses the rotational (+angular momentum) pole, opposite the IAU north pole.
EQUATOR_POLES = {"Uranus": (77.311, 15.175), "Neptune": (299.36, 43.46), "Pluto": (132.993, -6.163),
                 "Mars": (317.681, 52.887), "Jupiter": (268.057, 64.495), "Saturn": (40.589, 83.537)}
OBLIQUITY = math.radians(23.4392911)
DEG = math.pi / 180
PLANET_CODES = {"Earth": 399, "Mars": 499, "Jupiter": 599, "Saturn": 699,
                "Uranus": 799, "Neptune": 899, "Pluto": 999}
# Central-body GM, km^3/s^2 (JPL DE440 / satellite ephemerides; planet body, not system).
CENTER_GM = {10: 132712440041.279, 399: 398600.435507, 499: 42828.375816, 599: 126686531.9,
             699: 37931206.234, 799: 5793951.256, 899: 6835099.97, 999: 869.326, 9: 869.326 + 105.88}
GM_PLUTO, GM_CHARON = 869.326, 105.88
# Pluto's small moons orbit the Pluto–Charon barycenter (Horizons 9). Charon is fitted
# Pluto-centric; Pluto's heliocentric orbit is fitted for the barycenter. At runtime a body
# with `companionOffset` adds factor × (Charon relative to Pluto) to its fitted position.
CHARON_FRACTION = GM_CHARON / (GM_PLUTO + GM_CHARON)
PLUTO_BARYCENTRIC_MOONS = {"903", "904", "905", "902"}
PARENT_IDS = {"Earth": "earth", "Mars": "mars", "Jupiter": "jupiter", "Saturn": "saturn",
              "Uranus": "uranus", "Neptune": "neptune", "Pluto": "pluto"}

# Small bodies: (id, name, category, Horizons command). Pluto uses its major-body code.
SMALL_BODIES = [
    ("pluto", "Pluto", "Dwarf planet · Kuiper belt", "9"),
    ("eris", "Eris", "Dwarf planet · scattered disk", "136199;"),
    ("haumea", "Haumea", "Dwarf planet · Kuiper belt", "136108;"),
    ("makemake", "Makemake", "Dwarf planet · Kuiper belt", "136472;"),
    ("gonggong", "Gonggong", "Trans-Neptunian object", "225088;"),
    ("quaoar", "Quaoar", "Trans-Neptunian object", "50000;"),
    ("orcus", "Orcus", "Trans-Neptunian object", "90482;"),
    ("sedna", "Sedna", "Detached trans-Neptunian object", "90377;"),
    ("arrokoth", "Arrokoth", "Kuiper belt object", "486958;"),
    ("pallas", "Pallas", "Main-belt asteroid", "2;"),
    ("juno", "Juno", "Main-belt asteroid", "3;"),
    ("hygiea", "Hygiea", "Main-belt asteroid", "10;"),
    ("psyche", "Psyche", "Main-belt asteroid", "16;"),
    ("lutetia", "Lutetia", "Main-belt asteroid", "21;"),
    ("kleopatra", "Kleopatra", "Main-belt asteroid", "216;"),
    ("ida", "Ida", "Main-belt asteroid", "243;"),
    ("mathilde", "Mathilde", "Main-belt asteroid", "253;"),
    ("gaspra", "Gaspra", "Main-belt asteroid", "951;"),
    ("steins", "Šteins", "Main-belt asteroid", "2867;"),
    ("annefrank", "Annefrank", "Main-belt asteroid", "5535;"),
    ("dinkinesh", "Dinkinesh", "Main-belt asteroid", "152830;"),
    ("donaldjohanson", "Donaldjohanson", "Main-belt asteroid", "52246;"),
    ("eros", "Eros", "Near-Earth asteroid", "433;"),
    ("toutatis", "Toutatis", "Near-Earth asteroid", "4179;"),
    ("itokawa", "Itokawa", "Near-Earth asteroid", "25143;"),
    ("ryugu", "Ryugu", "Near-Earth asteroid", "162173;"),
    ("didymos", "Didymos", "Near-Earth asteroid", "65803;"),
    ("apophis", "Apophis", "Near-Earth asteroid", "99942;"),
    ("braille", "Braille", "Mars-crosser asteroid", "9969;"),
    ("halley", "1P/Halley", "Periodic comet", "DES=1P;CAP"),
    ("encke", "2P/Encke", "Periodic comet", "DES=2P;CAP"),
    ("tempel-1", "9P/Tempel 1", "Periodic comet", "DES=9P;CAP"),
    ("borrelly", "19P/Borrelly", "Periodic comet", "DES=19P;CAP"),
    ("wild-2", "81P/Wild 2", "Periodic comet", "DES=81P;CAP"),
    ("hartley-2", "103P/Hartley 2", "Periodic comet", "DES=103P;CAP"),
    ("churyumov-gerasimenko", "67P/Churyumov–Gerasimenko", "Periodic comet", "DES=67P;CAP"),
]


def fetch(url: str, attempts: int = 4) -> str:
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=60) as response:
                return response.read().decode("utf-8")
        except Exception as error:  # noqa: BLE001 - retry any transient failure
            if attempt == attempts - 1:
                raise
            print(f"  retry after {error}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("unreachable")


def table_rows(page: str, table_id: str) -> list[list[str]]:
    start = page.find(f'id="{table_id}"')
    body = page[start:page.find("</table>", start)]
    rows = []
    for tr in re.findall(r"<tr>(.*?)</tr>", body, re.S):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.split(r"<td[^>]*>", tr)[1:]]
        if cells:
            rows.append(cells)
    return rows


def number(text: str) -> float | None:
    try:
        return float(text.replace("<", "").strip())
    except ValueError:
        return None


def horizons_vectors(command: str, center: int) -> tuple[str, list[list[float]], float]:
    query = {
        "format": "json", "COMMAND": f"'{command}'", "EPHEM_TYPE": "VECTORS",
        "CENTER": f"'500@{center}'", "REF_PLANE": "ECLIPTIC", "REF_SYSTEM": "ICRF",
        "VEC_TABLE": "2", "OUT_UNITS": "KM-S", "CSV_FORMAT": "YES", "TIME_TYPE": "TDB",
        "TLIST": " ".join(f"'{e}'" for e in EPOCHS), "OBJ_DATA": "YES",
    }
    result = json.loads(fetch(f"{HORIZONS}?{urllib.parse.urlencode(query)}"))
    text = result.get("result", "")
    if "$$SOE" not in text:
        raise ValueError(result.get("error") or text[-400:])
    states = []
    for line in text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines():
        values = [v.strip() for v in line.split(",")]
        states.append([float(v) for v in values[2:8]])
    return text, states, CENTER_GM[center]


def target_name(text: str) -> str:
    match = re.search(r"Target body name:\s*(.+?)\s{2,}", text)
    return match.group(1).strip() if match else ""


def header_radius(text: str) -> float | None:
    header = text.split("Ephemeris / API_USER")[0]
    for pattern in [r"Mean radius \(km\)\s*=\s*([0-9.]+)", r"Radius \(km\)\s*=\s*([0-9.]+)",
                    r"\bRAD=\s*([0-9.]+)", r"Mean radius, km\s*=\s*([0-9.]+)"]:
        match = re.search(pattern, header)
        if match:
            return float(match.group(1))
    return None


def header_gm(text: str) -> float | None:
    header = text.split("Ephemeris / API_USER")[0]
    match = re.search(r"\bGM(?:, km\^3/s\^2)?\s*=\s*([0-9.]+)", header) or re.search(r"\bGM=\s*([0-9.]+)", header)
    return float(match.group(1)) if match else None


# --- vector helpers -------------------------------------------------------------
def dot(a, b): return sum(x * y for x, y in zip(a, b))
def cross(a, b): return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
def norm(a): return math.sqrt(dot(a, a))
def unit(a): n = norm(a); return [x / n for x in a]
def matvec(m, v): return [dot(row, v) for row in m]
def transpose(m): return [list(r) for r in zip(*m)]
def wrap360(x): return x % 360.0
def wrap180(x): return (x + 180.0) % 360.0 - 180.0


ECL_TO_ICRF = [[1, 0, 0], [0, math.cos(OBLIQUITY), -math.sin(OBLIQUITY)], [0, math.sin(OBLIQUITY), math.cos(OBLIQUITY)]]


def frame_to_ecliptic(pole_ra: float | None, pole_dec: float | None):
    """Rows of the matrix map reference-frame coordinates to ecliptic J2000."""
    if pole_ra is None or pole_dec is None:
        return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    a, d = pole_ra * DEG, pole_dec * DEG
    z = [math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d)]  # ICRF
    x = [-math.sin(a), math.cos(a), 0.0]  # node of the plane on the ICRF equator
    y = cross(z, x)
    frame_to_icrf = transpose([x, y, z])
    icrf_to_ecl = transpose(ECL_TO_ICRF)
    return [[sum(icrf_to_ecl[i][k] * frame_to_icrf[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def elements(r, v, mu):
    h = cross(r, v)
    hn = norm(h)
    inclination = math.atan2(math.hypot(h[0], h[1]), h[2])
    node = math.atan2(h[0], -h[1])
    p_axis = [math.cos(node), math.sin(node), 0.0]
    q_axis = cross(unit(h), p_axis)
    rn, v2 = norm(r), dot(v, v)
    e_vec = [((v2 - mu / rn) * r[i] - dot(r, v) * v[i]) / mu for i in range(3)]
    e = norm(e_vec)
    a = 1 / (2 / rn - v2 / mu)
    if not (a > 0 and e < 1):
        raise ValueError("non-elliptic osculating orbit")
    u = math.atan2(dot(r, q_axis), dot(r, p_axis))
    peri = math.atan2(dot(e_vec, q_axis), dot(e_vec, p_axis)) if e > 1e-9 else 0.0
    nu = u - peri
    ecc_anomaly = 2 * math.atan2(math.sqrt(1 - e) * math.sin(nu / 2), math.sqrt(1 + e) * math.cos(nu / 2))
    mean = ecc_anomaly - e * math.sin(ecc_anomaly)
    return {"a": a, "e": e, "i": inclination / DEG, "node": wrap360(node / DEG),
            "peri": wrap360(peri / DEG), "M": wrap360(mean / DEG), "hn": hn}


def kepler_position(el, days):
    m = (el["M"] + el["nM"] * days) * DEG
    node = (el["node"] + el["nNode"] * days) * DEG
    peri = (el["peri"] + el["nPeri"] * days) * DEG
    e, a, i = el["e"], el["a"], el["i"] * DEG
    E = m if e < 0.8 else math.pi
    for _ in range(50):
        E -= (E - e * math.sin(E) - m) / (1 - e * math.cos(E))
    xp, yp = a * (math.cos(E) - e), a * math.sqrt(1 - e * e) * math.sin(E)
    cw, sw, cn, sn, ci, si = math.cos(peri), math.sin(peri), math.cos(node), math.sin(node), math.cos(i), math.sin(i)
    return [(cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
            (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
            sw * si * xp + cw * si * yp]


def jd(date: str) -> float:
    y, mo, d = (int(x) for x in date.split("-"))
    return datetime.date(y, mo, d).toordinal() - datetime.date(2000, 1, 1).toordinal() + 2451544.5


def fit_body(states, mu, matrix, precession):
    """precession: (P_node_yr, P_apsis_yr) or None for no secular precession."""
    to_frame = transpose(matrix)
    frame = [(matvec(to_frame, s[:3]), matvec(to_frame, s[3:])) for s in states]
    fit = [(jd(EPOCHS[k]) - jd(EPOCHS[FIT[0]]), elements(*frame[k], mu)) for k in FIT]
    e0 = fit[0][1]
    sense = 1 if e0["i"] < 90 else -1
    n_node = n_peri = 0.0
    if precession:
        p_node, p_apsis = precession
        ci = math.cos(e0["i"] * DEG)
        if p_node:
            n_node = -math.copysign(1, ci) * 360 / (p_node * 365.25)
        if p_apsis:
            n_peri = math.copysign(1, 5 * ci * ci - 1) * 360 / (p_apsis * 365.25)
    # Unwrap mean longitude epoch by epoch using the rate estimated so far.
    rate = math.degrees(math.sqrt(mu / e0["a"] ** 3)) * 86400 * sense
    times, longitudes = [0.0], [e0["node"] + e0["peri"] + e0["M"]]
    for t, el in fit[1:]:
        raw = el["node"] + el["peri"] + el["M"]
        predicted = longitudes[-1] + rate * (t - times[-1])
        longitudes.append(raw + 360 * round((predicted - raw) / 360))
        times.append(t)
        if len(times) >= 2:
            rate = (longitudes[-1] - longitudes[0]) / (times[-1] - times[0])
    mean_t = sum(times) / len(times)
    mean_l = sum(longitudes) / len(longitudes)
    n_l = sum((t - mean_t) * (l - mean_l) for t, l in zip(times, longitudes)) / sum((t - mean_t) ** 2 for t in times)
    l0 = mean_l - n_l * mean_t
    el = {k: e0[k] for k in ("a", "e", "i", "node", "peri")}
    el["M"] = wrap360(l0 - e0["node"] - e0["peri"])
    el.update(nM=n_l - n_node - n_peri, nNode=n_node, nPeri=n_peri)
    errors = []
    for index in HOLDOUT:
        days = jd(EPOCHS[index]) - jd(EPOCHS[FIT[0]])
        model = matvec(matrix, kepler_position(el, days))
        truth = states[index][:3]
        cos_angle = dot(model, truth) / (norm(model) * norm(truth))
        errors.append(math.degrees(math.acos(max(-1, min(1, cos_angle)))))
    return el, max(errors)


def slug(name: str) -> str:
    text = name.lower().replace("š", "s").replace("ä", "a").replace("ö", "o").replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def round_sig(x: float, digits: int = 12) -> float:
    return float(f"{x:.{digits}g}")


SAMPLE_THRESHOLD_DEG = 0.25
SAMPLE_START, SAMPLE_STOP = "2024-01-01", "2030-01-01"
SAMPLES_BIN = ROOT / "public" / "ephemeris" / "body-samples.bin"
SAMPLES_INDEX = ROOT / "src" / "data" / "generated" / "bodySamples.json"


def sample_center(body: dict) -> int:
    if body["parentId"] == "sun":
        return 10
    return {v: PLANET_CODES[k] for k, v in PARENT_IDS.items()}[body["parentId"]]


def sample_command(body: dict) -> str:
    # Samples are always body-centered, so no companion offset applies to them.
    return "999" if body["id"] == "pluto" else body["horizonsId"]


def build_samples() -> None:
    import struct
    data = json.loads(OUT.read_text(encoding="utf-8"))
    period = lambda b: 360 / abs(b["elements"]["nM"] + b["elements"]["nNode"] + b["elements"]["nPeri"])
    chosen = [b for b in data["bodies"] if b["holdoutErrorDeg"] > SAMPLE_THRESHOLD_DEG and period(b) >= 12]
    print(f"sampling {len(chosen)} bodies", file=sys.stderr)
    blob, index = bytearray(), {}
    for n, body in enumerate(chosen):
        step = int(max(1, min(10, round(period(body) / 48))))
        query = {
            "format": "json", "COMMAND": f"'{sample_command(body)}'", "EPHEM_TYPE": "VECTORS",
            "CENTER": f"'500@{sample_center(body)}'", "REF_PLANE": "ECLIPTIC", "REF_SYSTEM": "ICRF",
            "VEC_TABLE": "1", "OUT_UNITS": "KM-S", "CSV_FORMAT": "YES", "TIME_TYPE": "TDB",
            "START_TIME": f"'{SAMPLE_START}'", "STOP_TIME": f"'{SAMPLE_STOP}'", "STEP_SIZE": f"'{step} d'",
            "OBJ_DATA": "NO",
        }
        try:
            text = json.loads(fetch(f"{HORIZONS}?{urllib.parse.urlencode(query)}"))["result"]
            rows = [line.split(",") for line in text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()]
            offset = len(blob) // 4
            for row in rows:
                blob += struct.pack("<3f", *(float(v) for v in row[2:5]))
            index[body["id"]] = {"offset": offset, "count": len(rows), "stepDays": step}
            print(f"[{n + 1}/{len(chosen)}] {body['name']}: {len(rows)} samples @ {step} d", file=sys.stderr)
        except Exception as error:  # noqa: BLE001
            print(f"FAILED {body['name']}: {error}", file=sys.stderr)
        time.sleep(0.3)
    SAMPLES_BIN.parent.mkdir(parents=True, exist_ok=True)
    SAMPLES_BIN.write_bytes(bytes(blob))
    SAMPLES_INDEX.write_text(json.dumps({
        "generated": time.strftime("%Y-%m-%d"),
        "startTdb": f"{SAMPLE_START}T00:00:00Z", "stopTdb": f"{SAMPLE_STOP}T00:00:00Z",
        "format": "little-endian float32 x,y,z km per sample; ecliptic J2000; parent body center (no companion offset)",
        "asset": "/ephemeris/body-samples.bin", "bytes": len(blob),
        "source": "https://ssd.jpl.nasa.gov/api/horizons.api",
        "bodies": index,
    }, indent=1), encoding="utf-8")
    print(f"wrote {len(blob)} bytes for {len(index)} bodies", file=sys.stderr)


def main() -> None:
    phys_page = fetch("https://ssd.jpl.nasa.gov/sats/phys_par/")
    elem_page = fetch("https://ssd.jpl.nasa.gov/sats/elem/")
    physical = {}
    for row in table_rows(phys_page, "sat_phys_par"):
        physical[row[2]] = {"gm": number(row[3]), "radius": number(row[6]), "density": number(row[9])}
    satellites, seen = [], set()
    for row in table_rows(elem_page, "sat_elem"):
        planet, name, code, ephemeris, frame = row[1], row[2], row[3], row[4], row[5]
        if code in seen or planet not in PLANET_CODES or code == "301":
            continue
        seen.add(code)
        satellites.append({"planet": planet, "name": name, "code": code, "ephemeris": ephemeris, "frame": frame,
                           "p_apsis": number(row[14]), "p_node": number(row[15]),
                           "pole_ra": number(row[16]), "pole_dec": number(row[17])})
    print(f"{len(satellites)} satellites, {len(SMALL_BODIES)} small bodies", file=sys.stderr)

    bodies, failures = [], []
    for index, sat in enumerate(satellites):
        center = PLANET_CODES[sat["planet"]]
        barycentric = sat["code"] in PLUTO_BARYCENTRIC_MOONS
        if barycentric:
            center = 9
        try:
            text, states, mu = horizons_vectors(sat["code"], center)
            if not barycentric:
                mu += physical.get(sat["code"], {}).get("gm") or 0.0
            target = target_name(text)
            if sat["code"] not in target and sat["name"].split(" ")[0].lower() not in target.lower():
                raise ValueError(f"target mismatch: {target}")
            uses_plane = sat["frame"] != "ecliptic"
            pole = (sat["pole_ra"], sat["pole_dec"])
            if uses_plane and None in pole:
                pole = EQUATOR_POLES[sat["planet"]]
            matrix = frame_to_ecliptic(*pole) if uses_plane else frame_to_ecliptic(None, None)
            precession = (sat["p_node"], sat["p_apsis"]) if uses_plane else None
            el, error_deg = fit_body(states, mu, matrix, precession)
            phys = physical.get(sat["code"], {})
            radius = phys.get("radius") or header_radius(text)
            bodies.append({
                "id": slug(sat["name"]), "name": sat["name"], "parentId": PARENT_IDS[sat["planet"]],
                "kind": "satellite", "category": f"Natural satellite of {sat['planet']}",
                "horizonsId": sat["code"], "jplEphemeris": sat["ephemeris"], "referencePlane": sat["frame"],
                "radiusKm": radius, "radiusSource": "JPL sat phys_par" if phys.get("radius") else ("Horizons header" if radius else None),
                "gmKm3s2": phys.get("gm"),
                "elements": {k: round_sig(el[k]) for k in ("a", "e", "i", "node", "peri", "M", "nM", "nNode", "nPeri")},
                "frameToEcliptic": [[round_sig(x, 15) for x in row] for row in matrix],
                "holdoutErrorDeg": round_sig(error_deg, 4),
                **({"companionOffset": {"id": "charon", "factor": round_sig(CHARON_FRACTION)}} if barycentric else {}),
            })
            print(f"[{index + 1}/{len(satellites)}] {sat['name']}: {error_deg:.4f} deg", file=sys.stderr)
        except Exception as error:  # noqa: BLE001 - record and continue
            failures.append({"name": sat["name"], "code": sat["code"], "reason": str(error)[:200]})
            print(f"[{index + 1}] FAILED {sat['name']}: {error}", file=sys.stderr)
        time.sleep(0.3)

    for body_id, name, category, command in SMALL_BODIES:
        try:
            text, states, mu = horizons_vectors(command, 10)
            el, error_deg = fit_body(states, mu, frame_to_ecliptic(None, None), None)
            radius = header_radius(text)
            bodies.append({
                "id": body_id, "name": name, "parentId": "sun", "kind": "small-body", "category": category,
                "horizonsId": command, "targetName": target_name(text), "referencePlane": "ecliptic",
                "radiusKm": radius, "radiusSource": "Horizons header" if radius else None,
                "gmKm3s2": header_gm(text),
                "elements": {k: round_sig(el[k]) for k in ("a", "e", "i", "node", "peri", "M", "nM", "nNode", "nPeri")},
                "frameToEcliptic": [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
                "holdoutErrorDeg": round_sig(error_deg, 4),
                **({"companionOffset": {"id": "charon", "factor": -round_sig(CHARON_FRACTION)}} if body_id == "pluto" else {}),
            })
            print(f"{name} ({target_name(text)}): {error_deg:.4f} deg", file=sys.stderr)
        except Exception as error:  # noqa: BLE001
            failures.append({"name": name, "code": command, "reason": str(error)[:200]})
            print(f"FAILED {name}: {error}", file=sys.stderr)
        time.sleep(0.3)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "generated": time.strftime("%Y-%m-%d"),
        "epochTdb": f"{EPOCHS[FIT[0]]}T00:00:00Z",
        "units": {"a": "km", "angles": "deg", "rates": "deg/day", "radius": "km", "gm": "km^3/s^2"},
        "method": "Horizons ecliptic-J2000 vectors -> elements in the JPL reference plane; mean longitude rate fitted "
                  f"{EPOCHS[FIT[0]]}..{EPOCHS[FIT[1]]}; holdout error at {EPOCHS[HOLDOUT[0]]} and {EPOCHS[HOLDOUT[1]]}.",
        "sources": ["https://ssd.jpl.nasa.gov/sats/elem/", "https://ssd.jpl.nasa.gov/sats/phys_par/",
                    "https://ssd.jpl.nasa.gov/api/horizons.api"],
        "bodies": bodies,
        "failures": failures,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {OUT} ({len(bodies)} bodies, {len(failures)} failures)", file=sys.stderr)


if __name__ == "__main__":
    build_samples() if "--samples" in sys.argv else main()
