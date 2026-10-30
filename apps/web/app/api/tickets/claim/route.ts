import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { claimGuestTickets } from "@/lib/ticketClaim";
import { jamPathById } from "@/lib/shortRef";

// Attaches anything bought as a guest under the signed-in address.
//
// The OAuth callback and the signup route already do this inline, but plain
// email-and-password sign-in goes through neither: it calls Supabase directly
// from the browser and routes onward. Someone who already had an account,
// bought a ticket without signing in, and then signed in with their password
// would otherwise never have it attached. This is the hook for that path.
//
// Safe to call on any sign-in: claiming is idempotent and does nothing when
// there is no unclaimed guest order under the address.
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  let user = (await supabase.auth.getUser()).data.user ?? null;
  if (!user) {
    const bearer = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (bearer) user = (await supabaseFromBearer(bearer).auth.getUser()).data.user ?? null;
  }
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jamIds = await claimGuestTickets(supabaseAdmin(), user.id, user.email);
  return NextResponse.json({ jam_ids: jamIds, jam_path: jamIds[0] ? await jamPathById(jamIds[0]) : null });
}
