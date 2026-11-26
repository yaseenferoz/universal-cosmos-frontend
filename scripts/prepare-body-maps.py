"""Install global surface maps for moons and dwarf planets that had none.

Requires Pillow and NumPy. Downloads are cached in the ignored .local/asset-source/maps.
  python scripts/prepare-body-maps.py

Every map is re-projected to the renderer's convention: simple cylindrical, planetocentric
latitude, east longitude increasing to the right and 0 deg at the image center (texture
u = 0.5, the IAU prime meridian on mesh +X). Each source's convention was taken from its
USGS/PDS label where available and confirmed by circular cross-correlation against a
labelled map of the same body (Cassini 2014 PIA maps and the New Horizons PIA11707 map
are centered on 180 deg and are rolled by half a turn).

Cassini PIA184xx maps are IR3/green/UV enhanced-colour products; their chroma is reduced
so compositional variation stays visible at roughly natural saturation. No pixels are
invented: unobserved regions stay transparent (partialCoverage) for the renderer to fill.

Results: public/textures/<id>-<width>.webp and src/data/generated/bodyMaps.json.
"""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".local" / "asset-source" / "maps"
OUT_DIR = ROOT / "public" / "textures"
OUT = ROOT / "src" / "data" / "generated" / "bodyMaps.json"
PIA = "https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia"
CKAN = "https://astrogeology.usgs.gov/ckan/dataset"
JPL_LICENSE = "JPL image use policy: reuse permitted with attribution; no endorsement."
USGS_LICENSE = "USGS source: no access constraints; cite authors."
CASSINI = "NASA/JPL-Caltech/Space Science Institute/Lunar and Planetary Institute"
CASSINI_NOTE = ("Cassini ISS global mosaic (2014 release) in enhanced IR3/green/UV colour; chroma reduced to "
                "about {chroma:.0%} for approximately natural saturation. Source illumination is baked in.")

MAPS = [
    dict(body="mimas", id="mimas-surface", file="PIA18437.jpg", url=f"{PIA}/pia18/pia18437/PIA18437.jpg",
         source="https://photojournal.jpl.nasa.gov/catalog/PIA18437", title="Cassini global map of Mimas",
         attribution=CASSINI, license=JPL_LICENSE, roll=0.5, chroma=0.12, note=CASSINI_NOTE),
    dict(body="tethys", id="tethys-surface", file="PIA18439.jpg", url=f"{PIA}/pia18/pia18439/PIA18439.jpg",
         source="https://photojournal.jpl.nasa.gov/catalog/PIA18439", title="Cassini global map of Tethys",
         attribution=CASSINI, license=JPL_LICENSE, roll=0.5, chroma=0.12, note=CASSINI_NOTE),
    dict(body="dione", id="dione-surface", file="PIA18434.jpg", url=f"{PIA}/pia18/pia18434/PIA18434.jpg",
         source="https://photojournal.jpl.nasa.gov/catalog/PIA18434", title="Cassini global map of Dione",
         attribution=CASSINI, license=JPL_LICENSE, roll=0.5, chroma=0.12, note=CASSINI_NOTE),
    dict(body="rhea", id="rhea-surface", file="PIA18438.jpg", url=f"{PIA}/pia18/pia18438/PIA18438.jpg",
         source="https://photojournal.jpl.nasa.gov/catalog/PIA18438", title="Cassini global map of Rhea",
         attribution=CASSINI, license=JPL_LICENSE, roll=0.5, chroma=0.12, note=CASSINI_NOTE),
    dict(body="iapetus", id="iapetus-surface", file="PIA18436.jpg", url=f"{PIA}/pia18/pia18436/PIA18436.jpg",
         source="https://photojournal.jpl.nasa.gov/catalog/PIA18436", title="Cassini global map of Iapetus",
         attribution=CASSINI, license=JPL_LICENSE, roll=0.5, chroma=0.0, dark_tint=(1.32, 1.0, 0.74),
         note=("Cassini ISS global mosaic (2014 release); brightness from the source, colour replaced by a "
               "luminance-dependent tint: the dark Cassini Regio material is reddish-brown (very red spectral "
               "slope), the bright ice neutral. Hue is approximate. Source illumination is baked in.")),
    dict(body="enceladus", id="enceladus-cassini-surface", file="PIA18435.jpg", url=f"{PIA}/pia18/pia18435/PIA18435.jpg",
         source="https://photojournal.jpl.nasa.gov/catalog/PIA18435", title="Cassini global map of Enceladus",
         attribution=CASSINI, license=JPL_LICENSE, roll=0.5, chroma=0.12, note=CASSINI_NOTE),
    dict(body="pluto", id="pluto-surface", file="PIA11707.jpg", url=f"{PIA}/pia11/pia11707/PIA11707.jpg",
         source="https://photojournal.jpl.nasa.gov/catalog/PIA11707", title="New Horizons global colour map of Pluto",
         attribution="NASA/Johns Hopkins University Applied Physics Laboratory/Southwest Research Institute",
         license=JPL_LICENSE, roll=0.5, chroma=0.85, partial=True,
         note=("New Horizons LORRI/MVIC global colour mosaic (2015 flyby). The southern hemisphere was in "
               "polar night and was never imaged; it is transparent in this map.")),
    dict(body="charon", id="charon-surface", file="charon_newhorizons_global_mosaic_300m_jul2017_1024.jpg",
         url=f"{CKAN}/93827f6c-8feb-42b6-98e6-b0ce57c7d2c8/resource/1abf318c-3290-4aa0-932e-a34f32d7f6ad/download/charon_newhorizons_global_mosaic_300m_jul2017_1024.jpg",
         source="https://astrogeology.usgs.gov/search/map/charon_new_horizons_lorri_mvic_global_mosaic_300m",
         title="New Horizons LORRI/MVIC global mosaic of Charon",
         attribution="NASA/JHUAPL/SwRI; USGS Astrogeology", license=USGS_LICENSE, roll=0.0, chroma=1.0, partial=True,
         note=("New Horizons panchromatic mosaic (USGS 1024-pixel preview). The unobserved southern "
               "hemisphere is transparent in this map.")),
    dict(body="ceres", id="ceres-surface", file="ceres_dawn_fc_dlr_global_feb2016_1024.jpg",
         url=f"{CKAN}/6ad84c9a-1fad-4869-b4f6-b52c5c2ace36/resource/9f757a65-8d8a-4349-a72d-8062387574b3/download/ceres_dawn_fc_dlr_global_feb2016_1024.jpg",
         source="https://astrogeology.usgs.gov/search/map/ceres_dawn_fc_hamo_dlr_global_mosaic_140m",
         title="Dawn Framing Camera global mosaic of Ceres (DLR, 2016)",
         attribution="NASA/JPL-Caltech/UCLA/MPS/DLR/IDA; USGS Astrogeology", license=USGS_LICENSE,
         roll=0.0, chroma=0.5,
         note="Dawn FC global mosaic (USGS 1024-pixel preview). Source illumination is baked in."),
    dict(body="triton", id="triton-colour-surface", file="triton_voyager2_clrmosaic_1024.jpg",
         url=f"{CKAN}/445b4c39-e87a-4e4d-88a8-e48d8e755c5c/resource/de0ba9f1-303e-4e5f-a99a-3201fba9a764/download/triton_voyager2_clrmosaic_1024.jpg",
         source="https://astrogeology.usgs.gov/search/map/triton_voyager_2_global_color_mosaic_600m",
         title="Voyager 2 colour mosaic of Triton", attribution="NASA/JPL; USGS Astrogeology",
         license=USGS_LICENSE, roll=0.0, chroma=0.6, partial=True,
         note=("Voyager 2 (1989) colour mosaic. Voyager saw mainly the southern hemisphere; the rest is "
               "transparent in this map.")),
]


def source_image(entry: dict) -> Image.Image:
    path = CACHE / entry["file"]
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(entry["url"], headers={"User-Agent": "UniversalCosmosDataPrep/1.0"})
        with urllib.request.urlopen(request, timeout=300) as response:
            path.write_bytes(response.read())
    image = Image.open(path)
    image.draft("RGB", (4096, 2048))
    return image.convert("RGB")


def process(entry: dict) -> dict:
    image = source_image(entry)
    source_size = list(Image.open(CACHE / entry["file"]).size)
    width = min(2048, image.width)
    image = image.resize((width, width // 2), Image.LANCZOS)
    rgb = np.asarray(image, dtype=np.float64)
    if entry["roll"]:
        rgb = np.roll(rgb, int(round(entry["roll"] * width)), axis=1)
    luminance = rgb @ np.array([0.2126, 0.7152, 0.0722])
    rgb = luminance[..., None] + (rgb - luminance[..., None]) * entry["chroma"]
    if entry.get("dark_tint"):
        # Blend toward the dark-material reflectance colour where the surface is dark.
        weight = 1.0 - np.clip((luminance - 50.0) / 90.0, 0.0, 1.0)
        tint = np.array(entry["dark_tint"]) / (np.array(entry["dark_tint"]) @ np.array([0.2126, 0.7152, 0.0722]))
        rgb = rgb * (1.0 + weight[..., None] * (tint - 1.0))
    rgb = np.clip(np.round(rgb), 0, 255).astype(np.uint8)
    alpha = None
    if entry.get("partial"):
        # Unobserved pixels are pure black in these products. Erode the boundary (its
        # pixels are limb-darkened or mixed) and feather it so the continuation blends in.
        observed = np.asarray(image, dtype=np.uint8).max(axis=2) > 10
        if entry["roll"]:
            observed = np.roll(observed, int(round(entry["roll"] * width)), axis=1)
        eroded = Image.fromarray((observed * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(21))
        alpha = np.asarray(eroded.filter(ImageFilter.GaussianBlur(6)), dtype=np.uint8) * observed
    picture = Image.fromarray(rgb)
    if alpha is not None:
        picture.putalpha(Image.fromarray(alpha))
    linear = (rgb / 255.0)
    linear = np.where(linear <= 0.04045, linear / 12.92, ((linear + 0.055) / 1.055) ** 2.4)
    weights = (alpha > 0) if alpha is not None else np.ones(luminance.shape, dtype=bool)
    mean = float((linear @ np.array([0.2126, 0.7152, 0.0722]))[weights].mean())
    variants, resolutions, saved = {}, {}, {}
    for tier, target in (("low", 1024), ("medium", 2048), ("high", 2048)):
        w = min(target, picture.width)
        if w not in saved:
            name = f"{entry['id']}-{w}.webp"
            picture.resize((w, w // 2), Image.LANCZOS).save(OUT_DIR / name, "WEBP", quality=90, method=6)
            saved[w] = f"/textures/{name}"
        variants[tier] = saved[w]
        resolutions[tier] = [w, w // 2]
    record = {
        "id": entry["id"], "title": entry["title"], "assetUrl": entry["url"], "sourceUrl": entry["source"],
        "attribution": entry["attribution"], "license": entry["license"],
        "notes": entry["note"].format(chroma=entry["chroma"]) + " Re-projected to 0 deg longitude at the center.",
        "kind": "observational" if entry["chroma"] >= 0.85 or entry["chroma"] == 1.0 else "derived",
        "colorSpace": "srgb", "sourceResolution": source_size, "variants": variants, "resolutions": resolutions,
        "meanLinearLuminance": round(mean, 4),
    }
    if alpha is not None:
        record["partialCoverage"] = True
    print(entry["body"], source_size, "->", variants["high"], "mean", record["meanLinearLuminance"])
    return record


# Ice giants: Hubble OPAL filter composites (F467M/F547M/F658N or F657N) re-centred on the
# true colour measured from Irwin et al. 2024 (MNRAS 527:11521), whose reprocessed Voyager 2
# disks give linear R/G and B/G of 0.721/0.998 (Uranus) and 0.605/1.195 (Neptune).
OPAL = "https://archive.stsci.edu/hlsps/opal/cycle22"
GIANTS = [
    dict(body="uranus", id="uranus-natural", file="uranus.tif", legacy=True,
         url=f"{OPAL}/uranus/hlsp_opal_hst_wfc3-uvis_uranus-2014a_f467m-f547m-f658n_v1_globalmap.tif",
         source="https://archive.stsci.edu/hlsp/opal/opal-uranus-cycle-22",
         title="Hubble OPAL Uranus map (2014) in true colour", ratio=(0.721, 1.0, 0.998), mean=0.45,
         fringe=None),
    dict(body="neptune", id="neptune-natural", file="neptune.tif", legacy=True,
         url=f"{OPAL}/neptune/hlsp_opal_hst_wfc3-uvis_neptune-2015a_f467m-f547m-f657n_v1_globalmap.tif",
         source="https://archive.stsci.edu/hlsp/opal/opal-neptune-cycle-22",
         title="Hubble OPAL Neptune map (2015) in true colour", ratio=(0.605, 1.0, 1.195), mean=0.41,
         fringe=(18.0, 28.8)),
]
CHROMA_KEPT = 0.3


def to_linear(srgb: np.ndarray) -> np.ndarray:
    srgb = srgb / 255.0
    return np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)


def to_srgb(linear: np.ndarray) -> np.ndarray:
    linear = np.clip(linear, 0.0, 1.0)
    return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * linear ** (1 / 2.4) - 0.055) * 255.0


def recolour_giant(entry: dict) -> dict:
    # The OPAL previews used by scripts/prepare-imagery.py are cached under .local/asset-source.
    path = ROOT / ".local" / "asset-source" / entry["file"]
    if not path.exists():
        request = urllib.request.Request(entry["url"], headers={"User-Agent": "UniversalCosmosDataPrep/1.0"})
        with urllib.request.urlopen(request, timeout=300) as response:
            path.write_bytes(response.read())
    source = Image.open(path).convert("RGB")
    rgb = np.asarray(source, dtype=np.float64)
    height, width = rgb.shape[:2]
    observed = rgb.min(axis=2) > 12
    # Drop the 12-pixel registration margin next to unobserved pixels (as the original asset did).
    margin = Image.fromarray((~observed * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(25))
    observed &= np.asarray(margin) == 0
    linear = to_linear(rgb)
    weights = np.array([0.2126, 0.7152, 0.0722])
    luminance = np.maximum(linear @ weights, 1e-4)
    mean_colour = linear[observed].mean(axis=0)
    mean_luminance = mean_colour @ weights
    relative = (linear / luminance[..., None]) / (mean_colour / mean_luminance)
    target = np.array(entry["ratio"]) / (np.array(entry["ratio"]) @ weights)
    natural = target * (luminance / mean_luminance)[..., None] * relative ** CHROMA_KEPT
    # Zonal continuation: each row's observed mean, rows without data take the nearest row's.
    latitude = 90.0 - (np.arange(height) + 0.5) / height * 180.0
    zonal = np.zeros((height, 3))
    have = np.zeros(height, dtype=bool)
    for row in range(height):
        # Only well-covered rows: edge rows near the coverage limit are limb-darkened.
        if observed[row].mean() > 0.6:
            zonal[row] = natural[row][observed[row]].mean(axis=0)
            have[row] = True
    rows = np.nonzero(have)[0]
    for row in range(height):
        if not have[row]:
            nearest = rows[np.argsort(np.abs(rows - row))[:12]]
            zonal[row] = zonal[nearest].mean(axis=0)
    blend = observed.astype(np.float64)
    if entry["fringe"]:
        start, end = entry["fringe"]
        blend *= (1.0 - np.clip((latitude - start) / (end - start), 0.0, 1.0))[:, None]
    # Feather the observed/continued boundary; unobserved pixels always take the continuation.
    soft = np.asarray(Image.fromarray((blend * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)),
                      dtype=np.float64) / 255.0 * observed
    filled = natural * soft[..., None] + zonal[:, None, :] * (1.0 - soft[..., None])
    filled *= entry["mean"] / (filled @ weights).mean()
    picture = Image.fromarray(np.clip(np.round(to_srgb(filled)), 0, 255).astype(np.uint8))
    name = f"{entry['id']}-{width}.webp"
    picture.save(OUT_DIR / name, "WEBP", quality=92, method=6)
    variants = {tier: f"/textures/{name}" for tier in ("low", "medium", "high")}
    print(entry["body"], [width, height], "->", name, "observed", round(float(observed.mean()), 3))
    return {
        "id": entry["id"], "title": entry["title"], "assetUrl": entry["url"], "sourceUrl": entry["source"],
        "attribution": "NASA / ESA / STScI / OPAL program (PI: Amy Simon); colour: Irwin et al. 2024",
        "license": "MAST/HST data: public domain, cite the OPAL program; colour reference Irwin et al. 2024 (MNRAS 527:11521).",
        "notes": ("Hubble OPAL filter-composite brightness structure re-centred on the true colour measured from "
                  "Irwin et al. 2024's reprocessed Voyager 2 disk; 30% of the composite's relative colour "
                  "variation is kept. Unobserved and registration-fringe latitudes use a zonal-mean continuation "
                  "(illustrative). Historical weather; native resolution only, no upscaling."),
        "kind": "derived", "colorSpace": "srgb", "sourceResolution": [width, height],
        "variants": variants, "resolutions": {tier: [width, height] for tier in variants},
    }


def main() -> None:
    maps = {entry["body"]: process(entry) for entry in MAPS}
    maps.update({entry["body"]: recolour_giant(entry) for entry in GIANTS})
    OUT.write_text(json.dumps(maps, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
