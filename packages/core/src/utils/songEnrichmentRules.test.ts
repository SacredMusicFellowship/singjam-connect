import { describe, it, expect } from "vitest";
import { decideEnrichment, type EnrichmentSources, type ModelAnswer } from "./songEnrichmentRules";

const base = (over: Partial<EnrichmentSources> = {}): EnrichmentSources => ({
  gpt: null, claude: null, musicbrainz: null, spotifyReleaseYear: null, lyrics: null, ...over,
});
const hi = <T,>(v: T) => ({ v, c: "high" as const });
const med = <T,>(v: T) => ({ v, c: "medium" as const });

describe("decideEnrichment — recording year", () => {
  it("takes a year two sources agree on", () => {
    expect(decideEnrichment(base({ gpt: { recording_year: hi(1969) }, musicbrainz: { recordingYear: 1969, composers: [], lyricists: [] } })).recording_year).toBe(1969);
  });
  it("prefers the earliest agreed year when a reissue also has two votes", () => {
    expect(decideEnrichment(base({ gpt: { recording_year: hi(1963) }, claude: { recording_year: hi(1963) }, musicbrainz: { recordingYear: 2010, composers: [], lyricists: [] }, spotifyReleaseYear: 2010 })).recording_year).toBe(1963);
  });
  it("leaves it out when every source disagrees, or there's only one", () => {
    expect(decideEnrichment(base({ gpt: { recording_year: hi(1965) }, claude: { recording_year: hi(1966) } })).recording_year).toBeUndefined();
    expect(decideEnrichment(base({ spotifyReleaseYear: 1994 })).recording_year).toBeUndefined();
  });
});

describe("decideEnrichment — year written and songwriters", () => {
  it("needs both models to agree on the year written, and it can't be after the recording", () => {
    expect(decideEnrichment(base({ gpt: { year_written: hi(1961) }, claude: { year_written: hi(1961) } })).year_written).toBe(1961);
    expect(decideEnrichment(base({ gpt: { year_written: hi(1961) }, claude: { year_written: hi(1962) } })).year_written).toBeUndefined();
    const late: ModelAnswer = { year_written: hi(1999), recording_year: hi(1990) };
    expect(decideEnrichment(base({ gpt: late, claude: late })).year_written).toBeUndefined();
  });
  it("uses MusicBrainz's credits when a model names one of the same people", () => {
    const d = decideEnrichment(base({ gpt: { composers: hi(["Bill Withers"]) }, musicbrainz: { recordingYear: null, composers: ["Bill Withers"], lyricists: [] } }));
    expect(d.composers).toEqual(["Bill Withers"]);
    expect(d.lyricists).toEqual(["Bill Withers"]);
  });
  it("otherwise needs both models to name the same writers", () => {
    expect(decideEnrichment(base({ gpt: { composers: hi(["A", "B"]) }, claude: { composers: hi(["B", "A"]) } })).composers).toEqual(["A", "B"]);
    expect(decideEnrichment(base({ gpt: { composers: hi(["A"]) }, claude: { composers: hi(["C"]) } })).composers).toBeUndefined();
  });
});

describe("decideEnrichment — tags and musical fields", () => {
  it("keeps tonality, meter and vibe only when the models agree", () => {
    const d = decideEnrichment(base({ gpt: { tonality: hi("Major"), meter: med("4"), vibe: hi("Ballad") }, claude: { tonality: hi("Minor"), meter: hi("4"), vibe: hi("Ballad") } }));
    expect(d).toMatchObject({ meter: "4", vibe: "Ballad" });
    expect(d.tonality).toBeUndefined();
  });
  it("caps genres and themes at 3 from the approved lists, shared picks first", () => {
    const d = decideEnrichment(base({ gpt: { genres: hi(["Rock", "Pop", "Soul", "Funk"]), themes: hi(["Love", "Made Up Theme"]) }, claude: { genres: hi(["Soul"]), themes: hi(["Love"]) } }));
    expect(d.genres).toEqual(["Soul", "Rock", "Pop"]);
    expect(d.themes).toEqual(["Love"]);
  });
});

describe("decideEnrichment — cultures, forms, occasions and communities", () => {
  it("keeps only what both models name from the approved lists", () => {
    const d = decideEnrichment(base({
      gpt: { forms: hi(["Hymn", "Carol"]), communities: hi(["Christian", "Black Church (US)"]), occasions: med(["Funeral and memorial"]), cultures: hi(["English"]) },
      claude: { forms: hi(["Hymn"]), communities: hi(["Christian"]), occasions: med(["Funeral and memorial", "Wedding"]), cultures: hi(["Jewish"]) },
    }));
    expect(d.forms).toEqual(["Hymn"]);
    expect(d.communities).toEqual(["Christian"]);
    expect(d.occasions).toEqual(["Funeral and memorial"]);
    expect(d.cultures).toBeUndefined();
  });
  it("ignores names outside the lists, such as a group heading", () => {
    const pick = { occasions: hi(["Gatherings"]), communities: hi(["Jewish movements"]) };
    const d = decideEnrichment(base({ gpt: pick, claude: pick }));
    expect(d.occasions).toBeUndefined();
    expect(d.communities).toBeUndefined();
  });
});

describe("decideEnrichment — lyrics", () => {
  const lyrics = "Oh\nWhen the night has come\nAnd the land is dark\nStand by me, oh stand by me";
  it("takes a model's first line when it opens the published lyrics, and a hook found in them", () => {
    const d = decideEnrichment(base({ gpt: { first_line: hi("When the night has come"), hook: hi("Stand by me") }, lyrics }));
    expect(d).toMatchObject({ first_line: "When the night has come", hook: "Stand by me" });
  });
  it("prefers a model's line found in the lyrics over a spoken introduction at their top", () => {
    const live = "This one next tells a story of a lot of different people\nHang down your head, Tom Dooley\nHang down your head and cry";
    expect(decideEnrichment(base({ gpt: { first_line: hi("Hang down your head, Tom Dooley") }, lyrics: live })).first_line).toBe("Hang down your head, Tom Dooley");
  });
  it("rejects a hook that isn't in the lyrics", () => {
    expect(decideEnrichment(base({ gpt: { hook: hi("Lean on me") }, lyrics })).hook).toBeUndefined();
  });
  it("without published lyrics, needs both models to quote the same words", () => {
    expect(decideEnrichment(base({ gpt: { first_line: hi("Gosto muito de te ver") }, claude: { first_line: hi("Gosto muito de você") } })).first_line).toBeUndefined();
    expect(decideEnrichment(base({ gpt: { first_line: hi("Have you seen the ghost of John?") }, claude: { first_line: hi("Have you seen the ghost of John") } })).first_line).toBe("Have you seen the ghost of John?");
  });
});
