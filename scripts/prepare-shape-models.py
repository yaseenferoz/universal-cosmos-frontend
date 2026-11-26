"""Install NASA 3D shape models for small bodies into public/models.

Requires Pillow and NumPy. Downloads are cached in the ignored .local/asset-source/models.
  python scripts/prepare-shape-models.py

For each verified NASA model (science.nasa.gov 3D resources) this script:
- re-encodes embedded PNG textures as baseline JPEG (core glTF, no extension needed),
  capped at 2048 px, to keep each download small; geometry is copied unchanged;
- measures the mesh: volume-equivalent radius, principal-axis lengths (PCA of the
  vertices) and the largest vertex distance from the centroid, in units of that radius.
The renderer aligns principal axes (shortest = spin axis) and scales to the catalog's
mean radius at load time, so differing source units do not matter.

Results: public/models/<id>-nasa.glb and src/data/generated/shapeModels.json.
"""
from __future__ import annotations

import io
import json
import struct
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".local" / "asset-source" / "models"
PUBLIC = ROOT / "public" / "models"
OUT = ROOT / "src" / "data" / "generated" / "shapeModels.json"
MAX_TEXTURE = 2048
VTAD = "NASA Visualization Technology Applications and Development (VTAD)"
ASSETS = "https://assets.science.nasa.gov/content/dam/science/psd"

MODELS = [
    dict(id="eros", title="Eros 3D model", credit=VTAD,
         sourceUrl="https://science.nasa.gov/resource/eros-3d-model/",
         downloadUrl=f"{ASSETS}/solar/2023/09/e/Eros_1_10.glb",
         notes="Low-polygon NASA visualization model of NEAR Shoemaker's Eros with baked texture."),
    dict(id="bennu", title="Bennu 3D model", credit=VTAD,
         sourceUrl="https://science.nasa.gov/resource/bennu-3d-model/",
         downloadUrl=f"{ASSETS}/solar/2023/09/b/Bennu_1_1.glb",
         notes="NASA visualization model of OSIRIS-REx's Bennu with baked texture."),
    dict(id="itokawa", title="Itokawa 3D model", credit=VTAD,
         sourceUrl="https://science.nasa.gov/resource/asteroid-itokawa-3d-model/",
         downloadUrl=f"{ASSETS}/solar/2023/09/i/Itokawa_1_1.glb",
         notes="NASA visualization model of Hayabusa's Itokawa with baked texture."),
    dict(id="vesta", title="Vesta 3D model", credit=VTAD,
         sourceUrl="https://science.nasa.gov/resource/vesta-3d-model/",
         downloadUrl=f"{ASSETS}/solar/2023/09/v/Vesta_1_100.glb",
         notes="NASA visualization model of Dawn's Vesta, including the Rheasilvia basin."),
    dict(id="hyperion", title="Hyperion 3D model", credit=VTAD,
         sourceUrl="https://science.nasa.gov/resource/hyperion-3d-model/",
         downloadUrl=f"{ASSETS}/solar/2023/09/h/Hyperion_1_1000.glb",
         notes="NASA visualization model of Cassini's Hyperion. Hyperion tumbles chaotically; the rendered spin is illustrative."),
    dict(id="arrokoth", title="Arrokoth 3D model", credit=VTAD,
         sourceUrl="https://science.nasa.gov/resource/arrokoth-3d-model/",
         downloadUrl=f"{ASSETS}/solar/2023/09/a/Arrokoth.glb",
         notes="NASA visualization model of New Horizons' Arrokoth contact binary."),
    dict(id="phobos", title="Phobos 3D model", credit="NASA/JPL-Caltech",
         sourceUrl="https://science.nasa.gov/resource/phobos-mars-moon-3d-model/",
         downloadUrl=f"{ASSETS}/mars/resources/gltf_files/24878_Phobos_1_1000.glb",
         notes="NASA/JPL visualization model of Phobos with baked texture."),
    dict(id="deimos", title="Deimos 3D model", credit="NASA/JPL-Caltech",
         sourceUrl="https://science.nasa.gov/resource/deimos-mars-moon-3d-model/",
         downloadUrl=f"{ASSETS}/mars/resources/gltf_files/24879_Deimos_1_1000.glb",
         notes="NASA/JPL visualization model of Deimos with baked texture."),
]


def download(model: dict) -> bytes:
    path = CACHE / f"{model['id']}.glb"
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(model["downloadUrl"], headers={"User-Agent": "UniversalCosmosDataPrep/1.0"})
        with urllib.request.urlopen(request, timeout=120) as response:
            path.write_bytes(response.read())
    return path.read_bytes()


def split_glb(data: bytes) -> tuple[dict, bytes]:
    magic, version, _ = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2:
        raise ValueError("not a glTF 2.0 binary")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    gltf = json.loads(data[20:20 + json_length])
    offset = 20 + json_length
    bin_length, _ = struct.unpack_from("<II", data, offset)
    return gltf, data[offset + 8:offset + 8 + bin_length]


def join_glb(gltf: dict, binary: bytes) -> bytes:
    text = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    text += b" " * (-len(text) % 4)
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(text) + 8 + len(binary)
    return (struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(text), 0x4E4F534A) + text
            + struct.pack("<II", len(binary), 0x004E4942) + binary)


def normal_map_images(gltf: dict) -> set[int]:
    textures = gltf.get("textures", [])
    images = set()
    for material in gltf.get("materials", []):
        normal = material.get("normalTexture")
        if normal is not None:
            images.add(textures[normal["index"]]["source"])
    return images


def color_texture_mean(gltf: dict, binary: bytes) -> float | None:
    """Mean linear luminance of the base-colour texture (renderer tints to measured albedo)."""
    materials = gltf.get("materials", [])
    if not materials:
        return None
    texture = materials[0].get("pbrMetallicRoughness", {}).get("baseColorTexture")
    if texture is None:
        return None
    image = gltf["images"][gltf["textures"][texture["index"]]["source"]]
    view = gltf["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    pixels = np.asarray(Image.open(io.BytesIO(binary[start:start + view["byteLength"]])).convert("RGB"),
                        dtype=np.float64) / 255.0
    linear = np.where(pixels <= 0.04045, pixels / 12.92, ((pixels + 0.055) / 1.055) ** 2.4)
    luminance = linear @ np.array([0.2126, 0.7152, 0.0722])
    return round(float(luminance.mean()), 4)


def reencode(gltf: dict, binary: bytes) -> tuple[dict, bytes]:
    views = gltf["bufferViews"]
    replaced: dict[int, bytes] = {}
    normals = normal_map_images(gltf)
    for index, image in enumerate(gltf.get("images", [])):
        if "bufferView" not in image:
            continue
        view = views[image["bufferView"]]
        start = view.get("byteOffset", 0)
        source = Image.open(io.BytesIO(binary[start:start + view["byteLength"]]))
        if source.mode in ("RGBA", "LA") and source.getchannel("A").getextrema()[0] < 255:
            continue  # real transparency: keep the original PNG
        picture = source.convert("RGB")
        if max(picture.size) > MAX_TEXTURE:
            scale = MAX_TEXTURE / max(picture.size)
            picture = picture.resize((round(picture.width * scale), round(picture.height * scale)), Image.LANCZOS)
        out = io.BytesIO()
        # Normal maps keep full chroma and higher quality; colour maps use 4:2:0.
        if index in normals:
            picture.save(out, "JPEG", quality=94, subsampling=0, optimize=True)
        else:
            picture.save(out, "JPEG", quality=88, optimize=True)
        replaced[image["bufferView"]] = out.getvalue()
        image["mimeType"] = "image/jpeg"
    chunks = []
    cursor = 0
    for index, view in enumerate(views):
        start = view.get("byteOffset", 0)
        payload = replaced.get(index, binary[start:start + view["byteLength"]])
        padding = -cursor % 4
        chunks.append(b"\0" * padding)
        cursor += padding
        view["byteOffset"] = cursor
        view["byteLength"] = len(payload)
        chunks.append(payload)
        cursor += len(payload)
    gltf["buffers"][0]["byteLength"] = cursor
    return gltf, b"".join(chunks)


COMPONENTS = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def accessor(gltf: dict, binary: bytes, index: int) -> np.ndarray:
    item = gltf["accessors"][index]
    view = gltf["bufferViews"][item["bufferView"]]
    dtype = np.dtype(COMPONENTS[item["componentType"]])
    width = WIDTH[item["type"]]
    start = view.get("byteOffset", 0) + item.get("byteOffset", 0)
    stride = view.get("byteStride", 0) or dtype.itemsize * width
    raw = np.frombuffer(binary, dtype=np.uint8, count=stride * (item["count"] - 1) + dtype.itemsize * width, offset=start)
    rows = np.lib.stride_tricks.as_strided(raw, shape=(item["count"], dtype.itemsize * width), strides=(stride, 1))
    return np.ascontiguousarray(rows).view(dtype).reshape(item["count"], width)


def measure(gltf: dict, binary: bytes) -> dict:
    vertices, triangles = [], []
    base = 0
    for mesh in gltf["meshes"]:
        for primitive in mesh["primitives"]:
            positions = accessor(gltf, binary, primitive["attributes"]["POSITION"]).astype(np.float64)
            indices = (accessor(gltf, binary, primitive["indices"]).reshape(-1, 3).astype(np.int64)
                       if "indices" in primitive else np.arange(len(positions)).reshape(-1, 3))
            vertices.append(positions)
            triangles.append(indices + base)
            base += len(positions)
    points = np.concatenate(vertices)
    faces = np.concatenate(triangles)
    a, b, c = points[faces[:, 0]], points[faces[:, 1]], points[faces[:, 2]]
    signed = np.einsum("ij,ij->i", a, np.cross(b, c)) / 6.0
    volume = abs(signed.sum())
    centroid = ((a + b + c) / 4.0 * signed[:, None]).sum(axis=0) / signed.sum()
    radius = (3 * volume / (4 * np.pi)) ** (1 / 3)
    centered = points - centroid
    _, vectors = np.linalg.eigh(np.cov(centered.T))
    projected = centered @ vectors
    lengths = sorted(((projected.max(axis=0) - projected.min(axis=0)) / 2 / radius).tolist(), reverse=True)
    return {
        "vertices": int(len(points)),
        "triangles": int(len(faces)),
        "semiAxes": [round(value, 3) for value in lengths],
        "extent": round(float(np.linalg.norm(centered, axis=1).max() / radius), 3),
    }


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    catalog = {}
    for model in MODELS:
        source = download(model)
        gltf, binary = split_glb(source)
        stats = measure(gltf, binary)
        stats["colorTextureMean"] = color_texture_mean(gltf, binary)
        gltf, binary = reencode(gltf, binary)
        output = join_glb(gltf, binary)
        file = f"{model['id']}-nasa.glb"
        (PUBLIC / file).write_bytes(output)
        catalog[model["id"]] = {**{key: model[key] for key in ("title", "credit", "sourceUrl", "downloadUrl", "notes")},
                                "url": f"/models/{file}", "bytes": len(output), **stats}
        print(f"{model['id']:9s} {len(source):>9d} -> {len(output):>9d} B  {stats}")
    OUT.write_text(json.dumps(catalog, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
