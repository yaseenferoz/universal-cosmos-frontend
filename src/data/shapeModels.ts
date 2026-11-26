import models from "./generated/shapeModels.json";
import type { ObjectId } from "../types/celestial";

/**
 * NASA 3D visualization models installed by scripts/prepare-shape-models.py.
 * Geometry is the published model; textures were re-encoded as JPEG. Statistics are
 * measured from the mesh in units of its volume-equivalent radius.
 */
export interface ShapeModelAsset {
  title: string;
  credit: string;
  sourceUrl: string;
  downloadUrl: string;
  notes: string;
  /** Path under public/. */
  url: string;
  bytes: number;
  vertices: number;
  triangles: number;
  /** Principal semi-axes, largest first, in volume-equivalent radii. */
  semiAxes: [number, number, number];
  /** Largest centroid-to-vertex distance in volume-equivalent radii (camera clearance). */
  extent: number;
  /** Mean linear luminance of the colour texture; the renderer rescales it to the measured albedo. */
  colorTextureMean: number | null;
}

const MODELS = models as unknown as Record<string, ShapeModelAsset>;

export function shapeModelFor(id: ObjectId): ShapeModelAsset | undefined {
  return Object.prototype.hasOwnProperty.call(MODELS, id) ? MODELS[id] : undefined;
}

export function shapeModelIds(): ObjectId[] {
  return Object.keys(MODELS);
}
