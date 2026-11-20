import { describe, expect, it, vi } from "vitest";
import { resolveSongId } from "./resolveSongId";

const db = (data: unknown, error: unknown = null) => ({ rpc: vi.fn(async () => ({ data, error })) }) as any;

describe("resolveSongId", () => {
  it("passes an id straight through without a lookup", async () => {
    const client = db(null);
    expect(await resolveSongId(client, "632931c5-ccfd-4ba2-b217-3aba880b68cf")).toBe("632931c5-ccfd-4ba2-b217-3aba880b68cf");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("resolves a current or old slug through the database", async () => {
    const client = db("song-1");
    expect(await resolveSongId(client, "twist-and-shout")).toBe("song-1");
    expect(client.rpc).toHaveBeenCalledWith("resolve_song_slug", { p_slug: "twist-and-shout" });
  });

  it("returns null for a slug no song has had", async () => {
    expect(await resolveSongId(db(null), "no-such-song")).toBeNull();
  });

  it("throws instead of reporting a missing song when the lookup fails", async () => {
    await expect(resolveSongId(db(null, new Error("down")), "x")).rejects.toThrow("down");
  });
});
