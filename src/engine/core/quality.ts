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
    low: { pixelRatio: 1, stars: 3000, textureSize: 512, shadowMapSize: 0 },
    medium: {
      pixelRatio: 1.5,
      stars: 8000,
      textureSize: 1024,
      shadowMapSize: 1024,
    },
    high: {
      pixelRatio: 2,
      stars: 12000,
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

/** Adaptive-resolution state for the "auto" preset (pure; see nextAdaptiveResolution). */
export interface AdaptiveResolutionState {
  /** Upper bound on the render pixel ratio; Infinity means "preset maximum". */
  limit: number;
  /** Ratio that last proved too slow, and when (ms). */
  failedRatio: number;
  failedAt: number;
  /** Consecutive adaptation intervals at comfortable frame rates. */
  fastIntervals: number;
}

export const ADAPTIVE_STARTUP_GRACE_MS = 8000;
export const ADAPTIVE_SLOW_FPS = 28;
export const ADAPTIVE_FAST_FPS = 50;
export const ADAPTIVE_STEP = 0.15;
export const ADAPTIVE_MIN_RATIO = 0.5;
const RETRY_AFTER_MS = 60_000;

export function initialAdaptiveResolution(): AdaptiveResolutionState {
  return { limit: Infinity, failedRatio: Infinity, failedAt: -Infinity, fastIntervals: 0 };
}

/**
 * One adaptation step (called every few seconds). Drops resolution under sustained
 * slow frames, but — unlike a one-way ratchet — ignores start-up hitches and climbs
 * back after two fast intervals, never retrying a ratio that failed in the last minute.
 */
export function nextAdaptiveResolution(
  state: AdaptiveResolutionState,
  fps: number,
  currentRatio: number,
  presetRatio: number,
  nowMs: number,
  startedMs: number,
): AdaptiveResolutionState {
  if (!Number.isFinite(fps) || nowMs - startedMs < ADAPTIVE_STARTUP_GRACE_MS) return state;
  if (fps < ADAPTIVE_SLOW_FPS) {
    if (currentRatio <= ADAPTIVE_MIN_RATIO) return { ...state, fastIntervals: 0 };
    return {
      limit: Math.max(ADAPTIVE_MIN_RATIO, currentRatio - ADAPTIVE_STEP),
      failedRatio: currentRatio,
      failedAt: nowMs,
      fastIntervals: 0,
    };
  }
  if (fps < ADAPTIVE_FAST_FPS || state.limit === Infinity) return { ...state, fastIntervals: 0 };
  const fastIntervals = state.fastIntervals + 1;
  if (fastIntervals < 2) return { ...state, fastIntervals };
  const next = Math.min(presetRatio, currentRatio + ADAPTIVE_STEP);
  const recentlyFailed = next >= state.failedRatio - 1e-6 && nowMs - state.failedAt < RETRY_AFTER_MS;
  if (recentlyFailed) return { ...state, fastIntervals };
  return { ...state, limit: next >= presetRatio - 1e-6 ? Infinity : next, fastIntervals: 0 };
}
