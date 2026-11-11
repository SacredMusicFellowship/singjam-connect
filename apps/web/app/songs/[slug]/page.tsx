import type { Metadata } from "next";
import { supabaseAnon } from "@/lib/supabase/anon";
import { resolveSongId } from "@/lib/resolveSongId";
import SongPageContent from "@/components/SongPageContent";

export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = supabaseAnon();
  const songId = await resolveSongId(supabase, slug).catch(() => null);
  const { data } = songId
    ? await supabase.from("songs").select("title, display_artist, byline, first_line").eq("id", songId).single()
    : { data: null };
  if (!data) return { title: "Song" };
  const title = data.title;
  // How the song is known: its recording artists, or its writers / tradition (byline, migration 204).
  const artist = (data as any).byline ?? (data as any).display_artist;
  const byRecording = artist === (data as any).display_artist;
  const firstLine = (data as any).first_line;
  const description = [
    artist ? (byRecording ? `"${title}" by ${artist}.` : `"${title}" (${artist}).`) : `"${title}".`,
    firstLine ? `Starts with: "${firstLine}".` : null,
    "Add it to your repertoire and find musicians to jam with on SingJam.",
  ].filter(Boolean).join(" ");
  return {
    title: artist ? `${title} | ${artist}` : title,
    description,
    openGraph: { title: artist ? `${title} | ${artist}` : title, description },
  };
}

export default function SongPage() {
  return <SongPageContent />;
}
