import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveApiUser } from "@/lib/supabase/apiUser";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: setId } = await params;
  const user = await resolveApiUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { order } = await req.json();
  if (!Array.isArray(order)) return NextResponse.json({ error: "order must be an array" }, { status: 400 });

  const admin = supabaseAdmin();

  const [ownerRes, collabRes] = await Promise.all([
    admin.from("sets").select("id").eq("id", setId).eq("owner_user_id", user.id).maybeSingle(),
    admin.from("set_collaborators").select("id").eq("set_id", setId).eq("user_id", user.id).eq("status", "accepted").eq("role", "co-owner").maybeSingle(),
  ]);
  if (!ownerRes.data && !collabRes.data) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await admin.rpc("reorder_set_songs", {
    p_set_id: setId,
    p_order: order.map(({ id, position }: { id: string; position: number }) => ({ id, position })),
  });
  if (error) return NextResponse.json({ error: "Could not reorder the set" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
