import { schedule } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { sendJamReminders } from "../../lib/sendJamReminders";
import { sendEventReminders } from "../../lib/sendEventReminders";
// The shared client, so reminders carry the same reply-to as every other email.
import { resend } from "../../lib/resend";

export const handler = schedule("0 * * * *", async () => {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Independent: a failure in one must not stop the other.
  const results = await Promise.allSettled([sendJamReminders(admin, resend), sendEventReminders(admin, resend)]);
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  for (const f of failed) console.error("send-jam-reminders:", f.reason);
  if (failed.length > 0) return { statusCode: 500 };

  return { statusCode: 200 };
});
