import { describe, it, expect } from "vitest";
import { formatJamLongDate, formatJamTimeRange, jamPreviewPlace } from "./jamPreviewText";

const LA = "America/Los_Angeles";

describe("formatJamLongDate", () => {
  it("uses the event's zone, not the server's", () => {
    // 7pm in LA is already the next day in UTC.
    expect(formatJamLongDate("2026-11-02T03:00:00Z", LA)).toBe("Sunday, November 1, 2026");
  });

  it("is null without a start", () => {
    expect(formatJamLongDate(null, LA)).toBeNull();
  });
});

describe("formatJamTimeRange", () => {
  it("names the zone once, on the end time", () => {
    expect(formatJamTimeRange("2026-11-01T22:30:00Z", "2026-11-02T00:30:00Z", LA)).toBe("2:30 PM – 4:30 PM PST");
  });

  it("names it on the start time when there is no end", () => {
    expect(formatJamTimeRange("2026-11-01T22:30:00Z", null, LA)).toBe("2:30 PM PST");
  });
});

describe("jamPreviewPlace", () => {
  const base = { name: "SingJam at the Starry Plough", neighborhood: "Berkeley, CA", full_address: "3101 Shattuck Ave., Berkeley, CA 94705, USA" };

  it("shows an official event's address", () => {
    expect(jamPreviewPlace({ ...base, visibility: "official" })).toBe("3101 Shattuck Ave., Berkeley, CA 94705");
  });

  it("shows a private jam's address, since the link is the invitation", () => {
    expect(jamPreviewPlace({ ...base, visibility: "private" })).toBe("3101 Shattuck Ave., Berkeley, CA 94705");
  });

  it("keeps a community jam to its neighbourhood until RSVP", () => {
    expect(jamPreviewPlace({ ...base, visibility: "community" })).toBe("Berkeley, CA");
  });

  it("says TBD for an undecided venue", () => {
    expect(jamPreviewPlace({ ...base, visibility: "official", neighborhood: "TBD", full_address: null })).toBe("Location TBD");
  });
});
