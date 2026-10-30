import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { leaderByToken, removeJamLeader } from "@/lib/jamLeaders";

// A leader stepping down from the event page. The token is handed only to the
// leader themselves (GET /api/jam/[id]/leaders), so it is the credential.

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = supabaseAdmin();

  const leader = await leaderByToken(admin, token);
  if (!leader) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let action: unknown;
  try {
    action = (await req.json())?.action;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (action === "withdraw") {
    await removeJamLeader(admin, leader, { notifyHost: true });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
