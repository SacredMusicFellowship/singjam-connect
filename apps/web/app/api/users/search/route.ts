import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// search_users filters on `p.id != exclude_user_id`, which a NULL would turn
// into "exclude everyone", so including yourself passes an id no account has.
const NO_USER = "00000000-0000-0000-0000-000000000000";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("q")?.trim() ?? "";
  const q = raw.startsWith("@") ? raw.slice(1) : raw;
  // Invites and friends leave you out; adding a music leader doesn't, since a
  // host often leads their own event.
  const includeSelf = searchParams.get("include_self") === "1";

  if (q.length < 2) return NextResponse.json([]);

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase.rpc("search_users", {
    search_query: q,
    exclude_user_id: includeSelf ? NO_USER : user.id,
  });

  return NextResponse.json(data ?? []);
}
