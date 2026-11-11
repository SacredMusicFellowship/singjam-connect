import { describe, it, expect } from "vitest";
import { matchesGeniusHit, matchesWikipediaArticle, samePeople, type WikipediaPage } from "./enrichmentMatching";

const page = (over: Partial<WikipediaPage>): WikipediaPage => ({ title: "", type: "standard", description: null, extract: "", ...over });

describe("matchesWikipediaArticle", () => {
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

describe("matchesGeniusHit", () => {
  it("matches the same title by the same act", () => {
    expect(matchesGeniusHit({ title: "Twist and Shout", artist: "The Beatles" }, { title: "Twist and Shout (Remastered 2009)", artist: "The Beatles" })).toBe(true);
  });
  it("rejects a cover by another artist", () => {
    expect(matchesGeniusHit({ title: "Twist and Shout", artist: "The Beatles" }, { title: "Twist and Shout", artist: "The Isley Brothers" })).toBe(false);
  });
  it("never matches without an artist", () => {
    expect(matchesGeniusHit({ title: "Amazing Grace", artist: null }, { title: "Amazing Grace", artist: "Judy Collins" })).toBe(false);
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
