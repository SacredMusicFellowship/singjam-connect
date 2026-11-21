import type { CreateEmailOptions } from "resend";
import { resend } from "@/lib/resend";

// Resend allows 10 requests/sec per team. Firing one request per recipient at
// once silently drops everything past the 10th, and the SDK returns { error }
// rather than throwing, so callers that only await the promise never notice.
const BATCH_SIZE = 100; // Resend's per-request batch maximum
const PACED_GROUP = 8;  // stays under 10/sec with headroom for other senders

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendBulkEmail(
  emails: CreateEmailOptions[]
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  // The batch endpoint is one request per 100 emails but cannot carry
  // attachments, so only attachment-bearing mail (calendar updates) is paced.
  if (!emails.some((e) => e.attachments?.length)) {
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const chunk = emails.slice(i, i + BATCH_SIZE);
      const { error } = await withRateLimitRetry(() => resend.batch.send(chunk as any));
      if (error) {
        console.error("sendBulkEmail: batch send failed", error);
        failed += chunk.length;
      } else {
        sent += chunk.length;
      }
    }
    return { sent, failed };
  }

  for (let i = 0; i < emails.length; i += PACED_GROUP) {
    const started = Date.now();
    const results = await Promise.all(
      emails.slice(i, i + PACED_GROUP).map((e) =>
        withRateLimitRetry(() => resend.emails.send(e)).catch((err) => ({ error: err }))
      )
    );
    for (const { error } of results) {
      if (error) {
        console.error("sendBulkEmail: send failed", error);
        failed++;
      } else {
        sent++;
      }
    }
    if (i + PACED_GROUP < emails.length) await sleep(Math.max(0, 1000 - (Date.now() - started)));
  }
  return { sent, failed };
}

async function withRateLimitRetry<T extends { error: any }>(send: () => Promise<T>): Promise<T> {
  const first = await send();
  if (first.error?.name !== "rate_limit_exceeded") return first;
  await sleep(1000);
  return send();
}
