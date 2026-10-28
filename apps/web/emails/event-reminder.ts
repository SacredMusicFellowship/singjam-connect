// The message carries the date, time and place in Sherri's words, so there are
// no separate When/Where boxes repeating them.
export function eventReminderHtml({
  jamName,
  jamUrl,
  messageHtml,
}: {
  jamName: string;
  jamUrl: string;
  messageHtml: string;
}) {
  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#18181b;padding:32px 16px">
  <h1 style="font-size:22px;font-weight:700;margin-bottom:16px">${jamName}</h1>
  ${messageHtml}
  <a href="${jamUrl}"
     style="display:inline-block;margin-top:8px;background-color:#f59e0b;color:#fff;font-weight:600;font-size:14px;padding:10px 20px;border-radius:8px;text-decoration:none">
    View event
  </a>
  <p style="margin-top:32px;font-size:13px;color:#a1a1aa">SingJam · Music. Community. Love.</p>
</body>
</html>`;
}
