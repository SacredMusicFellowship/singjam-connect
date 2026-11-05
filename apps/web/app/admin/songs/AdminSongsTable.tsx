"use client";

import Link from "next/link";
import { Fragment, useState, useMemo, useEffect } from "react";
import DeleteSongButton from "./DeleteSongButton";
import { fetchAllRows, formatRecordingArtists, songMissingFields, SONG_COMPLETENESS_FIELDS, type ProductionCredit } from "@singjam/core";
import { formatComposers } from "@/lib/formatComposers";
import { matchesSearch } from "@/lib/normalizeSearch";
import { supabaseBrowser } from "@/lib/supabase/client";
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
  song_recording_artists: { year: number | null; position: number | null; youtube_url: string | null; artists: { name: string } | null }[];
  song_productions: { productions: ProductionCredit | null }[];
  youtube_url: string | null;
  song_genres: { genre_id: string }[];
  song_languages: { language_id: string }[];
  user_songs: { count: number }[];
  created_at: string;
  submitted_by: string | null;
  profiles: { display_name: string | null; last_name: string | null; username: string | null } | null;
};

type SortCol = "title" | "songwriters" | "artist" | "year" | "popularity" | "added" | "missing";
type SortDir = "asc" | "desc";

export const BEFORE_TRACKING = "before-tracking";
const PAGE = 100;
const COMPLETE = "complete";
const INCOMPLETE = "incomplete";

function adderName(p: Song["profiles"]): string | null {
  if (!p) return null;
  return [p.display_name, p.last_name].filter(Boolean).join(" ") || p.username || null;
}

const SORT_LABELS: Record<SortCol, string> = {
  title: "Title",
  songwriters: "Songwriters",
  artist: "Artist",
  year: "Year",
  popularity: "Popularity",
  added: "Added",
  missing: "Missing",
};

const COLUMNS: { key: SortCol; className: string }[] = [
  { key: "title",       className: "" },
  { key: "songwriters", className: "" },
  { key: "artist",      className: "" },
  { key: "year",        className: "w-16" },
  { key: "popularity",  className: "w-24" },
  { key: "added",       className: "w-28" },
  { key: "missing",     className: "w-40" },
];

// Same wording as the search cards: "from Show (year) · Artist (year), …".
function ArtistCredits({ shows, artistsLine }: { shows: ProductionCredit[]; artistsLine: string }) {
  if (!shows.length) return <>{artistsLine}</>;
  return (
    <>
      from{" "}
      {shows.map((p, i) => (
        <Fragment key={`${p.name}-${p.year}`}>
          {i > 0 && ", "}
          <em>{p.name}</em>
          {p.year ? ` (${p.year})` : null}
        </Fragment>
      ))}
      {artistsLine ? ` · ${artistsLine}` : null}
    </>
  );
}

function MissingSummary({ missing }: { missing: string[] }) {
  if (!missing.length) return <span className="text-xs text-emerald-600">Complete</span>;
  return (
    <div className="line-clamp-2 text-xs text-zinc-500" title={missing.join(", ")}>
      <span className="mr-1 inline-flex min-w-5 justify-center rounded-full bg-red-50 px-1.5 font-medium text-red-600">
        {missing.length}
      </span>
      {missing.join(", ")}
    </div>
  );
}

// The Songs table for admins and song editors. Song editors get everything but
// deleting; `addedBy` presets the "Added by" filter (?added_by= from the Users page).
export default function AdminSongsTable({ basePath = "/admin/songs", isAdmin = true, addedBy = "" }: { basePath?: string; isAdmin?: boolean; addedBy?: string }) {
  const supabase = supabaseBrowser();
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [adderFilter, setAdderFilter] = useState(addedBy);
  const [missingFilter, setMissingFilter] = useState("");
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "missing", dir: "desc" });
  const [shown, setShown] = useState(PAGE);
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
          song_recording_artists(year, position, youtube_url, artists(name)),
          song_productions(productions(name, year)),
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

  useEffect(() => {
    setShown(PAGE);
    setSelected(new Set());
  }, [query, adderFilter, missingFilter, sort]);

  function toggleSort(col: SortCol) {
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: col === "missing" || col === "added" || col === "popularity" ? "desc" : "asc" }
    );
  }

  function removeSongs(ids: string[]) {
    const gone = new Set(ids);
    setSongs((prev) => prev && prev.filter((s) => !gone.has(s.id)));
    setSelected((prev) => new Set([...prev].filter((id) => !gone.has(id))));
  }

  const enriched = useMemo(() =>
    (songs ?? []).map((s) => {
      const songwriterNames = new Set<string>([
        ...s.song_composers.map((c) => c.people?.name).filter(Boolean) as string[],
        ...s.song_lyricists.map((l) => l.people?.name).filter(Boolean) as string[],
      ]);
      const cultures = s.song_cultures.map((c) => c.cultures?.name).filter(Boolean) as string[];
      const songwriterNamesRaw = [...songwriterNames].sort().join(" ");
      const songwriters = songwriterNames.size ? formatComposers([...songwriterNames].sort(), cultures) : "";
      const years = s.song_recording_artists
        .map((r) => r.year)
        .filter((y): y is number => typeof y === "number");
      const firstRecording = years.length ? Math.min(...years) : null;
      const yw = s.year_written ?? null;
      const firstYear = yw && firstRecording ? Math.min(yw, firstRecording) : yw ?? firstRecording ?? null;
      const credits = s.song_recording_artists
        .filter((r) => r.artists?.name)
        .map((r) => ({ name: r.artists!.name, year: r.year, position: r.position }));
      const artistsLine = formatRecordingArtists(credits, s.display_artist) ?? "";
      const shows = s.song_productions.map((p) => p.productions).filter((p): p is ProductionCredit => !!p?.name);
      const artistSortKey = [...shows.map((p) => p.name), artistsLine].join(" ");
      const missing = songMissingFields(s);
      const adder = s.submitted_by ? adderName(s.profiles) ?? "Unknown user" : null;
      return { ...s, songwriters, songwriterNamesRaw, firstYear, missing, adder, artistsLine, shows, artistSortKey, popularity: s.user_songs[0]?.count ?? 0 };
    }),
  [songs]);

  const adders = useMemo(() => {
    const byId = new Map<string, string>();
    for (const s of enriched) if (s.submitted_by && s.adder) byId.set(s.submitted_by, s.adder);
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [enriched]);

  const filtered = useMemo(() => {
    return enriched.filter((s) => {
      if (adderFilter === BEFORE_TRACKING ? s.submitted_by : adderFilter && s.submitted_by !== adderFilter) return false;
      if (missingFilter === COMPLETE ? s.missing.length : missingFilter === INCOMPLETE ? !s.missing.length : missingFilter && !s.missing.includes(missingFilter)) return false;
      const hay = [s.title, s.display_artist ?? "", s.artistSortKey, s.songwriterNamesRaw, s.first_line ?? "", s.hook ?? ""].join(" ");
      return matchesSearch(hay, query);
    });
  }, [enriched, query, adderFilter, missingFilter]);

  const sorted = useMemo(() => {
    const { col, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    const strip = (v: string) => v.replace(/^the\s+/i, "");
    // Blanks always sink to the bottom, whichever way the column is sorted.
    const blank = (a: unknown, b: unknown) => Number(a == null || a === "") - Number(b == null || b === "");
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (col === "title") cmp = a.title.localeCompare(b.title);
      else if (col === "songwriters") cmp = blank(a.songwriters, b.songwriters) || a.songwriters.localeCompare(b.songwriters) * mul;
      else if (col === "artist") cmp = blank(a.artistSortKey, b.artistSortKey) || strip(a.artistSortKey).localeCompare(strip(b.artistSortKey)) * mul;
      else if (col === "year") cmp = blank(a.firstYear, b.firstYear) || ((a.firstYear ?? 0) - (b.firstYear ?? 0)) * mul;
      else if (col === "popularity") cmp = a.popularity - b.popularity;
      else if (col === "added") cmp = a.created_at.localeCompare(b.created_at);
      else if (col === "missing") cmp = a.missing.length - b.missing.length;
      if (col !== "songwriters" && col !== "artist" && col !== "year") cmp *= mul;
      return cmp || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
    });
  }, [filtered, sort]);

  const visible = sorted.slice(0, shown);
  const visibleIds = visible.map((s) => s.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const filtering = Boolean(query.trim() || adderFilter || missingFilter);

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
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
    const ids = [...selected];
    const { error } = await supabase.from("songs").delete().in("id", ids);
    setDeleting(false);
    if (error) { alert(error.message); return; }
    removeSongs(ids);
  }

  if (loadError !== null) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 shadow-sm">
        Could not load the song list — {loadError}. Reload to try again.
      </div>
    );
  }

  if (songs === null) return <AdminSongsTableSkeleton />;

  const emptyText = filtering ? "No songs match these filters." : "No songs yet.";

  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-zinc-200 p-5 shadow-sm">
        <label className="block text-sm font-medium mb-1">Search</label>
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          placeholder="Title, songwriter, artist, first line, or hook…"
          autoComplete="off"
        />
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <label htmlFor="added-by" className="text-xs font-medium text-zinc-600">Added by</label>
            <Select id="added-by" value={adderFilter} onChange={(e) => setAdderFilter(e.target.value)} shape="pill" size="sm">
              <option value="">Anyone</option>
              {adders.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              <option value={BEFORE_TRACKING}>Before tracking</option>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="missing" className="text-xs font-medium text-zinc-600">Details</label>
            <Select id="missing" value={missingFilter} onChange={(e) => setMissingFilter(e.target.value)} shape="pill" size="sm">
              <option value="">Any</option>
              <option value={INCOMPLETE}>Missing something</option>
              <option value={COMPLETE}>Complete</option>
              <optgroup label="Missing…">
                {SONG_COMPLETENESS_FIELDS.map((f) => <option key={f} value={f}>Missing {f}</option>)}
              </optgroup>
            </Select>
          </div>
          <div className="flex items-center gap-2 sm:hidden">
            <label htmlFor="sort" className="text-xs font-medium text-zinc-600">Sort</label>
            <Select
              id="sort"
              value={`${sort.col}:${sort.dir}`}
              onChange={(e) => {
                const [col, dir] = e.target.value.split(":") as [SortCol, SortDir];
                setSort({ col, dir });
              }}
              shape="pill"
              size="sm"
            >
              <option value="missing:desc">Most missing</option>
              <option value="title:asc">Title A–Z</option>
              <option value="added:desc">Newest</option>
              <option value="added:asc">Oldest</option>
              <option value="popularity:desc">Most popular</option>
              <option value="year:asc">Year</option>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex min-h-8 items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          {filtering ? `${sorted.length} of ${songs.length} songs` : `${songs.length} songs`}
        </p>
        {isAdmin && selected.size > 0 && (
          <button
            onClick={handleBulkDelete}
            disabled={deleting}
            className="hidden sm:block rounded-full bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-40"
          >
            {deleting ? "Deleting…" : `Delete ${selected.size} selected`}
          </button>
        )}
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {visible.map((s) => (
          <Link
            key={s.id}
            href={`${basePath}/${s.slug ?? s.id}`}
            className="block rounded-xl border border-slate-200 bg-white px-4 py-3 active:bg-slate-50"
          >
            <div className="font-medium text-slate-900">{s.title}</div>
            {s.songwriters && <div className="mt-0.5 text-xs text-slate-500">{s.songwriters}</div>}
            {(s.shows.length > 0 || s.artistsLine) && (
              <div className="mt-0.5 text-xs text-slate-500"><ArtistCredits shows={s.shows} artistsLine={s.artistsLine} /></div>
            )}
            <div className="mt-0.5 truncate text-xs text-slate-400">
              Added {s.created_at.slice(0, 10)}{s.adder ? ` by ${s.adder}` : ""}
            </div>
            <div className="mt-1.5"><MissingSummary missing={s.missing} /></div>
          </Link>
        ))}
        {!sorted.length && <p className="py-8 text-center text-sm text-slate-400">{emptyText}</p>}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] table-fixed text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium text-slate-500">
              {isAdmin && (
                <th className="w-10 px-3 py-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all shown" className="accent-amber-500" />
                </th>
              )}
              {COLUMNS.map((col) => (
                <th key={col.key} className={`px-3 py-3 ${col.className}`}>
                  <button
                    onClick={() => toggleSort(col.key)}
                    className={`flex items-center gap-1 hover:text-slate-800 ${sort.col === col.key ? "text-slate-800" : ""}`}
                  >
                    {SORT_LABELS[col.key]}
                    <span className={sort.col === col.key ? "text-amber-500" : "text-slate-300"}>
                      {sort.col === col.key ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((s) => (
              <tr key={s.id} className={`align-top hover:bg-slate-50 ${selected.has(s.id) ? "bg-amber-50" : ""}`}>
                {isAdmin && (
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleOne(s.id)} aria-label={`Select ${s.title}`} className="accent-amber-500" />
                  </td>
                )}
                <td className="px-3 py-2.5 font-medium">
                  <Link href={`/songs/${s.slug ?? s.id}`} className="text-slate-900 hover:text-amber-600 hover:underline">
                    {s.title}
                  </Link>
                  <div className="mt-1 flex gap-3 text-xs font-normal">
                    <Link href={`${basePath}/${s.slug ?? s.id}`} className="text-amber-600 hover:text-amber-500">Edit</Link>
                    {isAdmin && <DeleteSongButton id={s.id} onDeleted={() => removeSongs([s.id])} />}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-slate-500">
                  {s.songwriters || <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2.5 text-slate-500">
                  {s.shows.length > 0 || s.artistsLine
                    ? <ArtistCredits shows={s.shows} artistsLine={s.artistsLine} />
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-slate-500">{s.firstYear ?? <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2.5 tabular-nums text-slate-500">{s.popularity}</td>
                <td className="px-3 py-2.5 text-xs">
                  <div className="truncate text-slate-500">
                    {s.adder && s.profiles?.username ? (
                      <Link href={`/u/${s.profiles.username}`} className="hover:text-amber-600 hover:underline">{s.adder}</Link>
                    ) : (
                      s.adder ?? <span className="text-slate-300">before tracking</span>
                    )}
                  </div>
                  <div className="tabular-nums text-slate-400">{s.created_at.slice(0, 10)}</div>
                </td>
                <td className="px-3 py-2.5"><MissingSummary missing={s.missing} /></td>
              </tr>
            ))}
            {!sorted.length && (
              <tr>
                <td colSpan={COLUMNS.length + (isAdmin ? 1 : 0)} className="px-4 py-8 text-center text-slate-400">{emptyText}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sorted.length > shown && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setShown((n) => n + PAGE)}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Show {Math.min(PAGE, sorted.length - shown)} more · {sorted.length - shown} left
          </button>
        </div>
      )}
    </div>
  );
}

export function AdminSongsTableSkeleton() {
  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-zinc-200 p-5 shadow-sm">
        <div className="h-4 w-16 animate-pulse rounded bg-zinc-200" />
        <div className="mt-2 h-9 animate-pulse rounded-lg bg-zinc-100" />
        <div className="mt-3 flex gap-4">
          <div className="h-6 w-36 animate-pulse rounded-lg bg-zinc-100" />
          <div className="h-6 w-32 animate-pulse rounded-lg bg-zinc-100" />
        </div>
      </div>
      <div className="flex min-h-8 items-center">
        <div className="h-3 w-20 animate-pulse rounded bg-zinc-100" />
      </div>

      {/* Mobile card skeleton */}
      <div className="sm:hidden space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white px-4 py-3 space-y-1.5">
            <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-200" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-100" />
          </div>
        ))}
      </div>

      {/* Desktop table skeleton */}
      <div className="hidden sm:block overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <div className="h-3 w-full animate-pulse rounded bg-zinc-200" />
        </div>
        <div className="divide-y divide-slate-100">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-4 w-1/5 animate-pulse rounded bg-zinc-200" />
              <div className="h-3 w-1/6 animate-pulse rounded bg-zinc-100" />
              <div className="h-3 w-1/6 animate-pulse rounded bg-zinc-100" />
              <div className="h-3 w-10 animate-pulse rounded bg-zinc-100" />
              <div className="h-3 w-10 animate-pulse rounded bg-zinc-100" />
              <div className="h-3 w-20 animate-pulse rounded bg-zinc-100" />
              <div className="h-3 w-32 animate-pulse rounded bg-zinc-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
