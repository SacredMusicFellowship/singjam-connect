import { describe, expect, it } from "vitest";
import { addHintLines, addSongSpellingNote, cleanTuneName, confirmedFirstLine, isPlaceholderArtist, parseAddHints } from "./songAddHints";
import { decideEnrichment, reviewEnrichment, type EnrichmentSources } from "./songEnrichmentRules";

const base = (over: Partial<EnrichmentSources> = {}): EnrichmentSources => ({
  gpt: null, claude: null, musicbrainz: null, spotifyReleaseYear: null, lyrics: null, ...over,
});

describe("parseAddHints", () => {
  it("keeps a known answer, a tidy first line and the event's tags", () => {
    expect(parseAddHints({ known_as: "hymn", first_line_hint: "  Lights  along the harbour " }, ["Christmas", "Christmas", " "]))
      .toEqual({ known_as: "hymn", first_line: "Lights along the harbour", context: ["Christmas"] });
  });
  it("drops anything outside the choices, and returns null when nothing is left", () => {
    expect(parseAddHints({ known_as: "opera", first_line_hint: "x" })).toBeNull();
  });
});

describe("isPlaceholderArtist", () => {
  it("treats Spotify's stand-in credits as no artist", () => {
    for (const n of ["Traditional", "Trad.", "Anonymous", "Various Artists", "Traditional Carol"]) expect(isPlaceholderArtist(n)).toBe(true);
    expect(isPlaceholderArtist("The Traditional Fools")).toBe(false);
    expect(isPlaceholderArtist(null)).toBe(false);
  });
});

describe("addHintLines", () => {
  it("tells the models a traditional song's recording is one version of it", () => {
    expect(addHintLines({ known_as: "traditional", context: ["Christmas"] }, "Mara Quill")).toEqual([
      "The person adding it says it's a traditional or folk song; Mara Quill's recording is one version of it, so describe the song itself.",
      "It was added for an event tagged: Christmas.",
    ]);
  });
  it("tells the models a song added as another tune is about the words", () => {
    expect(addHintLines({ other_tune: true, tune: "Harbour Lights" }, null)).toEqual([
      'These words are sung here to a different tune from the usual one (they call it "Harbour Lights"); describe the words, not any one melody.',
    ]);
  });
});

describe("cleanTuneName", () => {
  it("keeps a tune name tidied, and refuses one too short or long", () => {
    expect(cleanTuneName("  Harbour   Lights ")).toBe("Harbour Lights");
    expect(cleanTuneName("x")).toBeNull();
    expect(cleanTuneName("a".repeat(81))).toBeNull();
    expect(cleanTuneName(42)).toBeNull();
  });
});

describe("confirmedFirstLine", () => {
  it("counts a remembered line the lyrics hold", () => {
    expect(confirmedFirstLine("Lights along the harbour", "Lights along the harbour\nshine for us tonight", [])).toBe("Lights along the harbour");
  });
  it("counts a remembered line a hymnal's first line begins or ends it", () => {
    expect(confirmedFirstLine("Angels we have heard on high, sweetly singing", null, ["Angels we have heard on high"])).not.toBeNull();
  });
  it("doesn't count a line nothing prints, or one too short to tell songs apart", () => {
    expect(confirmedFirstLine("Lights along the harbour", "Something else entirely", [])).toBeNull();
    expect(confirmedFirstLine("Oh yeah", "Oh yeah", [])).toBeNull();
  });
});

describe("the first-line hint in enrichment", () => {
  it("fills the first line from the hint once the lyrics hold it", () => {
    const d = decideEnrichment(base({ lyrics: "Ooh\nLights along the harbour\nshine for us tonight", firstLineHint: "Lights along the harbour" }));
    expect(d.first_line).toBe("Lights along the harbour");
  });
  it("leaves it empty when nothing confirms it, but offers it unticked in a review", () => {
    const src = base({ firstLineHint: "Lights along the harbour" });
    expect(decideEnrichment(src).first_line).toBeUndefined();
    const r = reviewEnrichment(src, []);
    expect(r.suggestions.first_line).toBe("Lights along the harbour");
    expect(r.agreed).not.toContain("first_line");
  });
});

describe("addSongSpellingNote", () => {
  const found = { artist: "Fleetwood Mac", artist_known: true, spotify_url: "https://open.spotify.com/track/x", existing: null };
  it("says nothing when the typed artist was found as typed", () => {
    expect(addSongSpellingNote("fleetwood mac", found)).toBeNull();
  });
  it("shows what was typed when the artist was corrected", () => {
    expect(addSongSpellingNote("Fleewood Mac", found)).toEqual({ tone: "info", text: "You typed “Fleewood Mac”." });
  });
  it("warns when neither Spotify nor the library knows the artist", () => {
    expect(addSongSpellingNote("Fleewood Mac", { ...found, artist: "Fleewood Mac", artist_known: false, spotify_url: null })).toMatchObject({ tone: "warning" });
  });
  it("warns about the title when the artist is known but Spotify has no such song", () => {
    expect(addSongSpellingNote("Fleetwood Mac", { ...found, spotify_url: null })?.text).toMatch(/title's spelling/);
  });
  it("says nothing for a traditional song, an existing song or an older server", () => {
    expect(addSongSpellingNote("", { ...found, artist: null, spotify_url: null })).toBeNull();
    expect(addSongSpellingNote("Traditional", { ...found, artist: null, spotify_url: null })).toBeNull();
    expect(addSongSpellingNote("Fleewood Mac", { ...found, existing: { id: "s1" } })).toBeNull();
    expect(addSongSpellingNote("Fleetwood Mac", { artist: "Fleetwood Mac", spotify_url: null, existing: null })).toBeNull();
  });
});
