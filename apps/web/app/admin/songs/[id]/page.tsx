import type { Metadata } from "next";
import SongEditorPage, { getSong } from "./SongEditorPage";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const song = await getSong(id);
  return { title: song?.title ? `${song.title} | SingJam Admin` : "Edit Song | SingJam Admin" };
}

export default async function AdminSongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SongEditorPage id={id} basePath="/admin/songs" isAdmin />;
}
