import { adaptExposureEv, SOLAR_DISPLAY_RADIANCE, SOLAR_LIMB_DARKENING } from "./solarMath";
import { unresolvedSolarWeight } from "./SunRenderer";

export interface ExposureMeter {
  overview: boolean;
  surfaceIrradiance: number;
  sunInView: boolean;
  solarVisibleFraction: number;
  solarDiskSolidAngle: number;
  viewSolidAngle: number;
  solarTarget: boolean;
  /** Physical disk diameter in drawing-buffer pixels, before optical sampling. */
  solarDiameterPixels: number;
}

/** Match the renderer's 2px Gaussian optical kernel without enlarging the physical disk. */
export function solarTargetPixelWeight(diameterPixels: number): number {
  if (!Number.isFinite(diameterPixels) || diameterPixels <= 0) return 0;
  const unresolved = unresolvedSolarWeight(diameterPixels);
  if (unresolved === 0) return 1;
  const diskArea = Math.PI * (diameterPixels / 2) ** 2;
  // SunRenderer distributes disk-mean radiance over4pixels; SolarShaders normalizes
  // its Gaussian by0.2543. Meter its peak, so filtered subpixel signals remain bounded.
  const opticalKernelArea = 4 * 0.2543;
  const unresolvedPeak = Math.min(1, (1 - SOLAR_LIMB_DARKENING / 3) * diskArea / opticalKernelArea);
  return 1 - unresolved + unresolved * unresolvedPeak;
}

/** Analytic scene metering, not GPU histogram metering or calibrated photographic EV. */
export function meteredExposureEv(meter: ExposureMeter, solarFilter = false): number {
  if (meter.overview) return 0;
  const solarWeight = solarFilter
    ? solarTargetPixelWeight(meter.solarDiameterPixels)
    : Math.min(
        1,
        meter.solarDiskSolidAngle / Math.max(0.001, meter.viewSolidAngle),
      );
  const sunMeter = meter.sunInView
    ? (SOLAR_DISPLAY_RADIANCE *
        Math.max(0, meter.solarVisibleFraction) *
        solarWeight) /
      2
    : 0;
  const surfaceMeter = Math.max(0.00025, meter.surfaceIrradiance);
  // Ordinary viewing prioritizes the selected world's illumination. A tiny Sun
  // in the viewport may reduce that exposure by at most1EV, never black out a planet.
  let brightness = Math.max(surfaceMeter, solarFilter ? sunMeter : Math.min(sunMeter, surfaceMeter * 2));
  if (!solarFilter && meter.solarTarget && meter.sunInView && meter.solarVisibleFraction > 0) {
    // Approaching the Sun, adapt to the disk as an eye or camera would: blend toward
    // metering on mean disk radiance as the disk fills more of the view (log space).
    const fill = Math.min(1, meter.solarDiskSolidAngle / Math.max(0.001, meter.viewSolidAngle));
    const t = Math.max(0, Math.min(1, (fill - 0.004) / (0.12 - 0.004)));
    const adapt = t * t * (3 - 2 * t);
    // Disk centre lands mid-curve so the ~60% centre-to-limb falloff stays visible.
    const diskMeter = SOLAR_DISPLAY_RADIANCE * (1 - SOLAR_LIMB_DARKENING / 3) * 1.8;
    brightness = 2 ** ((1 - adapt) * Math.log2(brightness) + adapt * Math.log2(Math.max(brightness, diskMeter)));
  }
  return Math.max(-20, Math.min(12, -Math.log2(brightness)));
}

export class SolarExposure {
  private adaptedEv = 0;
  private wasAutomatic = true;
  private wasFiltering = false;
  private recoveringFilter = false;
  automatic = true;
  solarFilter = false;
  compensationEv = 0;
  valueEv = 0;

  update(meter: ExposureMeter, delta: number): number {
    if (this.automatic) {
      const targetEv = meteredExposureEv(meter, this.solarFilter);
      const filteringVisibleSun = this.solarFilter && meter.sunInView && meter.solarVisibleFraction > 0;
      // Recover smoothly but promptly after filtered/manual inspection. Ordinary
      // travel between worlds retains the normal1.2s brightening time constant.
      if ((this.wasFiltering || !this.wasAutomatic) && !filteringVisibleSun) this.recoveringFilter = true;
      if (filteringVisibleSun) this.recoveringFilter = false;
      this.adaptedEv = adaptExposureEv(
        this.adaptedEv,
        targetEv,
        delta,
        this.recoveringFilter ? 0.2 : 1.2,
        0.3,
      );
      if (Math.abs(this.adaptedEv - targetEv) < 0.1) this.recoveringFilter = false;
      this.valueEv = Math.max(
        -20,
        Math.min(12, this.adaptedEv + this.compensationEv),
      );
    } else {
      this.valueEv = Math.max(-20, Math.min(12, this.compensationEv));
      this.adaptedEv = this.valueEv;
      this.recoveringFilter = false;
    }
    this.wasAutomatic = this.automatic;
    this.wasFiltering = this.automatic && this.solarFilter && meter.sunInView && meter.solarVisibleFraction > 0;
    return 2 ** this.valueEv;
  }
}
