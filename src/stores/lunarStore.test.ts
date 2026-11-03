import { beforeEach, describe, expect, it } from "vitest";
import { useLunarStore } from "./lunarStore";

const initial = useLunarStore.getState();
beforeEach(() => useLunarStore.setState(initial, true));
describe("lunar surface commands", () => {
  it("bounds observer height and rejects nonfinite settings", () => {
    const state = useLunarStore.getState();
    state.setEyeHeight(-100);
    expect(useLunarStore.getState()).toMatchObject({
      eyeHeightM: 0.8,
    });
    state.setEyeHeight(NaN);
    expect(useLunarStore.getState()).toMatchObject({
      eyeHeightM: 1.7,
    });
  });
  it("clears held movement on return and session teardown", () => {
    const state = useLunarStore.getState();
    state.setMovement(1, -1);
    state.returnToOrbit();
    expect(useLunarStore.getState().movement).toEqual({ forward: 0, right: 0 });
    state.setMovement(1, 1);
    state.resetSession();
    expect(useLunarStore.getState().movement).toEqual({ forward: 0, right: 0 });
  });
});
