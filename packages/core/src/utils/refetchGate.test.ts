import { describe, expect, it } from "vitest";
import { createRefetchGate, mergeRefetchedSetSongs } from "./refetchGate";

describe("createRefetchGate", () => {
  it("opens once for a burst of return signals, then again after the gap", () => {
    let t = 1000;
    const gate = createRefetchGate(2000, () => t);
    expect(gate()).toBe(true);
    t += 50;
    expect(gate()).toBe(false);
    t += 1900;
    expect(gate()).toBe(false);
    t += 100;
    expect(gate()).toBe(true);
  });
});

describe("mergeRefetchedSetSongs", () => {
  const row = (id: string, position: number, extra: Partial<{ key_note: string | null; played: boolean; leader_user_ids: string[] | null }> = {}) =>
    ({ id, position, key_note: null, played: false, leader_user_ids: [], ...extra });

  it("takes the server's songs, including ones added or removed elsewhere, in position order", () => {
    const local = [row("a", 1), row("b", 2)];
    const server = [row("c", 2), row("a", 1, { key_note: "G" })];
    expect(mergeRefetchedSetSongs(local, server, () => false)).toEqual([row("a", 1, { key_note: "G" }), row("c", 2)]);
  });

  it("keeps a field whose save is still settling", () => {
    const local = [row("a", 1, { key_note: "D", played: true })];
    const server = [row("a", 1, { key_note: "G", played: false })];
    const pending = (key: string) => key === "key:a";
    expect(mergeRefetchedSetSongs(local, server, pending)).toEqual([row("a", 1, { key_note: "D", played: false })]);
  });

  it("keeps the local order while a reorder is settling", () => {
    const local = [row("a", 2), row("b", 1)];
    const server = [row("a", 1), row("b", 2)];
    expect(mergeRefetchedSetSongs(local, server, (k) => k === "order").map((s) => s.id)).toEqual(["b", "a"]);
  });
});
