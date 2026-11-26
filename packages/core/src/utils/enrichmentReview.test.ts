import { describe, it, expect } from "vitest";
import { decideListedFacts, decideNotes, hymnTuneName, reviewEnrichment, type EnrichmentSources } from "./songEnrichmentRules";

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

  it("prefers notes drawn from Wikipedia, and says so", () => {
    const r = reviewEnrichment(base({ gpt: { notes: hi("From memory.") } }), [], { wikipedia: { notes: "From the article.", productions: [], alternate_titles: [] } });
    expect(r.suggestions.notes).toBe("From the article.");
    expect(r.fromWikipedia).toContain("notes");
    expect(r.agreed).not.toContain("notes");
  });

  it("confirms a production one model and Wikipedia both name", () => {
    const r = reviewEnrichment(base({ gpt: { productions: hi(["Pitch Perfect"]) } }), [], { wikipedia: { notes: null, productions: ["Pitch Perfect"], alternate_titles: [] } });
    expect(r.suggestions.productions).toEqual(["Pitch Perfect"]);
    expect(r.agreed).toContain("productions");
  });

  it("offers Wikipedia's alternate titles, labelled, when no model names them", () => {
    const r = reviewEnrichment(base(), [], { wikipedia: { notes: null, productions: [], alternate_titles: ["When I'm Gone"] } });
    expect(r.suggestions.alternate_titles).toEqual(["When I'm Gone"]);
    expect(r.fromWikipedia).toContain("alternate_titles");
    expect(r.agreed).not.toContain("alternate_titles");
  });

  it("treats a matched Genius link as confirmed", () => {
    const r = reviewEnrichment(base(), [], { geniusUrl: "https://genius.com/x" });
    expect(r.suggestions.genius_url).toBe("https://genius.com/x");
    expect(r.agreed).toContain("genius_url");
  });
});

describe("decideListedFacts", () => {
  const wiki = { notes: null, productions: ["Pitch Perfect"], alternate_titles: ["When I'm Gone"] };
  it("fills what a model and the article both name", () => {
    expect(decideListedFacts({ gpt: { productions: hi(["Pitch Perfect"]) }, claude: null }, wiki)).toEqual({ productions: ["Pitch Perfect"] });
  });
  it("fills what both models name, even without an article", () => {
    expect(decideListedFacts({ gpt: { alternate_titles: hi(["Cups"]) }, claude: { alternate_titles: hi(["Cups"]) } }, null)).toEqual({ alternate_titles: ["Cups"] });
  });
  it("fills nothing from a single source", () => {
    expect(decideListedFacts({ gpt: { productions: hi(["Glee"]) }, claude: null }, null)).toEqual({});
    expect(decideListedFacts({ gpt: null, claude: null }, wiki)).toEqual({});
  });
  it("ignores low-confidence answers", () => {
    expect(decideListedFacts({ gpt: { productions: low(["Pitch Perfect"]) }, claude: null }, wiki)).toEqual({});
  });
});

describe("decideNotes", () => {
  const wiki = (notes: string | null) => ({ notes, productions: [], alternate_titles: [] });
  it("takes Wikipedia's notes first", () => {
    expect(decideNotes({ gpt: { notes: hi("From memory.") }, claude: null }, wiki("From the article."))).toEqual({ notes: "From the article.", source: "wikipedia" });
  });
  it("falls back to one model's sure answer, marked as AI", () => {
    expect(decideNotes({ gpt: null, claude: { notes: hi("From memory.") } }, wiki(null))).toEqual({ notes: "From memory.", source: "ai" });
  });
  it("leaves notes empty when no source is sure", () => {
    expect(decideNotes({ gpt: { notes: low("A guess.") }, claude: null }, null)).toBeNull();
  });
});

describe("reviewEnrichment for a hymn or carol", () => {
  // Hymnary's entry for "Angels We Have Heard on High": no author, printed in 308 hymnals.
  const angels = {
    title: "Angels We Have Heard on High", firstLine: "Angels we have heard on high", authors: [], sources: "",
    instances: 308, url: "https://hymnary.org/text/angels_we_have_heard_on_high",
    tunes: [{ name: "GLORIA", composers: [], instances: 301 }, { name: "[Angels we have heard on high]", composers: [], instances: 2 }],
  };
  const carol = (over: Partial<EnrichmentSources> = {}) => base({
    title: "Angels We Have Heard on High",
    hymnary: [angels],
    gpt: { composers: hi(["Traditional"]), tune: hi("GLORIA"), alternate_titles: hi(["Gloria", "Les Anges dans nos campagnes"]) },
    claude: { composers: hi(["Traditional"]), tune: hi("Gloria") },
    ...over,
  });

  it("suggests the hymnals' text and the tune both models name, pre-ticked", () => {
    const r = reviewEnrichment(carol(), []);
    expect(r.suggestions.text).toEqual({ title: "Angels We Have Heard on High", first_line: "Angels we have heard on high", authors: [], url: angels.url });
    expect(r.suggestions.tune).toEqual({ name: "Gloria", composers: [], arrangers: [], cultures: [] });
    expect(r.agreed).toEqual(expect.arrayContaining(["text", "tune"]));
  });

  it("pre-ticks the text's only printed tune even when no model names it", () => {
    const r = reviewEnrichment(carol({ gpt: { composers: hi(["Traditional"]) }, claude: { composers: hi(["Traditional"]) } }), []);
    expect(r.suggestions.tune?.name).toBe("Gloria");
    expect(r.agreed).toEqual(expect.arrayContaining(["text", "tune"]));
  });

  it("offers a tune only one model names, unticked, when the text has several", () => {
    const twoTunes = { ...angels, tunes: [...angels.tunes, { name: "WESTMINSTER CAROL", composers: [], instances: 40 }] };
    const r = reviewEnrichment(carol({ hymnary: [twoTunes], claude: { composers: hi(["Traditional"]) } }), []);
    expect(r.suggestions.tune?.name).toBe("Gloria");
    expect(r.agreed).not.toContain("tune");
    expect(r.agreed).not.toContain("text");
  });

  it("never suggests a tune Hymnary doesn't print the text to", () => {
    const r = reviewEnrichment(carol({ gpt: { composers: hi(["Traditional"]), tune: hi("IRIS") }, claude: { composers: hi(["Traditional"]), tune: hi("IRIS") } }), []);
    expect(r.suggestions.tune).toBeNull();
    expect(r.suggestions.text?.title).toBe("Angels We Have Heard on High");
  });

  it("credits a folk melody to Traditional, with Hymnary's composer as its arranger", () => {
    const canticle = {
      title: "Canticle of the Turning", firstLine: "My soul cries out with a joyful shout", authors: ["Rory Cooney"], sources: "",
      instances: 19, url: "https://hymnary.org/text/my_soul_cries_out_with_a_joyful_shout",
      tunes: [{ name: "STAR OF COUNTY DOWN", composers: ["Rory Cooney"], instances: 27, key: "e minor", meter: "Irregular", sources: "Irish melody" }],
    };
    const r = reviewEnrichment(base({ title: "canticle of the turning", hymnary: [canticle], gpt: { lyricists: hi(["Rory Cooney"]) }, claude: { lyricists: hi(["Rory Cooney"]) } }), []);
    expect(r.suggestions.tune).toEqual({ name: "Star of County Down", composers: ["Traditional"], arrangers: ["Rory Cooney"], cultures: ["Irish"] });
    expect(r.suggestions.music_culture).toBe("Irish");
    expect(r.suggestions.tonality).toBe("Minor");
    expect(r.agreed).toEqual(expect.arrayContaining(["text", "tune", "music_culture", "tonality"]));
  });

  it("keeps the tune's name out of the alternate titles", () => {
    const r = reviewEnrichment(carol(), []);
    expect(r.suggestions.alternate_titles).toEqual(["Les Anges dans nos campagnes"]);
  });

  it("drops Faith from a religious song, counting the song's own tags", () => {
    const r = reviewEnrichment(base({ gpt: { themes: hi(["Joy", "Faith"]) }, claude: { themes: hi(["Joy", "Faith"]) } }), [], { existing: { communities: ["Christian"] } });
    expect(r.suggestions.themes).toEqual(["Joy"]);
  });

  it("drops Hymn from a spiritual", () => {
    const r = reviewEnrichment(base({ gpt: { genres: hi(["Spiritual"]), forms: hi(["Hymn"]) }, claude: { genres: hi(["Spiritual"]), forms: hi(["Hymn"]) } }), []);
    expect(r.suggestions.forms).toEqual([]);
  });
});

describe("decideListedFacts", () => {
  it("leaves a hymn tune's name out of the alternate titles", () => {
    const tunes = [{ title: "x", firstLine: "x", authors: [], sources: "", instances: 9, url: "", tunes: [{ name: "GLORIA", composers: [], instances: 1 }] }];
    const r = decideListedFacts({ gpt: { alternate_titles: hi(["Gloria"]) }, claude: { alternate_titles: hi(["Gloria"]) }, hymnary: tunes }, null);
    expect(r.alternate_titles).toBeUndefined();
  });
});

describe("hymnTuneName", () => {
  it("puts hymnals' capitals into title case", () => {
    expect(hymnTuneName("ST. ANNE")).toBe("St. Anne");
    expect(hymnTuneName("NEW BRITAIN")).toBe("New Britain");
  });
});
