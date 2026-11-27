/**
 * Illustrative nebula structure by kind. The catalogues give each nebula's position, size,
 * outline and distance; the 3D structure inside is not observed, so it is procedural, with
 * emission-line colours: Hα + [N II] (656 nm, red-pink), [O III] (501 nm, teal) and
 * dust-scattered starlight (blue).
 */
export const NEBULA_KIND_CODE = { emission: 0, planetary: 1, supernova: 2, reflection: 3, dark: 4 } as const;
/** Shader code for a filled (pulsar-wind) supernova remnant. */
export const FILLED_REMNANT_CODE = 5;

export function nebulaShaderKind(kind: keyof typeof NEBULA_KIND_CODE, filled: boolean): number {
  return kind === "supernova" && filled ? FILLED_REMNANT_CODE : NEBULA_KIND_CODE[kind];
}

export const NEBULA_COMMON = /* glsl */ `
  uniform highp sampler3D noiseVolume;
  const vec3 H_ALPHA = vec3(1.0, 0.2, 0.3);
  const vec3 OXYGEN = vec3(0.22, 1.0, 0.78);
  const vec3 SCATTERED = vec3(0.45, 0.62, 1.0);
  const vec3 SYNCHROTRON = vec3(0.62, 0.7, 1.0);
  // Explicit LOD: no derivatives inside ray-march loops (and the lattice has no mipmaps).
  float noise3(vec3 p) { return textureLod(noiseVolume, p, 0.0).r; }
  float fbm3(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise3(p); p = p * 2.03 + vec3(0.131, 0.273, 0.417); a *= 0.5; }
    return v / 0.9375;
  }

  /** Emission (rgb, per unit length; radius = 1) and extinction (a) at p inside the nebula. */
  vec4 nebulaAt(float kind, vec3 p, vec3 seed) {
    float r = length(p);
    if (r >= 1.0) return vec4(0.0);
    // Base octave ~3 lattice cells across the nebula; fbm adds detail down to ~1/20 of its size.
    vec3 q = p * 0.025 + seed;
    if (kind < 0.5) {
      // HII region: turbulent gas around a cavity blown by its young stars, dust lanes outside.
      vec3 w = p + (vec3(fbm3(q), fbm3(q + 0.37), fbm3(q + 0.71)) - 0.5) * 1.1;
      float rw = length(w);
      float envelope = 1.0 - smoothstep(0.35, 1.0, rw);
      float gas = envelope * smoothstep(0.03, 0.28, rw) * pow(fbm3(w * 0.04 + seed * 1.3), 3.0) * 9.0;
      vec3 color = mix(OXYGEN * 0.55 + H_ALPHA * 0.55, H_ALPHA, smoothstep(0.1, 0.55, rw));
      float dust = envelope * smoothstep(0.52, 0.68, fbm3(w * 0.06 + seed + 0.5)) * 7.0;
      return vec4(color * gas, dust);
    }
    if (kind < 1.5) {
      // Planetary nebula: ionised shell, [O III] inside, Hα and [N II] at the rim.
      float shell = exp(-pow((r - 0.72) / 0.14, 2.0)) * (0.45 + 1.1 * fbm3(q * 2.5));
      float inner = exp(-r * r / 0.2) * 0.12;
      return vec4(mix(OXYGEN, H_ALPHA, smoothstep(0.55, 0.9, r)) * (shell + inner) * 1.6, 0.0);
    }
    if (kind < 2.5) {
      // Supernova remnant: thin filamentary shock shell.
      float ridge = 1.0 - abs(2.0 * fbm3(q * 2.5) - 1.0);
      float shell = exp(-pow((r - 0.86) / 0.1, 2.0)) * pow(ridge, 5.0) * 4.5;
      return vec4(mix(H_ALPHA, OXYGEN, smoothstep(0.42, 0.68, fbm3(q * 1.2 + 0.3))) * shell, 0.0);
    }
    if (kind > 4.5) {
      // Filled remnant (pulsar wind nebula): bluish synchrotron glow laced with Hα and [O III] filaments.
      float glow = exp(-r * r / 0.3) * (0.5 + 0.7 * fbm3(q * 2.0)) * 0.9;
      float ridge = 1.0 - abs(2.0 * fbm3(q * 3.0 + 0.2) - 1.0);
      float filaments = pow(ridge, 6.0) * (1.0 - smoothstep(0.6, 1.0, r)) * 4.0;
      return vec4(SYNCHROTRON * glow + mix(H_ALPHA, OXYGEN, smoothstep(0.45, 0.65, fbm3(q * 1.4 + 0.6))) * filaments, 0.0);
    }
    if (kind < 3.5) {
      // Reflection nebula: dust lit by nearby stars.
      float cloud = (1.0 - smoothstep(0.3, 1.0, r)) * pow(fbm3(q * 1.2), 2.0) * 2.5;
      return vec4(SCATTERED * cloud, cloud * 0.5);
    }
    // Dark nebula: dust only.
    float cloud = (1.0 - smoothstep(0.35, 1.0, r)) * smoothstep(0.35, 0.6, fbm3(q * 1.1));
    return vec4(0.0, 0.0, 0.0, cloud * 8.0);
  }

  /** Sky-projected look for sprites (offset p in the outline, radius 1). */
  vec3 nebulaSprite(float kind, vec2 p, vec3 seed) {
    float r = length(p);
    if (r >= 1.0) return vec3(0.0);
    vec3 q = vec3(p * 0.025, 0.0) + seed;
    if (kind < 0.5) return mix(H_ALPHA * 0.7 + OXYGEN * 0.4, H_ALPHA, smoothstep(0.1, 0.5, r)) * (1.0 - smoothstep(0.3, 1.0, r)) * (0.3 + 1.2 * pow(fbm3(q), 2.0));
    // Small planetary nebulae read as soft disks; the ring shows once they are resolved.
    if (kind < 1.5) return OXYGEN * 0.7 * exp(-r * r / 0.45) + H_ALPHA * exp(-pow((r - 0.78) / 0.16, 2.0)) * 0.7;
    if (kind > 4.5) return (SYNCHROTRON * exp(-r * r / 0.3) + H_ALPHA * 0.5 * (1.0 - smoothstep(0.5, 1.0, r)) * fbm3(q * 3.0)) * 0.9;
    // Patchy, broad rims: remnants are filamentary arcs, not neat circles.
    if (kind < 2.5) return mix(H_ALPHA, OXYGEN, 0.3) * exp(-pow((r - 0.8) / 0.2, 2.0)) * smoothstep(0.35, 0.75, fbm3(q * 2.5)) * 1.2;
    if (kind < 3.5) return SCATTERED * (1.0 - smoothstep(0.2, 1.0, r)) * (0.4 + fbm3(q));
    return vec3(0.0);
  }
`;
