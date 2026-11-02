import { describe, it, expect } from "vitest";
import { isMusicalKey, normalizeSetSongNote, SET_SONG_NOTE_MAX } from "./musicalKeys";

describe("isMusicalKey", () => {
  it("accepts listed keys", () => {
    expect(isMusicalKey("G")).toBe(true);
    expect(isMusicalKey("Bb")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isMusicalKey("H")).toBe(false);
    expect(isMusicalKey("g")).toBe(false);
    expect(isMusicalKey("")).toBe(false);
    expect(isMusicalKey(null)).toBe(false);
  });
});

describe("normalizeSetSongNote", () => {
  it("trims the note", () => {
    expect(normalizeSetSongNote("  Capo 3  ")).toBe("Capo 3");
  });

  it("turns blank or null into null so the note is cleared", () => {
    expect(normalizeSetSongNote("   ")).toBeNull();
    expect(normalizeSetSongNote("")).toBeNull();
    expect(normalizeSetSongNote(null)).toBeNull();
  });

  it("rejects non-strings and notes over the limit", () => {
    expect(normalizeSetSongNote(3)).toBeUndefined();
    expect(normalizeSetSongNote(undefined)).toBeUndefined();
    expect(normalizeSetSongNote("x".repeat(SET_SONG_NOTE_MAX + 1))).toBeUndefined();
  });

  it("allows a note exactly at the limit", () => {
    expect(normalizeSetSongNote("x".repeat(SET_SONG_NOTE_MAX))).toHaveLength(SET_SONG_NOTE_MAX);
  });
});
