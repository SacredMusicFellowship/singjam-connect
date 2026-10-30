import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { leaderByToken, removeJamLeader, setLeaderVisibility } from "@/lib/jamLeaders";

// A leader managing their own spot. The token from their email is the
// credential, so this works for leaders without an account too.

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
  if (action === "hide" || action === "show") {
    await setLeaderVisibility(admin, leader.id, action === "show");
    return NextResponse.json({ ok: true, show_publicly: action === "show" });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
