/**
 * GLSL shared by the galaxy sprites (GalaxyField) and volumes (DeepVolumes). Colours are
 * linear display RGB for broad stellar populations: illustrative, not spectra.
 */
import { ATLAS_COLUMNS, ATLAS_ROWS } from "./galaxyMaps";
import { BULGE_CORE, MAP_NORMALISATION } from "./galaxyModel";

const float = (value: number) => (Number.isInteger(value) ? `${value}.0` : `${value}`);

export const GALAXY_COMMON = /* glsl */ `
  const vec3 YOUNG_COLOR = vec3(0.6, 0.74, 1.0);
  const vec3 HII_COLOR = vec3(1.0, 0.42, 0.55);
  const vec3 BULGE_COLOR = vec3(1.0, 0.74, 0.5);
  const vec3 DUST_REDDENING = vec3(0.78, 1.0, 1.3);
  const float MAP_NORMALISATION = ${float(MAP_NORMALISATION)};
  const float BULGE_CORE2 = ${float(BULGE_CORE * BULGE_CORE)};
  uniform sampler2D atlas;
  uniform sampler2D milkyWayMap;
  /** Texels across one atlas cell and across the Milky Way map. */
  uniform vec2 mapTexels;

  /** Face-on map (young, old, dust, HII) at p in the unit disk; cell 8 is the Milky Way. */
  vec4 faceOn(float cell, vec2 p, float pixelsAcross) {
    if (dot(p, p) >= 1.0) return vec4(0.0);
    if (cell > 7.5) return textureLod(milkyWayMap, p * 0.5 + 0.5, log2(max(1.0, mapTexels.y / max(pixelsAcross, 1.0))));
    vec2 cellXY = vec2(mod(cell, ${float(ATLAS_COLUMNS)}), floor(cell / ${float(ATLAS_COLUMNS)}));
    vec2 uv = (cellXY + (p / 1.06) * 0.5 + 0.5) / vec2(${float(ATLAS_COLUMNS)}, ${float(ATLAS_ROWS)});
    return textureLod(atlas, uv, log2(max(1.0, mapTexels.x / max(pixelsAcross, 1.0))));
  }

  /** Projected column of the truncated bulge at scaled impact parameter bs (spherical approximation). */
  float bulgeColumn(float bs, float k, float radius, float truncation) {
    float rt2 = truncation * truncation;
    if (bs >= truncation) return 0.0;
    float a = sqrt(bs * bs + BULGE_CORE2);
    float l = sqrt(rt2 - bs * bs);
    return max(0.0, k * radius * (2.0 * atan(l / a) / a - 2.0 * l / (rt2 + BULGE_CORE2)));
  }

  /**
   * Bulge column along the segment a → b (object units), scaled coordinates s = M x.
   * Closed form of ∫ K (1/(|s|² + c²) − 1/(Rt² + c²)) dt inside |s| < Rt.
   */
  float bulgeSegment(vec3 a, vec3 b, mat3 M, float truncation) {
    vec3 o = M * a, d = M * (b - a);
    float A = dot(d, d), B = dot(o, d), C = dot(o, o);
    float rt2 = truncation * truncation;
    if (A < 1e-14) return 0.0;
    float disc = B * B - A * (C - rt2);
    if (disc <= 0.0) return 0.0;
    float root = sqrt(disc);
    float s1 = max(0.0, (-B - root) / A), s2 = min(1.0, (-B + root) / A);
    if (s2 <= s1) return 0.0;
    float s0 = B / A;
    float k = sqrt(max((C + BULGE_CORE2) / A - s0 * s0, 1e-14));
    float first = (atan((s2 + s0) / k) - atan((s1 + s0) / k)) / (A * k);
    return max(0.0, first - (s2 - s1) / (rt2 + BULGE_CORE2)) * length(b - a);
  }

  /** ∫ exp(−|y|/h) dt along a segment of length len whose height goes linearly from ya to yb. */
  float heightIntegral(float ya, float yb, float len, float h) {
    float dy = yb - ya;
    if (abs(dy) < 1e-4 * h) return len * exp(-abs(0.5 * (ya + yb)) / h);
    float ga = sign(ya) * h * (1.0 - exp(-abs(ya) / h));
    float gb = sign(yb) * h * (1.0 - exp(-abs(yb) / h));
    return len / abs(dy) * abs(gb - ga);
  }
`;
