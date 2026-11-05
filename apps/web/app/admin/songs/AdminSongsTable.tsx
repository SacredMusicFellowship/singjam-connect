"use client";

import Link from "next/link";
import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import DeleteSongButton from "./DeleteSongButton";
import { fetchAllRows, songMissingFields } from "@singjam/core";
import { formatComposers } from "@/lib/formatComposers";
import { matchesSearch } from "@/lib/normalizeSearch";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import SearchInput from "@/components/SearchInput";

import Select from "@/components/Select";
type Song = {
  id: string;
  title: string;
  slug: string | null;
  display_artist: string | null;
  first_line: string | null;
  hook: string | null;
  genius_url: string | null;
  chord_chart_url: string | null;
  year_written: number | null;
  tonality: string | null;
  meter: string | null;
  vibe: string | null;
  song_composers: { people: { name: string } | null }[];
  song_lyricists: { people: { name: string } | null }[];
  song_cultures: { cultures: { name: string } | null }[];
  song_recording_artists: { year: number | null; youtube_url: string | null }[];
  youtube_url: string | null;
  song_genres: { genre_id: string }[];
  song_languages: { language_id: string }[];
  user_songs: { count: number }[];
  created_at: string;
  submitted_by: string | null;
  profiles: { display_name: string | null; last_name: string | null; username: string | null } | null;
};

type SortCol = "title" | "songwriters" | "artist" | "year" | "popularity" | "added" | "missing";

export const BEFORE_TRACKING = "before-tracking";

function adderName(p: Song["profiles"]): string | null {
  if (!p) return null;
  return [p.display_name, p.last_name].filter(Boolean).join(" ") || p.username || null;
}
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortCol | "actions"; label: string; defaultWidth: number; sortable: boolean }[] = [
  { key: "title",       label: "Title",               defaultWidth: 160, sortable: true },
  { key: "songwriters", label: "Songwriters",          defaultWidth: 140, sortable: true },
  { key: "artist",      label: "Artist(s)",            defaultWidth: 110, sortable: true },
  { key: "year",        label: "Year",                 defaultWidth: 80,  sortable: true },
  { key: "popularity",  label: "SingJam popularity",   defaultWidth: 80,  sortable: true },
  { key: "added",       label: "Added",                defaultWidth: 120, sortable: true },
  { key: "missing",     label: "Missing",              defaultWidth: 220, sortable: true },
  { key: "actions",     label: "Actions",              defaultWidth: 100, sortable: false },
];

// The Songs table for admins and song editors. Song editors get everything but
// deleting; `addedBy` presets the "Added by" filter (?added_by= from the Users page).
export default function AdminSongsTable({ basePath = "/admin/songs", isAdmin = true, addedBy = "" }: { basePath?: string; isAdmin?: boolean; addedBy?: string }) {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const equalWidth = 100 / COLUMNS.length;
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [widths, setWidths] = useState<number[]>(COLUMNS.map(() => equalWidth));
  const [wrap, setWrap] = useState(true);
  const [query, setQuery] = useState("");
  const [adderFilter, setAdderFilter] = useState(addedBy);
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "missing", dir: "desc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchAllRows<Song>((from, to) =>
      supabase
        .from("songs")
        .select(`
          id, title, slug, display_artist,
          first_line, hook, genius_url, chord_chart_url, youtube_url, tonality, meter, vibe, year_written,
          song_composers(people(name)),
          song_lyricists(people(name)),
          song_recording_artists(year, youtube_url),
          song_genres(genre_id),
          song_languages(language_id),
          song_cultures(cultures(name)),
          user_songs(count),
          created_at, submitted_by,
          profiles!submitted_by(display_name, last_name, username)
        `)
        .order("title")
        .order("id")
        .range(from, to) as any
    ).then(setSongs, (err: any) =>
      // supabase-js stringifies network failures into the message ("TypeError: …")
      setLoadError(String(err?.message ?? err).replace(/^\w*Error:\s*/, "") || "unknown error")
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dragging = useRef<{ col: number; startX: number; startW: number } | null>(null);

  const onMouseDown = useCallback((colIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = { col: colIndex, startX: e.clientX, startW: widths[colIndex] };

    function onMove(ev: MouseEvent) {
      if (!dragging.current) return;
      const { col, startX, startW } = dragging.current;
      const newW = Math.max(60, startW + (ev.clientX - startX));
      setWidths((prev) => {
        const next = [...prev];
        next[col] = newW;
        return next;
      });
    }
    function onUp() {
      dragging.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [widths]);

  function toggleSort(col: SortCol) {
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: col === "missing" || col === "added" ? "desc" : "asc" }
    );
  }

  const enriched = useMemo(() =>
    (songs ?? []).map((s) => {
      const songwriterNames = new Set<string>([
        ...s.song_composers.map((c) => c.people?.name).filter(Boolean) as string[],
        ...s.song_lyricists.map((l) => l.people?.name).filter(Boolean) as string[],
      ]);
      const cultures = s.song_cultures.map((c) => c.cultures?.name).filter(Boolean) as string[];
      const songwriterNamesRaw = [...songwriterNames].sort().join(" ");
      const songwriters = songwriterNames.size
        ? formatComposers([...songwriterNames].sort(), cultures)
        : "—";
      const years = s.song_recording_artists
        .map((r) => r.year)
        .filter((y): y is number => typeof y === "number");
      const firstRecording = years.length ? Math.min(...years) : null;
      const yw = s.year_written ?? null;
      const firstYear = yw && firstRecording ? Math.min(yw, firstRecording) : yw ?? firstRecording ?? null;
      const missing = songMissingFields(s);
      return { ...s, songwriters, songwriterNamesRaw, firstYear, missing };
    }),
  [songs]);

  const adders = useMemo(() => {
    const byId = new Map<string, string>();
    for (const s of songs ?? []) if (s.submitted_by) byId.set(s.submitted_by, adderName(s.profiles) ?? "Unknown user");
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [songs]);

  const filtered = useMemo(() => {
    return enriched.filter((s) => {
      if (adderFilter === BEFORE_TRACKING ? s.submitted_by : adderFilter && s.submitted_by !== adderFilter) return false;
      const hay = [s.title, s.display_artist ?? "", s.songwriterNamesRaw, s.first_line ?? "", s.hook ?? ""].join(" ");
      return matchesSearch(hay, query);
    });
  }, [enriched, query, adderFilter]);

  const sorted = useMemo(() => {
    const { col, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (col === "title")       cmp = a.title.localeCompare(b.title);
      else if (col === "songwriters") cmp = a.songwriters.localeCompare(b.songwriters);
      else if (col === "artist") {
        const strip = (v: string) => v.replace(/^the\s+/i, "");
        cmp = strip(a.display_artist ?? "").localeCompare(strip(b.display_artist ?? ""));
      }
      else if (col === "year")   cmp = (a.firstYear ?? Infinity) - (b.firstYear ?? Infinity);
      else if (col === "popularity") cmp = (a.user_songs[0]?.count ?? 0) - (b.user_songs[0]?.count ?? 0);
      else if (col === "added") cmp = a.created_at.localeCompare(b.created_at);
      else if (col === "missing") cmp = a.missing.length - b.missing.length;
      return cmp * mul || a.title.localeCompare(b.title);
    });
  }, [filtered, sort]);

  const allVisibleIds = sorted.map((s) => s.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) allVisibleIds.forEach((id) => next.delete(id));
      else allVisibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selected.size} song${selected.size === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setDeleting(true);
    const { error } = await supabase.from("songs").delete().in("id", [...selected]);
    setDeleting(false);
    if (error) { alert(error.message); return; }
    setSelected(new Set());
    router.refresh();
  }

  const cellClass = wrap ? "px-4 py-2.5 whitespace-normal" : "px-4 py-2.5 truncate";

  if (loadError !== null) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 shadow-sm">
        Could not load the song list — {loadError}. Reload to try again.
      </div>
    );
  }

  if (songs === null) {
    return (
      <div className="space-y-2">
        <div className="rounded-2xl border border-zinc-200 p-5 shadow-sm">
          <div className="h-4 w-16 animate-pulse rounded bg-zinc-200" />
          <div className="mt-2 h-9 animate-pulse rounded-lg bg-zinc-100" />
        </div>

        {/* Mobile card skeleton */}
        <div className="sm:hidden space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-200" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-100" />
                </div>
                <div className="h-4 w-8 shrink-0 animate-pulse rounded bg-zinc-100" />
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table skeleton */}
        <div className="hidden sm:block overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <div className="h-3 w-full animate-pulse rounded bg-zinc-200" />
          </div>
          <div className="divide-y divide-slate-100">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-2.5">
                <div className="h-4 w-1/4 animate-pulse rounded bg-zinc-200" />
                <div className="h-3 w-1/5 animate-pulse rounded bg-zinc-100" />
                <div className="h-3 w-1/6 animate-pulse rounded bg-zinc-100" />
                <div className="h-3 w-10 animate-pulse rounded bg-zinc-100" />
                <div className="h-3 w-12 animate-pulse rounded bg-zinc-100" />
                <div className="h-3 w-20 animate-pulse rounded bg-zinc-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-zinc-200 p-5 shadow-sm">
        <label className="block text-sm font-medium mb-1">Search</label>
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          placeholder="Search by title, songwriter, artist, first line, or hook…"
          autoComplete="off"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="added-by" className="text-xs font-medium text-zinc-600">Added by</label>
          <Select
            id="added-by"
            value={adderFilter}
            onChange={(e) => setAdderFilter(e.target.value)}
            shape="pill"
            size="sm"
          >
            <option value="">Anyone</option>
            {adders.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            <option value={BEFORE_TRACKING}>Before tracking</option>
          </Select>
        </div>
        {(query.trim() || adderFilter) && (
          <p className="mt-2 text-xs text-zinc-500">{filtered.length} of {songs.length} songs</p>
        )}
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {sorted.map((s) => {
          const editHref = `${basePath}/${s.slug ?? s.id}`;
          return (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 truncate">{s.title}</div>
                  {s.songwriters !== "—" && (
                    <div className="mt-0.5 text-xs text-slate-500 truncate">{s.songwriters}</div>
                  )}
                  <div className="mt-0.5 text-xs text-slate-400 truncate">
                    Added {s.created_at.slice(0, 10)}{s.submitted_by ? ` by ${adderName(s.profiles) ?? "Unknown user"}` : ""}
                  </div>
                  {s.missing.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {s.missing.map((m) => (
                        <span key={m} className="rounded-full bg-red-50 border border-red-200 px-1.5 py-0.5 text-xs text-red-500">
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <Link href={editHref} className="shrink-0 text-sm font-medium text-amber-600 hover:text-amber-500">
                  Edit
                </Link>
              </div>
            </div>
          );
        })}
        {!sorted.length && (
          <p className="py-8 text-center text-sm text-slate-400">
            {query.trim() ? "No songs match that search." : "No songs yet."}
          </p>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:flex items-center justify-between">
        {isAdmin && selected.size > 0 ? (
          <button
            onClick={handleBulkDelete}
            disabled={deleting}
            className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-40"
          >
            {deleting ? "Deleting…" : `Delete ${selected.size} selected`}
          </button>
        ) : <div />}
        <button
          onClick={() => setWrap((w) => !w)}
          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
        >
          {wrap ? "Clip cells" : "Wrap cells"}
        </button>
      </div>
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            {widths.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <th className="w-8 px-3 py-3">
                {isAdmin && <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-amber-500" />}
              </th>
              {COLUMNS.map((col, i) => (
                <th
                  key={col.key}
                  className="relative px-4 py-3 select-none"
                  style={{ width: widths[i] }}
                >
                  {col.sortable ? (
                    <button
                      onClick={() => toggleSort(col.key as SortCol)}
                      className="flex items-center gap-1 hover:text-slate-800"
                    >
                      {col.label}
                      <span className="text-slate-300">
                        {sort.col === col.key
                          ? sort.dir === "asc" ? "↑" : "↓"
                          : "↕"}
                      </span>
                    </button>
                  ) : col.label}
                  {i < COLUMNS.length - 1 && (
                    <div
                      onMouseDown={(e) => onMouseDown(i, e)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-amber-300 active:bg-amber-400"
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((s) => {
              const viewHref = `/songs/${s.slug ?? s.id}`;
              const editHref = `${basePath}/${s.slug ?? s.id}`;

              return (
                <tr key={s.id} className={`hover:bg-slate-50 ${selected.has(s.id) ? "bg-amber-50" : ""}`}>
                  <td className="w-8 px-3 py-2.5">
                    {isAdmin && <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleOne(s.id)} className="accent-amber-500" />}
                  </td>
                  <td className={`${cellClass} font-medium`}>
                    <Link href={viewHref} className={`text-slate-900 hover:text-amber-600 hover:underline ${wrap ? "" : "truncate"} block`}>
                      {s.title}
                    </Link>
                  </td>
                  <td className={`${cellClass} text-slate-500`}>{s.songwriters}</td>
                  <td className={`${cellClass} text-slate-500`}>{s.display_artist ?? "—"}</td>
                  <td className={`${cellClass} text-slate-500`}>{s.firstYear ?? "—"}</td>
                  <td className={`${cellClass} text-slate-500`}>{s.user_songs[0]?.count ?? 0}</td>
                  <td className={`${cellClass} text-xs text-slate-500`}>
                    <div>{s.submitted_by ? adderName(s.profiles) ?? "Unknown user" : <span className="text-slate-300">before tracking</span>}</div>
                    <div className="text-slate-400">{s.created_at.slice(0, 10)}</div>
                  </td>
                  <td className={cellClass}>
                    {s.missing.length === 0 ? (
                      <span className="text-xs text-slate-300">✓</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {s.missing.map((m) => (
                          <span key={m} className="rounded-full bg-red-50 border border-red-200 px-1.5 py-0.5 text-xs text-red-500">
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className={cellClass}>
                    <div className="flex items-center gap-3">
                      <Link href={editHref} className="text-amber-600 hover:text-amber-500">
                        Edit
                      </Link>
                      {isAdmin && <DeleteSongButton id={s.id} />}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!sorted.length && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  {query.trim() ? "No songs match that search." : "No songs yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
