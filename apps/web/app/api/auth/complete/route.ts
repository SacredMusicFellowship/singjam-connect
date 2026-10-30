import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { syncContact } from "@/lib/activecampaign";
import { claimGuestTickets } from "@/lib/ticketClaim";
import { jamPathById } from "@/lib/shortRef";

// Called after immediate-session signup (email confirmation disabled) to
// create the profile and link any invite token, mirroring the callback route.
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  let user = (await supabase.auth.getUser()).data.user ?? null;
  if (!user) {
    const bearer = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (bearer) user = (await supabaseAdmin().auth.getUser(bearer)).data.user ?? null;
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { inviteToken } = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();

  // A new signup has a bare profiles row (id only) from the handle_new_user()
  // DB trigger, so "no username" — not "no row" — is the new-user signal.
  // Username stays null until the user picks one in setup: writing a generated
  // placeholder here raced the setup form, which could overwrite the name they
  // chose. The welcome email is sent from the profile save for the same reason.
  const { data: existing } = await admin
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  if (!existing?.username && user.email) {
    syncContact(user.email).catch((err) => console.error("[ActiveCampaign] syncContact failed for", user.email, err));
  }

  // Anything they bought as a guest under this address becomes theirs now.
  if (user.email) {
    await claimGuestTickets(admin, user.id, user.email).catch((err) =>
      console.error("[tickets] claimGuestTickets failed for", user.email, err));
  }

  // Link invite and resolve jam ID
  let jamId: string | null = null;
  if (inviteToken) {
    await admin.from("jam_invites")
      .update({ invited_user_id: user.id, invitee_email: null })
      .eq("token", inviteToken)
      .is("invited_user_id", null);

    const { data: invite } = await admin
      .from("jam_invites")
      .select("jam_id")
      .eq("token", inviteToken)
      .maybeSingle();
    jamId = invite?.jam_id ?? null;
  }

  return NextResponse.json({ jamId, jamPath: jamId ? await jamPathById(jamId) : null });
}
