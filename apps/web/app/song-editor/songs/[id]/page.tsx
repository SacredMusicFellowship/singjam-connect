import type { Metadata } from "next";
import { getServerUserRole } from "@/lib/supabase/cached";
import SongEditorPage, { getSong } from "@/app/admin/songs/[id]/SongEditorPage";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const song = await getSong(id);
  return { title: song?.title ? `${song.title} | SingJam Song Editor` : "Edit Song | SingJam Song Editor" };
}

export default async function SongEditorSongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SongEditorPage id={id} basePath="/song-editor/songs" isAdmin={(await getServerUserRole()) === "admin"} />;
}
