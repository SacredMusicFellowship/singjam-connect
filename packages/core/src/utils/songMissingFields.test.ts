import { describe, it, expect } from "vitest";
import { songMissingFields, SONG_COMPLETENESS_FIELDS } from "./songMissingFields";

const full = {
  display_artist: "A", first_line: "x", hook: "x", genius_url: "u", chord_chart_url: "u", tonality: "Major", meter: "4", vibe: "Ballad",
  youtube_url: null, song_composers: [1], song_lyricists: [1], song_recording_artists: [{ youtube_url: "y" }], song_tags: [{ tags: { name: "Rock", type: "genre" } }, { tags: { name: "English", type: "language" } }],
};

describe("songMissingFields", () => {
  it("is empty for a complete song, counting a recording's video", () => {
    expect(songMissingFields(full)).toEqual([]);
  });
  it("lists what's blank", () => {
    expect(songMissingFields({ ...full, chord_chart_url: null, song_recording_artists: [{ youtube_url: null }] })).toEqual(["chord chart", "video"]);
  });
  it("names every field it can report in SONG_COMPLETENESS_FIELDS, in the same order", () => {
    const empty = {
      display_artist: null, first_line: null, hook: null, genius_url: null, chord_chart_url: null, tonality: null, meter: null, vibe: null,
      youtube_url: null, song_composers: [], song_lyricists: [], song_recording_artists: [], song_tags: [],
    };
    expect(songMissingFields(empty)).toEqual([...SONG_COMPLETENESS_FIELDS]);
  });
});
