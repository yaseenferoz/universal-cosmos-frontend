import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import type { ObjectId } from "../../types/celestial";
import type { DiagnosticTelemetry } from "../../types/diagnostics";
import {
  KM_PER_EXPLORATION_UNIT,
  type Cartesian,
  type ViewMode,
} from "../coordinates/CoordinateSystem";
import type { FloatingOrigin } from "../coordinates/FloatingOrigin";
import { angularDiameterRad } from "../solar/solarMath";

interface DiagnosticFrame {
  camera: PerspectiveCamera;
  origin: FloatingOrigin;
  positionsKm: ReadonlyMap<ObjectId, Cartesian>;
  renderPositions: ReadonlyMap<ObjectId, Vector3>;
  sunRenderRadius: number;
  selectedId: ObjectId | null;
  viewMode: ViewMode;
  effectiveExposureEv: number;
  automaticExposure: boolean;
  lunarActive: boolean;
}

const plain = ({ x, y, z }: Cartesian): Cartesian => ({ x, y, z });

/** A low-frequency snapshot, independent of React and GPU precision. */
export function sampleSceneDiagnostics(
  frame: DiagnosticFrame,
): DiagnosticTelemetry {
  const observer = frame.origin.toGlobal(frame.camera.position);
  const sun = frame.renderPositions.get("sun") ?? new Vector3();
  const toSun = sun.clone().sub(observer);
  const renderDistance = toSun.length();
  const physical = frame.viewMode === "exploration";
  const observerKm = physical
    ? observer.clone().multiplyScalar(KM_PER_EXPLORATION_UNIT)
    : null;
  const selectedPosition = frame.selectedId
    ? frame.positionsKm.get(frame.selectedId)
    : undefined;
  const selectedDirection =
    selectedPosition && frame.selectedId !== "sun"
      ? new Vector3()
          .copy(frame.positionsKm.get("sun") ?? { x: 0, y: 0, z: 0 })
          .sub(selectedPosition)
          .normalize()
      : null;
  const phase =
    selectedDirection && selectedPosition && observerKm
      ? MathUtils.radToDeg(
          selectedDirection.angleTo(observerKm.clone().sub(selectedPosition)),
        )
      : null;
  const canNavigate =
    physical && !frame.lunarActive && frame.renderPositions.has("sun");
  return {
    scaleMode: frame.viewMode,
    cameraPositionKm: observerKm ? plain(observerKm) : null,
    cameraSunDistanceKm: physical
      ? renderDistance * KM_PER_EXPLORATION_UNIT
      : null,
    sunAngularDiameterRad: angularDiameterRad(
      frame.sunRenderRadius,
      renderDistance,
    ),
    cameraFovDeg: frame.camera.getEffectiveFOV(),
    cameraSunDirection: plain(toSun.normalize()),
    selectedId: frame.selectedId,
    selectedPositionKm: selectedPosition ? plain(selectedPosition) : null,
    planetSunDirection: selectedDirection ? plain(selectedDirection) : null,
    selectedPhaseAngleDeg: phase,
    effectiveExposureEv: frame.effectiveExposureEv,
    automaticExposure: frame.automaticExposure,
    canLookAtSun: canNavigate,
    canGoToDaySide:
      canNavigate && !!selectedPosition && frame.selectedId !== "sun",
  };
}
