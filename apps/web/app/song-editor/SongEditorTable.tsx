"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchAllRows } from "@singjam/core";
import { supabaseBrowser } from "@/lib/supabase/client";
import { matchesSearch } from "@/lib/normalizeSearch";
import SearchInput from "@/components/SearchInput";
import Link from "next/link";

type Song = {
  id: string;
  title: string;
  slug: string | null;
  display_artist: string | null;
  chord_chart_url: string | null;
  genius_url: string | null;
};

type EditState = { chord_chart_url: string; genius_url: string };

export default function SongEditorTable({ initialQuery = "" }: { initialQuery?: string }) {
  const supabase = supabaseBrowser();
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // A song page's Edit link opens the table already searched to that song.
  const [query, setQuery] = useState(initialQuery);
  const [editing, setEditing] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchAllRows<Song>((from, to) =>
      supabase
        .from("songs")
        .select("id, title, slug, display_artist, chord_chart_url, genius_url")
        .order("title")
        .order("id")
        .range(from, to)
    ).then(setSongs, (err: any) =>
      // supabase-js stringifies network failures into the message ("TypeError: …")
      setLoadError(String(err?.message ?? err).replace(/^\w*Error:\s*/, "") || "unknown error")
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!songs) return [];
    return songs.filter((s) =>
      matchesSearch([s.title, s.display_artist ?? ""].join(" "), query)
    );
  }, [songs, query]);

  function startEdit(song: Song) {
    setEditing((prev) => ({
      ...prev,
      [song.id]: {
        chord_chart_url: song.chord_chart_url ?? "",
        genius_url: song.genius_url ?? "",
      },
    }));
    setSaved((prev) => ({ ...prev, [song.id]: false }));
  }

  function cancelEdit(id: string) {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function saveEdit(song: Song) {
    const state = editing[song.id];
    if (!state) return;
    setSaving((prev) => ({ ...prev, [song.id]: true }));
    const res = await fetch(`/api/song-editor/songs/${song.id}/links`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chord_chart_url: state.chord_chart_url.trim() || null,
        genius_url: state.genius_url.trim() || null,
      }),
    });
    setSaving((prev) => ({ ...prev, [song.id]: false }));
    if (!res.ok) {
      alert("Failed to save. Please try again.");
      return;
    }
    setSongs((prev) =>
      (prev ?? []).map((s) =>
        s.id === song.id
          ? {
              ...s,
              chord_chart_url: state.chord_chart_url.trim() || null,
              genius_url: state.genius_url.trim() || null,
            }
          : s
      )
    );
    setEditing((prev) => {
      const next = { ...prev };
      delete next[song.id];
      return next;
    });
    setSaved((prev) => ({ ...prev, [song.id]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [song.id]: false })), 2000);
  }

  if (loadError !== null) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 shadow-sm">
        Could not load the song list — {loadError}. Reload to try again.
      </div>
    );
  }

  if (songs === null) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-zinc-200 p-5 shadow-sm">
          <div className="h-4 w-16 animate-pulse rounded bg-zinc-200" />
          <div className="mt-2 h-9 animate-pulse rounded-lg bg-zinc-100" />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1.5">
                  <div className="h-4 w-40 animate-pulse rounded bg-zinc-200" />
                  <div className="h-3 w-24 animate-pulse rounded bg-zinc-100" />
                </div>
                <div className="h-4 w-8 shrink-0 animate-pulse rounded bg-zinc-100" />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-3">
                <div className="h-5 w-24 animate-pulse rounded-full bg-zinc-100" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-zinc-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 p-5 shadow-sm">
        <label className="block text-sm font-medium mb-1">Search</label>
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          placeholder="Search by title or artist…"
          autoComplete="off"
        />
        {query.trim() && (
          <p className="mt-2 text-xs text-zinc-500">{filtered.length} of {songs.length} songs</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-400">
            {query.trim() ? "No songs match that search." : "No songs yet."}
          </p>
        )}
        {filtered.map((song) => {
          const state = editing[song.id];
          const isSaving = saving[song.id];
          const wasSaved = saved[song.id];

          return (
            <div key={song.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link href={`/song-editor/songs/${song.slug ?? song.id}`} className="block font-medium text-slate-900 truncate hover:text-teal-600">
                    {song.title}
                  </Link>
                  {song.display_artist && (
                    <p className="text-xs text-slate-500 truncate">{song.display_artist}</p>
                  )}
                </div>
                {!state && (
                  <button
                    onClick={() => startEdit(song)}
                    className="shrink-0 text-sm font-medium text-teal-600 hover:text-teal-500"
                  >
                    {wasSaved ? "Saved ✓" : "Edit"}
                  </button>
                )}
              </div>

              {!state && (
                <div className="mt-1.5 flex flex-wrap gap-3">
                  <LinkPill label="Chord chart" url={song.chord_chart_url} />
                  <LinkPill label="Lyrics" url={song.genius_url} />
                </div>
              )}

              {state && (
                <div className="mt-3 space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Chord chart URL
                    </label>
                    <input
                      value={state.chord_chart_url}
                      onChange={(e) =>
                        setEditing((prev) => ({
                          ...prev,
                          [song.id]: { ...prev[song.id], chord_chart_url: e.target.value },
                        }))
                      }
                      placeholder="https://..."
                      className="w-full rounded-xl border border-zinc-300 px-3 py-1.5 text-sm focus:border-teal-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Lyrics URL
                    </label>
                    <input
                      value={state.genius_url}
                      onChange={(e) =>
                        setEditing((prev) => ({
                          ...prev,
                          [song.id]: { ...prev[song.id], genius_url: e.target.value },
                        }))
                      }
                      placeholder="https://genius.com/..."
                      className="w-full rounded-xl border border-zinc-300 px-3 py-1.5 text-sm focus:border-teal-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => saveEdit(song)}
                      disabled={isSaving}
                      className="rounded-full bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-40"
                    >
                      {isSaving ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => cancelEdit(song.id)}
                      disabled={isSaving}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LinkPill({ label, url }: { label: string; url: string | null }) {
  if (!url) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">
        {label}: —
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-xs text-teal-700 hover:bg-teal-100"
    >
      {label} ↗
    </a>
  );
}
