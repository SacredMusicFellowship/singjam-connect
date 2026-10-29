// Building the door list as a file the host can keep — reconciliation after the
// event, or handing a printed list to whoever is on the door.
//
// Lives in apps/web/lib rather than packages/core because there is nothing to
// share: the native app has no filesystem to download into.

export type GuestCsvRow = {
  name: string;
  email: string | null;
  tier: string;
  code: string;
  is_member: boolean;
  checked_in_at: string | null;
  paid_at: string | null;
  order_amount_cents: number;
  order_tickets: number;
  order_position: number;
  currency: string;
};

// UTC and ISO on purpose. A locale string in a spreadsheet is ambiguous about
// which timezone it meant, and it does not sort.
const HEADERS = [
  "Name",
  "Email",
  "Tier",
  "Door code",
  "Ticket",
  "Checked in (UTC)",
  "Paid (UTC)",
  "Order total",
  "Tickets in order",
  "Ticket in order",
];

// Names and email addresses here are typed in by anonymous ticket buyers, so a
// cell starting with =, +, - or @ is run as a formula the moment the file opens
// in Excel or Sheets. A leading tab defuses that and still reads correctly to a
// human. RFC 4180 quoting goes on top, which is what handles commas in names.
function cell(value: string | null | undefined): string {
  const raw = value ?? "";
  const safe = /^[=+\-@\t\r]/.test(raw) ? `\t${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function guestListToCsv(guests: GuestCsvRow[]): string {
  const rows = guests.map((g) =>
    [
      cell(g.name),
      cell(g.email),
      cell(g.tier),
      cell(g.code),
      cell(g.is_member ? "Member" : "Guest"),
      cell(g.checked_in_at),
      cell(g.paid_at),
      // A plain number with the currency, so it sums in a spreadsheet — and on
      // the order's first ticket only, or summing the column counts a
      // two-ticket order's total twice.
      cell(
        g.order_position > 1
          ? ""
          : `${(g.order_amount_cents / 100).toFixed(2)} ${g.currency.toUpperCase()}`
      ),
      cell(String(g.order_tickets)),
      cell(`${g.order_position} of ${g.order_tickets}`),
    ].join(",")
  );

  // The BOM is what makes Excel read this as UTF-8 rather than mangling any
  // name with an accent in it. CRLF line endings per RFC 4180.
  return "﻿" + [HEADERS.map(cell).join(","), ...rows].join("\r\n") + "\r\n";
}

export function guestListFilename(jamName: string | null | undefined, now = new Date()): string {
  const slug =
    (jamName ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "guest-list";
  return `${slug}-guests-${now.toISOString().slice(0, 10)}.csv`;
}
