import { gsap } from "gsap";
import { Vector3 } from "three";
import { interpolateDirection } from "./CameraLookController";

/** GSAP animates a scalar; the render loop samples it against a moving destination. */
export class FlightController {
  readonly startPosition = new Vector3();
  readonly startTarget = new Vector3();
  readonly offset = new Vector3();
  readonly state = { progress: 1 };
  private tween: gsap.core.Tween | null = null;
  private active = false;
  private orbit: {
    startOffset: Vector3;
    startTargetOffset: Vector3;
    minimumRadius: number;
  } | null = null;
  get flying(): boolean {
    return this.active;
  }
  get orbiting(): boolean {
    return this.active && this.orbit !== null;
  }
  start(
    position: Vector3,
    target: Vector3,
    offset: Vector3,
    instant: boolean,
  ): void {
    this.cancel();
    this.startPosition.copy(position);
    this.startTarget.copy(target);
    this.offset.copy(offset);
    this.state.progress = instant ? 1 : 0;
    this.active = true;
    if (!instant)
      this.tween = gsap.to(this.state, {
        progress: 1,
        duration: 1.65,
        ease: "power2.inOut",
      });
  }
  /** A same-body transfer travels around its surface, never through the solid interior. */
  startOrbit(
    position: Vector3,
    target: Vector3,
    center: Vector3,
    offset: Vector3,
    minimumRadius: number,
    instant: boolean,
  ): void {
    this.start(position, target, offset, instant);
    this.orbit = {
      startOffset: position.clone().sub(center),
      startTargetOffset: target.clone().sub(center),
      minimumRadius: Math.max(0, minimumRadius),
    };
  }
  sample(destination: Vector3): { position: Vector3; target: Vector3 } {
    let position = this.startPosition
      .clone()
      .lerp(destination.clone().add(this.offset), this.state.progress);
    let target = this.startTarget
      .clone()
      .lerp(destination, this.state.progress);
    if (this.orbit) {
      const startRadius = Math.max(
        this.orbit.minimumRadius,
        this.orbit.startOffset.length(),
      );
      const endRadius = Math.max(
        this.orbit.minimumRadius,
        this.offset.length(),
      );
      const radius =
        startRadius + (endRadius - startRadius) * this.state.progress;
      position = interpolateDirection(
        this.orbit.startOffset,
        this.offset,
        this.state.progress,
      )
        .multiplyScalar(radius)
        .add(destination);
      target = this.orbit.startTargetOffset
        .clone()
        .multiplyScalar(1 - this.state.progress)
        .add(destination);
    }
    if (this.state.progress >= 1) this.active = false;
    return { position, target };
  }
  cancel(): void {
    this.tween?.kill();
    this.tween = null;
    this.active = false;
    this.orbit = null;
  }
  pause(): void {
    this.tween?.pause();
  }
  resume(): void {
    this.tween?.resume();
  }
}
