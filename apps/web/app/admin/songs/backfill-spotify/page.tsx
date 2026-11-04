"use client";

import { useEffect, useState } from "react";

type PendingEntry = {
  song_id: string;
  artist_id: string;
  position: number;
  title: string;
  display_artist: string | null;
  artist_name: string;
};

type EntryResult =
  | { status: "pending" }
  | { status: "running" }
  | { status: "found"; spotify_url: string }
  | { status: "not_found" }
  | { status: "error"; reason: string };

export default function BackfillSpotifyPage() {
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const [results, setResults] = useState<EntryResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    fetch("/api/admin/songs/backfill-spotify")
      .then((r) => r.json())
      .then((d) => {
        setPending(d.pending ?? []);
        setResults((d.pending ?? []).map(() => ({ status: "pending" as const })));
        setLoading(false);
      });
  }, []);

  async function runBackfill() {
    setRunning(true);
    const current: EntryResult[] = pending.map(() => ({ status: "pending" }));
    setResults([...current]);

    for (let i = 0; i < pending.length; i++) {
      const entry = pending[i];
      current[i] = { status: "running" };
      setResults([...current]);

      try {
        const params = new URLSearchParams({ title: entry.title, artist: entry.artist_name });
        const lookupRes = await fetch(`/api/songs/lookup?${params}`);
        const lookupData = lookupRes.ok ? await lookupRes.json() : {};
        const spotifyUrl: string | null = lookupData.spotify_url ?? null;

        if (spotifyUrl) {
          const patchRes = await fetch("/api/admin/songs/backfill-spotify", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              song_id: entry.song_id,
              artist_id: entry.artist_id,
              spotify_url: spotifyUrl,
            }),
          });
          if (patchRes.ok) {
            current[i] = { status: "found", spotify_url: spotifyUrl };
          } else {
            current[i] = { status: "error", reason: "Failed to save" };
          }
        } else {
          current[i] = { status: "not_found" };
        }
      } catch {
        current[i] = { status: "error", reason: "Request failed" };
      }

      setResults([...current]);
      setProgress(i + 1);
      if (i < pending.length - 1) await new Promise((r) => setTimeout(r, 600));
    }

    setRunning(false);
  }

  const statusCounts = results.reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; },
    {} as Record<string, number>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-56 animate-pulse rounded bg-zinc-200" />
            <div className="h-4 w-80 animate-pulse rounded bg-zinc-100" />
          </div>
          <div className="h-9 w-32 animate-pulse rounded-lg bg-zinc-100" />
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
            <div className="h-3 w-full animate-pulse rounded bg-zinc-200" />
          </div>
          <div className="divide-y divide-slate-100">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-2">
                <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-200" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-zinc-100" />
                <div className="h-3 w-16 animate-pulse rounded bg-zinc-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Backfill Spotify links</h1>
          <p className="mt-1 text-sm text-slate-500">
            {pending.length} recording artist{pending.length !== 1 ? "s" : ""} with no Spotify link.
            Searches Spotify by song title and artist name and saves any matches.
          </p>
        </div>
        {pending.length > 0 && (
          <button
            onClick={runBackfill}
            disabled={running || pending.length === 0}
            className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-40"
          >
            {running ? `Running… ${progress}/${pending.length}` : `Run backfill`}
          </button>
        )}
      </div>

      {running && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-2 rounded-full bg-amber-500 transition-all"
            style={{ width: `${(progress / pending.length) * 100}%` }}
          />
        </div>
      )}

      {!running && progress > 0 && (
        <div className="flex gap-4 text-sm">
          {statusCounts.found ? <span className="text-emerald-600">✓ {statusCounts.found} linked</span> : null}
          {statusCounts.not_found ? <span className="text-slate-400">— {statusCounts.not_found} not found on Spotify</span> : null}
          {statusCounts.error ? <span className="text-red-500">✗ {statusCounts.error} errors</span> : null}
        </div>
      )}

      {pending.length === 0 && !loading && (
        <p className="text-sm text-slate-400">All recording artists already have Spotify links.</p>
      )}

      {pending.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Song</th>
                <th className="px-4 py-2 text-left font-medium">Artist</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pending.map((entry, i) => {
                const result = results[i];
                return (
                  <tr key={`${entry.song_id}:${entry.artist_id}`} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium">
                      <a
                        href={`/songs/${entry.song_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-800 hover:underline"
                      >
                        {entry.title}
                      </a>
                    </td>
                    <td className="px-4 py-2 text-slate-500">{entry.artist_name}</td>
                    <td className="px-4 py-2">
                      {result?.status === "pending" && <span className="text-slate-300">—</span>}
                      {result?.status === "running" && <span className="text-amber-500">Searching…</span>}
                      {result?.status === "found" && (
                        <a
                          href={(result as { status: "found"; spotify_url: string }).spotify_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-600 hover:underline"
                        >
                          ✓ Linked
                        </a>
                      )}
                      {result?.status === "not_found" && <span className="text-slate-400">Not found</span>}
                      {result?.status === "error" && (
                        <span className="text-red-500">
                          ✗ {(result as { status: "error"; reason: string }).reason}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
