import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findEventSet } from "./eventSet";

function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq"]) c[m] = vi.fn().mockReturnValue(c);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  return c;
}

const admin = (result: any) =>
  ({ from: vi.fn().mockReturnValue(chain(result)) }) as unknown as SupabaseClient;

describe("findEventSet", () => {
  it("returns null when the event has no set", async () => {
    expect(await findEventSet(admin({ data: null }), "jam-1")).toBeNull();
  });

  it("returns the set even before it has any songs", async () => {
    expect(await findEventSet(admin({ data: { id: "set-1" } }), "jam-1")).toEqual({ id: "set-1" });
  });

  it("returns null when the lookup fails", async () => {
    expect(await findEventSet(admin({ data: null, error: { message: "boom" } }), "jam-1")).toBeNull();
  });
});
