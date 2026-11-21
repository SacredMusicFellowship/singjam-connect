import type { SupabaseClient } from "@supabase/supabase-js";
import { tagFirstTimeAttendee } from "@/lib/activecampaign";
import { resend, FROM_ADDRESS } from "@/lib/resend";

export type EventAttendanceSweepResult = {
  recorded: number;
  tagged: number;
  failed: number;
  // Left for the next run because the time budget ran out.
  deferred: number;
};

// Records door check-ins and open-link set list joins for ended official
// events, then tags each person whose first recorded event that was.
//
// Stops tagging once `budgetMs` has passed: Netlify kills a scheduled function
// at 30 seconds, and a killed run reports nothing. Whatever is left is still
// untagged in the database, so the next run picks it up.
export async function runEventAttendanceSweep(
  admin: SupabaseClient,
  { budgetMs = 20_000 }: { budgetMs?: number } = {}
): Promise<EventAttendanceSweepResult> {
  const deadline = Date.now() + budgetMs;
  const result: EventAttendanceSweepResult = { recorded: 0, tagged: 0, failed: 0, deferred: 0 };

  const { data: recorded, error: recordError } = await admin.rpc("record_event_attendance");
  if (recordError) throw new Error(recordError.message);
  result.recorded = recorded ?? 0;

  const { data: firstTimers, error: listError } = await admin.rpc("event_first_timers_to_tag");
  if (listError) throw new Error(listError.message);

  const queue = (firstTimers ?? []) as { id: string; email: string }[];
  for (const [i, row] of queue.entries()) {
    if (Date.now() > deadline) {
      result.deferred = queue.length - i;
      break;
    }
    if (!(await tagFirstTimeAttendee(row.email))) {
      result.failed++;
      continue;
    }
    const { error } = await admin
      .from("event_attendance")
      .update({ first_timer_tagged_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    result.tagged++;
  }
  return result;
}

// First-timers are welcomed by hand from the AC tag, so a sweep that quietly
// fails means someone quietly isn't welcomed.
export async function notifyAdminOfAttendanceProblem(problem: string) {
  const adminEmail = process.env.ADMIN_EMAIL ?? "benkramarz@gmail.com";
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: adminEmail,
    subject: "[SingJam] Event attendance sweep needs a look",
    html: [
      `<p>${problem}</p>`,
      `<p>Untagged first-timers are retried on the next nightly run. To retry now, use Run now on the <a href="https://singjam.org/admin/attendance">attendance page</a>.</p>`,
    ].join(""),
  });
}
