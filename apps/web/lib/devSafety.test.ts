import { describe, it, expect, vi, afterEach } from "vitest";
import { sideEffectsBlocked, visibilityForNewJam, devRefusesVisibility } from "./devSafety";

afterEach(() => vi.unstubAllEnvs());

describe("sideEffectsBlocked", () => {
  it("blocks under next dev", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_DEV_SIDE_EFFECTS", "");
    expect(sideEffectsBlocked("test")).toBe(true);
  });

  it("allows under next dev when explicitly opted in", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_DEV_SIDE_EFFECTS", "true");
    expect(sideEffectsBlocked("test")).toBe(false);
  });

  it("never blocks a production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_SIDE_EFFECTS", "");
    expect(sideEffectsBlocked("test")).toBe(false);
  });

  it("never blocks the test runner", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(sideEffectsBlocked("test")).toBe(false);
  });
});

describe("jam visibility under next dev", () => {
  it("saves a new jam private whatever was picked", () => {
    expect(visibilityForNewJam("official", true)).toBe("private");
    expect(visibilityForNewJam("community", true)).toBe("private");
    expect(visibilityForNewJam("community", false)).toBe("community");
  });

  it("refuses only a change to a non-private visibility", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_DEV_SIDE_EFFECTS", "");
    expect(devRefusesVisibility("private", "community")).toBe(true);
    expect(devRefusesVisibility("official", "official")).toBe(false);
    expect(devRefusesVisibility("official", "private")).toBe(false);
    expect(devRefusesVisibility("official", undefined)).toBe(false);
  });

  it("refuses nothing outside next dev or when opted in", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(devRefusesVisibility("private", "official")).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_DEV_SIDE_EFFECTS", "true");
    expect(devRefusesVisibility("private", "official")).toBe(false);
  });
});
