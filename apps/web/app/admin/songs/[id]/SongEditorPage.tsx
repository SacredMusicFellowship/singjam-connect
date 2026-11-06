import { cache } from "react";
import { getServerSupabase } from "@/lib/supabase/cached";
import { resolveSongId } from "@/lib/resolveSongId";
import { isUuid } from "@singjam/core";
import { notFound, redirect } from "next/navigation";
import SongEditor from "./SongEditor";

export const getSong = cache(async (id: string) => {
  const supabase = await getServerSupabase();
  const songId = await resolveSongId(supabase, id);
  if (!songId) return null;
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
    .eq("id", songId)
    .single();
  return data;
});

// Rendered by /admin/songs/[id] and /song-editor/songs/[id]; song editors get
// everything except deleting songs. New songs are added through the same form
// everyone uses, so the old /new address goes back to the songs list.
export default async function SongEditorPage({ id, basePath, isAdmin }: { id: string; basePath: string; isAdmin: boolean }) {
  if (id === "new") redirect(basePath);
  const supabase = await getServerSupabase();

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

  if (!song) notFound();
  if (song.slug && song.slug !== id && !isUuid(id)) redirect(`${basePath}/${song.slug}`);

  return (
    <SongEditor
      song={song}
      allGenres={genresRes.data ?? []}
      allThemes={themesRes.data ?? []}
      allCultures={culturesRes.data ?? []}
      allLanguages={langsRes.data ?? []}
      allPeople={peopleRes.data ?? []}
      allArtists={artistsRes.data ?? []}
      allProductions={productionsRes.data ?? []}
      basePath={basePath}
      isAdmin={isAdmin}
    />
  );
}
