import { cache } from "react";
import { redirect } from "next/navigation";
import { getServerSupabase, getServerUser } from "@/lib/supabase/cached";
import { songSubtitleText } from "@singjam/core";
import PDFBuilderLoader from "./PDFBuilderLoader";

const getSet = cache(async (id: string) => {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("sets")
    .select("id, name, owner_user_id, link_sharing, profiles(display_name, username)")
    .eq("id", id)
    .single();
  return data as any;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const set = await getSet(id);
  return { title: `${set?.name ?? "Set"} | PDF Builder` };
}

export default async function SetPDFPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ order?: string }> }) {
  const { id } = await params;
  const { order } = await searchParams;
  const supabase = await getServerSupabase();
  const user = await getServerUser();

  const [set, songsRes, authCollabRes, allCollabsRes] = await Promise.all([
    getSet(id),
    supabase
      .from("set_songs")
      .select("song_id, position, key_note, leader_user_ids, songs(title, display_artist, byline, song_productions(productions(name)), tonality, song_recording_artists(position, youtube_url), song_composers(people(name)))")
      .eq("set_id", id)
      .order("position", { ascending: true }),
    user
      ? supabase.from("set_collaborators").select("user_id").eq("set_id", id).eq("status", "accepted").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("set_collaborators")
      .select("user_id, profiles!user_id(display_name, username)")
      .eq("set_id", id)
      .eq("status", "accepted"),
  ]);

  if (!set) redirect(`/set/${id}`);

  const isOwner = user?.id === set.owner_user_id;
  const isCollaborator = !!authCollabRes.data;
  if (!isOwner && !isCollaborator) {
    if (set.link_sharing === "private") redirect(`/set/${id}`);
    if (set.link_sharing === "link" && !user) redirect(`/set/${id}`);
    // "public" falls through
  }
  // Leader assignments are collaborator-only — hide them from non-collaborator viewers.
  const isPublicViewer = !isOwner && !isCollaborator;

  const participantMap = new Map<string, string>();
  if (set.profiles) {
    const ownerName = set.profiles.display_name ?? set.profiles.username;
    if (ownerName) participantMap.set(set.owner_user_id, ownerName);
  }
  for (const collab of (allCollabsRes.data ?? [])) {
    const name = (collab.profiles as any)?.display_name ?? (collab.profiles as any)?.username;
    if (name && collab.user_id) participantMap.set(collab.user_id as string, name);
  }

  let rawSongs = (songsRes.data ?? []).map((s: any) => {
    const productions = (s.songs?.song_productions ?? [])
      .map((sp: any) => sp.productions?.name)
      .filter(Boolean) as string[];
    const songwriters = (s.songs?.song_composers ?? [])
      .map((sc: any) => sc.people?.name)
      .filter(Boolean) as string[];

    return {
      song_id: s.song_id as string,
      title: (s.songs?.title ?? "") as string,
      artist: songSubtitleText(productions, s.songs?.byline),
      key: (s.key_note ?? null) as string | null,
      tonality: (s.songs?.tonality ?? null) as string | null,
      songwriters,
      leaders: isPublicViewer
        ? []
        : (((s.leader_user_ids ?? []) as string[])
            .map((uid) => participantMap.get(uid))
            .filter(Boolean) as string[]),
    };
  });

  if (order) {
    const orderIds = order.split(",");
    rawSongs.sort((a, b) => {
      const ai = orderIds.indexOf(a.song_id);
      const bi = orderIds.indexOf(b.song_id);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    });
  }

  const songs = rawSongs.map(({ song_id: _id, ...rest }, idx) => ({ position: idx + 1, ...rest }));

  return <PDFBuilderLoader setName={set.name} songs={songs} />;
}
