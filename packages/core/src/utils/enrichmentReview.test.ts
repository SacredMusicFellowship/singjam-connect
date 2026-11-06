import { describe, it, expect } from "vitest";
import { reviewEnrichment, type EnrichmentSources } from "./songEnrichmentRules";

const base = (over: Partial<EnrichmentSources> = {}): EnrichmentSources => ({
  gpt: null, claude: null, musicbrainz: null, spotifyReleaseYear: null, lyrics: null, ...over,
});
const hi = <T,>(v: T) => ({ v, c: "high" as const });
const low = <T,>(v: T) => ({ v, c: "low" as const });

describe("reviewEnrichment", () => {
  it("marks values two sources agree on as agreed", () => {
    const r = reviewEnrichment(base({ gpt: { tonality: hi("Major") }, claude: { tonality: hi("Major") } }), []);
    expect(r.suggestions.tonality).toBe("Major");
    expect(r.agreed).toContain("tonality");
  });

  it("still offers a single model's answer, unagreed", () => {
    const r = reviewEnrichment(base({ gpt: { tonality: hi("Major") }, claude: { tonality: hi("Minor") } }), []);
    expect(r.suggestions.tonality).toBe("Major");
    expect(r.agreed).not.toContain("tonality");
  });

  it("drops single answers outside the vocabulary or below confidence", () => {
    const r = reviewEnrichment(base({ gpt: { tonality: hi("Ionian-ish"), meter: low("3") } }), []);
    expect(r.suggestions.tonality).toBeNull();
    expect(r.suggestions.meter).toBeNull();
  });

  it("offers a lone recording year from MusicBrainz first", () => {
    const r = reviewEnrichment(base({ gpt: { recording_year: hi(2010) }, musicbrainz: { recordingYear: 1963, composers: [], lyricists: [] } }), []);
    expect(r.suggestions.primary_recording_year).toBe(1963);
    expect(r.agreed).not.toContain("primary_recording_year");
  });

  it("never marks notes as agreed", () => {
    const note = hi("A folk song first recorded in 1931.");
    const r = reviewEnrichment(base({ gpt: { notes: note }, claude: { notes: note } }), []);
    expect(r.suggestions.notes).toBe(note.v);
    expect(r.agreed).not.toContain("notes");
  });

  it("agrees on the productions both models name", () => {
    const r = reviewEnrichment(base({ gpt: { productions: hi(["Pitch Perfect", "Glee"]) }, claude: { productions: hi(["Pitch Perfect"]) } }), []);
    expect(r.suggestions.productions).toEqual(["Pitch Perfect"]);
    expect(r.agreed).toContain("productions");
  });

  it("offers one model's productions when they share none", () => {
    const r = reviewEnrichment(base({ claude: { productions: hi(["Glee"]) } }), []);
    expect(r.suggestions.productions).toEqual(["Glee"]);
    expect(r.agreed).not.toContain("productions");
  });

  it("treats confirmed landmark recordings as agreed", () => {
    const r = reviewEnrichment(base(), [{ artist: "The Beatles", year: 1963 }]);
    expect(r.suggestions.additional_recordings).toHaveLength(1);
    expect(r.agreed).toContain("additional_recordings");
  });

  it("only confirms a tag list when both models chose every tag", () => {
    const one = reviewEnrichment(base({ gpt: { genres: hi(["Pop", "Folk"]) }, claude: { genres: hi(["Folk"]) } }), []);
    expect(one.suggestions.genres).toEqual(["Folk", "Pop"]);
    expect(one.agreed).not.toContain("genres");
    const both = reviewEnrichment(base({ gpt: { genres: hi(["Pop", "Folk"]) }, claude: { genres: hi(["Folk", "Pop"]) } }), []);
    expect(both.agreed).toContain("genres");
  });
});
