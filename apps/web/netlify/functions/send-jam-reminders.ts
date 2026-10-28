import { schedule } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { sendEventReminders } from "../../lib/sendEventReminders";
// The shared client, so reminders carry the same reply-to as every other email.
import { resend } from "../../lib/resend";

export const handler = schedule("0 * * * *", async () => {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    await sendEventReminders(admin, resend);
  } catch (err) {
    console.error("send-jam-reminders:", err);
    return { statusCode: 500 };
  }
  return { statusCode: 200 };
});
