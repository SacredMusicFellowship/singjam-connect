import { schedule } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { notifyAdminOfAttendanceProblem, runEventAttendanceSweep } from "../../lib/eventAttendance";

export const handler = schedule("0 4 * * *", async () => {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const result = await runEventAttendanceSweep(admin);
    console.log(`[event-attendance] done: ${JSON.stringify(result)}`);
    if (result.failed > 0) {
      await notifyAdminOfAttendanceProblem(
        `ActiveCampaign rejected the first-time attendee tag for ${result.failed} ${result.failed === 1 ? "person" : "people"}.`
      );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[event-attendance] failed: ${message}`);
    await notifyAdminOfAttendanceProblem(`The nightly sweep failed: ${message}`).catch(() => {});
  }
  return { statusCode: 200 };
});
