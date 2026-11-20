import { describe, expect, it } from "vitest";
import { addHintLines, confirmedFirstLine, isPlaceholderArtist, parseAddHints } from "./songAddHints";
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
