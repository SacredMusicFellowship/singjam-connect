"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ConfidencePicker from "@/components/ConfidencePicker";
import { CONFIDENCE_STYLES, hasLeadVoice, KEY_STYLE, PEOPLE_ROW_LIMIT, prioritizePeople, SET_SONG_NOTE_MAX, shownPeopleCount } from "@singjam/core";
import RoleSelect from "@/components/RoleSelect";
import ChordsLink from "@/components/ChordsLink";
import {
  MUSICAL_KEYS,
  YoutubeIcon,
  SpotifyIcon,
  UltimateGuitarIcon,
  getPrimaryYoutubeId,
  getPrimarySpotifyUrl,
  getSpotifyTrackId,
  type Song,
  type Participant,
} from "@/components/setDetailShared";

type AddingField = "youtube" | "spotify" | "chord" | null;

export default function SetSongRow({
  song,
  canManage,
  canRemove,
  isAdmin,
  isSongEditor = false,
  isPublicViewer,
  participants,
  hasEligible,
  participantKnowledge,
  participantKeys,
  currentUserId,
  currentUserSingingVoice,
  myConfidence,
  onMediaAdded,
  onKeyChanged,
  onNotesChanged,
  onLeadersChanged,
  onAddToRepertoire,
  onVoiceUpdated,
  onTogglePlayed,
  onRemove,
  signInUrl,
}: {
  song: Song;
  index: number;
  /** Owner or co-owner: reorder, remove, key, played, notes, choosing leaders. */
  canManage: boolean;
  /** Managers, or an editor removing a song they added. */
  canRemove: boolean;
  isAdmin: boolean;
  isSongEditor?: boolean;
  isPublicViewer: boolean;
  participants: Participant[];
  hasEligible: boolean;
  participantKnowledge: Map<string, string>;
  /** The key each participant plays this song in, from their repertoire. */
  participantKeys: Map<string, string>;
  currentUserId: string | null;
  currentUserSingingVoice: string | null;
  /** The viewer's own role for this song, if it's in their repertoire. */
  myConfidence: string | null;
  onMediaAdded: (songId: string, field: "youtube_url" | "spotify_url" | "chord_chart_url", url: string) => void;
  onKeyChanged: (id: string, key: string | null) => void;
  onNotesChanged: (id: string, notes: string | null) => void;
  onLeadersChanged: (id: string, leaderUserIds: string[]) => void;
  onAddToRepertoire: (songId: string, confidence: string) => Promise<void>;
  onVoiceUpdated: (voice: string) => void;
  onTogglePlayed: (id: string, played: boolean) => void;
  onRemove: (songId: string) => void;
  signInUrl?: string;
}) {
  const [youtubeOpen, setYoutubeOpen] = useState(false);
  const [spotifyOpen, setSpotifyOpen] = useState(false);
  const [addingField, setAddingField] = useState<AddingField>(null);
  const [pickingRepertoire, setPickingRepertoire] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  // Choosing Lead without a lead voice asks about it first, as elsewhere in the app.
  const [askingLeadVoice, setAskingLeadVoice] = useState(false);
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [notesInput, setNotesInput] = useState("");
  // Set when Cancel/Escape closes the editor, so the input's blur doesn't save.
  const discardNotesRef = useRef(false);
  const [youtubeSearchResults, setYoutubeSearchResults] = useState<Array<{ videoId: string; title: string; channel: string; url: string }>>([]);
  const [youtubeSearching, setYoutubeSearching] = useState(false);

  const videoId = getPrimaryYoutubeId(song.songs);
  const spotify_url = getPrimarySpotifyUrl(song.songs);
  const spotifyTrackId = getSpotifyTrackId(spotify_url);
  const { chord_chart_url } = song.songs;

  const fieldMap: Record<NonNullable<AddingField>, "youtube_url" | "spotify_url" | "chord_chart_url"> = {
    youtube: "youtube_url",
    spotify: "spotify_url",
    chord: "chord_chart_url",
  };

  const placeholders: Record<NonNullable<AddingField>, string> = {
    youtube: "Paste YouTube URL…",
    spotify: "Paste Spotify track URL…",
    chord: "Paste chord chart URL…",
  };

  async function handleYoutubeSearch() {
    setYoutubeSearching(true);
    setYoutubeSearchResults([]);
    try {
      const artist = song.songs.display_artist ?? "";
      const res = await fetch(
        `/api/youtube?title=${encodeURIComponent(song.songs.title)}&artist=${encodeURIComponent(artist)}`
      );
      const data = await res.json();
      setYoutubeSearchResults(data.items ?? []);
    } finally {
      setYoutubeSearching(false);
    }
  }

  function toggleAdding(field: NonNullable<AddingField>) {
    if (addingField === field) {
      setAddingField(null);
      setUrlInput("");
      setYoutubeSearchResults([]);
    } else {
      setAddingField(field);
      setUrlInput("");
      setYoutubeSearchResults([]);
      if (field === "youtube") handleYoutubeSearch();
    }
  }

  async function saveMedia(field: NonNullable<AddingField>, url: string) {
    setSaving(true);
    const res = await fetch(`/api/songs/${song.song_id}/media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [fieldMap[field]]: url }),
    });
    if (res.ok) {
      onMediaAdded(song.song_id, fieldMap[field], url);
      setAddingField(null);
      setUrlInput("");
      setYoutubeSearchResults([]);
    }
    setSaving(false);
  }

  async function handleSave() {
    if (!addingField || !urlInput.trim()) return;
    await saveMedia(addingField, urlInput.trim());
  }

  function startEditingNotes() {
    discardNotesRef.current = false;
    setNotesInput(song.notes ?? "");
    setEditingNotes(true);
  }

  function saveNotes(value: string = notesInput) {
    if (discardNotesRef.current) return;
    discardNotesRef.current = true;
    setEditingNotes(false);
    const next = value.trim() || null;
    if (next !== song.notes) onNotesChanged(song.id, next);
  }

  function cancelNotes() {
    discardNotesRef.current = true;
    setEditingNotes(false);
  }

  function handleToggleLeader(userId: string) {
    const current = song.leader_user_ids ?? [];
    const updated = current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId];
    onLeadersChanged(song.id, updated);
  }

  const leaderIds = song.leader_user_ids ?? [];
  // Leader/support assignments are only shown to set collaborators; non-collaborator
  // (public) viewers see no participants at all.
  const visibleParticipants = isPublicViewer ? [] : participants;

  const leadParticipants = visibleParticipants.filter(
    (p) => leaderIds.includes(p.user_id) || participantKnowledge.get(p.user_id) === "lead"
  );
  const supportParticipants = visibleParticipants.filter(
    (p) => !leaderIds.includes(p.user_id) && participantKnowledge.get(p.user_id) === "support"
  );
  // Shown so leaders can see who might want help, and learners find each other.
  const learnParticipants = visibleParticipants.filter(
    (p) => !leaderIds.includes(p.user_id) && participantKnowledge.get(p.user_id) === "learn"
  );

  // Each row stays on one line ("+ N more" opens the rest) so a big jam's card
  // doesn't grow. Only a cut-short row is reordered, chosen leaders and you
  // first, so pills don't jump around when the whole list is showing.
  const collapse = <T extends { user_id: string }>(list: T[], first: (string | null)[]) =>
    showAllPeople || list.length <= PEOPLE_ROW_LIMIT.phone ? list : prioritizePeople(list, first);
  const leadShown = collapse(leadParticipants, [...leaderIds, currentUserId]);
  const supportShown = collapse(supportParticipants, [currentUserId]);
  const learnShown = collapse(learnParticipants, [currentUserId]);
  const pillVisibility = (i: number, count: number) => {
    if (showAllPeople) return "";
    if (i >= shownPeopleCount(count, PEOPLE_ROW_LIMIT.wide)) return "hidden";
    if (i >= shownPeopleCount(count, PEOPLE_ROW_LIMIT.phone)) return "hidden sm:inline-block";
    return "";
  };
  const moreToggle = (count: number) => {
    const phoneHidden = count - shownPeopleCount(count, PEOPLE_ROW_LIMIT.phone);
    const wideHidden = count - shownPeopleCount(count, PEOPLE_ROW_LIMIT.wide);
    if (phoneHidden === 0) return null;
    const pill = "rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-50 transition-colors";
    if (showAllPeople) {
      return (
        <button type="button" onClick={() => setShowAllPeople(false)} className={`${pill} ${wideHidden === 0 ? "sm:hidden" : ""}`}>
          Show less
        </button>
      );
    }
    return (
      <>
        <button type="button" onClick={() => setShowAllPeople(true)} className={`${pill} sm:hidden`}>
          +{phoneHidden} more
        </button>
        {wideHidden > 0 && (
          <button type="button" onClick={() => setShowAllPeople(true)} className={`${pill} hidden sm:inline-block`}>
            +{wideHidden} more
          </button>
        )}
      </>
    );
  };

  // Only for songs you don't have yet; once it's yours, the Role dropdown moves it.
  const showRepertoireButtons = !!(!myConfidence && (currentUserId || signInUrl));
  const showPeople = (leadParticipants.length > 0 || supportParticipants.length > 0 || learnParticipants.length > 0 || (canManage && participants.length > 0));
  const showPlayed = canManage || song.played;
  const showRole = !!currentUserId && !!myConfidence;
  const showKeyLine = canManage || (!isPublicViewer && !!(song.key_note || song.songs.tonality));

  // Your own name is bolder so you can find yourself on a busy card.
  const ownWeight = (userId: string) => (userId === currentUserId ? "font-bold" : "font-medium");

  // Removing their own song is the only action a guest has, so it gets a direct button instead of a ⋯ menu.
  const guestRemove = canRemove && !canManage;
  const menuItems: MenuItem[] = [];
  if (canManage && !song.notes) menuItems.push({ label: "Add note", onSelect: startEditingNotes });
  if (canManage) menuItems.push({ label: "Remove from set", destructive: true, onSelect: () => onRemove(song.song_id) });

  return (
    <div className="flex-1 min-w-0 space-y-2">
      <div className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 min-w-0">
            {song.songs.slug ? (
              <Link href={`/songs/${song.songs.slug}`} target="_blank" rel="noopener noreferrer" className="font-medium text-zinc-900 hover:text-amber-600 line-clamp-2">
                {song.songs.title}
              </Link>
            ) : (
              <p className="font-medium text-zinc-900 line-clamp-2">{song.songs.title}</p>
            )}
          </div>
          <div className="flex items-center gap-3 min-w-0 mt-0.5">
            {song.songs.display_artist && (
              <p className="min-w-0 truncate text-xs text-zinc-500">{song.songs.display_artist}</p>
            )}
            {showKeyLine && (
            <span className="flex shrink-0 items-center gap-1">
            {canManage ? (
              // The visible chip is sized to its own text; the transparent select
              // on top opens the native picker without its widest-option width.
              <span className={`relative shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${song.key_note ? `${KEY_STYLE.chip} ${KEY_STYLE.text}` : `${KEY_STYLE.emptyChip} ${KEY_STYLE.emptyText}`}`}>
                <span className="inline-grid justify-items-center"><span className="col-start-1 row-start-1">{song.key_note ?? "+ key"}</span><span className="invisible col-start-1 row-start-1" aria-hidden="true">C#</span></span>
                <select
                  value={song.key_note ?? ""}
                  onChange={(e) => {
                    const val = e.target.value || null;
                    if (val !== song.key_note) onKeyChanged(song.id, val);
                  }}
                  aria-label="Key"
                  className="absolute inset-0 w-full cursor-pointer opacity-0"
                >
                  <option value="">No key</option>
                  {MUSICAL_KEYS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </span>
            ) : (
              !isPublicViewer && song.key_note && (
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${KEY_STYLE.chip} ${KEY_STYLE.text}`}>
                  <span className="inline-grid justify-items-center"><span className="col-start-1 row-start-1">{song.key_note}</span><span className="invisible col-start-1 row-start-1" aria-hidden="true">C#</span></span>
                </span>
              )
            )}
            {!isPublicViewer && song.songs.tonality && (
              <span className="text-xs text-zinc-500">{song.songs.tonality}</span>
            )}
            </span>
            )}
          </div>
          {editingNotes ? (
            <div className="mt-1.5 max-w-sm space-y-1.5">
              <input
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                onBlur={() => saveNotes()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveNotes();
                  if (e.key === "Escape") cancelNotes();
                }}
                maxLength={SET_SONG_NOTE_MAX}
                placeholder="e.g. Capo 3, start soft"
                aria-label="Note for this song"
                autoFocus
                className="w-full rounded-xl border border-zinc-300 px-2.5 py-1.5 text-xs focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              {/* onMouseDown keeps the input from blurring (and saving) before the click lands. */}
              <div className="flex items-center gap-2">
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => saveNotes()}
                  className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-400 transition-colors"
                >
                  Save
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={cancelNotes}
                  className="text-xs text-zinc-500 hover:text-zinc-700"
                >
                  Cancel
                </button>
                {song.notes && (
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => saveNotes("")}
                    className="text-xs text-zinc-400 hover:text-red-500"
                  >
                    Remove note
                  </button>
                )}
                <span className="ml-auto text-[10px] text-zinc-400">{notesInput.length}/{SET_SONG_NOTE_MAX}</span>
              </div>
            </div>
          ) : !isPublicViewer && song.notes ? (
            <div className="mt-1.5 flex max-w-sm items-start gap-1.5 rounded-lg bg-zinc-50 px-2.5 py-1.5">
              <svg className="mt-px h-3.5 w-3.5 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <p className="flex-1 min-w-0 text-xs text-zinc-700 break-words">{song.notes}</p>
              {canManage && (
                <button onClick={startEditingNotes} className="shrink-0 text-xs font-medium text-amber-600 hover:text-amber-500">
                  Edit
                </button>
              )}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 flex items-center gap-0.5">
          {/* Ultimate Guitar chord chart */}
          {chord_chart_url ? (
            <ChordsLink href={chord_chart_url} />
          ) : isAdmin || isSongEditor ? (
            <>
              <button
                onClick={() => toggleAdding("chord")}
                className={`sm:hidden rounded-lg p-1.5 transition-all ${addingField === "chord" ? "opacity-100" : "opacity-50 border border-dashed border-zinc-400 hover:opacity-80 hover:border-zinc-500"}`}
                title="Add chord chart"
              >
                <UltimateGuitarIcon />
              </button>
              <button
                onClick={() => toggleAdding("chord")}
                className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border border-dashed pl-1.5 pr-3 py-1 transition-all ${addingField === "chord" ? "opacity-100 border-zinc-400" : "opacity-50 border-zinc-400 hover:opacity-80 hover:border-zinc-500"}`}
                title="Add chord chart"
              >
                <UltimateGuitarIcon />
                <span className="text-xs font-medium text-zinc-600">Chords</span>
              </button>
            </>
          ) : null}

          {/* Spotify */}
          {spotify_url ? (
            <button
              onClick={() => setSpotifyOpen((o) => !o)}
              className={`rounded-lg p-1.5 transition-colors text-green-500 ${spotifyOpen ? "bg-green-50" : "hover:bg-green-50"}`}
              title={spotifyOpen ? "Close player" : "Play on Spotify"}
            >
              <SpotifyIcon />
            </button>
          ) : isAdmin ? (
            <button
              onClick={() => toggleAdding("spotify")}
              className={`rounded-lg p-1.5 transition-colors ${addingField === "spotify" ? "bg-green-50 text-green-500" : "text-green-500 border border-dashed border-green-300 hover:bg-green-50 hover:border-green-400"}`}
              title="Add Spotify link"
            >
              <SpotifyIcon />
            </button>
          ) : null}

          {/* YouTube */}
          {videoId ? (
            <button
              onClick={() => setYoutubeOpen((o) => !o)}
              className={`rounded-lg p-1.5 transition-colors text-red-500 ${youtubeOpen ? "bg-red-50" : "hover:bg-red-50"}`}
              title={youtubeOpen ? "Close video" : "Watch on YouTube"}
            >
              <YoutubeIcon />
            </button>
          ) : isAdmin ? (
            <button
              onClick={() => toggleAdding("youtube")}
              className={`rounded-lg p-1.5 transition-colors ${addingField === "youtube" ? "bg-red-50 text-red-500" : "text-red-400 border border-dashed border-red-300 hover:bg-red-50 hover:text-red-500 hover:border-red-400"}`}
              title="Add YouTube link"
            >
              <YoutubeIcon />
            </button>
          ) : null}

        </div>
      </div>

      {askingLeadVoice && (
        <ConfidencePicker
          variant="compact"
          singingVoice={currentUserSingingVoice}
          initialAskVoice
          offerLearn={false}
          onSave={async (level) => { await onAddToRepertoire(song.song_id, level); setAskingLeadVoice(false); }}
          onCancel={() => setAskingLeadVoice(false)}
          onVoiceUpdated={onVoiceUpdated}
        />
      )}

      {(showRepertoireButtons || showPeople || showPlayed || showRole || menuItems.length > 0 || guestRemove) && (
        // The ⋯ sits in the card's bottom-right corner, on whatever row is last,
        // so it never adds a line of its own.
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0 space-y-2">
              {/* Below the title row rather than inside it, so on a phone both buttons
                  get the card's full width and sit side by side. */}
              {showRepertoireButtons && (
                !currentUserId ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={signInUrl}
                      className="inline-flex items-center gap-1 rounded-full bg-indigo-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-400 transition-colors"
                    >
                      I know this song!
                    </a>
                    <a href={signInUrl} className="inline-flex items-center rounded-full bg-white px-2.5 py-1.5 text-xs font-medium text-indigo-600 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50 transition-colors">
                      Want to learn it
                    </a>
                  </div>
                ) : pickingRepertoire ? (
                  <div>
                    <ConfidencePicker
                      variant="compact"
                      singingVoice={currentUserSingingVoice}
                      onSave={async (level) => { await onAddToRepertoire(song.song_id, level); setPickingRepertoire(false); }}
                      onCancel={() => setPickingRepertoire(false)}
                      offerLearn={false}
                      onVoiceUpdated={onVoiceUpdated}
                    />
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setPickingRepertoire(true)}
                      className="inline-flex items-center gap-1 rounded-full bg-indigo-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-400 transition-colors"
                    >
                      I know this song!
                    </button>
                    <button
                      onClick={() => onAddToRepertoire(song.song_id, "learn")}
                      className="inline-flex items-center rounded-full bg-white px-2.5 py-1.5 text-xs font-medium text-indigo-600 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50 transition-colors"
                    >
                      Want to learn it
                    </button>
                  </div>
                )
              )}

              {showPeople && (
                <div className="space-y-1">
                  {(leadParticipants.length > 0 || (canManage && participants.length > 0)) && (
                    <div className="flex items-start gap-1.5">
                      <span className={`shrink-0 text-[10px] font-medium pt-0.5 ${CONFIDENCE_STYLES.lead.label}`}>Lead</span>
                      <div className="flex flex-wrap gap-1 flex-1">
                        {canManage && leaderIds.length === 0 && !hasEligible && (
                          <span className="rounded-full border border-dashed border-amber-300 px-2 py-0.5 text-xs font-medium text-amber-500">
                            No leader
                          </span>
                        )}
                        {leadShown.map((p, i) => {
                          const isLeader = leaderIds.includes(p.user_id);
                          // Anyone who has joined the set can put themselves forward; choosing
                          // someone else is for the owner and co-owners.
                          const isClickable = participantKnowledge.get(p.user_id) === "lead" && (canManage || p.user_id === currentUserId);
                          const firstName = p.display_name ?? p.username ?? "?";
                          const name = p.last_name ? `${firstName} ${p.last_name[0].toUpperCase()}.` : firstName;
                          const personalKey = participantKeys.get(p.user_id);
                          const pillStyle = isLeader ? "bg-amber-400 text-white" : `${CONFIDENCE_STYLES.lead.pill} ${CONFIDENCE_STYLES.lead.pillText}`;
                          return (
                            <button
                              key={p.user_id}
                              type="button"
                              onClick={() => isClickable && handleToggleLeader(p.user_id)}
                              disabled={!isClickable}
                              className={`rounded-full px-2 py-0.5 text-xs transition-all ${pillVisibility(i, leadShown.length)} ${ownWeight(p.user_id)} ${pillStyle} ${isClickable ? "cursor-pointer hover:opacity-75" : "cursor-default"}`}
                            >
                              {name}
                              {personalKey && ` (${personalKey})`}
                            </button>
                          );
                        })}
                        {moreToggle(leadShown.length)}
                      </div>
                    </div>
                  )}
                  {supportParticipants.length > 0 && (
                    <div className="flex items-start gap-1.5">
                      <span className={`shrink-0 text-[10px] font-medium pt-0.5 ${CONFIDENCE_STYLES.support.label}`}>Support</span>
                      <div className="flex flex-wrap gap-1 flex-1">
                        {supportShown.map((p, i) => {
                          const firstName = p.display_name ?? p.username ?? "?";
                          const label = p.last_name ? `${firstName} ${p.last_name[0].toUpperCase()}.` : firstName;
                          return (
                            <span
                              key={p.user_id}
                              className={`rounded-full px-2 py-0.5 text-xs ${pillVisibility(i, supportShown.length)} ${CONFIDENCE_STYLES.support.pill} ${CONFIDENCE_STYLES.support.pillText} ${ownWeight(p.user_id)}`}
                            >
                              {label}
                            </span>
                          );
                        })}
                        {moreToggle(supportShown.length)}
                      </div>
                    </div>
                  )}
                  {learnParticipants.length > 0 && (
                    <div className="flex items-start gap-1.5">
                      <span className={`shrink-0 text-[10px] font-medium pt-0.5 ${CONFIDENCE_STYLES.learn.label}`}>Learning</span>
                      <div className="flex flex-wrap gap-1 flex-1">
                        {learnShown.map((p, i) => {
                          const firstName = p.display_name ?? p.username ?? "?";
                          const label = p.last_name ? `${firstName} ${p.last_name[0].toUpperCase()}.` : firstName;
                          return (
                            <span key={p.user_id} className={`rounded-full px-2 py-0.5 text-xs ${pillVisibility(i, learnShown.length)} ${CONFIDENCE_STYLES.learn.pill} ${CONFIDENCE_STYLES.learn.pillText} ${ownWeight(p.user_id)}`}>
                              {label}
                            </span>
                          );
                        })}
                        {moreToggle(learnShown.length)}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {(showRole || showPlayed) && (
              <div className="flex flex-wrap items-center gap-2">
              {showRole && (
                <RoleSelect
                  value={myConfidence!}
                  onChange={(level) => {
                    if (level === "lead" && !hasLeadVoice(currentUserSingingVoice)) setAskingLeadVoice(true);
                    else onAddToRepertoire(song.song_id, level);
                  }}
                />
              )}
              {canManage ? (
                <button
                  onClick={() => onTogglePlayed(song.id, !song.played)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    song.played
                      ? "bg-green-500 text-white hover:bg-green-400"
                      : "border border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50"
                  }`}
                >
                  {song.played && <CheckIcon />}
                  {song.played ? "Played" : "Mark as played"}
                </button>
              ) : song.played ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-500 px-2.5 py-1 text-xs font-medium text-white">
                  <CheckIcon />
                  Played
                </span>
              ) : null}
              </div>
              )}
          </div>
          {menuItems.length > 0 && <SongMenu items={menuItems} />}
          {guestRemove && <RemoveButton onRemove={() => onRemove(song.song_id)} />}
        </div>
      )}

      {youtubeOpen && videoId && (
        <div className="rounded-xl overflow-hidden border border-zinc-200">
          <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube.com/embed/${videoId}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {spotifyOpen && spotifyTrackId && (
        <iframe
          src={`https://open.spotify.com/embed/track/${spotifyTrackId}?utm_source=generator`}
          width="100%"
          height="152"
          className="rounded-xl border-0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        />
      )}

      {addingField && (
        <div className="space-y-2">
          {addingField === "youtube" && (
            <div>
              {youtubeSearching && (
                <p className="text-xs text-zinc-400 py-1">Searching YouTube…</p>
              )}
              {!youtubeSearching && youtubeSearchResults.length > 0 && (
                <div className="rounded-lg border border-zinc-200 divide-y divide-zinc-100 overflow-hidden">
                  {youtubeSearchResults.map((r) => (
                    <div key={r.videoId} className="flex items-center justify-between gap-3 px-3 py-2 bg-white">
                      <div className="min-w-0">
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-amber-600 hover:underline truncate block">{r.title}</a>
                        <div className="text-xs text-zinc-400 truncate">{r.channel}</div>
                      </div>
                      <button
                        onClick={() => saveMedia("youtube", r.url)}
                        disabled={saving}
                        className="shrink-0 rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:border-amber-400 hover:text-amber-600 disabled:opacity-50 transition-colors"
                      >
                        Select
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {!youtubeSearching && youtubeSearchResults.length === 0 && (
                <p className="text-xs text-zinc-400 py-1">No results — paste URL below.</p>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={placeholders[addingField]}
              className="flex-1 rounded-xl border border-zinc-300 px-2.5 py-1.5 text-xs focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") { setAddingField(null); setUrlInput(""); setYoutubeSearchResults([]); } }}
              autoFocus={addingField !== "youtube"}
            />
            <button
              onClick={handleSave}
              disabled={saving || !urlInput.trim()}
              className="rounded-full bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => { setAddingField(null); setUrlInput(""); setYoutubeSearchResults([]); }}
              className="text-xs text-zinc-400 hover:text-zinc-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type MenuItem = { label: string; onSelect: () => void; destructive?: boolean };

function RemoveButton({ onRemove }: { onRemove: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => { setConfirming(false); onRemove(); }}
          className="rounded-full bg-red-500 px-2 py-1 text-xs font-medium text-white hover:bg-red-400 transition-colors"
        >
          Remove
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center">
      <button
        onClick={() => setConfirming(true)}
        className="sm:hidden p-1 text-zinc-300 hover:text-red-400 transition-colors"
        aria-label="Remove song"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>
      <button
        onClick={() => setConfirming(true)}
        className="hidden sm:inline-flex rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500 transition-colors"
      >
        Remove
      </button>
    </div>
  );
}

function SongMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  // A destructive item asks again in place before it runs.
  const [confirming, setConfirming] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function close() {
    setOpen(false);
    setConfirming(null);
  }

  // Same trigger and menu styling as the set's own ⋯ menu (SetDetail, SetCard).
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className="p-1 text-zinc-400 hover:text-zinc-600 transition-colors"
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden="true">
          <circle cx="4" cy="10" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="16" cy="10" r="1.5" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 bottom-full mb-1 w-40 rounded-xl border border-zinc-200 bg-white shadow-lg z-10 overflow-hidden py-1">
          {items.map((item) =>
            confirming === item.label ? (
              <div key={item.label} className="flex gap-2 px-3 py-2">
                <button
                  onClick={() => setConfirming(null)}
                  className="flex-1 rounded-full border border-zinc-300 bg-white px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { close(); item.onSelect(); }}
                  className="flex-1 rounded-full bg-red-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                key={item.label}
                role="menuitem"
                onClick={() => {
                  if (item.destructive) { setConfirming(item.label); return; }
                  close();
                  item.onSelect();
                }}
                className={`w-full text-left flex items-center px-4 py-2.5 text-sm transition-colors ${item.destructive ? "text-red-600 hover:bg-red-50" : "text-zinc-700 hover:bg-zinc-50"}`}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
