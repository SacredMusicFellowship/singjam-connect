import { execFileSync } from "node:child_process";

// Local Supabase Auth delivers its emails to Mailpit instead of sending them.
const MAILPIT_URL = (() => {
  if (process.env.MAILPIT_URL) return process.env.MAILPIT_URL;
  const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" }));
  return status.MAILPIT_URL as string;
})();

export async function latestEmailHtml(to: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`).then((r) => r.json());
    const id = search.messages?.[0]?.ID;
    if (id) return (await fetch(`${MAILPIT_URL}/api/v1/message/${id}`).then((r) => r.json())).HTML;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No email to ${to} within ${timeoutMs}ms`);
}
