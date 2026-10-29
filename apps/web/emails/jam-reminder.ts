import { formatJamTime } from "../lib/formatJamTime";

export function jamReminderHtml({
  name,
  jamName,
  jamUrl,
  startsAt,
  timezone,
  address,
}: {
  name?: string | null;
  jamName: string;
  jamUrl: string;
  startsAt?: string | null;
  timezone?: string | null;
  address?: string | null;
}) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const dateStr = formatJamTime(startsAt, timezone);

  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#18181b;padding:32px 16px">
  <h1 style="font-size:22px;font-weight:700;margin-bottom:8px">Your jam is tomorrow</h1>
  <p style="font-size:15px;line-height:1.6;color:#52525b">
    ${greeting} Just a reminder that <strong>${jamName}</strong> is coming up soon.
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
  <a href="${jamUrl}"
     style="display:inline-block;margin-top:24px;background-color:#f59e0b;color:#fff;font-weight:600;font-size:14px;padding:10px 20px;border-radius:8px;text-decoration:none">
    View jam
  </a>
  <p style="margin-top:32px;font-size:13px;color:#a1a1aa">SingJam · Music. Community. Love.</p>
</body>
</html>`;
}
