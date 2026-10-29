import { describe, it, expect } from "vitest";
import { guestListToCsv, guestListFilename, type GuestCsvRow } from "./guestListCsv";

const guest = (over: Partial<GuestCsvRow> = {}): GuestCsvRow => ({
  name: "Ada Lovelace",
  email: "ada@example.com",
  tier: "General",
  code: "A3F91C",
  is_member: false,
  checked_in_at: null,
  paid_at: "2026-09-08T19:00:00.000Z",
  order_amount_cents: 1500,
  order_tickets: 1,
  order_position: 1,
  currency: "usd",
  ...over,
});

const lines = (csv: string) => csv.replace(/^﻿/, "").trimEnd().split("\r\n");

describe("guestListToCsv", () => {
  it("includes what the buyer paid for the order and how many tickets it covered", () => {
    const row = lines(guestListToCsv([guest({ order_amount_cents: 3000, order_tickets: 2 })]))[1];
    expect(row.endsWith('"30.00 USD","2","1 of 2"')).toBe(true);
  });

  it("puts an order's total on its first ticket only, so the column sums to what was taken", () => {
    const rows = lines(
      guestListToCsv([
        guest({ code: "AAAAAA", order_amount_cents: 3000, order_tickets: 2, order_position: 1 }),
        guest({ code: "BBBBBB", order_amount_cents: 3000, order_tickets: 2, order_position: 2 }),
      ])
    );
    expect(rows[1].endsWith('"30.00 USD","2","1 of 2"')).toBe(true);
    expect(rows[2].endsWith('"","2","2 of 2"')).toBe(true);
  });

  it("writes a header row and one row per guest", () => {
    const rows = lines(guestListToCsv([guest(), guest({ name: "Chen Wei" })]));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toBe(
      '"Name","Email","Tier","Door code","Ticket","Checked in (UTC)","Paid (UTC)","Order total","Tickets in order","Ticket in order"'
    );
    expect(rows[1]).toContain('"Ada Lovelace"');
    expect(rows[2]).toContain('"Chen Wei"');
  });

  it("starts with a BOM so Excel reads it as UTF-8", () => {
    // Without this, any name with an accent in it opens mangled.
    expect(guestListToCsv([guest({ name: "Björk Guðmundsdóttir" })]).startsWith("﻿")).toBe(true);
  });

  it("quotes a name containing a comma rather than splitting the row", () => {
    const rows = lines(guestListToCsv([guest({ name: "Delacroix-Whitmore, Marguerite" })]));
    expect(rows[1]).toContain('"Delacroix-Whitmore, Marguerite"');
    expect(rows).toHaveLength(2);
  });

  it("doubles an embedded quote", () => {
    expect(lines(guestListToCsv([guest({ name: 'Jo "Jojo" Smith' })]))[1]).toContain(
      '"Jo ""Jojo"" Smith"'
    );
  });

  it("defuses a cell that a spreadsheet would run as a formula", () => {
    // Buyer names come from anonymous checkout, so this is reachable input.
    const csv = guestListToCsv([
      guest({ name: '=HYPERLINK("http://evil.example","Click")', email: "+15551234567@example.com" }),
    ]);
    expect(csv).toContain('"\t=HYPERLINK(');
    expect(csv).toContain('"\t+15551234567@example.com"');
  });

  it("leaves an ordinary hyphenated name alone", () => {
    // The guard is on the leading character only — mid-string is harmless.
    expect(guestListToCsv([guest({ name: "Fitzwilliam-Hargreaves" })])).toContain(
      '"Fitzwilliam-Hargreaves"'
    );
  });

  it("writes an empty cell for a guest with no email", () => {
    expect(lines(guestListToCsv([guest({ email: null })]))[1]).toContain('"Ada Lovelace","",');
  });

  it("labels the ticket Member or Guest", () => {
    expect(guestListToCsv([guest({ is_member: true })])).toContain('"Member"');
    expect(guestListToCsv([guest({ is_member: false })])).toContain('"Guest"');
  });

  it("carries the check-in time when there is one", () => {
    expect(guestListToCsv([guest({ checked_in_at: "2026-09-08T19:02:00.000Z" })])).toContain(
      '"2026-09-08T19:02:00.000Z"'
    );
  });

  it("returns just the header when nobody has bought", () => {
    expect(lines(guestListToCsv([]))).toHaveLength(1);
  });
});

describe("guestListFilename", () => {
  const on = new Date("2026-09-08T20:00:00.000Z");

  it("slugs the event name and dates the file", () => {
    expect(guestListFilename("SingJam at 2727 California", on)).toBe(
      "singjam-at-2727-california-guests-2026-09-08.csv"
    );
  });

  it("falls back when the event has no name", () => {
    expect(guestListFilename(null, on)).toBe("guest-list-guests-2026-09-08.csv");
    expect(guestListFilename("!!!", on)).toBe("guest-list-guests-2026-09-08.csv");
  });

  it("caps a long name and never leaves a trailing dash before the suffix", () => {
    // Truncation can land mid-word, so what matters is the length cap and that
    // the slug does not end in a dash — "…-guests-" would read as a typo.
    const name = "A".repeat(58) + " and then some more words";
    const slug = guestListFilename(name, on).replace("-guests-2026-09-08.csv", "");
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});
