import { describe, expect, it } from "vitest";
import { mergeOwnKnowledge } from "./ownSetKnowledge";

const knowledge = [
  { user_id: "me", song_id: "a", confidence: "lead", key_note: null },
  { user_id: "me", song_id: "b", confidence: "support", key_note: "D" },
  { user_id: "them", song_id: "a", confidence: "lead", key_note: "G" },
];
const songs = new Set(["a", "b"]);

describe("mergeOwnKnowledge", () => {
  it("takes the viewer's fresh key and part on the set's songs, leaving everyone else's", () => {
    const out = mergeOwnKnowledge(knowledge, "me", [
      { song_id: "a", confidence: "lead", key_note: "C" },
      { song_id: "b", confidence: "lead", key_note: "D" },
      { song_id: "z", confidence: "lead", key_note: "E" },
    ], songs, true);
    expect(out).toEqual([
      { user_id: "them", song_id: "a", confidence: "lead", key_note: "G" },
      { user_id: "me", song_id: "a", confidence: "lead", key_note: "C" },
      { user_id: "me", song_id: "b", confidence: "lead", key_note: "D" },
    ]);
  });

  it("drops a song the viewer no longer has, or only has as known", () => {
    const out = mergeOwnKnowledge(knowledge, "me", [{ song_id: "a", confidence: "known", key_note: "C" }], songs, true);
    expect(out).toEqual([{ user_id: "them", song_id: "a", confidence: "lead", key_note: "G" }]);
  });

  it("leaves the set alone for a viewer who isn't a participant", () => {
    expect(mergeOwnKnowledge(knowledge, "me", [], songs, false)).toBe(knowledge);
  });
});
