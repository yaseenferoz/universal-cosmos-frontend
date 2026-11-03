import { beforeEach, describe, expect, it } from "vitest";
import { useRenderingStore } from "./renderingStore";

const initial = useRenderingStore.getState();
beforeEach(() => useRenderingStore.setState(initial, true));
describe("global photographic controls", () => {
  it("freezes adapted exposure when automatic metering is disabled", () => {
    useRenderingStore.setState({
      telemetry: { ...initial.telemetry, effectiveExposureEv: -14.5 },
    });
    useRenderingStore.getState().setAutomaticExposure(false);
    expect(useRenderingStore.getState().exposureEv).toBe(-14.5);
    useRenderingStore.getState().setAutomaticExposure(true);
    expect(useRenderingStore.getState().exposureEv).toBe(0);
  });
  it("bounds exposure separately for compensation and manual operation", () => {
    useRenderingStore.getState().setExposure(-30);
    expect(useRenderingStore.getState().exposureEv).toBe(-6);
    useRenderingStore.getState().setAutomaticExposure(false);
    useRenderingStore.getState().setExposure(-30);
    expect(useRenderingStore.getState().exposureEv).toBe(-20);
    useRenderingStore.getState().setExposure(NaN);
    expect(useRenderingStore.getState().exposureEv).toBe(0);
  });
  it("rejects observation commands inside the Sun or beyond the prepared range", () => {
    const state = useRenderingStore.getState();
    [0, NaN, Infinity, 100].forEach(state.observeSunAt);
    expect(useRenderingStore.getState().solarDistanceRequest).toBe(0);
    state.observeSunAt(5.2);
    expect(useRenderingStore.getState()).toMatchObject({
      requestedDistanceAu: 5.2,
      solarDistanceRequest: 1,
    });
  });
  it("restores scene metering without changing optical controls or navigation", () => {
    const state = useRenderingStore.getState();
    state.setAutomaticExposure(false);
    state.setExposure(-18);
    state.setSolarFilter(true);
    state.setBloomStrength(0.6);
    state.setCorona(false);
    state.lookAtSun();
    state.resetExposure();
    expect(useRenderingStore.getState()).toMatchObject({
      automaticExposure: true, exposureEv: 0, solarFilter: false,
      bloomStrength: 0.6, corona: false, lookAtSunRequest: 1,
    });
  });
  it("bounds optical bloom and keeps diagnostic toggles independent of camera commands", () => {
    const state = useRenderingStore.getState();
    state.setBloomStrength(5);
    expect(useRenderingStore.getState().bloomStrength).toBe(1);
    state.setBloomStrength(-1);
    expect(useRenderingStore.getState().bloomStrength).toBe(0);
    state.setBloomStrength(NaN);
    state.setDiagnosticsEnabled(true);
    expect(useRenderingStore.getState()).toMatchObject({
      bloomStrength: 0.35, diagnosticsEnabled: true,
      daySideRequest: 0, lookAtSunRequest: 0,
    });
  });
});
