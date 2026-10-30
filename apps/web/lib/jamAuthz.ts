import type { SupabaseClient } from "@supabase/supabase-js";
import { canEditJam } from "@singjam/core";
import { isJamCohost } from "@/lib/jamCohosts";

// Who may run a jam.
//
// A community jam belongs to the person who made it. An official event belongs
// to SingJam: it carries the org's name, sells tickets into the org's Stripe
// account, and is answered for by the org. Tying it to whichever account
// happened to create it means nobody else can check people in at the door,
// message attendees, or fix a tier — which is exactly the moment you need a
// second pair of hands.
//
// So anyone trusted to create official events (profiles.can_host_official,
// migration 156 — the same capability the insert trigger enforces) can manage
// any of them. That capability is the org's short list, not a general role.
export async function canManageJam(
  admin: SupabaseClient,
  jamId: string,
  userId: string,
): Promise<boolean> {
  const { data: jam } = await admin
    .from("jams")
    .select("host_user_id, visibility")
    .eq("id", jamId)
    .maybeSingle();

  if (!jam) return false;
  if (jam.host_user_id === userId) return true;
  if (await isJamCohost(admin, jamId, userId)) return true;

  if (jam.visibility === "official") {
    const { data: profile } = await admin
      .from("profiles")
      .select("can_host_official")
      .eq("id", userId)
      .maybeSingle();
    if ((profile as any)?.can_host_official) return true;
  }

  return false;
}

// Who may edit or cancel a jam — narrower than canManageJam, because co-hosts
// share the running of a jam without being able to change or cancel it.
// The rule itself lives in @singjam/core so native shows the same controls.
export async function canEditJamById(
  admin: SupabaseClient,
  jamId: string,
  userId: string,
): Promise<boolean> {
  const [{ data: jam }, { data: profile }] = await Promise.all([
    admin.from("jams").select("host_user_id, visibility").eq("id", jamId).maybeSingle(),
    admin.from("profiles").select("can_host_official").eq("id", userId).maybeSingle(),
  ]);
  if (!jam) return false;
  return canEditJam(jam, { id: userId, can_host_official: (profile as any)?.can_host_official });
}
