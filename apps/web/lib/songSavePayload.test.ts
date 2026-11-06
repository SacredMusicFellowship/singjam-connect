import { describe, expect, it } from "vitest";
import { songSavePayload, type SongForm } from "./songSavePayload";

const people = [{ id: "trad", name: "Traditional" }, { id: "p1", name: "John Lennon" }];
const artists = [{ id: "a1", name: "The Beatles" }];
const form = (over: Partial<SongForm> = {}): SongForm => ({
  title: "  Twist and Shout ", displayArtist: "", firstLine: "", hook: "", notes: "", geniusUrl: "", chordChartUrl: "",
  year: "", yearWritten: "1961", tonalities: ["Major"], meters: [], vibe: null,
  genres: [], themes: [], languages: [], cultures: [], composers: [], lyricists: [],
  pendingComposerNames: [], pendingLyricistNames: [], composerTraditionalCulture: "Irish", lyricistTraditionalCulture: "Scottish",
  recordingArtists: [], pendingRecordingArtists: [], productions: [], pendingProductionNames: [], productionYears: {},
  hadRecordingArtists: false, ...over,
});
const build = (over: Partial<SongForm> = {}) => songSavePayload(form(over), { people, artists });

describe("songSavePayload", () => {
  it("trims the title and parses years", () => {
    const p = build();
    expect(p.fields.title).toBe("Twist and Shout");
    expect(p.fields.year_written).toBe(1961);
    expect(p.fields.year).toBeNull();
  });

  it("sends traditional cultures only for traditional writers", () => {
    expect(build({ composers: ["p1"] }).music_culture).toBeNull();
    expect(build({ composers: ["trad"] }).music_culture).toBe("Irish");
    expect(build({ pendingLyricistNames: ["[traditional]"] })).toMatchObject({ lyric_culture: "Scottish", lyricist_names: ["Traditional"] });
  });

  it("keeps a recording's stored Spotify link unless the form has one", () => {
    const p = build({
      recordingArtists: [
        { id: "a1", year: 1963, youtube_url: null },
        { id: "a2", year: 1962, youtube_url: null, spotify_url: "https://open.spotify.com/track/x" },
      ],
    });
    expect(p.recordings[0]).not.toHaveProperty("spotify_url");
    expect(p.recordings[1]).toHaveProperty("spotify_url", "https://open.spotify.com/track/x");
  });

  it("drops pending artists already listed or repeated", () => {
    const p = build({
      recordingArtists: [{ id: "a1", year: 1963, youtube_url: null }],
      pendingRecordingArtists: [
        { name: "the beatles", year: null, spotify_url: null },
        { name: "The Isley Brothers", year: 1962, spotify_url: null },
        { name: "The Isley Brothers ", year: 1962, spotify_url: null },
      ],
    });
    expect(p.recordings.map((r) => ("name" in r ? r.name : r.artist_id))).toEqual(["a1", "The Isley Brothers"]);
  });

  it("uses recording artists for display_artist, else the typed artist only for a song that had none", () => {
    expect(build({ recordingArtists: [{ id: "a1", year: null, youtube_url: null }] }).fields.display_artist).toBe("The Beatles");
    expect(build({ displayArtist: " Someone " }).fields.display_artist).toBe("Someone");
    expect(build({ displayArtist: "Someone", hadRecordingArtists: true }).fields.display_artist).toBeNull();
  });

  it("sends existing productions by id and new ones by name and year", () => {
    const p = build({ productions: ["pr1"], pendingProductionNames: ["Hamilton"], productionYears: { pr1: "1939", "new:Hamilton": "2015" } });
    expect(p.productions).toEqual([{ id: "pr1", year: 1939 }, { id: null, name: "Hamilton", year: 2015 }]);
  });
});
