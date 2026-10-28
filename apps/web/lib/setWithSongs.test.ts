import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findSetWithSongs } from "./setWithSongs";

function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq"]) c[m] = vi.fn().mockReturnValue(c);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return c;
}

const admin = (...results: any[]) => {
  const from = vi.fn();
  for (const r of results) from.mockReturnValueOnce(chain(r));
  return { from } as unknown as SupabaseClient & { from: ReturnType<typeof vi.fn> };
};

describe("findSetWithSongs", () => {
  it("returns null when the event has no set", async () => {
    const a = admin({ data: null });
    expect(await findSetWithSongs(a, "jam-1")).toBeNull();
    expect(a.from).toHaveBeenCalledTimes(1);
  });

  it("returns null when the set has no songs", async () => {
    const a = admin({ data: { id: "set-1" } }, { count: 0 });
    expect(await findSetWithSongs(a, "jam-1")).toBeNull();
  });

  it("returns null when the count can't be read", async () => {
    const a = admin({ data: { id: "set-1" } }, { count: null, error: { message: "boom" } });
    expect(await findSetWithSongs(a, "jam-1")).toBeNull();
  });

  it("returns the set once it has a song", async () => {
    const a = admin({ data: { id: "set-1" } }, { count: 3 });
    expect(await findSetWithSongs(a, "jam-1")).toEqual({ id: "set-1" });
    expect(a.from).toHaveBeenNthCalledWith(2, "set_songs");
  });
});
