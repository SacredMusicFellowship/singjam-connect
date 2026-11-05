import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { triggerSongEnrichment } from "@/lib/triggerSongEnrichment";

// "Fill in blanks automatically" in the song editor: the same enrichment new
// songs get (~4¢), filling only empty fields from sources that agree.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("admin", "song_editor");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  await triggerSongEnrichment(id, null);
  return NextResponse.json({ ok: true });
}
