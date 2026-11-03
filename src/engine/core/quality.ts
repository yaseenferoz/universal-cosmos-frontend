import type { Quality } from "../../types/celestial";

export interface QualityConfig {
  pixelRatio: number;
  stars: number;
  textureSize: number;
  shadowMapSize: number;
}
export function qualityConfig(
  quality: Quality,
  devicePixelRatio = 1,
  mobile = false,
): QualityConfig {
  const resolved = quality === "auto" ? (mobile ? "low" : "medium") : quality;
  const presets = {
    low: { pixelRatio: 1, stars: 1000, textureSize: 512, shadowMapSize: 0 },
    medium: {
      pixelRatio: 1.5,
      stars: 1600,
      textureSize: 1024,
      shadowMapSize: 1024,
    },
    high: {
      pixelRatio: 2,
      stars: 2400,
      textureSize: 2048,
      shadowMapSize: 2048,
    },
  };
  return {
    ...presets[resolved],
    pixelRatio: Math.min(
      Math.max(devicePixelRatio, 0.5),
      presets[resolved].pixelRatio,
    ),
  };
}
