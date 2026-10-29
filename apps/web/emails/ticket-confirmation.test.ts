import { describe, it, expect } from "vitest";
import { ticketConfirmationHtml, ticketCode, ticketLabel } from "./ticket-confirmation";

const base = {
  jamName: "SingJam at the Starry Plough",
  jamId: "jam-1",
  jamUrl: "https://singjam.org/jam/jam-1",
  startsAt: "2026-10-04T21:30:00Z",
  timezone: "America/Los_Angeles",
  address: "The Starry Plough Pub, Berkeley, CA",
  currency: "usd",
};

const ticket = (tierName: string, priceCents: number | null, token = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee") => ({
  tierName,
  qrToken: token,
  priceCents,
});

describe("ticketLabel", () => {
  it("gives a bare tier name the noun it is missing", () => {
    expect(ticketLabel("Advance")).toBe("Advance ticket");
    expect(ticketLabel("Day-Of")).toBe("Day-Of ticket");
  });

  it("keeps the host's wording when the tier already says ticket", () => {
    expect(ticketLabel("Advance Ticket")).toBe("Advance Ticket");
    expect(ticketLabel("early tickets")).toBe("early tickets");
  });
});

describe("ticketConfirmationHtml", () => {
  it("names each ticket and prices it", () => {
    const html = ticketConfirmationHtml({
      ...base,
      tickets: [ticket("Advance", 1500)],
      amountCents: 1576,
    });
    expect(html).toContain("Advance ticket");
    expect(html).toContain("$15.00");
    expect(html).toContain("Total paid");
    expect(html).toContain("$15.76");
  });

  it("reconciles the fee so the rows add up to what was charged", () => {
    // Face value is $30; the buyer paid $31.52 because they covered the fee.
    // Without the reconciling line the receipt would not add up.
    const html = ticketConfirmationHtml({
      ...base,
      tickets: [ticket("Advance", 1500, "a-b-c-d-e"), ticket("Advance", 1500, "f-g-h-i-j")],
      amountCents: 3152,
    });
    expect(html).toContain("Fees");
    expect(html).toContain("$1.52");
    expect(html).toContain("$31.52");
  });

  it("shows a discount as a negative adjustment, not a fee", () => {
    const html = ticketConfirmationHtml({
      ...base,
      tickets: [ticket("General", 1500)],
      amountCents: 1174,
    });
    expect(html).toContain("Discount");
    expect(html).toContain("−$3.26");
    expect(html).not.toContain(">Fees<");
  });

  it("adds no reconciling line when the rows already match the total", () => {
    const html = ticketConfirmationHtml({
      ...base,
      tickets: [ticket("Advance", 1500)],
      amountCents: 1500,
    });
    expect(html).not.toContain("Fees");
    expect(html).not.toContain("Discount");
    expect(html).toContain("Total paid");
  });

  it("omits the breakdown rather than inventing one when a price is unknown", () => {
    const html = ticketConfirmationHtml({
      ...base,
      tickets: [ticket("Advance", null)],
      amountCents: 1576,
    });
    expect(html).not.toContain("Fees");
    expect(html).not.toContain("Discount");
    // The total is still stated — that number is always known.
    expect(html).toContain("Total paid");
  });

  it("shows the guest sign-up block only for a guest", () => {
    const asGuest = ticketConfirmationHtml({
      ...base,
      tickets: [ticket("Advance", 1500)],
      amountCents: 1500,
      isGuest: true,
      signUpUrl: "https://singjam.org/auth",
    });
    const asMember = ticketConfirmationHtml({
      ...base,
      tickets: [ticket("Advance", 1500)],
      amountCents: 1500,
      isGuest: false,
      signUpUrl: "https://singjam.org/auth",
    });
    expect(asGuest).toContain("Create an account");
    expect(asMember).not.toContain("Create an account");
  });

  it("invites a member to add songs, linking the set list once", () => {
    const setUrl = "https://singjam.org/set/set-1";
    const asMember = ticketConfirmationHtml({
      ...base,
      tickets: [ticket("Advance", 1500)],
      amountCents: 1500,
      isGuest: false,
      setUrl,
    });
    expect(asMember).toContain("Help choose songs for this SingJam");
    expect(asMember).toContain("Add the songs you'd love to sing");
    expect(asMember.split(`href="${setUrl}"`)).toHaveLength(2);
  });

  it("gives a member no song invitation when the event has no set list", () => {
    const asMember = ticketConfirmationHtml({
      ...base,
      tickets: [ticket("Advance", 1500)],
      amountCents: 1500,
      isGuest: false,
      setUrl: null,
    });
    expect(asMember).not.toContain("Help choose songs for this SingJam");
  });

  it("keeps a guest's set-list button alongside the sign-up block", () => {
    const setUrl = "https://singjam.org/set/set-1";
    const asGuest = ticketConfirmationHtml({
      ...base,
      tickets: [ticket("Advance", 1500)],
      amountCents: 1500,
      isGuest: true,
      signUpUrl: "https://singjam.org/auth",
      setUrl,
    });
    expect(asGuest).toContain("Create an account");
    expect(asGuest.split(`href="${setUrl}"`)).toHaveLength(2);
    expect(asGuest).toContain("View set list");
  });

  it("greets by name and carries on in lower case", () => {
    const html = ticketConfirmationHtml({ ...base, name: "Ada", tickets: [ticket("Advance", 1500)], amountCents: 1500 });
    expect(html).toContain("Hi Ada, you're coming to");
  });

  it("shows the address without a venue the title already names or a trailing USA, but maps the full one", () => {
    const address = "The Starry Plough Pub, 3101 Shattuck Ave., Berkeley, CA 94705, USA";
    const html = ticketConfirmationHtml({ ...base, address, tickets: [ticket("Advance", 1500)], amountCents: 1500 });
    expect(html).toContain(">3101 Shattuck Ave., Berkeley, CA 94705</a>");
    expect(html).toContain(`?q=${encodeURIComponent(address)}`);
  });

  it("derives a short door code from the ticket token", () => {
    expect(ticketCode("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe("AAAAAA");
  });
});
