import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";

// A song shows up on its own page and on many cached browse pages (texts, tunes,
// people, genres, scripture…), so a save clears every cached page rather than
// trying to list each one.
export async function POST() {
  const auth = await requireRole("admin", "song_editor");
  if (!auth.ok) return auth.response;

  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
