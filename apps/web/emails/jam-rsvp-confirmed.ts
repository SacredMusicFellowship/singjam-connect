import { formatJamTime } from "../lib/formatJamTime";

function googleCalendarUrl({
  title,
  startsAt,
  endsAt,
  location,
}: {
  title: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
}): string {
  const end = endsAt ?? new Date(new Date(startsAt).getTime() + 2 * 60 * 60 * 1000).toISOString();
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${fmt(startsAt)}/${fmt(end)}`,
  });
  if (location) params.set("location", location);
  return `https://www.google.com/calendar/render?${params}`;
}

function outlookCalendarUrl({
  title,
  startsAt,
  endsAt,
  location,
}: {
  title: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
}): string {
  const end = endsAt ?? new Date(new Date(startsAt).getTime() + 2 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    subject: title,
    startdt: startsAt,
    enddt: end,
    path: "/calendar/action/compose",
    rru: "addevent",
  });
  if (location) params.set("location", location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}

export function jamRsvpConfirmedHtml({
  name,
  jamName,
  jamId,
  jamUrl,
  startsAt,
  endsAt,
  timezone,
  address,
  rsvpId,
}: {
  name?: string | null;
  jamName: string;
  jamId: string;
  /** Lets the .ics link carry a public jam's full address without a session — see the ics route. */
  rsvpId?: string | null;
  jamUrl: string;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string | null;
  address?: string | null;
}) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const dateStr = formatJamTime(startsAt, timezone);
  const icsUrl = `https://singjam.org/api/jam/${jamId}/ics${rsvpId ? `?rsvp=${rsvpId}` : ""}`;
  const googleUrl = startsAt
    ? googleCalendarUrl({ title: jamName, startsAt, endsAt: endsAt ?? null, location: address ?? null })
    : null;
  const outlookUrl = startsAt
    ? outlookCalendarUrl({ title: jamName, startsAt, endsAt: endsAt ?? null, location: address ?? null })
    : null;

  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#18181b;padding:32px 16px">
  <h1 style="font-size:22px;font-weight:700;margin-bottom:8px">You're going! 🎵</h1>
  <p style="font-size:15px;line-height:1.6;color:#52525b">
    ${greeting} You're confirmed for <strong>${jamName}</strong>. See you there!
  </p>
  ${dateStr ? `
  <div style="margin-top:20px;padding:16px;background:#f4f4f5;border-radius:10px">
    <p style="font-size:13px;font-weight:600;color:#71717a;margin:0 0 4px">When</p>
    <p style="font-size:15px;font-weight:500;color:#18181b;margin:0">${dateStr}</p>
  </div>` : ""}
  ${address ? `
  <div style="margin-top:12px;padding:16px;background:#f4f4f5;border-radius:10px">
    <p style="font-size:13px;font-weight:600;color:#71717a;margin:0 0 4px">Where</p>
    <a href="https://maps.google.com/?q=${encodeURIComponent(address)}"
       style="font-size:15px;font-weight:500;color:#18181b;margin:0;text-decoration:underline">${address}</a>
  </div>` : ""}
  ${googleUrl ? `
  <div style="margin-top:24px">
    <p style="font-size:13px;font-weight:600;color:#71717a;margin:0 0 10px">Add to calendar</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <a href="${googleUrl}"
         style="display:inline-block;padding:8px 16px;border:1px solid #e4e4e7;border-radius:8px;font-size:13px;font-weight:500;color:#18181b;text-decoration:none">
        Google Calendar
      </a>
      <a href="${icsUrl}"
         style="display:inline-block;padding:8px 16px;border:1px solid #e4e4e7;border-radius:8px;font-size:13px;font-weight:500;color:#18181b;text-decoration:none">
        Apple Calendar
      </a>
      <a href="${outlookUrl}"
         style="display:inline-block;padding:8px 16px;border:1px solid #e4e4e7;border-radius:8px;font-size:13px;font-weight:500;color:#18181b;text-decoration:none">
        Outlook
      </a>
    </div>
  </div>` : ""}
  <a href="${jamUrl}"
     style="display:inline-block;margin-top:24px;background-color:#f59e0b;color:#fff;font-weight:600;font-size:14px;padding:10px 20px;border-radius:8px;text-decoration:none">
    View jam
  </a>
  <p style="margin-top:32px;font-size:13px;color:#a1a1aa">SingJam · Music. Community. Love.</p>
</body>
</html>`;
}
