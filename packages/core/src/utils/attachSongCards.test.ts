import { describe, expect, it } from "vitest";
import { attachSongCards } from "./attachSongCards";

const rows = [
  { id: "r1", song_id: "a", songs: { title: "A" } },
  { id: "r2", song_id: "b", songs: { title: "B" } },
  { id: "r3", song_id: "a", songs: { title: "A" } },
  { id: "r4", song_id: "c", songs: null },
];

describe("attachSongCards", () => {
  it("puts each song's card on every row of it", () => {
    const out = attachSongCards(rows, [{ song_id: "a", card: { byline: "x" } }, { song_id: "b", card: { byline: "y" } }]);
    expect(out.map((r) => (r.songs as { card?: unknown } | null)?.card)).toEqual([{ byline: "x" }, { byline: "y" }, { byline: "x" }, undefined]);
    expect(out[3].songs).toBeNull();
  });

  it("leaves the rows as they are without cards, so they fall back to the byline", () => {
    expect(attachSongCards(rows, null)).toBe(rows);
    expect(attachSongCards(rows, [])).toBe(rows);
  });
});
