import { describe, it, expect } from "vitest";
import { jamRsvpConfirmedHtml } from "./jam-rsvp-confirmed";

const BASE = {
  jamName: "Monthly Singalong",
  jamId: "jam-123",
  jamUrl: "https://singjam.org/jam/jam-123",
};

describe("jamRsvpConfirmedHtml", () => {
  it("greets by name when provided", () => {
    const html = jamRsvpConfirmedHtml({ ...BASE, name: "Alice" });
    expect(html).toContain("Hi Alice,");
  });

  it("uses a generic greeting when name is omitted", () => {
    const html = jamRsvpConfirmedHtml({ ...BASE });
    expect(html).toContain("Hi,");
  });

  it("includes the jam name", () => {
    const html = jamRsvpConfirmedHtml({ ...BASE });
    expect(html).toContain("Monthly Singalong");
  });

  it("includes the jam URL", () => {
    const html = jamRsvpConfirmedHtml({ ...BASE });
    expect(html).toContain("https://singjam.org/jam/jam-123");
  });

  it("includes the date block when startsAt is provided", () => {
    const html = jamRsvpConfirmedHtml({
      ...BASE,
      startsAt: "2026-06-10T19:00:00Z",
      timezone: "America/New_York",
    });
    expect(html).toContain("When");
    expect(html).toContain("June");
  });

  it("omits the date and calendar blocks when startsAt is null", () => {
    const html = jamRsvpConfirmedHtml({ ...BASE, startsAt: null });
    expect(html).not.toContain("When");
    expect(html).not.toContain("Add to calendar");
  });

  it("includes a Google Maps link when address is provided", () => {
    const html = jamRsvpConfirmedHtml({ ...BASE, address: "123 Main St, Oakland, CA" });
    expect(html).toContain("maps.google.com");
    expect(html).toContain("123 Main St, Oakland, CA");
  });

  it("includes calendar links when startsAt is provided", () => {
    const html = jamRsvpConfirmedHtml({
      ...BASE,
      startsAt: "2026-06-10T19:00:00Z",
    });
    expect(html).toContain("google.com/calendar");
    expect(html).toContain("outlook.live.com/calendar");
    expect(html).toContain("/api/jam/jam-123/ics");
  });

  it("puts the RSVP's id in the .ics link", () => {
    const html = jamRsvpConfirmedHtml({ ...BASE, startsAt: "2026-06-10T19:00:00Z", rsvpId: "rsvp-1" });
    expect(html).toContain("/api/jam/jam-123/ics?rsvp=rsvp-1");
  });

  it("omits address block when address is null", () => {
    const html = jamRsvpConfirmedHtml({ ...BASE, address: null });
    expect(html).not.toContain("Where");
  });
});
