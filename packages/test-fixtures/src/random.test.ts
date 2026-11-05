import { describe, expect, it } from "vitest";
import { createRng, stableShortCode, stableUuid } from "./random";

describe("createRng", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 5 }, a.next)).toEqual(Array.from({ length: 5 }, b.next));
  });

  it("gives a different sequence for a different seed", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it("keeps int() within its bounds", () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const n = rng.int(3, 6);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it("samples without repeats", () => {
    const picked = createRng(9).sample([1, 2, 3, 4, 5], 5);
    expect(new Set(picked).size).toBe(5);
  });
});

describe("stableUuid", () => {
  it("is a valid v4-shaped uuid that depends only on the key", () => {
    const id = stableUuid("member:host");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(stableUuid("member:host")).toBe(id);
    expect(stableUuid("member:member")).not.toBe(id);
  });
});

describe("stableShortCode", () => {
  it("uses the same 8-character alphabet as the database generators", () => {
    expect(stableShortCode("jam:x")).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/);
    expect(stableShortCode("jam:x")).toBe(stableShortCode("jam:x"));
  });
});
