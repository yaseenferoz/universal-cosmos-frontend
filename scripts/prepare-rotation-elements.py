"""Build src/data/generated/rotationElements.json from the NAIF generic text PCK.

Run once (standard library only):
  python scripts/prepare-rotation-elements.py                       # downloads pck00011.tpc
  python scripts/prepare-rotation-elements.py --kernel pck00011.tpc # use a local copy

Source
- NAIF generic text PCK pck00011.tpc, https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/
  It encodes the IAU WGCCRE 2015 rotational elements (Archinal et al. 2018,
  Celest. Mech. Dyn. Astr. 130:22) plus NAIF's quadratic Mars phase angles.

Model (degrees; T = Julian centuries TDB and d = days TDB since J2000.0)
  alpha0 = RA[0] + RA[1] T + RA[2] T^2 + sum NUT_PREC_RA[i] sin(theta_i)
  delta0 = DEC[0] + DEC[1] T + DEC[2] T^2 + sum NUT_PREC_DEC[i] cos(theta_i)
  W      = PM[0] + PM[1] d + PM[2] d^2 + sum NUT_PREC_PM[i] sin(theta_i)
  theta_i = A[i][0] + A[i][1] T (+ A[i][2] T^2 when the system's MAX_PHASE_DEGREE is 2)
where A are the BODYn_NUT_PREC_ANGLES of the body's barycenter n (n = id // 100 for
planets and satellites). Only assignments inside \\begindata blocks are read.

Only bodies present in this app's catalog are written. Earth (399) is included for
validation; the renderer keeps its dedicated Earth orientation model.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "generated" / "rotationElements.json"
BODIES_JSON = ROOT / "src" / "data" / "generated" / "solarSystemBodies.json"
KERNEL_URL = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc"

# Hand-curated catalog ids -> NAIF ids.
CURATED = {
    "sun": 10, "mercury": 199, "venus": 299, "earth": 399, "moon": 301, "mars": 499,
    "phobos": 401, "deimos": 402, "jupiter": 599, "io": 501, "europa": 502,
    "ganymede": 503, "callisto": 504, "saturn": 699, "mimas": 601, "enceladus": 602,
    "tethys": 603, "dione": 604, "rhea": 605, "titan": 606, "iapetus": 608,
    "uranus": 799, "ariel": 701, "umbriel": 702, "titania": 703, "oberon": 704,
    "miranda": 705, "neptune": 899, "triton": 801, "ceres": 2000001, "vesta": 2000004,
}
# Generated small bodies whose NAIF id is not 2000000 + number (spacecraft-era ids).
SPECIAL = {"pluto": 999, "ida": 2431010, "gaspra": 9511010, "borrelly": 1000005,
           "churyumov-gerasimenko": 1000012, "tempel-1": 1000093}


def parse_kernel(text: str) -> dict[str, list[float]]:
    """Numeric assignments from \\begindata sections (later assignments win)."""
    values: dict[str, list[float]] = {}
    data = []
    active = False
    for line in text.splitlines():
        marker = line.strip()
        if marker == "\\begindata":
            active = True
            continue
        if marker == "\\begintext":
            active = False
            continue
        if active:
            data.append(line)
    body = "\n".join(data)
    for match in re.finditer(r"([A-Z0-9_]+)\s*(\+?=)\s*(\([^)]*\)|[^\s()]+)", body):
        name, operator, raw = match.groups()
        raw = raw.strip("()")
        if "'" in raw or "@" in raw:
            continue
        numbers = [float(token.replace("D", "E").replace("d", "e"))
                   for token in re.split(r"[\s,]+", raw.strip()) if token]
        if operator == "+=" and name in values:
            values[name] = values[name] + numbers
        else:
            values[name] = numbers
    return values


def catalog_naif_ids() -> dict[str, int]:
    ids = dict(CURATED)
    bodies = json.loads(BODIES_JSON.read_text(encoding="utf-8"))["bodies"]
    for body in bodies:
        body_id = body["id"]
        if body_id in ids:
            continue
        if body_id in SPECIAL:
            ids[body_id] = SPECIAL[body_id]
            continue
        code = str(body.get("horizonsId", "")).rstrip(";")
        if not code.isdigit():
            continue
        number = int(code)
        if body["kind"] == "satellite":
            ids[body_id] = number
        else:
            ids[body_id] = 2_000_000 + number
    return ids


def system_of(naif: int) -> int | None:
    return naif // 100 if 100 <= naif < 1000 else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kernel", type=Path, help="local copy of pck00011.tpc")
    args = parser.parse_args()
    if args.kernel:
        raw = args.kernel.read_bytes()
    else:
        request = urllib.request.Request(KERNEL_URL, headers={"User-Agent": "UniversalCosmosDataPrep/1.0"})
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
    values = parse_kernel(raw.decode("ascii", errors="replace"))

    bodies: dict[str, dict] = {}
    systems: dict[str, dict] = {}
    for body_id, naif in sorted(catalog_naif_ids().items(), key=lambda item: item[1]):
        key = f"BODY{naif}"
        if f"{key}_POLE_RA" not in values or f"{key}_PM" not in values:
            continue
        entry: dict = {
            "naif": naif,
            "ra": (values[f"{key}_POLE_RA"] + [0.0, 0.0, 0.0])[:3],
            "dec": (values[f"{key}_POLE_DEC"] + [0.0, 0.0, 0.0])[:3],
            "pm": (values[f"{key}_PM"] + [0.0, 0.0, 0.0])[:3],
        }
        system = system_of(naif)
        nut = {name: values.get(f"{key}_NUT_PREC_{name.upper()}") for name in ("ra", "dec", "pm")}
        if system is not None and any(nut.values()):
            angles = values.get(f"BODY{system}_NUT_PREC_ANGLES")
            if not angles:
                raise SystemExit(f"{body_id}: nutation terms without BODY{system}_NUT_PREC_ANGLES")
            degree = int(values.get(f"BODY{system}_MAX_PHASE_DEGREE", [1])[0])
            width = degree + 1
            if len(angles) % width:
                raise SystemExit(f"BODY{system}_NUT_PREC_ANGLES length is not a multiple of {width}")
            count = len(angles) // width
            systems[str(system)] = {"degree": degree,
                                    "angles": [angles[i * width:(i + 1) * width] for i in range(count)]}
            for name, terms in nut.items():
                terms = terms or []
                if len(terms) > count:
                    raise SystemExit(f"{body_id}: {len(terms)} {name} terms but {count} angles")
                # Trailing zero coefficients carry no information.
                while terms and terms[-1] == 0:
                    terms = terms[:-1]
                if terms:
                    entry[f"nut{name.capitalize()}"] = terms
            entry["system"] = system
        bodies[body_id] = entry

    output = {
        "source": {
            "kernel": KERNEL_URL,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "reference": "IAU WGCCRE 2015: Archinal et al. 2018, Celest. Mech. Dyn. Astr. 130:22",
            "generated": datetime.date.today().isoformat(),
        },
        "units": "degrees; RA/DEC polynomials in Julian centuries TDB, PM in days TDB, both from J2000.0",
        "systems": systems,
        "bodies": bodies,
    }
    OUT.write_text(json.dumps(output, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(bodies)} bodies, systems {sorted(systems)}")


if __name__ == "__main__":
    main()
