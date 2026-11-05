import { cache } from "react";
import { getServerSupabase } from "@/lib/supabase/cached";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SongEditor from "./SongEditor";

const getSong = cache(async (id: string) => {
  if (id === "new") return null;
  const supabase = await getServerSupabase();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const { data } = await supabase
    .from("songs")
    .select(`
      *,
      song_genres(genre_id),
      song_themes(theme_id),
      song_cultures(culture_id, context),
      song_languages(language_id),
      song_composers(person_id),
      song_lyricists(person_id),
      song_recording_artists(artist_id, year, position, youtube_url, spotify_url),
      song_alternate_titles(id, title),
      song_productions(production_id)
    `)
    .eq(isUuid ? "id" : "slug", id)
    .single();
  return data;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (id === "new") return { title: "New Song | SingJam Admin" };
  const song = await getSong(id);
  return { title: song?.title ? `${song.title} | SingJam Admin` : "Edit Song | SingJam Admin" };
}

export default async function AdminSongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getServerSupabase();
  const isNew = id === "new";

  const [song, genresRes, themesRes, culturesRes, langsRes, peopleRes, artistsRes, productionsRes] =
    await Promise.all([
      getSong(id),
      supabase.from("genres").select("id, name").order("name"),
      supabase.from("themes").select("id, name").order("name"),
      supabase.from("cultures").select("id, name").order("name"),
      supabase.from("languages").select("id, name").order("name"),
      supabase.from("people").select("id, name").order("name").limit(10000),
      supabase.from("artists").select("id, name").order("name").limit(10000),
      supabase.from("productions").select("id, name, year").order("name").order("year"),
    ]);

  if (!isNew && !song) notFound();

  return (
    <SongEditor
      song={song}
      isNew={isNew}
      allGenres={genresRes.data ?? []}
      allThemes={themesRes.data ?? []}
      allCultures={culturesRes.data ?? []}
      allLanguages={langsRes.data ?? []}
      allPeople={peopleRes.data ?? []}
      allArtists={artistsRes.data ?? []}
      allProductions={productionsRes.data ?? []}
    />
  );
}
