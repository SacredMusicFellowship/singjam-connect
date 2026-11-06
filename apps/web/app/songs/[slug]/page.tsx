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
    ? await supabase.from("songs").select("title, display_artist, first_line").eq("id", songId).single()
    : { data: null };
  if (!data) return { title: "Song" };
  const title = data.title;
  const artist = (data as any).display_artist;
  const firstLine = (data as any).first_line;
  const description = [
    artist ? `"${title}" by ${artist}.` : `"${title}".`,
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
