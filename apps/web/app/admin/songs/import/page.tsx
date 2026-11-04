"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { generateSlug } from "@/lib/generateSlug";

type ParsedRow = { title: string; artist: string };

type RowResult =
  | { status: "pending" }
  | { status: "running" }
  | { status: "skipped"; reason: string }
  | { status: "added"; detail: string }
  | { status: "error"; reason: string };

type Lookup = { id: string; name: string };

// ISO 639-2 code → English name (common subset)
const LANG_CODE_MAP: Record<string, string> = {
  eng: "English", fra: "French", spa: "Spanish", deu: "German",
  ita: "Italian", por: "Portuguese", rus: "Russian", jpn: "Japanese",
  zho: "Chinese", kor: "Korean", nld: "Dutch", pol: "Polish",
  swe: "Swedish", nor: "Norwegian", fin: "Finnish", heb: "Hebrew",
  ara: "Arabic", hin: "Hindi", lat: "Latin", cat: "Catalan",
  tur: "Turkish", vie: "Vietnamese", tha: "Thai", ind: "Indonesian",
};


function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const first = lines[0].toLowerCase();
  const hasHeader = first.includes("title") || first.includes("song");
  return (hasHeader ? lines.slice(1) : lines)
    .map((line) => {
      const cols: string[] = [];
      let cur = "";
      let inQuote = false;
      for (const ch of line) {
        if (ch === '"') { inQuote = !inQuote; }
        else if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; }
        else { cur += ch; }
      }
      cols.push(cur.trim());
      return { title: cols[0] ?? "", artist: cols[1] ?? "" };
    })
    .filter((r) => r.title);
}

export default function ImportCSVPage() {
  const supabase = supabaseBrowser();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [results, setResults] = useState<RowResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  // Preloaded DB lookups
  const [allGenres, setAllGenres] = useState<Lookup[]>([]);
  const [allLanguages, setAllLanguages] = useState<Lookup[]>([]);
  const [allArtists, setAllArtists] = useState<Lookup[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from("genres").select("id, name"),
      supabase.from("languages").select("id, name"),
      supabase.from("artists").select("id, name").limit(10000),
    ]).then(([g, l, a]) => {
      setAllGenres(g.data ?? []);
      setAllLanguages(l.data ?? []);
      setAllArtists(a.data ?? []);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target?.result as string);
      setRows(parsed);
      setResults(parsed.map(() => ({ status: "pending" })));
      setProgress(0);
    };
    reader.readAsText(file);
  }

  async function findOrCreatePerson(name: string, table: "people" | "artists", cache: Lookup[]): Promise<string | null> {
    const cached = cache.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (cached) return cached.id;
    // Check DB before inserting to avoid unique constraint failures
    const { data: found } = await supabase.from(table).select("id, name").ilike("name", name).maybeSingle();
    if (found) { cache.push(found); return found.id; }
    const { data: created } = await supabase.from(table).insert({ name }).select("id, name").single();
    if (created) cache.push(created);
    return created?.id ?? null;
  }

  async function runImport() {
    setRunning(true);
    const current: RowResult[] = rows.map(() => ({ status: "pending" }));
    setResults([...current]);

    // Mutable copies of lookup caches so new entries persist across rows
    const artistCache = [...allArtists];
    const peopleCache: Lookup[] = [];

    for (let i = 0; i < rows.length; i++) {
      const { title, artist } = rows[i];
      current[i] = { status: "running" };
      setResults([...current]);

      try {
        // Fast pre-check on raw input — avoids enrichment cost for obvious duplicates
        const rawNormArtist = artist?.trim() ?? "";
        let preQuery = supabase.from("songs").select("id").ilike("title", title);
        preQuery = rawNormArtist
          ? preQuery.ilike("display_artist", rawNormArtist)
          : preQuery.is("display_artist", null);
        const { data: preExisting } = await preQuery.limit(1).maybeSingle();

        if (preExisting) {
          current[i] = { status: "skipped", reason: "Already in database" };
          setResults([...current]);
          setProgress(i + 1);
          continue;
        }

        // Enrich
        const res = await fetch(
          `/api/enrich?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&mode=import`
        );
        const data = await res.json();
        const mb = data.musicbrainz;
        const genius = data.genius;
        const spotifyGenres: string[] = data.spotify?.genres ?? [];
        const lastfmTags: string[] = data.lastfm?.tags ?? [];

        const finalTitle: string = mb?.title ?? title;
        const composerNames: string[] = mb?.composers ?? [];
        const lyricistNames: string[] = mb?.lyricists ?? [];
        const primaryYear: number | null = mb?.year ?? null;
        const langCodes: string[] = mb?.languages ?? [];

        // Primary display_artist: first topArtist name, or passed-in artist
        const primaryArtistName = mb?.display_artist ?? artist ?? null;

        // Post-enrichment check: match on title_normalized (punctuation-stripped) so that
        // "Johnny B. Goode" matches "Johnny B Goode", "Don't Think Twice, It's Alright" matches
        // "Don't Think Twice It's Alright", etc.
        const normalizedTitle = finalTitle.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
        const { data: postExisting } = await supabase
          .from("songs")
          .select("id, title, display_artist")
          .eq("title_normalized", normalizedTitle)
          .limit(1)
          .maybeSingle();

        if (postExisting) {
          const matchDesc = postExisting.display_artist
            ? `"${postExisting.title}" — ${postExisting.display_artist}`
            : `"${postExisting.title}"`;
          current[i] = { status: "skipped", reason: `Possible duplicate of ${matchDesc}` };
          setResults([...current]);
          setProgress(i + 1);
          continue;
        }
        let slug = generateSlug(finalTitle, [...composerNames, ...lyricistNames]);
        const { data: slugConflict } = await supabase.from("songs").select("id").eq("slug", slug).maybeSingle();
        if (slugConflict) slug = `${slug}-${Date.now()}`;

        // Create song
        const { data: song, error: songErr } = await supabase
          .from("songs")
          .insert({
            title: finalTitle,
            display_artist: primaryArtistName || null,
            slug,
            genius_url: genius?.lyrics_url ?? null,
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (songErr || !song) throw new Error(songErr?.message ?? "Failed to insert song");

        // Recording artist — just the primary (standardized) artist with year
        if (primaryArtistName) {
          const artistId = await findOrCreatePerson(primaryArtistName, "artists", artistCache);
          if (artistId) {
            await supabase.from("song_recording_artists").insert({
              song_id: song.id,
              artist_id: artistId,
              year: primaryYear,
              position: 0,
              spotify_url: data.spotify?.spotify_url ?? null,
            });
          }
        }

        // Composers & lyricists
        const composerIds = (await Promise.all(composerNames.map((n) => findOrCreatePerson(n, "people", peopleCache)))).filter(Boolean) as string[];
        const lyricistIds = (await Promise.all(lyricistNames.map((n) => findOrCreatePerson(n, "people", peopleCache)))).filter(Boolean) as string[];
        if (composerIds.length) {
          await supabase.from("song_composers").insert(composerIds.map((id) => ({ song_id: song.id, person_id: id })));
        }
        if (lyricistIds.length) {
          await supabase.from("song_lyricists").insert(lyricistIds.map((id) => ({ song_id: song.id, person_id: id })));
        }

        // Genres — only match existing DB genres (case-insensitive)
        const allGenreNames = [...new Set([...spotifyGenres, ...lastfmTags].map((g) => g.toLowerCase()))];
        const matchedGenreIds = allGenres
          .filter((g) => allGenreNames.includes(g.name.toLowerCase()))
          .map((g) => g.id);
        if (matchedGenreIds.length) {
          await supabase.from("song_genres").insert(matchedGenreIds.map((id) => ({ song_id: song.id, genre_id: id })));
        }

        // Languages — map ISO 639 codes to DB language names
        const langIds = langCodes
          .map((code) => {
            const name = LANG_CODE_MAP[code.toLowerCase()];
            if (!name) return null;
            return allLanguages.find((l) => l.name.toLowerCase() === name.toLowerCase())?.id ?? null;
          })
          .filter((id): id is string => !!id);
        const uniqueLangIds = [...new Set(langIds)];
        if (uniqueLangIds.length) {
          await supabase.from("song_languages").insert(uniqueLangIds.map((id) => ({ song_id: song.id, language_id: id })));
        }

        const detail = [
          composerNames.length ? `composers: ${composerNames.join(", ")}` : null,
          primaryArtistName ? `artist: ${primaryArtistName}` : null,
          matchedGenreIds.length ? `${matchedGenreIds.length} genre(s)` : null,
          uniqueLangIds.length ? `language` : null,
          genius?.lyrics_url ? `genius` : null,
        ].filter(Boolean).join(" · ");

        current[i] = { status: "added", detail: detail || "no enrichment data" };
        setResults([...current]);
      } catch (err: any) {
        current[i] = { status: "error", reason: err?.message ?? "Unknown error" };
        setResults([...current]);
      }

      setProgress(i + 1);
      if (i < rows.length - 1) await new Promise((r) => setTimeout(r, 1100));
    }

    setRunning(false);
  }

  const statusCounts = results.reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Import songs from CSV</h1>
        <p className="mt-1 text-sm text-slate-500">
          CSV should have <code className="rounded bg-slate-100 px-1">title</code> and{" "}
          <code className="rounded bg-slate-100 px-1">artist</code> columns. Looks up composers, recording artists, genres, language, and Genius URL automatically.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="text-sm text-slate-600" />
        {rows.length > 0 && !running && (
          <button
            onClick={runImport}
            className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400"
          >
            Import {rows.length} songs
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <>
          {running && (
            <div className="space-y-1">
              <div className="text-sm text-slate-500">{progress} / {rows.length} processed</div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-2 rounded-full bg-amber-500 transition-all"
                  style={{ width: `${(progress / rows.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {!running && progress > 0 && (
            <div className="flex gap-4 text-sm">
              {statusCounts.added && <span className="text-emerald-600">✓ {statusCounts.added} added</span>}
              {statusCounts.skipped && <span className="text-slate-400">↷ {statusCounts.skipped} skipped</span>}
              {statusCounts.error && <span className="text-red-500">✗ {statusCounts.error} errors</span>}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Title</th>
                  <th className="px-4 py-2 text-left font-medium">Artist</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, i) => {
                  const result = results[i];
                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium text-slate-800">{row.title}</td>
                      <td className="px-4 py-2 text-slate-500">{row.artist}</td>
                      <td className="px-4 py-2">
                        {result?.status === "pending" && <span className="text-slate-300">—</span>}
                        {result?.status === "running" && <span className="text-amber-500">Looking up…</span>}
                        {result?.status === "added" && (
                          <span className="text-emerald-600">✓ Added{result.detail ? ` · ${result.detail}` : ""}</span>
                        )}
                        {result?.status === "skipped" && (
                          <span className="text-slate-400">↷ {result.reason}</span>
                        )}
                        {result?.status === "error" && (
                          <span className="text-red-500">✗ {result.reason}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
