// Everything here is typed by a host, and any member can host a community jam,
// so it is escaped: otherwise a host could put their own links or markup into
// an email that arrives from events@singjam.org.
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// No "Hi Name," of our own: hosts writing to a group open with their own
// greeting ("Hi everyone!"), and ours stacked on top of it.
export function jamHostMessageHtml({
  hostName,
  jamName,
  jamUrl,
  subject,
  body,
}: {
  hostName: string;
  jamName: string;
  jamUrl: string;
  subject: string;
  body: string;
}) {
  const escapedBody = escapeHtml(body).replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#18181b;padding:32px 16px">
  <p style="font-size:13px;font-weight:600;color:#71717a;margin:0 0 16px">Message from <strong style="color:#18181b">${escapeHtml(hostName)}</strong> about <strong style="color:#18181b">${escapeHtml(jamName)}</strong></p>
  <h1 style="font-size:22px;font-weight:700;margin-bottom:16px">${escapeHtml(subject)}</h1>
  <p style="font-size:15px;line-height:1.7;color:#52525b">${escapedBody}</p>
  <a href="${jamUrl}"
     style="display:inline-block;margin-top:24px;background-color:#f59e0b;color:#fff;font-weight:600;font-size:14px;padding:10px 20px;border-radius:8px;text-decoration:none">
    View jam
  </a>
  <p style="margin-top:32px;font-size:13px;color:#a1a1aa">SingJam · Music. Community. Love.</p>
</body>
</html>`;
}
