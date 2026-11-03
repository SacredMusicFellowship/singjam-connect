import { schedule } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { runEventAttendanceSweep } from "../../lib/eventAttendance";

export const handler = schedule("0 4 * * *", async () => {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const result = await runEventAttendanceSweep(admin);
  if (result.importFailed) console.error("[event-attendance] AC tag import failed; skipped first-timer tagging");
  console.log(`[event-attendance] done: ${JSON.stringify(result)}`);
  return { statusCode: 200 };
});
