"""Star clusters for scripts/prepare-deep-sky.py (standard library only).

Open clusters: Hunt & Reffert 2023 (A&A 673, A114), the Gaia DR3 all-sky cluster catalogue.
Only open clusters passing the authors' quality cuts are kept (astrometric significance
CST >= 5 and median CMD class >= 0.5). Distances are their maximum-likelihood Gaia distances
(16th-84th percentile range), ages and extinctions their CMD fits, and sizes their radii.

Globular clusters: Harris catalogue (VizieR VII/202) for integrated magnitude, colour,
metallicity, core and half-light radii and concentration; distances from Gaia EDR3 parallaxes
(Vasiliev & Baumgardt 2021) where better than 5%, otherwise the Harris distance.
"""
from __future__ import annotations

import math
import re

import deep_sky_sources as sources

# Popular names not carried by OpenNGC for these clusters.
NICKNAMES = {
    "Melotte 22": "Pleiades", "Melotte 25": "Hyades", "NGC 2632": "Beehive Cluster", "Melotte 111": "Coma Star Cluster",
    "Melotte 20": "Alpha Persei Cluster", "NGC 869": "h Persei", "NGC 884": "χ Persei", "NGC 4755": "Jewel Box",
    "NGC 6705": "Wild Duck Cluster", "IC 2602": "Southern Pleiades", "NGC 3532": "Wishing Well Cluster",
    "IC 2391": "Omicron Velorum Cluster", "NGC 2516": "Southern Beehive", "NGC 5139": "Omega Centauri",
    "NGC 104": "47 Tucanae", "NGC 6205": "Hercules Cluster", "NGC 7789": "Caroline's Rose",
}
SURVEY_PREFIXES = ("MWSC", "OCL", "FSR", "Theia", "CWNU", "UBC", "UPK", "HSC", "CWWDL", "OC ", "LP ", "Gulliver", "COIN", "LISC", "Harvard")
GLOBULAR_AGE_LOG = 10.1  # ~12.6 Gyr, typical of Galactic globular clusters (assumed for display)


def cluster_name(raw: str, helpers) -> str | None:
    text = raw.strip().replace("_", " ")
    m = re.match(r"^M\s*0*(\d+)$", text)
    if m:
        return f"M {int(m.group(1))}"
    m = re.match(r"^(NGC|IC|Melotte|Collinder|Trumpler|Stock|Berkeley|King|Ruprecht|Czernik|Dolidze|Pismis|Haffner|Platais|Roslund|Alessi|Blanco|Basel|Bochum|Hogg|Lynga|Mamajek|vdBergh|Westerlund)\s*0*(\d+)(.*)$", text)
    if m:
        return f"{m.group(1)} {int(m.group(2))}{m.group(3)}"
    return helpers.catalogue_name(text) if not text.startswith(SURVEY_PREFIXES) else None


def rounded(value: float | None, digits: int) -> float | None:
    return None if value is None else round(value, digits)


def build(refresh: bool, ngc: list[dict], helpers) -> dict:
    number, unit_vector = helpers.number, helpers.unit_vector
    named = [e for e in ngc if e["row"]["Type"] in ("OCl", "Cl+N", "GCl", "*Ass")]

    def names_for(candidates: list[str], direction, radius_arcmin: float) -> list[str]:
        names = [n for n in (cluster_name(c, helpers) for c in candidates) if n]
        return names or [candidates[0].replace("_", " ")]

    clusters: list[dict] = []
    for row in sources.vizier_rows("hr23", refresh):
        if row["Type"] != "o" or (number(row["CST"]) or 0) < 5 or (number(row["CMDCl50"]) or 0) < 0.5:
            continue
        ra, dec, d = number(row["RA_ICRS"]), number(row["DE_ICRS"]), number(row["dist50"])
        r50 = number(row["r50pc"])
        if ra is None or dec is None or not d or not r50:
            continue
        direction = unit_vector(ra, dec)
        radius_arcmin = math.degrees(r50 / d) * 60
        all_names = [row["Name"]] + [n for n in row["AllNames"].split(",") if n and n != row["Name"]]
        clusters.append({
            "dir": direction, "angle": radius_arcmin,
            "names": names_for(all_names, direction, radius_arcmin), "kind": "open",
            "p": [round(c, 3) for c in helpers.engine_position(direction, d)], "d": round(d, 2),
            "lo": rounded(number(row["dist16"]), 1), "hi": rounded(number(row["dist84"]), 1),
            "method": "Gaia DR3 parallaxes of members", "ref": "2023A&A...673A.114H",
            "r50": round(r50, 3), "rc": rounded(number(row["rcpc"]), 3), "rt": rounded(number(row["rtpc"]), 3),
            "n": int(number(row["N"]) or 0), "age": rounded(number(row["logAge50"]), 3), "av": rounded(number(row["AV50"]), 3),
        })

    parallaxes = {row["Name"].strip(): row for row in sources.vizier_rows("gcplx", refresh)}
    for row in sources.vizier_rows("harris", refresh):
        ra, dec = helpers.sexagesimal(row["RAJ2000"], True), helpers.sexagesimal(row["DEJ2000"], False)
        harris_kpc, mv = number(row["Rsun"]), number(row["MVt"])
        rc_arcmin, rh_arcmin, c = number(row["Rc"]), number(row["Rh"]), number(row["c"])
        if ra is None or dec is None or not harris_kpc or mv is None or not rh_arcmin:
            continue
        direction = unit_vector(ra, dec)
        plx = parallaxes.get(row["ID"].strip())
        p, e = (number(plx["plx"]), number(plx["e_plx"])) if plx else (None, None)
        if p and e and p > 0 and e / p < 0.05:
            d, lo, hi = 1000 / p, 1000 / (p + e), 1000 / (p - e)
            method, ref = "Gaia EDR3 parallax", "2021MNRAS.505.5978V"
        else:
            d, lo, hi = harris_kpc * 1000, None, None
            method, ref = "Horizontal-branch brightness (Harris catalogue)", "1996AJ....112.1487H"
        to_pc = math.radians(1 / 60) * d
        rc = (rc_arcmin or rh_arcmin * 0.3) * to_pc
        candidates = [row["ID"]] + ([row["Name"]] if row["Name"].strip() else [])
        clusters.append({
            "dir": direction, "angle": rh_arcmin,
            "names": names_for(candidates, direction, rh_arcmin), "kind": "globular",
            "p": [round(x, 2) for x in helpers.engine_position(direction, d)], "d": round(d, 1),
            "lo": rounded(lo, 1), "hi": rounded(hi, 1), "method": method, "ref": ref,
            "r50": round(rh_arcmin * to_pc, 3), "rc": round(rc, 3), "rt": round(rc * 10 ** (c or 1.5), 2),
            "age": GLOBULAR_AGE_LOG, "mv": mv, "bv": number(row["(B-V)t"]), "feh": number(row["[Fe/H]"]),
        })

    # OpenNGC names (Messier numbers, common names) go to the nearest cluster centre whose
    # half-member radius contains them, one cluster per OpenNGC object.
    grid = helpers.SkyGrid(0.002)
    for i, cluster in enumerate(clusters):
        grid.add(i, cluster["dir"])
    for entry in named:
        best, best_sep = None, math.inf
        for i, w in grid.near(entry["dir"], math.radians(3)):
            sep = helpers.separation(entry["dir"], w)
            limit = math.radians(max(1.5, min(60.0, clusters[i]["angle"])) / 60)
            if sep <= limit and sep < best_sep:
                best, best_sep = clusters[i], sep
        if best is not None:
            best["names"] = [n for n in entry["names"] if not n.startswith(("UGC", "PGC"))] + best["names"]
    for cluster in clusters:
        names = list(dict.fromkeys(cluster.pop("names")))
        nick = [NICKNAMES[n] for n in names if n in NICKNAMES]
        cluster["names"] = list(dict.fromkeys(nick + names))
        del cluster["dir"], cluster["angle"]
    clusters = [{"names": c.pop("names"), **c} for c in clusters]

    open_count = sum(1 for c in clusters if c["kind"] == "open")
    print(f"clusters: {open_count} open, {len(clusters) - open_count} globular")
    return {
        "meta": {
            "sources": [
                "Hunt & Reffert 2023, A&A 673, A114 (Gaia DR3 star clusters; VizieR J/A+A/673/A114)",
                "Harris 1996 (2010 edition), Galactic globular clusters (VizieR VII/202)",
                "Vasiliev & Baumgardt 2021, MNRAS 505, 5978 (Gaia EDR3 globular-cluster parallaxes)",
                "OpenNGC by Mattia Verga (CC BY-SA 4.0), names",
            ],
            "globularAgeLog": GLOBULAR_AGE_LOG,
        },
        "clusters": clusters,
    }
