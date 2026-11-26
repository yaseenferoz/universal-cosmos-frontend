"""Build src/data/generated/bodyAppearance.json: measured albedo, colour and shape inputs.

Run once (standard library only):
  python scripts/prepare-body-appearance.py                    # fetch everything
  python scripts/prepare-body-appearance.py --cache DIR        # reuse/save raw responses in DIR

Sources (only published values are written; null means "not measured"):
- JPL Horizons object-data headers (satellites): "Radius (km)" (triaxial when given) and
  "Geometric Albedo". https://ssd.jpl.nasa.gov/api/horizons.api
- JPL Small-Body Database API phys_par (asteroids, comets, dwarf planets): albedo,
  extent, spec_B (SMASSII), spec_T (Tholen), BV. https://ssd-api.jpl.nasa.gov/sbdb.api
- Graykowski & Jewitt 2018, AJ 155:184, irregular-satellite colours (VizieR J/AJ/155/184).
- Hainaut et al. 2012, A&A 546:A115, MBOSS-2 TNO/Centaur colours (VizieR J/A+A/546/A115).
- Literature values for bodies the databases omit (cited per entry in LITERATURE).

Units: geometric albedo in V; colour indices in Johnson-Cousins magnitudes; axes are
relative (database semi-axes or full extents; only ratios are used by the renderer).
"""
from __future__ import annotations

import argparse
import datetime
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BODIES_JSON = ROOT / "src" / "data" / "generated" / "solarSystemBodies.json"
OUT = ROOT / "src" / "data" / "generated" / "bodyAppearance.json"
HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"
SBDB = "https://ssd-api.jpl.nasa.gov/sbdb.api"
VIZIER = "https://vizier.cds.unistra.fr/viz-bin/asu-tsv"
USER_AGENT = "UniversalCosmosDataPrep/1.0"

# Curated moons (not in the generated list) whose albedo scales their installed maps.
CURATED_SATELLITES = {
    "io": "501", "europa": "502", "ganymede": "503", "callisto": "504", "mimas": "601",
    "enceladus": "602", "tethys": "603", "dione": "604", "rhea": "605", "titan": "606",
    "iapetus": "608", "ariel": "701", "umbriel": "702", "titania": "703", "oberon": "704",
    "miranda": "705", "triton": "801", "phobos": "401", "deimos": "402",
}
CURATED_SMALL = {"ceres": "1", "vesta": "4", "bennu": "101955"}

# Published values missing from the databases above.
LITERATURE = {
    "pluto": {"albedo": 0.52, "albedoSource": "Buratti et al. 2017, Icarus 287:207"},
    "charon": {"albedo": 0.38, "albedoSource": "Buratti et al. 2017, Icarus 287:207"},
    "eris": {"albedo": 0.96, "albedoSource": "Sicardy et al. 2011, Nature 478:493"},
    "haumea": {"albedo": 0.51, "albedoSource": "Ortiz et al. 2017, Nature 550:219",
               "axes": [2322, 1704, 1026], "axesSource": "Ortiz et al. 2017, Nature 550:219 (occultation)"},
    "makemake": {"albedo": 0.77, "albedoSource": "Ortiz et al. 2012, Nature 491:566"},
    "gonggong": {"albedo": 0.14, "albedoSource": "Kiss et al. 2019, Icarus 334:3",
                 "colorClass": "very red", "colorSource": "Kiss et al. 2019 (one of the reddest TNOs)"},
    "quaoar": {"albedo": 0.12, "albedoSource": "Braga-Ribas et al. 2013, ApJ 773:26"},
    "orcus": {"albedo": 0.23, "albedoSource": "Fornasier et al. 2013, A&A 555:A15"},
    "sedna": {"albedo": 0.32, "albedoSource": "Pal et al. 2012, A&A 541:L6"},
    "arrokoth": {"albedo": 0.21, "albedoSource": "Hofgartner et al. 2021, Icarus 356:113723",
                 "axes": [36, 20, 10], "axesSource": "Spencer et al. 2020, Science 367:eaay3999",
                 "colorClass": "very red", "colorSource": "Grundy et al. 2020, Science 367:eaay3705"},
    "bennu": {"albedo": 0.044, "albedoSource": "Lauretta et al. 2019, Nature 568:55",
              "axes": [565, 535, 508], "axesSource": "Barnouin et al. 2019, Nat. Geosci. 12:247"},
    "hygiea": {"axes": [450, 430, 424], "axesSource": "Vernazza et al. 2020, Nat. Astron. 4:136"},
}


def fetch(url: str, cache: Path | None, name: str, attempts: int = 4) -> str:
    if cache:
        path = cache / name
        if path.exists():
            return path.read_text(encoding="utf-8")
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=90) as response:
                text = response.read().decode("utf-8")
            break
        except Exception as error:  # noqa: BLE001 - network retry
            if attempt == attempts - 1:
                raise
            print(f"  retry {name}: {error}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    if cache:
        cache.mkdir(parents=True, exist_ok=True)
        (cache / name).write_text(text, encoding="utf-8")
    time.sleep(0.4)
    return text


def horizons_header(code: str, cache: Path | None) -> str:
    query = urllib.parse.urlencode({"format": "json", "COMMAND": f"'{code}'", "OBJ_DATA": "YES",
                                    "MAKE_EPHEM": "NO"})
    data = json.loads(fetch(f"{HORIZONS}?{query}", cache, f"horizons-{code}.json"))
    return data.get("result", "")


def parse_header(text: str) -> dict:
    out: dict = {}
    radius = re.search(r"Radius\s*\(km\)\s*=\s*([0-9.]+(?:\s*x\s*[0-9.]+){0,2})", text)
    if radius:
        parts = [float(value) for value in re.split(r"\s*x\s*", radius.group(1).strip())]
        if len(parts) == 3 and max(parts) > min(parts) * 1.02:
            out["axes"] = sorted(parts, reverse=True)
            out["axesSource"] = "JPL Horizons satellite physical data"
    albedo = re.search(r"Geometric\s+[Aa]lbedo\s*=\s*([0-9.]+)", text)
    if albedo:
        value = float(albedo.group(1))
        if 0 < value < 2:
            out["albedo"] = value
            out["albedoSource"] = "JPL Horizons satellite physical data"
    return out


def sbdb_physical(designation: str, cache: Path | None) -> dict:
    query = urllib.parse.urlencode({"sstr": designation, "phys-par": "1"})
    safe = re.sub(r"[^A-Za-z0-9]+", "_", designation)
    data = json.loads(fetch(f"{SBDB}?{query}", cache, f"sbdb-{safe}.json"))
    values = {row["name"]: row.get("value") for row in data.get("phys_par", [])}
    out: dict = {}
    if values.get("albedo"):
        out["albedo"] = float(values["albedo"])
        out["albedoSource"] = "JPL Small-Body Database"
    if values.get("extent"):
        parts = [float(value) for value in re.findall(r"[0-9.]+", values["extent"])]
        if len(parts) == 3:
            out["axes"] = sorted(parts, reverse=True)
            out["axesSource"] = "JPL Small-Body Database (extent)"
    taxonomy = values.get("spec_B") or values.get("spec_T")
    if taxonomy:
        out["taxonomy"] = taxonomy.strip()
        out["taxonomySource"] = "JPL SBDB " + ("SMASSII (spec_B)" if values.get("spec_B") else "Tholen (spec_T)")
    if values.get("BV"):
        out["bv"] = float(values["BV"])
        out["colorSource"] = "JPL Small-Body Database (B-V)"
    return out


def vizier_rows(source: str, cache: Path | None, name: str) -> list[dict]:
    query = urllib.parse.urlencode({"-source": source, "-out.all": "", "-out.max": "unlimited"})
    text = fetch(f"{VIZIER}?{query}", cache, name)
    lines = [line for line in text.splitlines() if line and not line.startswith("#")]
    header = lines[0].split("\t")
    rows = []
    for line in lines[3:]:
        cells = line.split("\t")
        rows.append({key.strip(): cell.strip() for key, cell in zip(header, cells)})
    return rows


def mean_colours(rows: list[dict], key_of) -> dict[str, dict]:
    sums: dict[str, dict[str, list[float]]] = {}
    for row in rows:
        key = key_of(row)
        if not key:
            continue
        for column, field in (("B-V", "bv"), ("V-R", "vr")):
            try:
                value = float(row.get(column, ""))
            except ValueError:
                continue
            sums.setdefault(key, {}).setdefault(field, []).append(value)
    return {key: {field: round(sum(values) / len(values), 3) for field, values in fields.items()}
            for key, fields in sums.items()}


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, help="directory for raw responses (reused when present)")
    args = parser.parse_args()
    bodies = json.loads(BODIES_JSON.read_text(encoding="utf-8"))["bodies"]

    irregular = mean_colours(vizier_rows("J/AJ/155/184", args.cache, "vizier-gj18.tsv"),
                             lambda row: slug(row.get("Sat", "").split(" ", 1)[-1]))
    tno = mean_colours(vizier_rows("J/A+A/546/A115/catalog", args.cache, "vizier-mboss.tsv"),
                       lambda row: "" if "+" in row.get("Name", "") else slug(row.get("Name", "").split("-", 1)[-1]))

    result: dict[str, dict] = {}
    satellites = {body["id"]: body["horizonsId"] for body in bodies if body["kind"] == "satellite"}
    satellites.update(CURATED_SATELLITES)
    for body_id, code in sorted(satellites.items()):
        entry = parse_header(horizons_header(code, args.cache))
        colours = irregular.get(body_id)
        if colours:
            entry.update(colours)
            entry["colorSource"] = "Graykowski & Jewitt 2018, AJ 155:184"
        result[body_id] = entry
        print(f"{body_id:24s} {entry}")

    small = {body["id"]: body["horizonsId"] for body in bodies if body["kind"] != "satellite"}
    small.update(CURATED_SMALL)
    for body_id, code in sorted(small.items()):
        designation = re.sub(r"^DES=|;.*$", "", code).rstrip(";")
        if body_id == "pluto":
            designation = "134340"
        entry = sbdb_physical(designation, args.cache)
        colours = tno.get(body_id)
        if colours:
            entry.update(colours)
            entry["colorSource"] = "Hainaut et al. 2012, A&A 546:A115 (MBOSS-2)"
        result[body_id] = entry
        print(f"{body_id:24s} {entry}")

    for body_id, values in LITERATURE.items():
        result.setdefault(body_id, {}).update(values)

    output = {
        "generated": datetime.date.today().isoformat(),
        "note": "Measured inputs only; renderer defaults for missing values are illustrative.",
        "bodies": {key: result[key] for key in sorted(result)},
    }
    OUT.write_text(json.dumps(output, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(result)} bodies")


if __name__ == "__main__":
    main()
