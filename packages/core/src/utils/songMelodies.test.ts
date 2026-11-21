import { describe, it, expect } from "vitest";
import { knownTuneHint, NO_MELODIES } from "./songMelodies";

describe("knownTuneHint", () => {
  const melodies = { ...NO_MELODIES, known_tune: { title: "Amazing Grace", slug: "amazing-grace", confidence: "lead" } };
  it("shows while the song isn't in the viewer's songs", () => {
    expect(knownTuneHint(melodies, null)).toEqual(melodies.known_tune);
  });
  it("hides once the viewer has the song, or knows no song with this tune", () => {
    expect(knownTuneHint(melodies, "learn")).toBeNull();
    expect(knownTuneHint(NO_MELODIES, null)).toBeNull();
    expect(knownTuneHint(null, null)).toBeNull();
  });
});
