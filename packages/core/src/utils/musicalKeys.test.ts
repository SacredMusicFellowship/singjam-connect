import { describe, it, expect } from "vitest";
import { isMusicalKey, keyForNewLeaders, keyMode, keyWithMode, normalizeSetSongNote, SET_SONG_NOTE_MAX } from "./musicalKeys";

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

describe("keyForNewLeaders", () => {
  const keys = new Map([["ana", "G"], ["ben", "D"]]);

  it("uses the newly selected leader's key", () => {
    expect(keyForNewLeaders([], ["ana"], keys)).toBe("G");
    expect(keyForNewLeaders(["ana"], ["ana", "ben"], keys)).toBe("D");
  });

  it("leaves the key alone when a leader is only removed", () => {
    expect(keyForNewLeaders(["ana", "ben"], ["ana"], keys)).toBeUndefined();
    expect(keyForNewLeaders(["ana"], [], keys)).toBeUndefined();
  });

  it("leaves the key alone when the new leader has no personal key", () => {
    expect(keyForNewLeaders([], ["cal"], keys)).toBeUndefined();
  });

  it("skips a new leader without a key in favour of one who has a key", () => {
    expect(keyForNewLeaders([], ["cal", "ben"], keys)).toBe("D");
  });
});

describe("keyMode", () => {
  it("reads a single major, minor or modal tonality", () => {
    expect(keyWithMode("A", keyMode("Minor"), "short")).toBe("A min");
    expect(keyWithMode("A", keyMode("Minor"), "full")).toBe("A minor");
    expect(keyWithMode("A", keyMode("Major"), "short")).toBe("A maj");
    expect(keyWithMode("A", keyMode("Major"), "full")).toBe("A major");
    expect(keyWithMode("D", keyMode(" dorian "), "short")).toBe("D Dor");
    expect(keyWithMode("D", keyMode("Dorian"), "full")).toBe("D Dorian");
    expect(keyWithMode("E", keyMode("Harmonic Minor"), "short")).toBe("E min");
    expect(keyWithMode("E", keyMode("Melodic Minor"), "full")).toBe("E minor");
  });

  it("shows the key alone for no tonality, a scale, or more than one", () => {
    for (const t of [null, undefined, "", "Pentatonic", "Blues", "Modal", "Major, Mixolydian"]) {
      expect(keyMode(t)).toBeNull();
      expect(keyWithMode("G", keyMode(t), "full")).toBe("G");
    }
  });
});
