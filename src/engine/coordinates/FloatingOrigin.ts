import { Vector3 } from "three";

/** CPU doubles retain the absolute display origin; the GPU receives small relative values. */
export class FloatingOrigin {
  readonly offset = new Vector3();
  constructor(readonly threshold = 256) {}
  rebase(cameraPosition: Vector3): Vector3 | null {
    if (cameraPosition.length() < this.threshold) return null;
    const shift = cameraPosition.clone();
    this.offset.add(shift);
    return shift;
  }
  toLocal(global: Vector3, target = new Vector3()): Vector3 {
    return target.copy(global).sub(this.offset);
  }
  toGlobal(local: Vector3, target = new Vector3()): Vector3 {
    return target.copy(local).add(this.offset);
  }
}
