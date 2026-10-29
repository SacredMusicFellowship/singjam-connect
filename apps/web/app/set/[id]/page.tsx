import { notFound } from "next/navigation";
import { Suspense, cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase, getServerUser } from "@/lib/supabase/cached";
import SetDetail from "@/components/SetDetail";
import SetRequestAccess from "@/components/SetRequestAccess";
import SetJoinPrompt from "@/components/SetJoinPrompt";
import SetGuestPrompt from "@/components/SetGuestPrompt";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const getSet = cache(async (id: string) => {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("sets")
    .select("id, name, description, owner_user_id, jam_id, link_sharing, youtube_playlist_id, youtube_playlist_fingerprint, spotify_playlist_id, spotify_playlist_fingerprint, ultimate_guitar_playlist_url, profiles(display_name, last_name, username, avatar_url)")
    .eq("id", id)
    .single();
  return data as any;
});

const getSetSongs = cache(async (id: string) => {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("set_songs")
    .select("id, song_id, position, key_note, played, leader_user_ids, songs(title, display_artist, slug, chord_chart_url, youtube_url, tonality, year, meter, song_composers(people(name)), song_lyricists(people(name)), song_cultures(cultures(name), context), song_genres(genres(name)), song_themes(themes(name)), song_recording_artists(position, youtube_url, spotify_url))")
    .eq("set_id", id)
    .order("position", { ascending: true });
  return (data ?? []) as any[];
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [set, songs] = await Promise.all([getSet(id), getSetSongs(id)]);
  if (!set) return { title: "Set" };
  const name = set.name ?? "Set";
  const owner = set.profiles?.display_name ?? set.profiles?.username ?? null;
  const songCount = songs.length;
  const description = [
    set.description || null,
    owner ? `Curated by ${owner}.` : null,
    songCount > 0 ? `${songCount} song${songCount === 1 ? "" : "s"} in this set.` : null,
  ].filter(Boolean).join(" ") || "A collaborative song set on SingJam.";
  return {
    title: name,
    description,
    openGraph: { title: name, description },
  };
}

export default async function SetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  const { id } = await params;
  const { invite: inviteToken } = await searchParams;
  const supabase = await getServerSupabase();

  const user = await getServerUser();

  const [set, songs, collabRes, requestsRes, profileRes] = await Promise.all([
    getSet(id),
    getSetSongs(id),
    supabase
      .from("set_collaborators")
      .select("id, user_id, status, role, profiles!user_id(display_name, last_name, username, avatar_url)")
      .eq("set_id", id)
      .eq("status", "accepted"),
    supabase
      .from("set_collaborators")
      .select("id, user_id, status, role, profiles!user_id(display_name, last_name, username, avatar_url)")
      .eq("set_id", id)
      .eq("status", "requested"),
    user
      ? supabase.from("profiles").select("role, singing_voice").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
  ]);

  if (!set) notFound();
  const accessRequests = (requestsRes.data ?? []) as any[];

  const sortCollaborators = (list: any[]) =>
    [...list].sort((a, b) => {
      const nameA = (a.profiles?.display_name ?? a.profiles?.username ?? "").toLowerCase();
      const nameB = (b.profiles?.display_name ?? b.profiles?.username ?? "").toLowerCase();
      return nameA.localeCompare(nameB);
    });

  let collaborators = sortCollaborators(collabRes.data ?? []);

  const isOwner = user?.id === set.owner_user_id;
  const isAdmin = (profileRes as any)?.data?.role === "admin";
  const isSongEditor = (profileRes as any)?.data?.role === "song_editor";
  const currentUserSingingVoice: string | null = (profileRes as any)?.data?.singing_voice ?? null;

  // Auto-join for 'link' mode — logged-in users are added as viewers on first visit
  if (set.link_sharing === "link" && user && !isOwner && !isAdmin) {
    const alreadyJoined = collaborators.some((c: any) => c.user_id === user.id);
    if (!alreadyJoined) {
      const admin = supabaseAdmin();
      const { data: existing } = await admin
        .from("set_collaborators")
        .select("id, status")
        .eq("set_id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existing) {
        const { data: newCollab } = await admin
          .from("set_collaborators")
          .insert({ set_id: id, user_id: user.id, invited_by: user.id, status: "accepted", role: "viewer" })
          .select("id, user_id, status, role, profiles!user_id(display_name, last_name, username, avatar_url)")
          .single();

        if (newCollab) collaborators = sortCollaborators([...collaborators, newCollab as any]);
      } else if ((existing as any).status === "requested") {
        const { data: upgraded } = await admin
          .from("set_collaborators")
          .update({ status: "accepted", role: "viewer" })
          .eq("id", (existing as any).id)
          .select("id, user_id, status, role, profiles!user_id(display_name, last_name, username, avatar_url)")
          .single();

        if (upgraded) collaborators = sortCollaborators([...collaborators, upgraded as any]);
      }
    }
  }

  // Claim a set invite-link token before gating on visibility — otherwise a private
  // set's gate below redirects away before the client ever gets a chance to claim it.
  if (inviteToken && user && !isOwner) {
    const alreadyJoined = collaborators.some((c: any) => c.user_id === user.id);
    if (!alreadyJoined) {
      const admin = supabaseAdmin();
      const { data: invite } = await admin
        .from("set_collaborators")
        .select("id, user_id, status, role")
        .eq("set_id", id)
        .eq("token", inviteToken)
        .maybeSingle();

      if (invite && (!(invite as any).user_id || (invite as any).user_id === user.id)) {
        const { data: claimed } = await admin
          .from("set_collaborators")
          .update({ user_id: user.id, status: "accepted" })
          .eq("id", (invite as any).id)
          .select("id, user_id, status, role, profiles!user_id(display_name, last_name, username, avatar_url)")
          .single();

        if (claimed) collaborators = sortCollaborators([...collaborators, claimed as any]);
      }
    }
  }

  const isCollaborator = collaborators.some((c: any) => c.user_id === user?.id);
  const isCoOwner = collaborators.some((c: any) => c.user_id === user?.id && c.role === "co-owner");
  const isEditorCollaborator = collaborators.some((c: any) => c.user_id === user?.id && (c.role === "editor" || c.role === "co-owner"));
  // Co-owners can do everything the owner can except delete the set or assign co-owners.
  const canManage = isOwner || isCoOwner;

  // Gate by visibility mode
  if (!isOwner && !isCollaborator && !isAdmin && !isSongEditor) {
    if (set.link_sharing === "private") {
      return <SetRequestAccess setId={set.id} setName={set.name} isLoggedIn={!!user} inviteToken={inviteToken} />;
    }
    if (set.link_sharing === "link" && !user) {
      // Open-join sets require a SingJam account to auto-join
      return (
        <SetJoinPrompt
          setId={set.id}
          setName={set.name}
          ownerName={set.profiles?.display_name ?? set.profiles?.username ?? null}
          mode="join"
        />
      );
    }
    // 'public' sets are open to everyone — fall through
  }

  const isPublicViewer = !isOwner && !isCollaborator;

  const songIds = songs.map((s: any) => s.song_id);
  const participantIds = [set.owner_user_id, ...collaborators.map((c: any) => c.user_id)].filter(Boolean) as string[];

  // Fetch all knowledge levels for every participant × song combination
  const songKnowledge = songIds.length > 0 && participantIds.length > 0
    ? ((await supabase
        .from("user_songs")
        .select("user_id, song_id, confidence")
        .in("user_id", participantIds)
        .in("song_id", songIds)
        .in("confidence", ["lead", "support", "learn"])
      ).data ?? []) as { user_id: string; song_id: string; confidence: string }[]
    : [];

  const canAccessJam = set.jam_id
    ? await supabase.from("jams").select("id").eq("id", set.jam_id).maybeSingle().then(r => r.data !== null)
    : false;

  return (
    <Suspense>
      <SetDetail
        set={set}
        initialSongs={songs}
        collaborators={collaborators}
        accessRequests={accessRequests}
        currentUserId={user?.id ?? null}
        currentUserSingingVoice={currentUserSingingVoice}
        canEdit={isOwner || isEditorCollaborator}
        isOwner={isOwner}
        canManage={canManage}
        isAdmin={isAdmin}
        isSongEditor={isSongEditor}
        isPublicViewer={isPublicViewer}
        songKnowledge={songKnowledge}
        canAccessJam={canAccessJam}
      />
      {!user && <SetGuestPrompt setId={set.id} forEvent={!!set.jam_id} />}
    </Suspense>
  );
}
