import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveApiUser } from "@/lib/supabase/apiUser";
import { canManageJam } from "@/lib/jamAuthz";
import { ticketingBlocked } from "@/lib/devSafety";
import { addJamLeader, describeLeaders, jamLeaderRows, publicLeaders, removeJamLeader } from "@/lib/jamLeaders";

// Music leaders on an official event. Anyone may see who is leading; the host
// (or anyone who can manage the event) adds and removes them. A leader manages
// their own spot through /api/lead/[token], which works without an account.

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = await params;
  const admin = supabaseAdmin();
  const user = await resolveApiUser(req);

  const rows = await jamLeaderRows(admin, jamId);
  const leaders = await describeLeaders(admin, rows);
  const mine = user ? rows.find((r) => r.user_id === user.id) : undefined;
  const canManage = user ? await canManageJam(admin, jamId, user.id) : false;

  return NextResponse.json({
    leaders: publicLeaders(leaders, mine?.id),
    // Only the leader themselves gets their token: it is what steps them down.
    me: mine ? { id: mine.id, token: mine.token, show_publicly: mine.show_publicly } : null,
    ...(canManage ? { managed: leaders } : {}),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = await params;
  const user = await resolveApiUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();
  if (!(await canManageJam(admin, jamId, user.id))) {
    return NextResponse.json({ error: "Only the host can add leaders" }, { status: 403 });
  }

  // A leader is a real ticket on a real event, and every official event `next
  // dev` can reach is a live one, so this is refused locally like checkout is.
  if (ticketingBlocked(`add leader to jam ${jamId}`)) {
    return NextResponse.json({ error: "Adding leaders is disabled in local development" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const result = await addJamLeader(admin, {
    jamId,
    addedBy: user.id,
    userId: typeof body?.userId === "string" ? body.userId : null,
    name: typeof body?.name === "string" ? body.name : null,
    email: typeof body?.email === "string" ? body.email : null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ leader: result.leader, emailed: result.emailed });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = await params;
  const user = await resolveApiUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();
  if (!(await canManageJam(admin, jamId, user.id))) {
    return NextResponse.json({ error: "Only the host can remove leaders" }, { status: 403 });
  }

  let leaderId: string | undefined;
  try {
    leaderId = (await req.json())?.leaderId;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!leaderId) return NextResponse.json({ error: "leaderId is required" }, { status: 400 });

  // Scoped to this jam, so a leader id from another event can't be removed here.
  const leader = (await jamLeaderRows(admin, jamId)).find((r) => r.id === leaderId);
  if (!leader) return NextResponse.json({ error: "Leader not found" }, { status: 404 });

  await removeJamLeader(admin, leader, { notifyHost: false });
  return NextResponse.json({ ok: true });
}
