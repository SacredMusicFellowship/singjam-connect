import { describe, it, expect } from "vitest";
import { hymnaryTextsFor, hymnaryTunes, parseCsvRecords, pickHymnaryText, type HymnaryText } from "./hymnary";
import { decideEnrichment, type EnrichmentSources } from "./songEnrichmentRules";

const STAND_BY_ME = `displayTitle,firstLine,textTitle,refrainFirstLine,textAuthNumber,languages,authors,meter,textSources,totalInstances
"Stand By Me","When the storms of life are raging, Stand by me","Stand By Me",,when_the_storms_of_life_are_raging_stand,English,"Charles Albert Tindley",8.3.8.3.7.7.8.3,,83
"Stand by Me","When the storms of life are raging, Lord, stand by me","Stand by Me","Stand by me, stand by me",when_the_storms_of_life_are_raging_lord,English,"Tom Kendzia",,"Inspired by ""Stand by Me"" by Charles A. Tindley, 1851-1933",3
"This I Pray, O Lord","Hear my prayer, dear Lord, and when I'm tried, O stand by me","This I Pray, O Lord",,hear_my_prayer,English,"S. D.",,,1
`;

const WERE_YOU_THERE = `displayTitle,firstLine,textTitle,refrainFirstLine,textAuthNumber,languages,authors,meter,textSources,totalInstances
"Were You There","Were you there when they crucified my Lord?","Were You There","O Sometimes it causes me to tremble",were_you_there_when_they_crucified_my_lo,English,,Irregular,"African-American spiritual",297
`;

const text = (over: Partial<HymnaryText>): HymnaryText => ({
  title: "x", firstLine: "A first line long enough", authors: [], sources: "", instances: 10, url: "https://hymnary.org/text/x", tunes: [], ...over,
});

describe("parseCsvRecords", () => {
  it("reads quoted fields, doubled quotes and empty fields", () => {
    const rows = parseCsvRecords(STAND_BY_ME);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ textTitle: "Stand By Me", authors: "Charles Albert Tindley", refrainFirstLine: "", totalInstances: "83" });
    expect(rows[1].textSources).toBe('Inspired by "Stand by Me" by Charles A. Tindley, 1851-1933');
  });
});

describe("hymnaryTextsFor / hymnaryTunes", () => {
  it("keeps texts with the song's title, most printed first", () => {
    const texts = hymnaryTextsFor("Stand by Me", parseCsvRecords(STAND_BY_ME));
    expect(texts.map((t) => t.authors)).toEqual([["Charles Albert Tindley"], ["Tom Kendzia"]]);
    expect(texts[0].url).toBe("https://hymnary.org/text/when_the_storms_of_life_are_raging_stand");
  });
  it("orders tunes by how often they're printed", () => {
    const tunes = hymnaryTunes(parseCsvRecords(`tuneTitle,tuneAuthNumber,composers,tuneKey,incipit,meter,tuneSources,totalInstances
ARLINGTON,arlington_arne,"Thomas A. Arne","G Major",1,8.6.8.6,,1403
"AMAZING GRACE",new_britain,"Edwin O. Excell",,5,8.6.8.6,"19th cent. USA melody",946
`));
    expect(tunes[0]).toEqual({ name: "ARLINGTON", composers: ["Thomas A. Arne"], instances: 1403 });
  });
});

describe("pickHymnaryText", () => {
  const tindley = text({ authors: ["Charles Albert Tindley"] });
  it("needs the text's author to be one of the song's writers", () => {
    expect(pickHymnaryText([tindley], ["Charles A. Tindley"], "x")).toBe(tindley);
    expect(pickHymnaryText([tindley], ["Ben E. King", "Jerry Leiber", "Mike Stoller"], "x")).toBeNull();
    expect(pickHymnaryText([tindley], [], "x")).toBeNull();
  });
  it("takes an authorless text only for a traditional song, and only when widely printed", () => {
    const spiritual = text({ authors: [], instances: 297, firstLine: "Were you there when they crucified my Lord?" });
    expect(pickHymnaryText([spiritual], ["Traditional"], "Were You There")).toBe(spiritual);
    expect(pickHymnaryText([spiritual], ["Thomas A. Dorsey"], "Were You There")).toBeNull();
    expect(pickHymnaryText([{ ...spiritual, instances: 2 }], ["Traditional"], "Were You There")).toBeNull();
  });
  it("rejects an authorless text that doesn't open with the title", () => {
    expect(pickHymnaryText([text({ authors: [], instances: 1315, firstLine: "I heard the voice of Jesus say" })], ["Traditional"], "Shine On Me")).toBeNull();
  });
});

describe("decideEnrichment with Hymnary", () => {
  const base = (over: Partial<EnrichmentSources>): EnrichmentSources => ({ gpt: null, claude: null, musicbrainz: null, spotifyReleaseYear: null, lyrics: null, ...over });
  const hymnary = hymnaryTextsFor("Were You There", parseCsvRecords(WERE_YOU_THERE)).map((t) => ({ ...t, tunes: [] }));
  it("uses the hymnals' first line when nothing else placed one", () => {
    expect(decideEnrichment(base({ writers: ["Traditional"], hymnary, title: "Were You There" })).first_line).toBe("Were you there when they crucified my Lord?");
  });
  it("credits the text's authors and its main tune's composer only when a model names them too", () => {
    const hymn = [text({ authors: ["John Newton"], tunes: [{ name: "NEW BRITAIN", composers: ["Edwin O. Excell"], instances: 900 }] })];
    const sure = (v: string[]) => ({ v, c: "medium" as const });
    const d = decideEnrichment(base({ hymnary: hymn, gpt: { lyricists: sure(["John Newton"]), composers: sure(["Edwin O. Excell"]) } }));
    expect(d).toMatchObject({ lyricists: ["John Newton"], composers: ["Edwin O. Excell"] });
    expect(decideEnrichment(base({ hymnary: hymn, gpt: { composers: sure(["William Walker"]) } })).lyricists).toBeUndefined();
  });
});

describe("samePerson", () => {
  it("allows middle names and initials, nothing looser", async () => {
    const { samePerson } = await import("./hymnary");
    expect(samePerson("Charles Albert Tindley", "Charles A. Tindley")).toBe(true);
    expect(samePerson("Mary E. Byrne", "Mary Byrne")).toBe(true);
    expect(samePerson("Charles Wesley", "Samuel Wesley")).toBe(false);
    expect(samePerson("John B. Smith", "John C. Smith")).toBe(false);
  });
});
