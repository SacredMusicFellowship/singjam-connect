import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";

// Song editors and admins set a song's YouTube/Spotify links here. Chord charts
// go through /api/songs/[id]/charts, where anyone can add one and others review it.
const ALLOWED_FIELDS = ["youtube_url", "spotify_url"] as const;
type AllowedField = (typeof ALLOWED_FIELDS)[number];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: songId } = await params;
  const auth = await requireRole("admin", "song_editor");
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const updates: Partial<Record<AllowedField, string | null>> = {};

  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      const val = body[field];
      updates[field] = typeof val === "string" && val.trim() ? val.trim() : null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin.from("songs").update(updates).eq("id", songId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
