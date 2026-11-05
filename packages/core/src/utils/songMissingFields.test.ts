import { describe, it, expect } from "vitest";
import { songMissingFields } from "./songMissingFields";

const full = {
  display_artist: "A", first_line: "x", hook: "x", genius_url: "u", chord_chart_url: "u", tonality: "Major", meter: "4", vibe: "Ballad",
  youtube_url: null, song_composers: [1], song_lyricists: [1], song_recording_artists: [{ youtube_url: "y" }], song_genres: [1], song_languages: [1],
};

describe("songMissingFields", () => {
  it("is empty for a complete song, counting a recording's video", () => {
    expect(songMissingFields(full)).toEqual([]);
  });
  it("lists what's blank", () => {
    expect(songMissingFields({ ...full, chord_chart_url: null, song_recording_artists: [{ youtube_url: null }] })).toEqual(["chord chart", "video"]);
  });
});
