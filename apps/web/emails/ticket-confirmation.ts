import { formatJamTime } from "../lib/formatJamTime";

// Door staff look guests up by name or by this code, so it has to be short
// enough to read aloud from a phone screen in a noisy room.
export function ticketCode(qrToken: string) {
  return qrToken.replace(/-/g, "").slice(0, 6).toUpperCase();
}

function calendarUrls({
  title,
  startsAt,
  endsAt,
  location,
}: {
  title: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
}) {
  const end = endsAt ?? new Date(new Date(startsAt).getTime() + 2 * 60 * 60 * 1000).toISOString();
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";

  const google = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${fmt(startsAt)}/${fmt(end)}`,
  });
  const outlook = new URLSearchParams({
    subject: title,
    startdt: startsAt,
    enddt: end,
    path: "/calendar/action/compose",
    rru: "addevent",
  });
  if (location) {
    google.set("location", location);
    outlook.set("location", location);
  }
  return {
    google: `https://www.google.com/calendar/render?${google}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?${outlook}`,
  };
}

// "Advance" alone reads as an adjective with nothing to modify, exactly as it
// did on the payment page. Singular: each row is one ticket. A tier whose name
// already says "ticket" keeps the host's wording.
export function ticketLabel(tierName: string) {
  return /\btickets?\b/i.test(tierName) ? tierName : `${tierName} ticket`;
}

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

export function ticketConfirmationHtml({
  name,
  jamName,
  jamId,
  jamUrl,
  startsAt,
  endsAt,
  timezone,
  address,
  tickets,
  amountCents,
  currency,
  isGuest = false,
  signUpUrl,
  setUrl,
}: {
  name?: string | null;
  jamName: string;
  jamId: string;
  jamUrl: string;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string | null;
  address?: string | null;
  tickets: { tierName: string; qrToken: string; priceCents?: number | null }[];
  amountCents: number;
  currency: string;
  isGuest?: boolean;
  signUpUrl?: string;
  setUrl?: string | null;
}) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const dateStr = formatJamTime(startsAt, timezone);
  const icsUrl = `https://singjam.org/api/jam/${jamId}/ics`;
  const cal = startsAt
    ? calendarUrls({ title: jamName, startsAt, endsAt: endsAt ?? null, location: address ?? null })
    : null;

  const plural = tickets.length === 1 ? "ticket" : "tickets";

  // A member who buys a ticket is made an editor of the event's set list
  // (markAttending), so they can add songs straight away. Their invitation
  // carries the set-list link, which then stands in for the plain button below.
  const memberSongInvite = !isGuest && !!setUrl;

  // Tier prices are face value. The processing fee and any promotion code live
  // outside them, so the rows will not always sum to what was charged — and an
  // emailed receipt a buyer cannot add up is worse than no breakdown at all.
  // One reconciling line closes the gap without needing Stripe here: the order's
  // amount_cents is already the amount actually collected, written by the
  // webhook from Stripe's own total.
  const faceTotal = tickets.reduce((sum, x) => sum + (x.priceCents ?? 0), 0);
  const knowPrices = tickets.every((x) => typeof x.priceCents === "number");
  const adjustment = amountCents - faceTotal;
  const row = (label: string, value: string, bold = false) => `
    <div style="padding:10px 0;border-top:1px solid #e4e4e7">
      <span style="font-size:15px;${bold ? "font-weight:600;" : ""}color:#18181b">${label}</span>
      <span style="float:right;font-size:15px;${bold ? "font-weight:600;" : ""}color:#18181b">${value}</span>
    </div>`;

  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#18181b;padding:32px 16px">
  <h1 style="font-size:22px;font-weight:700;margin-bottom:8px">You're in! 🎉 We can't wait to sing with you.</h1>
  <p style="font-size:15px;line-height:1.6;color:#52525b">
    ${greeting} You're coming to <strong>${jamName}</strong> —
    <strong>${money(amountCents, currency)}</strong> confirmed. Show this email at the door, or
    just give your name.
  </p>

  <div style="margin-top:20px;padding:16px;background:#f4f4f5;border-radius:10px">
    <p style="font-size:13px;font-weight:600;color:#71717a;margin:0 0 10px">Your ${plural}</p>
    ${tickets
      .map(
        (t) => `
    <div style="display:block;padding:10px 0;border-top:1px solid #e4e4e7">
      <span style="font-size:15px;font-weight:500;color:#18181b">${ticketLabel(t.tierName)}</span>
      ${typeof t.priceCents === "number"
        ? `<span style="float:right;font-size:15px;color:#18181b">${money(t.priceCents, currency)}</span>`
        : ""}
      <div style="font-size:12px;font-family:monospace;letter-spacing:1px;color:#a1a1aa;margin-top:2px">${ticketCode(t.qrToken)}</div>
    </div>`
      )
      .join("")}
    ${knowPrices && adjustment !== 0
      ? row(adjustment > 0 ? "Fees" : "Discount", `${adjustment > 0 ? "" : "−"}${money(Math.abs(adjustment), currency)}`)
      : ""}
    ${row("Total paid", money(amountCents, currency), true)}
  </div>

  ${dateStr ? `
  <div style="margin-top:12px;padding:16px;background:#f4f4f5;border-radius:10px">
    <p style="font-size:13px;font-weight:600;color:#71717a;margin:0 0 4px">When</p>
    <p style="font-size:15px;font-weight:500;color:#18181b;margin:0">${dateStr}</p>
  </div>` : ""}

  ${address ? `
  <div style="margin-top:12px;padding:16px;background:#f4f4f5;border-radius:10px">
    <p style="font-size:13px;font-weight:600;color:#71717a;margin:0 0 4px">Where</p>
    <a href="https://maps.google.com/?q=${encodeURIComponent(address)}"
       style="font-size:15px;font-weight:500;color:#18181b;margin:0;text-decoration:underline">${address}</a>
  </div>` : ""}

  ${cal ? `
  <div style="margin-top:24px">
    <p style="font-size:13px;font-weight:600;color:#71717a;margin:0 0 10px">Add to calendar</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <a href="${cal.google}"
         style="display:inline-block;padding:8px 16px;border:1px solid #e4e4e7;border-radius:8px;font-size:13px;font-weight:500;color:#18181b;text-decoration:none">
        Google Calendar
      </a>
      <a href="${icsUrl}"
         style="display:inline-block;padding:8px 16px;border:1px solid #e4e4e7;border-radius:8px;font-size:13px;font-weight:500;color:#18181b;text-decoration:none">
        Apple Calendar
      </a>
      <a href="${cal.outlook}"
         style="display:inline-block;padding:8px 16px;border:1px solid #e4e4e7;border-radius:8px;font-size:13px;font-weight:500;color:#18181b;text-decoration:none">
        Outlook
      </a>
    </div>
  </div>` : ""}

  ${isGuest && signUpUrl ? `
  <div style="margin-top:24px;padding:16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px">
    <p style="font-size:14px;font-weight:600;color:#18181b;margin:0 0 6px">Help choose songs for this SingJam 🎶</p>
    <p style="font-size:13px;color:#52525b;margin:0 0 12px">
      You're on the guest list. Create an account to add songs to our set list and checkout
      faster next time.
    </p>
    <a href="${signUpUrl}"
       style="display:inline-block;background-color:#f59e0b;color:#fff;font-weight:600;font-size:13px;padding:8px 16px;border-radius:8px;text-decoration:none">
      Create an account
    </a>
    <p style="font-size:12px;color:#a1a1aa;margin:10px 0 0">
      Sign up with this email address and your ticket comes with you.
    </p>
  </div>` : ""}

  ${memberSongInvite ? `
  <div style="margin-top:24px;padding:16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px">
    <p style="font-size:14px;font-weight:600;color:#18181b;margin:0 0 6px">Help choose songs for this SingJam 🎶</p>
    <p style="font-size:13px;color:#52525b;margin:0 0 12px">
      You're on the set list for this one. Add the songs you'd love to sing, and see what
      everyone else has picked.
    </p>
    <a href="${setUrl}"
       style="display:inline-block;background-color:#f59e0b;color:#fff;font-weight:600;font-size:13px;padding:8px 16px;border-radius:8px;text-decoration:none">
      View set list
    </a>
  </div>` : ""}

  <div style="margin-top:24px">
    ${setUrl && !memberSongInvite ? `
    <a href="${setUrl}"
       style="display:inline-block;margin-right:8px;background-color:#f59e0b;color:#fff;font-weight:600;font-size:14px;padding:10px 20px;border-radius:8px;text-decoration:none">
      View set list
    </a>` : ""}
    <a href="${jamUrl}"
       style="display:inline-block;${setUrl
         ? "border:1px solid #e4e4e7;color:#18181b;"
         : "background-color:#f59e0b;color:#fff;"}font-weight:600;font-size:14px;padding:10px 20px;border-radius:8px;text-decoration:none">
      View event
    </a>
  </div>
  <p style="margin-top:32px;font-size:13px;color:#a1a1aa">SingJam · Music. Community. Love.</p>
</body>
</html>`;
}
