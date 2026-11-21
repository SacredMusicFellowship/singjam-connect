import { dropUsCountry, dropVenueRepeatedInTitle } from "@singjam/core";
import { formatJamTime } from "../lib/formatJamTime";
import { calendarBlockHtml, ticketCode } from "./ticket-confirmation";

// Sent when a host adds someone as a music leader. The leader already said yes
// to the host, so this confirms rather than asks: it carries their ticket, and
// the way out is the event page's RSVP, not a required step.
export function jamLeaderAddedHtml({
  jamId,
  jamName,
  jamUrl,
  startsAt,
  endsAt,
  timezone,
  address,
  qrToken,
  setUrl,
  signUpUrl,
  hasOwnTicket = false,
}: {
  jamId: string;
  jamName: string;
  jamUrl: string;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string | null;
  address?: string | null;
  qrToken?: string | null;
  setUrl?: string | null;
  /** Only for a leader without an account. */
  signUpUrl?: string | null;
  /** They already got a ticket themselves, so no leader ticket was issued. */
  hasOwnTicket?: boolean;
}) {
  const dateStr = formatJamTime(startsAt, timezone);

  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#18181b;padding:32px 16px">
  <h1 style="font-size:22px;font-weight:700;margin-bottom:8px">You're leading at ${jamName} 🎶</h1>
  <p style="font-size:15px;line-height:1.6;color:#52525b">
    ${hasOwnTicket
      ? "Thank you for bringing the music! You already have a ticket, so bring that one to the door, or just give your name."
      : "Thank you for bringing the music — your ticket is on us. Show this email at the door, or just give your name."}
  </p>

  ${qrToken ? `
  <div style="margin-top:20px;padding:16px;background:#f4f4f5;border-radius:10px">
    <p style="font-size:13px;font-weight:600;color:#71717a;margin:0 0 4px">Your ticket</p>
    <span style="font-size:15px;font-weight:500;color:#18181b">Leader</span>
    <div style="font-size:12px;font-family:monospace;letter-spacing:1px;color:#a1a1aa;margin-top:2px">${ticketCode(qrToken)}</div>
  </div>` : ""}

  ${dateStr ? `
  <div style="margin-top:12px;padding:16px;background:#f4f4f5;border-radius:10px">
    <p style="font-size:13px;font-weight:600;color:#71717a;margin:0 0 4px">When</p>
    <p style="font-size:15px;font-weight:500;color:#18181b;margin:0">${dateStr}</p>
  </div>` : ""}

  ${address ? `
  <div style="margin-top:12px;padding:16px;background:#f4f4f5;border-radius:10px">
    <p style="font-size:13px;font-weight:600;color:#71717a;margin:0 0 4px">Where</p>
    <a href="https://maps.google.com/?q=${encodeURIComponent(address)}"
       style="font-size:15px;font-weight:500;color:#18181b;margin:0;text-decoration:underline">${dropUsCountry(dropVenueRepeatedInTitle(address, jamName))}</a>
  </div>` : ""}

  ${calendarBlockHtml({ jamId, jamName, startsAt, endsAt, address })}

  ${signUpUrl ? `
  <div style="margin-top:24px;padding:16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px">
    <p style="font-size:14px;font-weight:600;color:#18181b;margin:0 0 6px">Add the songs you'll lead 🎶</p>
    <p style="font-size:13px;color:#52525b;margin:0 0 12px">
      Create a SingJam account with this email address to add songs to the set list and
      show people what you love to sing.
    </p>
    <a href="${signUpUrl}"
       style="display:inline-block;background-color:#f59e0b;color:#fff;font-weight:600;font-size:13px;padding:8px 16px;border-radius:8px;text-decoration:none">
      Create an account
    </a>
  </div>` : ""}

  <div style="margin-top:24px">
    ${setUrl && !signUpUrl ? `
    <a href="${setUrl}"
       style="display:inline-block;margin-right:8px;background-color:#f59e0b;color:#fff;font-weight:600;font-size:14px;padding:10px 20px;border-radius:8px;text-decoration:none">
      Add your songs
    </a>` : ""}
    <a href="${jamUrl}"
       style="display:inline-block;${setUrl && !signUpUrl
         ? "border:1px solid #e4e4e7;color:#18181b;"
         : "background-color:#f59e0b;color:#fff;"}font-weight:600;font-size:14px;padding:10px 20px;border-radius:8px;text-decoration:none">
      View event
    </a>
  </div>

  <p style="margin-top:28px;font-size:13px;line-height:1.6;color:#71717a">
    ${signUpUrl
      ? "Can't make it after all? Just reply to this email and we'll let the host know."
      : `Can't make it after all? Update your RSVP on the <a href="${jamUrl}" style="color:#71717a;text-decoration:underline">event page</a>.`}
  </p>
  <p style="margin-top:32px;font-size:13px;color:#a1a1aa">SingJam · Music. Community. Love.</p>
</body>
</html>`;
}
