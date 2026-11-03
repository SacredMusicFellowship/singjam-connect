import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllAuthEmails } from "@/lib/authUsers";
import { fetchContactsWithTag, tagFirstTimeAttendee } from "@/lib/activecampaign";

// Official events from before in-app check-in. Their attendance was recorded
// by hand as per-event ActiveCampaign tags, named by local date.
export const PRE_CHECKIN_EVENT_TAGS = [
  { tagId: "32", jamId: "24422a9c-2f5a-41b6-92d9-9e177a9fcf9d" }, // SingJam 05162026, Oakland Grove
  { tagId: "33", jamId: "730d04b0-897f-476a-9996-ec2f046d5462" }, // SingJam 05312026, Oakland Grove
  { tagId: "34", jamId: "71e7e15f-941d-459a-a128-9b86fbd53b19" }, // SingJam 06132026, Starry Plough
  { tagId: "31", jamId: "ee31d376-50fe-4a33-81b5-c12a6950851d" }, // SingJam 06282026, Oakland Grove
  // The tag reads 07132026 but the only event that week was Sat Jul 11.
  { tagId: "36", jamId: "d8e62f34-2cf4-4daa-9278-7462c391f27d" }, // SingJam 07132026, Starry Plough
];

export type EventAttendanceSweepResult = {
  imported: number;
  recorded: number;
  tagged: number;
  failed: number;
  importFailed: boolean;
};

// Re-run every time so a contact tagged in AC later still flows in; existing
// rows are left alone. Returns null if any tag could not be read in full.
async function importPreCheckinEvents(admin: SupabaseClient): Promise<number | null> {
  const userIdByEmail = new Map<string, string>();
  for (const [id, email] of await fetchAllAuthEmails(admin.auth.admin)) {
    userIdByEmail.set(email.toLowerCase(), id);
  }

  let imported = 0;
  for (const { tagId, jamId } of PRE_CHECKIN_EVENT_TAGS) {
    const contacts = await fetchContactsWithTag(tagId);
    if (!contacts) return null;
    const rows = contacts
      .filter((c) => c.email)
      .map((c) => {
        const email = c.email.toLowerCase();
        return {
          jam_id: jamId,
          email,
          user_id: userIdByEmail.get(email) ?? null,
          name: [c.firstName, c.lastName].filter(Boolean).join(" ") || null,
          source: "ac_import",
        };
      });
    if (rows.length === 0) continue;
    const { data, error } = await admin
      .from("event_attendance")
      .upsert(rows, { onConflict: "jam_id,email", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);
    imported += data?.length ?? 0;
  }
  return imported;
}

// Records door check-ins and open-link set list joins for ended official
// events, then tags each person whose first recorded event that was. The
// pre-check-in import must succeed first: without it, spring regulars would
// look like first-timers.
export async function runEventAttendanceSweep(admin: SupabaseClient): Promise<EventAttendanceSweepResult> {
  const result: EventAttendanceSweepResult = { imported: 0, recorded: 0, tagged: 0, failed: 0, importFailed: false };

  const imported = await importPreCheckinEvents(admin);
  if (imported === null) result.importFailed = true;
  else result.imported = imported;

  const { data: recorded, error: recordError } = await admin.rpc("record_event_attendance");
  if (recordError) throw new Error(recordError.message);
  result.recorded = recorded ?? 0;

  if (result.importFailed) return result;

  const { data: firstTimers, error: listError } = await admin.rpc("event_first_timers_to_tag");
  if (listError) throw new Error(listError.message);

  for (const row of (firstTimers ?? []) as { id: string; email: string }[]) {
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
