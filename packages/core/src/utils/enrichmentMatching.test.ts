import { describe, it, expect } from "vitest";
import { confirmsGeniusSong, matchesGeniusHit, matchesWikipediaArticle, samePeople, type GeniusSong, type GeniusSongDetails, type WikipediaPage } from "./enrichmentMatching";

const page = (over: Partial<WikipediaPage>): WikipediaPage => ({ title: "", type: "standard", description: null, extract: "", ...over });

describe("matchesWikipediaArticle", () => {
  it("stays fast on a title of open brackets or spaces", () => {
    const page: WikipediaPage = { title: "Cups", type: "standard", description: "2012 single", extract: "Cups is a song" };
    const start = Date.now();
    expect(matchesWikipediaArticle({ title: "(".repeat(50000), artist: null }, page)).toBe(false);
    expect(matchesWikipediaArticle({ title: "Cups" + " ".repeat(50000) + "x", artist: null }, page)).toBe(false);
    expect(Date.now() - start).toBeLessThan(500);
  });

  const cups = page({
    title: "Cups (song)",
    description: "2012 song by Anna Kendrick",
    extract: `"Cups" (alternatively titled "Cups (When I'm Gone)") is a song by the American actress and singer Anna Kendrick performed in the 2012 film Pitch Perfect.`,
  });

  it("accepts the article that names the song and its artist", () => {
    expect(matchesWikipediaArticle({ title: "Cups (When I'm Gone)", artist: "Anna Kendrick" }, cups)).toBe(true);
  });

  it("accepts a song article with exactly that title when the artist isn't named", () => {
    expect(matchesWikipediaArticle({ title: "Cups", artist: "Lulu and the Lampshades" }, cups)).toBe(true);
  });

  it("rejects disambiguation pages", () => {
    expect(matchesWikipediaArticle({ title: "Hallelujah", artist: "Leonard Cohen" }, page({ title: "Hallelujah", type: "disambiguation", extract: "Hallelujah may refer to: Leonard Cohen" }))).toBe(false);
  });

  it("rejects an article about something else with the same word", () => {
    const cupsGame = page({ title: "Cup", description: "drinking vessel", extract: "A cup is an open-top vessel used to hold cups of liquid." });
    expect(matchesWikipediaArticle({ title: "Cups", artist: "Anna Kendrick" }, cupsGame)).toBe(false);
  });

  it("rejects another song's article that doesn't name this one", () => {
    const other = page({ title: "Hallelujah (Leonard Cohen song)", description: "1984 song by Leonard Cohen", extract: `"Hallelujah" is a song written by Leonard Cohen.` });
    expect(matchesWikipediaArticle({ title: "Hallelujah I Love Her So", artist: "Ray Charles" }, other)).toBe(false);
  });
});

const song = (over: Partial<GeniusSong>): GeniusSong => ({ title: "", artists: [], writers: [], ...over });
const details = (over: Partial<GeniusSongDetails>): GeniusSongDetails => ({ title: "", artist: "", writers: [], coverOf: [], ...over });

describe("matchesGeniusHit", () => {
  it("matches the same title by the same act", () => {
    expect(matchesGeniusHit(song({ title: "Twist and Shout", artists: ["The Beatles"] }), { title: "Twist and Shout (Remastered 2009)", artist: "The Beatles" })).toBe(true);
  });
  it("rejects a cover by another artist", () => {
    expect(matchesGeniusHit(song({ title: "Twist and Shout", artists: ["The Beatles"] }), { title: "Twist and Shout", artist: "The Isley Brothers" })).toBe(false);
  });
  it("never matches without an artist or writer", () => {
    expect(matchesGeniusHit(song({ title: "Amazing Grace" }), { title: "Amazing Grace", artist: "Judy Collins" })).toBe(false);
  });
  it("matches any recording artist, not only the first", () => {
    expect(matchesGeniusHit(song({ title: "Hold On", artists: ["Mahalia Jackson", "Bob Dylan"] }), { title: "Hold On", artist: "Bob Dylan" })).toBe(true);
  });
  it("matches the writer's own recording", () => {
    expect(matchesGeniusHit(song({ title: "Open the Eyes of My Heart", artists: ["Worship Circle"], writers: ["Paul Baloche"] }), { title: "Open the Eyes of My Heart", artist: "Paul Baloche" })).toBe(true);
  });
  it("allows small title differences", () => {
    const hit = (title: string, artist: string, s: Partial<GeniusSong>) => matchesGeniusHit(song(s), { title, artist });
    expect(hit("The Jug of Punch", "The Clancy Brothers & Tommy Makem", { title: "A Jug of Punch", artists: ["The Clancy Brothers"] })).toBe(true);
    expect(hit("Greenland Whale Fisheries", "The Weavers", { title: "The Greenland Whale Fisheries", artists: ["The Weavers"] })).toBe(true);
    expect(hit("Wabash Cannon Ball (1947)", "Roy Acuff", { title: "Wabash Cannonball", artists: ["Roy Acuff"] })).toBe(true);
    expect(hit("Follow the Drinking Gourd (Carnegie Hall version)", "The Weavers", { title: "Follow the Drinkin' Gourd", artists: ["The Weavers"] })).toBe(true);
    expect(hit("Lion and the Lamb", "Bethel Music", { title: "The Lion and the Lamb", artists: ["Bethel Music"] })).toBe(true);
  });
  it("accepts the title in brackets and alternate titles", () => {
    expect(matchesGeniusHit(song({ title: "Hold On (Keep Your Hand on the Plow)", artists: ["Mahalia Jackson"] }), { title: "Keep Your Hand on the Plow", artist: "Mahalia Jackson" })).toBe(true);
    expect(matchesGeniusHit(song({ title: "Do Lord, Do Remember Me", alternateTitles: ["Do Lord"], artists: ["Johnny Cash"] }), { title: "Do Lord", artist: "Johnny Cash" })).toBe(true);
  });
  it("rejects a different song by the same act", () => {
    expect(matchesGeniusHit(song({ title: "Blow the Man Down", artists: ["Stan Hugill"] }), { title: "Running Down To Cuba", artist: "Stan Hugill" })).toBe(false);
  });
  it("matches an artist name written without its space", () => {
    expect(matchesGeniusHit(song({ title: "One More Time", artists: ["Daftpunk"] }), { title: "One More Time", artist: "Daft Punk" })).toBe(true);
  });
});

describe("confirmsGeniusSong", () => {
  it("accepts another act's version with the same writers", () => {
    const s = song({ title: "Let Me Call You Sweetheart", artists: ["Peerless Quartet"], writers: ["Leo Friedman", "Beth Slater Whitson"] });
    expect(confirmsGeniusSong(s, details({ title: "Let Me Call You Sweetheart", artist: "Bing Crosby", writers: ["Beth Slater Whitson", "Leo Friedman"] }))).toBe(true);
  });
  it("accepts a cover of the traditional song for a traditional song", () => {
    const s = song({ title: "Old Time Religion", writers: ["Traditional"] });
    expect(confirmsGeniusSong(s, details({ title: "Old Time Religion", artist: "Pete Seeger", coverOf: ["Traditional Transcriptions"] }))).toBe(true);
  });
  it("rejects a different song with the same title", () => {
    const spiritual = song({ title: "Over My Head", artists: ["Sister Rosetta Tharpe"], writers: ["Traditional"] });
    expect(confirmsGeniusSong(spiritual, details({ title: "Over My Head", artist: "Fleetwood Mac", writers: ["Christine McVie"] }))).toBe(false);
    const shanty = song({ title: "Rio Grande", writers: ["Traditional"] });
    expect(confirmsGeniusSong(shanty, details({ title: "Rio Grande", artist: "The Oh Hellos", writers: ["Tyler Heath", "Maggie Heath"] }))).toBe(false);
  });
  it("rejects a version Genius knows nothing about", () => {
    const s = song({ title: "His Eye Is on the Sparrow", writers: ["Civilla D. Martin", "Charles H. Gabriel"] });
    expect(confirmsGeniusSong(s, details({ title: "His Eye Is On the Sparrow", artist: "Mahalia Jackson" }))).toBe(false);
  });
  it("rejects a hit with another title", () => {
    const s = song({ title: "Old Time Religion", writers: ["Traditional"] });
    expect(confirmsGeniusSong(s, details({ title: "Old-Time Religion Blues", artist: "X", coverOf: ["Traditional Transcriptions"] }))).toBe(false);
  });
});

describe("samePeople", () => {
  it("treats a fuller form of the same names as the same people", () => {
    expect(samePeople(["Bert Berns", "Phil Medley"], ["Bert Russell Berns", "Phil Medley"])).toBe(true);
  });
  it("sees a different or extra person as a change", () => {
    expect(samePeople(["A.P. Carter"], ["A.P. Carter", "Luisa Gerstein"])).toBe(false);
    expect(samePeople(["Bert Berns"], ["Phil Medley"])).toBe(false);
  });
});
