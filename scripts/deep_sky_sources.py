"""Download and cache the source tables for scripts/prepare-deep-sky.py (standard library only).

Tables come from the VizieR mirror at the Harvard-Smithsonian CfA, the SIMBAD mirror at the
CfA, and the OpenNGC repository. Raw responses are cached in the ignored
.local/asset-source/deep directory; pass --refresh to prepare-deep-sky.py to download again.
"""
from __future__ import annotations

import csv
import io
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".local" / "asset-source" / "deep"
VIZIER = "https://vizier.cfa.harvard.edu/viz-bin/asu-tsv"
SIMBAD_TAP = "https://simbad.cfa.harvard.edu/simbad/sim-tap/sync"
OPENNGC = "https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/"
AGENT = {"User-Agent": "UniversalCosmosDataPrep/1.0"}

# VizieR tables: cache name -> (source, columns, extra parameters).
VIZIER_TABLES = {
    # Karachentsev et al. 2013, Updated Nearby Galaxy Catalog (Local Volume, D < ~11 Mpc).
    "ungc": ("J/AJ/145/101/catalog", "Name,RAJ2000,DEJ2000,a26,b/a,Bmag,Kmag,TT,Mcl,HRV,Dist,f_Dist,A26,i,BMag,KLum", {}),
    # Huchra et al. 2012, 2MASS Redshift Survey (Ks <= 11.75).
    "2mrs": ("J/ApJS/199/26/table3", "ID,RAJ2000,DEJ2000,GLON,GLAT,Ktmag,Jtmag,Rext,b/a,type,cz,CAT", {}),
    # 2MASS Extended Source Catalog: position angles for the 2MRS galaxies.
    "xsc": ("VII/233/xsc", "2MASX,Spa,Sb/a", {"K.K20e": "<12.2"}),
    # Tully et al. 2023, Cosmicflows-4 galaxy distances and group distances.
    "cf4": ("J/ApJ/944/94/table2", "PGC,1PGC,Vcmb,DM,e_DM,RAJ2000,DEJ2000", {}),
    "cf4groups": ("J/ApJ/944/94/groups", "1PGC,Ngal,DMzp,e_DMav,Vcmb", {}),
    # Chornay & Walton 2021, Gaia EDR3 planetary nebula central-star distances.
    "pne": ("J/A+A/656/A110/tablea1", "PNG,Name,Rel,pnRAdeg,pnDEdeg,pnRad,pnStat,rcomb,b_rcomb,B_rcomb", {}),
    # Anderson et al. 2014, WISE catalog of Galactic HII regions.
    "hii": ("J/ApJS/212/1/wisecat", "WISE,Cl,GLON,GLAT,Rad,HIIName,Dist,e_Dist,Meth", {"-out.add": "_RAJ,_DEJ"}),
    # Green 2025, catalogue of Galactic supernova remnants.
    "snr": ("VII/297/snrs", "SNR,RAJ2000,DEJ2000,MajDiam,MinDiam,type,Names", {}),
}


def fetch(url: str, data: bytes | None = None, timeout: int = 600) -> bytes:
    request = urllib.request.Request(url, data=data, headers=AGENT)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def cached(name: str, refresh: bool, download) -> bytes:
    path = CACHE / name
    if refresh or not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_bytes(download())
    return path.read_bytes()


def vizier_rows(name: str, refresh: bool) -> list[dict[str, str]]:
    """All rows of a cached VizieR table as dicts (blank strings for missing values)."""
    source, columns, extra = VIZIER_TABLES[name]
    params = {"-source": source, "-out": columns, "-out.max": "unlimited", "-oc.form": "dec", **extra}
    text = cached(f"{name}.tsv", refresh, lambda: fetch(VIZIER + "?" + urllib.parse.urlencode(params))).decode("utf-8", "replace")
    lines = [line for line in text.splitlines() if line and not line.startswith("#")]
    if len(lines) < 3:
        raise RuntimeError(f"VizieR returned no rows for {source}; delete {CACHE / (name + '.tsv')} and retry.")
    # Header, then a units line and a dashes line, then the data.
    header = lines[0].split("\t")
    rows = []
    for line in lines[3:]:
        cells = line.split("\t")
        if len(cells) == len(header):
            rows.append({key: value.strip() for key, value in zip(header, cells)})
    return rows


def openngc_rows(refresh: bool) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for name in ("NGC.csv", "addendum.csv"):
        text = cached(f"openngc-{name}", refresh, lambda name=name: fetch(OPENNGC + name)).decode("utf-8")
        rows.extend(csv.DictReader(io.StringIO(text), delimiter=";"))
    return rows


def simbad_query(adql: str, cache_name: str, refresh: bool) -> list[dict[str, str]]:
    def download() -> bytes:
        data = urllib.parse.urlencode({"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": adql}).encode()
        return fetch(SIMBAD_TAP, data)
    text = cached(cache_name, refresh, download).decode("utf-8", "replace")
    return list(csv.DictReader(io.StringIO(text)))
