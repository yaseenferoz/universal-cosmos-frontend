import {
  MathUtils,
  Frustum,
  Matrix4,
  PerspectiveCamera,
  Sphere,
  Vector3,
  type WebGLRenderer,
} from "three";
import type { CelestialObject, ObjectId } from "../../types/celestial";
import type { SolarTelemetry } from "../../types/solar";
import type { Cartesian, ViewMode } from "../coordinates/CoordinateSystem";
import { KM_PER_EXPLORATION_UNIT } from "../coordinates/CoordinateSystem";
import type { FloatingOrigin } from "../coordinates/FloatingOrigin";
import type { CelestialBody } from "../objects/CelestialBody";
import { SolarExposure } from "./SolarExposure";
import { solarDiameterPixels } from "./SunRenderer";
import {
  ASTRONOMICAL_UNIT_KM,
  NOMINAL_SOLAR_RADIUS_KM,
  angularDiameterRad,
  relativeSolarIrradiance,
  solarIrradianceWm2,
  solarVisibility,
} from "./solarMath";

interface SolarFrame {
  positionsKm: Map<ObjectId, Cartesian>;
  renderPositions: Map<ObjectId, Vector3>;
  origin: FloatingOrigin;
  camera: PerspectiveCamera;
  viewMode: ViewMode;
  referenceId: ObjectId;
  delta: number;
  viewportHeight: number;
  observerSurface?: { bodyId: ObjectId; radiusKm: number };
  localBodyId?: ObjectId;
}

/** Keeps scientific photometry and camera-relative rendering outside the UI/animation host. */
export class SolarScene {
  readonly exposure = new SolarExposure();
  coronaEnabled = true;
  glareStrength = 0.35;
  lunarIlluminationFraction = 1;
  telemetry: SolarTelemetry = {
    distanceAu: 1,
    angularDiameterDeg: 0.5329,
    irradianceWm2: 1361,
    visibleFraction: 1,
    effectiveExposureEv: 0,
    physicalScale: true,
  };
  private readonly sunRadiusKm: number;
  private readonly viewFrustum = new Frustum();
  private readonly viewProjection = new Matrix4();
  private readonly solarBounds = new Sphere();
  constructor(
    private readonly objects: readonly CelestialObject[],
    private readonly bodies: Map<ObjectId, CelestialBody>,
    private readonly renderer: WebGLRenderer,
  ) {
    this.sunRadiusKm =
      objects.find((body) => body.id === "sun")?.radiusKm ??
      NOMINAL_SOLAR_RADIUS_KM;
  }

  update(frame: SolarFrame): void {
    const {
      positionsKm,
      renderPositions,
      origin,
      camera,
      viewMode,
      referenceId,
    } = frame;
    const physical = viewMode === "exploration";
    const sunKm = new Vector3().copy(
      positionsKm.get("sun") ?? { x: 0, y: 0, z: 0 },
    );
    const sunRender = renderPositions.get("sun") ?? new Vector3();
    const sunLocal = origin.toLocal(sunRender);
    const cameraGlobal = origin.toGlobal(camera.position);
    const cameraKm = cameraGlobal
      .clone()
      .multiplyScalar(KM_PER_EXPLORATION_UNIT);
    const distanceKm = Math.max(
      this.sunRadiusKm * 1.00001,
      cameraKm.distanceTo(sunKm),
    );
    const distanceAu = distanceKm / ASTRONOMICAL_UNIT_KM;
    const diameter = angularDiameterRad(this.sunRadiusKm, distanceKm);
    // A measured valley can lie below the mean-radius sphere. Use its sampled local
    // radial ground for the analytic horizon; actual hills still occlude the rendered Sun.
    const occluders = this.objects
      .filter(
        (object) =>
          object.id !== "sun",
      )
      .map((object) => ({
        positionKm: positionsKm.get(object.id)!,
        radiusKm: frame.observerSurface?.bodyId === object.id ? frame.observerSurface.radiusKm : object.radiusKm,
      }));
    const visibleFraction = physical
      ? solarVisibility(cameraKm, sunKm, occluders, this.sunRadiusKm)
      : 1;
    // The observer's own lunar horizon affects the image, never the light on the
    // whole terrain pass. Only external bodies attenuate that scene's source.
    const localBodyId = frame.localBodyId ?? "moon";
    const lunarReceiver = frame.observerSurface ? cameraKm : (positionsKm.get(localBodyId) ?? cameraKm);
    this.lunarIlluminationFraction = physical ? solarVisibility(
      lunarReceiver,
      sunKm,
      this.objects.filter((object) => object.id !== "sun" && object.id !== localBodyId)
        .map((object) => ({ positionKm: positionsKm.get(object.id)!, radiusKm: object.radiusKm })),
      this.sunRadiusKm,
    ) : 1;

    // Bounds include the receiver's full radius so a localized eclipse is not rejected at its center.
    for (const body of this.bodies.values()) {
      if (body.data.id === "sun") continue;
      const position = new Vector3().copy(positionsKm.get(body.data.id)!);
      const toSun = sunKm.clone().sub(position);
      const sunDistance = Math.max(this.sunRadiusKm, toSun.length());
      const candidates = physical
        ? this.objects
            .filter((candidate) => {
              if (candidate.id === "sun" || candidate.id === body.data.id)
                return false;
              const offset = new Vector3()
                .copy(positionsKm.get(candidate.id)!)
                .sub(position);
              const distance = offset.length();
              if (distance <= body.data.radiusKm || distance >= sunDistance)
                return false;
              const reach = Math.asin(
                Math.min(
                  1,
                  (candidate.radiusKm + body.data.radiusKm) / distance,
                ),
              );
              return (
                offset.angleTo(toSun) <=
                reach + Math.asin(Math.min(1, this.sunRadiusKm / sunDistance))
              );
            })
            .sort((a, b) => {
              const distanceA = position.distanceTo(
                new Vector3().copy(positionsKm.get(a.id)!),
              );
              const distanceB = position.distanceTo(
                new Vector3().copy(positionsKm.get(b.id)!),
              );
              return b.radiusKm / distanceB - a.radiusKm / distanceA;
            })
            .slice(0, 4)
        : [];
      body.solarLighting.update({
        sunPosition: sunLocal,
        sunRadius:
          this.bodies.get("sun")?.renderRadius ??
          this.sunRadiusKm / KM_PER_EXPLORATION_UNIT,
        irradiance: physical
          ? relativeSolarIrradiance(sunDistance / ASTRONOMICAL_UNIT_KM)
          : 1,
        occluders: candidates.map((object) => ({
          position: origin.toLocal(renderPositions.get(object.id)!),
          radius: this.bodies.get(object.id)!.renderRadius,
        })),
      });
    }

    const halfFov = MathUtils.degToRad(camera.getEffectiveFOV() / 2);
    const drawingBufferHeight = frame.viewportHeight * this.renderer.getPixelRatio();
    camera.updateMatrixWorld(true);
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.viewFrustum.setFromProjectionMatrix(this.viewProjection);
    this.solarBounds.center.copy(sunLocal);
    this.solarBounds.radius = this.bodies.get("sun")?.renderRadius ?? this.sunRadiusKm / KM_PER_EXPLORATION_UNIT;
    // Meter only a disk intersecting the actual viewport, including portrait view offsets.
    // A diagonal cone incorrectly includes sources above/below a landscape frame.
    const sunInView = this.viewFrustum.intersectsSphere(this.solarBounds);
    const referencePosition = positionsKm.get(referenceId);
    const referenceAu =
      referenceId !== "sun" && referencePosition
        ? new Vector3().copy(referencePosition).distanceTo(sunKm) /
          ASTRONOMICAL_UNIT_KM
        : distanceAu;
    const exposure = this.exposure.update(
      {
        overview: !physical,
        surfaceIrradiance:
          referenceId === "sun"
            ? Math.min(1, relativeSolarIrradiance(referenceAu))
            : relativeSolarIrradiance(referenceAu),
        sunInView,
        solarVisibleFraction: visibleFraction,
        solarDiskSolidAngle: 2 * Math.PI * (1 - Math.cos(diameter / 2)),
        viewSolidAngle:
          4 *
          Math.asin(
            Math.sin(halfFov) *
              Math.sin(Math.atan(Math.tan(halfFov) * camera.aspect)),
          ),
        solarTarget: referenceId === "sun",
        solarDiameterPixels: solarDiameterPixels(
          this.sunRadiusKm, distanceKm, drawingBufferHeight, halfFov * 2,
        ),
      },
      frame.delta,
    );
    this.renderer.toneMappingExposure = exposure;

    const sun = this.bodies.get("sun");
    if (sun?.sunRenderer) {
      const masks = physical
        ? occluders
            .flatMap((occluder) => {
              const offset = new Vector3()
                .copy(occluder.positionKm)
                .sub(cameraKm);
              const distance = offset.length();
              if (distance <= 0 || distance >= distanceKm - this.sunRadiusKm)
                return [];
              const angularRadiusRad = Math.asin(
                Math.min(1, occluder.radiusKm / distance),
              );
              if (
                offset.angleTo(sunKm.clone().sub(cameraKm)) >
                angularRadiusRad + diameter * 2
              )
                return [];
              return [{ direction: offset.normalize(), angularRadiusRad }];
            })
            .sort((a, b) => b.angularRadiusRad - a.angularRadiusRad)
            .slice(0, 4)
        : [];
      sun.sunRenderer.setCoronaEnabled(this.coronaEnabled && physical);
      sun.sunRenderer.setGlareStrength(physical ? this.glareStrength : 0);
      sun.sunRenderer.update({
        camera,
        renderRadius: sun.renderRadius,
        exposure,
        viewportHeight: drawingBufferHeight,
        visibleSolarFraction: visibleFraction,
        occluders: masks,
      });
    }
    this.telemetry = {
      distanceAu,
      angularDiameterDeg: MathUtils.radToDeg(diameter),
      irradianceWm2: solarIrradianceWm2(distanceAu),
      visibleFraction,
      effectiveExposureEv: this.exposure.valueEv,
      physicalScale: physical,
    };
  }
}
