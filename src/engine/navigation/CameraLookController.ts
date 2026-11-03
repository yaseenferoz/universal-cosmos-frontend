import { gsap } from "gsap";
import { MathUtils, Quaternion, Vector3 } from "three";

/** Shortest rotation, including opposite directions without crossing a zero vector. */
export function interpolateDirection(
  start: Vector3,
  end: Vector3,
  progress: number,
): Vector3 {
  const from = start.clone().normalize();
  const to = end.clone().normalize();
  if (from.lengthSq() === 0) return to;
  if (to.lengthSq() === 0) return from;
  const rotation = new Quaternion().setFromUnitVectors(from, to);
  return from
    .applyQuaternion(
      new Quaternion().slerp(rotation, MathUtils.clamp(progress, 0, 1)),
    )
    .normalize();
}

/** Rotation-only command: the engine retains the observer's physical position. */
export class CameraLookController {
  readonly state = { progress: 1 };
  private readonly startDirection = new Vector3(0, 0, -1);
  private tween: gsap.core.Tween | null = null;
  private running = false;
  get active(): boolean {
    return this.running;
  }

  start(direction: Vector3, instant: boolean): void {
    this.cancel();
    this.startDirection.copy(direction).normalize();
    this.state.progress = instant ? 1 : 0;
    this.running = true;
    if (!instant)
      this.tween = gsap.to(this.state, {
        progress: 1,
        duration: 1.15,
        ease: "power2.inOut",
      });
  }
  sample(towardSun: Vector3): Vector3 {
    const direction = interpolateDirection(
      this.startDirection,
      towardSun,
      this.state.progress,
    );
    if (this.state.progress >= 1) this.running = false;
    return direction;
  }
  cancel(): void {
    this.tween?.kill();
    this.tween = null;
    this.running = false;
  }
  pause(): void {
    this.tween?.pause();
  }
  resume(): void {
    this.tween?.resume();
  }
}
