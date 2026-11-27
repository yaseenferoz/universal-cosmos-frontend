import { Vector3 } from "three";
import keepins from "../../data/issKeepins.json";

/** NASA Astrobee ISS frame: +X forward, +Y starboard, +Z nadir, meters.
 * Render frame: +Y zenith, origin at the main corridor elevation (4.85m).
 * Mesh placements/scales are the pinned Astrobee model.urdf visual transforms.
 */
export function stationPoint(x: number, y: number, z: number): Vector3 {
  return new Vector3(x, 4.85 - z, y);
}
export type StationModuleId = "node_1" | "us_lab" | "node_2" | "eu_lab" | "jpm" | "node_3" | "cupola";
type Triple = readonly [number, number, number];
interface StationModule {
  id: StationModuleId; name: string; role: string; origin: Triple; rpy: Triple;
  scale: number; viewpoint: Triple; look: Triple;
}
export const stationModules: readonly StationModule[] = [
  { id: "node_1", name: "Unity", role: "Connecting node", origin: [-4.4630848, -0.0027432, 4.8508666], rpy: [0, 0, 0], scale: 1, viewpoint: [-4.46, 0, 4.85], look: [1, 0, 0] },
  { id: "us_lab", name: "Destiny", role: "U.S. laboratory", origin: [6.3085472, 0.006477, 4.834892], rpy: [3.1415, 0, 0], scale: 1.0858, viewpoint: [2, 0, 4.85], look: [1, 0, 0] },
  { id: "node_2", name: "Harmony", role: "Laboratory junction", origin: [10.9744206, -0.0112558, 4.8358958], rpy: [0, 0, 0], scale: 1, viewpoint: [9, 0, 4.85], look: [1, 0, 0] },
  { id: "eu_lab", name: "Columbus", role: "European laboratory", origin: [10.9325664, 2.3509732, 4.8505872], rpy: [0, 0, 0], scale: 1, viewpoint: [10.93, 4.5, 4.85], look: [0, 1, 0] },
  { id: "jpm", name: "Kibo", role: "Japanese laboratory", origin: [10.9358938, -2.3364698, 4.8505872], rpy: [3.1415, 0, -1.570796], scale: 1, viewpoint: [10.93, -6, 4.85], look: [0, -1, 0] },
  { id: "node_3", name: "Tranquility", role: "Life support & Cupola access", origin: [-4.4586144, -6.6356992, 4.8434244], rpy: [0, 0, 0], scale: 1, viewpoint: [-4.46, -4.5, 4.85], look: [0, -1, 0] },
  { id: "cupola", name: "Cupola", role: "Earth observation windows", origin: [-4.4586144, -6.8356992, 6.8434244], rpy: [0, 0, 0], scale: 1, viewpoint: [-4.46, -6.84, 7.2], look: [0.05, 0, 1] },
] as const;

/** Long modules get a lamp at each end of the visited span instead of one in the middle. */
const LAMP_SPACING_M = 2.5;
/** Lamps sit slightly toward the overhead (+Y), where the ISS mounts its light assemblies. */
const LAMP_OVERHEAD_OFFSET_M = 0.35;

/** Cabin lamp positions (render frame): each module's origin and viewpoint, or their midpoint when close. */
export function moduleLampPositions(): Vector3[] {
  return stationModules.flatMap((module) => {
    const origin = stationPoint(...module.origin), viewpoint = stationPoint(...module.viewpoint);
    const points = origin.distanceTo(viewpoint) > LAMP_SPACING_M ? [origin, viewpoint] : [origin.lerp(viewpoint, 0.5)];
    return points.map((point) => point.setY(point.y + LAMP_OVERHEAD_OFFSET_M));
  });
}

const volumes = keepins.sequence.map(([x0, y0, z0, x1, y1, z1]) => ({
  min: stationPoint(x0, y0, z1), max: stationPoint(x1, y1, z0),
}));
function contains(point: Vector3): boolean {
  return volumes.some(({ min, max }) => point.x >= min.x && point.x <= max.x &&
    point.y >= min.y && point.y <= max.y && point.z >= min.z && point.z <= max.z);
}
const probe = new Vector3();
/** Union of NASA free-flight keep-in volumes. Shared hatch faces stay traversable. */
export function insideStation(point: Vector3): boolean {
  if (!contains(point)) return false;
  for (const axis of ["x", "y", "z"] as const) {
    for (const sign of [-1, 1]) {
      probe.copy(point); probe[axis] += sign * 0.12;
      if (!contains(probe)) return false;
    }
  }
  return true;
}
/** Swept, axis-sliding motion prevents skipping a wall on a slow frame. */
export function moveInStation(position: Vector3, displacement: Vector3): void {
  if (![...position, ...displacement].every(Number.isFinite)) return;
  const distance = Math.min(displacement.length(), 1);
  const steps = Math.max(1, Math.ceil(distance / 0.04));
  const step = displacement.clone().normalize().multiplyScalar(distance / steps);
  const candidate = new Vector3();
  for (let index = 0; index < steps; index++) {
    for (const axis of ["x", "y", "z"] as const) {
      candidate.copy(position); candidate[axis] += step[axis];
      if (insideStation(candidate)) position.copy(candidate);
    }
  }
}
