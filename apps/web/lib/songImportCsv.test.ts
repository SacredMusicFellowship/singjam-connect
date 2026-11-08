import { describe, expect, it } from "vitest";
import { importRowBody, parseImportCsv } from "./songImportCsv";

describe("parseImportCsv", () => {
  it("reads title and artist without a header, as before", () => {
    expect(parseImportCsv("Jolene,Dolly Parton\nHallelujah,")).toEqual([
      { title: "Jolene", artist: "Dolly Parton", writers: "", tags: "" },
      { title: "Hallelujah", artist: "", writers: "", tags: "" },
    ]);
  });
  it("maps columns by header in any order, with quoted commas and quotes", () => {
    const csv = 'tags,title,writers,artist\n"form:Shanty; theme:Sea","Haul Away, Joe",Traditional,\n,"The ""Wellerman""",Traditional,Nathan Evans';
    expect(parseImportCsv(csv)).toEqual([
      { title: "Haul Away, Joe", artist: "", writers: "Traditional", tags: "form:Shanty; theme:Sea" },
      { title: 'The "Wellerman"', artist: "Nathan Evans", writers: "Traditional", tags: "" },
    ]);
  });
});

describe("importRowBody", () => {
  it("skips the recording match only for a row with writers and no artist", () => {
    expect(importRowBody({ title: "Haul Away Joe", artist: "", writers: "Traditional", tags: "form:Shanty" })).toEqual({
      title: "Haul Away Joe", artist: "", writers: "Traditional", tags: "form:Shanty", no_recording: true,
    });
    expect(importRowBody({ title: "Jolene", artist: "", writers: "", tags: "" })).toEqual({ title: "Jolene", artist: "" });
    expect(importRowBody({ title: "Holy Forever", artist: "Chris Tomlin", writers: "Jason Ingram", tags: "" })).toEqual({
      title: "Holy Forever", artist: "Chris Tomlin", writers: "Jason Ingram",
    });
  });
});
