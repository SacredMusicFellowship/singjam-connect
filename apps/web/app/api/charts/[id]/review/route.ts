import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ChartError, reviewChart } from "@/lib/chordCharts";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("admin", "song_editor");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const { action, url } = await req.json().catch(() => ({}));
  if (!["approve", "reject", "replace"].includes(action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  try {
    await reviewChart(supabaseAdmin(), id, { id: auth.user.id, role: auth.role ?? null }, action, url);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ChartError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
