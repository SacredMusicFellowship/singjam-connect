import { describe, it, expect, vi, afterEach } from "vitest";
import { sideEffectsBlocked, ticketingBlocked, visibilityForNewJam, devRefusesVisibility } from "./devSafety";

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

describe("ticketingBlocked", () => {
  const underNextDev = (env: { E2E?: string; NEXT_PUBLIC_SUPABASE_URL?: string }) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_DEV_SIDE_EFFECTS", "true");
    vi.stubEnv("E2E", env.E2E ?? "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  };

  it("blocks under next dev, even when side effects are opted in", () => {
    underNextDev({ NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co" });
    expect(ticketingBlocked("test")).toBe(true);
  });

  it("allows the e2e suite against a local Supabase", () => {
    underNextDev({ E2E: "1", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" });
    expect(ticketingBlocked("test")).toBe(false);
    underNextDev({ E2E: "1", NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" });
    expect(ticketingBlocked("test")).toBe(false);
  });

  it("stays blocked with E2E=1 against a hosted Supabase", () => {
    underNextDev({ E2E: "1", NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co" });
    expect(ticketingBlocked("test")).toBe(true);
    underNextDev({ E2E: "1", NEXT_PUBLIC_SUPABASE_URL: "https://localhost.evil.example" });
    expect(ticketingBlocked("test")).toBe(true);
  });

  it("stays blocked against a local Supabase without E2E=1", () => {
    underNextDev({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" });
    expect(ticketingBlocked("test")).toBe(true);
  });

  it("stays blocked with E2E=1 and no Supabase URL", () => {
    underNextDev({ E2E: "1" });
    expect(ticketingBlocked("test")).toBe(true);
  });

  it("never blocks a production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(ticketingBlocked("test")).toBe(false);
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
