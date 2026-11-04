"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Song = { id: string; title: string; display_artist: string | null };

type Suggestion = {
  song: Song;
  musicbrainz: {
    year?: number;
    display_artist?: string;
    languages?: string[];
    composers?: string[];
    lyricists?: string[];
    recording_artists?: string[];
  } | null;
  spotify: {
    popularity?: number;
    energy?: number;
    genres?: string[];
  } | null;
  genius: {
    first_line?: string;
    lyrics_url?: string;
  } | null;
  error?: string;
};

type ApplyField = {
  field: string;
  value: string | number;
  label: string;
};

export default function BulkEnrichPage() {
  const supabase = supabaseBrowser();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [applying, setApplying] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase
      .from("songs")
      .select("id, title, display_artist")
      .order("title")
      .then(({ data }) => {
        setSongs(data ?? []);
        setLoading(false);
      });
  }, []);

  async function runEnrichment(selected: Song[]) {
    setRunning(true);
    setSuggestions([]);
    setProgress(0);

    const results: Suggestion[] = [];

    for (let i = 0; i < selected.length; i++) {
      const song = selected[i];
      try {
        const res = await fetch(
          `/api/enrich?title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.display_artist ?? "")}`
        );
        const data = await res.json();
        results.push({ song, ...data });
      } catch {
        results.push({ song, musicbrainz: null, spotify: null, genius: null, error: "Request failed" });
      }
      setProgress(i + 1);
      setSuggestions([...results]);
    }

    setRunning(false);
  }

  async function applyField(songId: string, field: string, value: string | number) {
    const key = `${songId}:${field}`;
    setApplying((prev) => new Set(prev).add(key));

    const { error } = await supabase
      .from("songs")
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq("id", songId);

    setApplying((prev) => { const next = new Set(prev); next.delete(key); return next; });

    if (!error) {
      setApplied((prev) => new Set(prev).add(key));
    }
  }

  const hasSuggestions = (s: Suggestion) =>
    s.musicbrainz?.year ||
    s.musicbrainz?.display_artist ||
    s.spotify?.popularity ||
    s.spotify?.energy ||
    s.genius?.first_line;

  const applyFields = (s: Suggestion): ApplyField[] => {
    const fields: ApplyField[] = [];
    if (s.musicbrainz?.year)
      fields.push({ field: "year", value: s.musicbrainz.year, label: `Year: ${s.musicbrainz.year}` });
    if (s.musicbrainz?.display_artist)
      fields.push({ field: "display_artist", value: s.musicbrainz.display_artist, label: `Artist: ${s.musicbrainz.display_artist}` });
    if (s.spotify?.popularity)
      fields.push({ field: "popularity", value: s.spotify.popularity, label: `Popularity: ${s.spotify.popularity}/5` });
    if (s.spotify?.energy)
      fields.push({ field: "energy", value: s.spotify.energy, label: `Energy: ${s.spotify.energy}/5` });
    if (s.genius?.first_line)
      fields.push({ field: "first_line", value: s.genius.first_line, label: `First line: "${s.genius.first_line}"` });
    return fields;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-48 animate-pulse rounded bg-zinc-200" />
            <div className="h-4 w-72 animate-pulse rounded bg-zinc-100" />
          </div>
          <div className="h-9 w-40 animate-pulse rounded-lg bg-zinc-100" />
        </div>

        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-200" />
              <div className="flex flex-wrap gap-2">
                <div className="h-6 w-24 animate-pulse rounded-full bg-zinc-100" />
                <div className="h-6 w-32 animate-pulse rounded-full bg-zinc-100" />
                <div className="h-6 w-20 animate-pulse rounded-full bg-zinc-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Bulk enrich songs</h1>
          <p className="mt-1 text-sm text-slate-500">
            {songs.length} songs in the database. Fetches MusicBrainz, Spotify, and Genius for each.
          </p>
        </div>
        <button
          onClick={() => runEnrichment(songs)}
          disabled={running || songs.length === 0}
          className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-40"
        >
          {running ? `Enriching… ${progress}/${songs.length}` : `✦ Enrich all ${songs.length} songs`}
        </button>
      </div>

      {running && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-2 rounded-full bg-amber-500 transition-all"
            style={{ width: `${(progress / songs.length) * 100}%` }}
          />
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-medium text-slate-600">
            {suggestions.filter(hasSuggestions).length} songs with suggestions ·{" "}
            {suggestions.filter((s) => s.error).length} errors
          </div>

          {suggestions.filter(hasSuggestions).map((s) => (
            <div key={s.song.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="font-medium text-slate-900">
                {s.song.title}
                {s.song.display_artist && (
                  <span className="ml-2 font-normal text-slate-400">— {s.song.display_artist}</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {applyFields(s).map(({ field, value, label }) => {
                  const key = `${s.song.id}:${field}`;
                  const isApplied = applied.has(key);
                  const isApplying = applying.has(key);
                  return (
                    <button
                      key={field}
                      onClick={() => applyField(s.song.id, field, value)}
                      disabled={isApplied || isApplying}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        isApplied
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-amber-400 hover:bg-amber-50"
                      }`}
                    >
                      {isApplied ? "✓ " : ""}{label}
                    </button>
                  );
                })}

                {s.genius?.lyrics_url && (
                  <a
                    href={s.genius.lyrics_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs text-orange-700 hover:bg-orange-100"
                  >
                    Genius lyrics ↗
                  </a>
                )}
              </div>

              {(s.musicbrainz?.composers?.length || s.musicbrainz?.lyricists?.length || s.musicbrainz?.recording_artists?.length) ? (
                <div className="text-xs text-slate-400 space-y-0.5">
                  {s.musicbrainz?.composers?.length ? <div>Composers: {s.musicbrainz.composers.join(", ")}</div> : null}
                  {s.musicbrainz?.lyricists?.length ? <div>Lyricists: {s.musicbrainz.lyricists.join(", ")}</div> : null}
                  {s.musicbrainz?.recording_artists?.length ? <div>Recording artists: {s.musicbrainz.recording_artists.join(", ")}</div> : null}
                  <div className="text-slate-300">People associations can be set in the individual song editor.</div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
