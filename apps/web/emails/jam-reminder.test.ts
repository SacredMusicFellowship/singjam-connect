import { describe, it, expect } from "vitest";
import { jamReminderHtml } from "./jam-reminder";

describe("jamReminderHtml", () => {
  it("greets by name when provided", () => {
    const html = jamReminderHtml({ jamName: "Tuesday Night Jam", jamUrl: "https://singjam.org/jam/1", name: "Alice" });
    expect(html).toContain("Hi Alice,");
  });

  it("uses a generic greeting when name is omitted", () => {
    const html = jamReminderHtml({ jamName: "Tuesday Night Jam", jamUrl: "https://singjam.org/jam/1" });
    expect(html).toContain("Hi,");
  });

  it("includes the jam name", () => {
    const html = jamReminderHtml({ jamName: "Tuesday Night Jam", jamUrl: "https://singjam.org/jam/1" });
    expect(html).toContain("Tuesday Night Jam");
  });

  it("includes the jam URL", () => {
    const html = jamReminderHtml({ jamName: "Tuesday Night Jam", jamUrl: "https://singjam.org/jam/abc" });
    expect(html).toContain("https://singjam.org/jam/abc");
  });

  it("includes the address block with a Google Maps link when address is provided", () => {
    const html = jamReminderHtml({
      jamName: "Tuesday Night Jam",
      jamUrl: "https://singjam.org/jam/1",
      address: "123 Main St, Brooklyn, NY",
    });
    expect(html).toContain("123 Main St, Brooklyn, NY");
    expect(html).toContain("Where");
    expect(html).toContain("https://maps.google.com/?q=123%20Main%20St%2C%20Brooklyn%2C%20NY");
  });

  it("omits the address block when address is null", () => {
    const html = jamReminderHtml({ jamName: "Tuesday Night Jam", jamUrl: "https://singjam.org/jam/1", address: null });
    expect(html).not.toContain("Where");
  });

  it("includes a formatted date when startsAt is provided", () => {
    const html = jamReminderHtml({
      jamName: "Tuesday Night Jam",
      jamUrl: "https://singjam.org/jam/1",
      startsAt: "2026-06-10T19:00:00Z",
      timezone: "America/New_York",
    });
    expect(html).toContain("When");
    expect(html).toContain("June");
  });

  it("omits the date block when startsAt is null", () => {
    const html = jamReminderHtml({ jamName: "Tuesday Night Jam", jamUrl: "https://singjam.org/jam/1", startsAt: null });
    expect(html).not.toContain("When");
  });
});
