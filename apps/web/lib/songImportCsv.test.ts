import { describe, expect, it } from "vitest";
import { importRowBody, parseImportCsv } from "./songImportCsv";

describe("parseImportCsv", () => {
  it("reads title and artist without a header, as before", () => {
    expect(parseImportCsv("Jolene,Dolly Parton\nHallelujah,")).toEqual([
      { title: "Jolene", artist: "Dolly Parton", writers: "", tags: "", first_line: "" },
      { title: "Hallelujah", artist: "", writers: "", tags: "", first_line: "" },
    ]);
  });
  it("maps columns by header in any order, with quoted commas and quotes", () => {
    const csv = 'tags,title,writers,artist\n"form:Shanty; theme:Sea","Haul Away, Joe",Traditional,\n,"The ""Wellerman""",Traditional,Nathan Evans';
    expect(parseImportCsv(csv)).toEqual([
      { title: "Haul Away, Joe", artist: "", writers: "Traditional", tags: "form:Shanty; theme:Sea", first_line: "" },
      { title: 'The "Wellerman"', artist: "Nathan Evans", writers: "Traditional", tags: "", first_line: "" },
    ]);
  });
});

describe("first_line column", () => {
  it("reads a sourced first line and sends it with the row", () => {
    const [row] = parseImportCsv('title,writers,first_line\nRio Grande,Traditional,"Oh, say were you ever in Rio Grande?"');
    expect(row.first_line).toBe("Oh, say were you ever in Rio Grande?");
    expect(importRowBody(row)).toMatchObject({ first_line: "Oh, say were you ever in Rio Grande?", no_recording: true });
  });
});

describe("importRowBody", () => {
  it("skips the recording match only for a row with writers and no artist", () => {
    expect(importRowBody({ title: "Haul Away Joe", artist: "", writers: "Traditional", tags: "form:Shanty", first_line: "" })).toEqual({
      title: "Haul Away Joe", artist: "", writers: "Traditional", tags: "form:Shanty", no_recording: true,
    });
    expect(importRowBody({ title: "Jolene", artist: "", writers: "", tags: "", first_line: "" })).toEqual({ title: "Jolene", artist: "" });
    expect(importRowBody({ title: "Holy Forever", artist: "Chris Tomlin", writers: "Jason Ingram", tags: "", first_line: "" })).toEqual({
      title: "Holy Forever", artist: "Chris Tomlin", writers: "Jason Ingram",
    });
  });
});
