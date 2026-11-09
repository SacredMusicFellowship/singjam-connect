import { describe, expect, it } from "vitest";
import { textTuneLines } from "./textTuneLines";

const person = (role: string, name: string) => ({ role, people: { name } });

describe("textTuneLines", () => {
  it("names the authors and translators of the words", () => {
    expect(textTuneLines({ title: "x", text_credits: [person("author", "John Newton")] }, null).words).toBe("John Newton");
    expect(textTuneLines({ title: "x", text_credits: [person("author", "Mary Byrne"), person("translator", "Eleanor Hull")] }, null).words)
      .toBe("Mary Byrne; tr. Eleanor Hull");
  });
  it("leaves out a words line with no named writers", () => {
    expect(textTuneLines({ title: "x", text_credits: [person("author", "Traditional")] }, null).words).toBeNull();
  });
  it("adds where a tune comes from and its year after its name", () => {
    const tune = { tune_label: "New Britain", year: 1829, tune_tags: [{ tags: { name: "American", type: "culture" } }, { tags: { name: "Dorian", type: "mode" } }] };
    expect(textTuneLines(null, tune).tune).toEqual({ name: "New Britain", detail: "American, 1829" });
    expect(textTuneLines(null, { tune_label: "Slane", slug: "slane", year: null })).toMatchObject({ tune: { name: "Slane", detail: null }, tuneSlug: "slane" });
  });
  it("doesn't repeat a community that is already the tune's label", () => {
    const tune = { tune_label: "Yemenite", year: null, tune_tags: [{ tags: { name: "Yemenite", type: "community" } }] };
    expect(textTuneLines(null, tune).tune).toEqual({ name: "Yemenite", detail: null });
  });
  it("returns nothing for a song with neither", () => {
    expect(textTuneLines(null, null)).toEqual({ words: null, textSlug: null, tune: null, tuneSlug: null });
  });
});
