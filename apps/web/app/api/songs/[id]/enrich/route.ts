import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { triggerEnrichmentReview } from "@/lib/triggerSongEnrichment";

// "Suggest improvements" in the song editor: the same multi-source enrichment
// new songs get, run as a review (~5¢). It takes longer than a request may, so
// POST starts it in the background and GET returns it once it's stored.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("admin", "song_editor");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const requestedAt = new Date().toISOString();
  const { error } = await supabaseAdmin().from("songs").update({ enrichment_proposal: { requested_at: requestedAt } }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await triggerEnrichmentReview(id, requestedAt);
  return NextResponse.json({ requestedAt });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("admin", "song_editor");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const { data, error } = await supabaseAdmin().from("songs").select("enrichment_proposal").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proposal: data.enrichment_proposal });
}

// Closing or applying a review clears it, so it isn't offered again.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("admin", "song_editor");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const { error } = await supabaseAdmin().from("songs").update({ enrichment_proposal: null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
