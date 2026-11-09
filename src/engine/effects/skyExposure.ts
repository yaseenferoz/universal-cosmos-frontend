/** Keep background light bounded when the exposure meter brightens distant worlds. */
export function skyExposureCompensation(exposure: number): number {
  return Number.isFinite(exposure) && exposure > 0
    ? 1 / Math.max(1, exposure)
    : 1;
}
