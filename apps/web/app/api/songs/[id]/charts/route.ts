import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requestUser } from "@/lib/requestUser";
import { requireRole } from "@/lib/auth";
import { ChartError, setChartAsEditor, submitChart } from "@/lib/chordCharts";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to add a chord chart." }, { status: 401 });
  const { id } = await params;
  const { url } = await req.json().catch(() => ({}));
  try {
    const result = await submitChart(supabaseAdmin(), id, String(url ?? ""), user.id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ChartError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

// The song editor's chart field: a song editor's chart counts as approved by them.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("admin", "song_editor");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const { url } = await req.json().catch(() => ({}));
  try {
    await setChartAsEditor(supabaseAdmin(), id, String(url ?? ""), auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ChartError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
