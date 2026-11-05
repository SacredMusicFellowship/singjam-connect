"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { generateSlug } from "@/lib/generateSlug";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Lookup = { id: string; name: string };
type ProductionLookup = Lookup & { year: number | null };

function productionLabel(p: ProductionLookup) {
  return p.year ? `${p.name} (${p.year})` : p.name;
}

function parseYear(v: string | undefined): number | null {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : null;
}
type AltTitle = { id: string; title: string };

function toTitleCase(s: string) {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

const LANG_NAMES: Record<string, string> = {
  eng: "English", fra: "French", deu: "German", spa: "Spanish",
  ita: "Italian", por: "Portuguese", jpn: "Japanese", zho: "Chinese",
  kor: "Korean", rus: "Russian", ara: "Arabic", nld: "Dutch",
  pol: "Polish", swe: "Swedish", nor: "Norwegian", fin: "Finnish",
  dan: "Danish", ces: "Czech", hun: "Hungarian", ron: "Romanian",
  tur: "Turkish", heb: "Hebrew", hin: "Hindi", ben: "Bengali",
  ind: "Indonesian", vie: "Vietnamese", tha: "Thai", ukr: "Ukrainian",
  cat: "Catalan", lat: "Latin", gle: "Irish", cym: "Welsh",
  eus: "Basque", glg: "Galician", hrv: "Croatian", srp: "Serbian",
  slk: "Slovak", slv: "Slovenian", bul: "Bulgarian", ell: "Greek",
  lit: "Lithuanian", lav: "Latvian", est: "Estonian", afr: "Afrikaans",
  swa: "Swahili", yor: "Yoruba", amh: "Amharic", msa: "Malay",
  tgl: "Filipino", nob: "Norwegian Bokmål", nno: "Norwegian Nynorsk",
  yid: "Yiddish", bre: "Breton", oci: "Occitan", scr: "Croatian",
};

function langCodeToName(code: string): string {
  return LANG_NAMES[code.toLowerCase()] ?? toTitleCase(code);
}

const TONALITY_OPTIONS = [
  "Major", "Minor", "Dorian", "Phrygian", "Lydian", "Mixolydian",
  "Aeolian", "Locrian", "Harmonic Minor", "Melodic Minor",
  "Pentatonic", "Blues", "Whole Tone", "Chromatic", "Modal",
];

const METER_OPTIONS = ["4", "3", "5", "7", "9", "11", "Free", "Irregular"];


type Song = {
  id: string;
  title: string;
  slug: string | null;
  display_artist: string | null;
  first_line: string | null;
  hook: string | null;
  notes: string | null;
  genius_url: string | null;
  chord_chart_url: string | null;
  youtube_url: string | null;
  year: number | null;
  year_written: number | null;
  tonality: string | null;
  meter: string | null;
  vibe: "Banger" | "Ballad" | null;
  song_genres: { genre_id: string }[];
  song_themes: { theme_id: string }[];
  song_cultures: { culture_id: string; context: string | null }[];
  song_languages: { language_id: string }[];
  song_composers: { person_id: string }[];
  song_lyricists: { person_id: string }[];
  song_recording_artists: { artist_id: string; year: number | null; position: number | null; youtube_url: string | null; spotify_url: string | null }[];
  song_alternate_titles: AltTitle[];
  song_productions: { production_id: string }[];
};

type Props = {
  song: Song | null;
  isNew: boolean;
  allGenres: Lookup[];
  allThemes: Lookup[];
  allCultures: Lookup[];
  allLanguages: Lookup[];
  allPeople: Lookup[];
  allArtists: Lookup[];
  allProductions: ProductionLookup[];
  basePath: string;
  isAdmin: boolean;
};

function toSet(ids: string[]) {
  return new Set(ids);
}

export default function SongEditor({
  song,
  isNew,
  allGenres,
  allThemes,
  allCultures,
  allLanguages,
  allPeople,
  allArtists,
  allProductions,
  basePath,
  isAdmin,
}: Props) {
  const supabase = supabaseBrowser();
  const router = useRouter();

  // Scalar fields
  const [title, setTitle] = useState(song?.title ?? "");
  const [slug, setSlug] = useState(song?.slug ?? "");
  const [displayArtist, setDisplayArtist] = useState(song?.display_artist ?? "");
  const [firstLine, setFirstLine] = useState(song?.first_line ?? "");
  const [hook, setHook] = useState(song?.hook ?? "");
  const [notes, setNotes] = useState(song?.notes ?? "");
  const [geniusUrl, setGeniusUrl] = useState(song?.genius_url ?? "");
  const [chordChartUrl, setChordChartUrl] = useState(song?.chord_chart_url ?? "");
  const [year, setYear] = useState(song?.year?.toString() ?? "");
  const [yearWritten, setYearWritten] = useState(song?.year_written?.toString() ?? "");
  const [tonalities, setTonalities] = useState<string[]>(() =>
    song?.tonality ? song.tonality.split(",").map((s) => s.trim()).filter(Boolean) : []
  );
  const [meters, setMeters] = useState<string[]>(() =>
    song?.meter ? song.meter.split(",").map((s) => s.trim()).filter(Boolean) : []
  );
  const [vibe, setVibe] = useState<"Banger" | "Ballad" | null>(song?.vibe ?? null);

  const initialComposerIds = song?.song_composers.map((x) => x.person_id) ?? [];
  const initialLyricistIds = song?.song_lyricists.map((x) => x.person_id) ?? [];
  const [composers, setComposers] = useState<Set<string>>(toSet(initialComposerIds));
  const [lyricists, setLyricists] = useState<Set<string>>(
    toSet(initialLyricistIds.length ? initialLyricistIds : initialComposerIds)
  );
  type RecordingArtistEntry = { id: string; year: number | null; youtube_url: string | null; spotify_url?: string | null };
  const initialRecordingArtistEntries: RecordingArtistEntry[] = (song?.song_recording_artists ?? [])
    .slice()
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
    .map((x) => ({ id: x.artist_id, year: x.year, youtube_url: x.youtube_url, spotify_url: x.spotify_url }));
  const seededRecordingArtistEntries: RecordingArtistEntry[] = initialRecordingArtistEntries.length
    ? initialRecordingArtistEntries
    : allArtists.filter((a) => a.name.toLowerCase() === (song?.display_artist ?? "").toLowerCase()).map((a) => ({ id: a.id, year: null, youtube_url: null }));
  const [recordingArtists, setRecordingArtists] = useState<RecordingArtistEntry[]>(seededRecordingArtistEntries);

  // Production
  const initialProductionIds = (song?.song_productions ?? []).map((x) => x.production_id);
  const [isFromProduction, setIsFromProduction] = useState(initialProductionIds.length > 0);
  const [productions, setProductions] = useState<Set<string>>(new Set(initialProductionIds));
  const [pendingProductionNames, setPendingProductionNames] = useState<string[]>([]);
  const [productionQuery, setProductionQuery] = useState("");
  const [productionYears, setProductionYears] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialProductionIds.map((id) => [id, String(allProductions.find((p) => p.id === id)?.year ?? "")])
    )
  );
  const productionLookups: Lookup[] = allProductions.map((p) => ({ id: p.id, name: productionLabel(p) }));
  const productionYearRows = [
    ...[...productions].map((id) => ({ key: id, name: allProductions.find((p) => p.id === id)?.name ?? "" })),
    ...pendingProductionNames.map((name) => ({ key: `new:${name}`, name })),
  ];

  // Tag pill arrays
  const [genres, setGenres] = useState<string[]>(() =>
    (song?.song_genres ?? []).map((x) => allGenres.find((g) => g.id === x.genre_id)?.name).filter((n): n is string => !!n)
  );
  const [themes, setThemes] = useState<string[]>(() =>
    (song?.song_themes ?? []).map((x) => allThemes.find((t) => t.id === x.theme_id)?.name).filter((n): n is string => !!n)
  );
  const [cultures, setCultures] = useState<string[]>(() =>
    (song?.song_cultures ?? [])
      .filter((x) => !x.context)
      .map((x) => allCultures.find((c) => c.id === x.culture_id)?.name)
      .filter((n): n is string => !!n)
  );
  const [languages, setLanguages] = useState<string[]>(() =>
    (song?.song_languages ?? []).map((x) => allLanguages.find((l) => l.id === x.language_id)?.name).filter((n): n is string => !!n)
  );

  // Alternate titles
  const [altTitles, setAltTitles] = useState<AltTitle[]>(song?.song_alternate_titles ?? []);
  const [newAltTitle, setNewAltTitle] = useState("");

  // UI state
  const [saving, setSaving] = useState(false);
  const [fillState, setFillState] = useState<"idle" | "running" | "started" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  // AI enrichment
  type AISuggestions = {
    year_written: number | null;
    first_line: string | null;
    hook: string | null;
    composers: string[];
    lyricists: string[];
    primary_recording_year: number | null;
    tonality: string | null;
    meter: string | null;
    vibe: "Banger" | "Ballad" | null;
    genres: string[];
    themes: string[];
    cultures: string[];
    music_culture: string | null;
    lyric_culture: string | null;
    languages: string[];
    notes: string | null;
    productions: string[];
    alternate_titles: string[];
    additional_recordings: { artist: string; year: number | null }[];
    confidence: "high" | "medium" | "low";
  };
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestions | null>(null);
  const [enrichingWithAI, setEnrichingWithAI] = useState(false);
  const [acceptedFields, setAcceptedFields] = useState<Set<string>>(new Set());

  // Lyric data
  const [openingGenius, setOpeningGenius] = useState(false);

  async function handleGetGeniusUrl() {
    setOpeningGenius(true);
    try {
      const res = await fetch(`/api/enrich?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(displayArtist)}`);
      const data = await res.json();
      const url = data.genius?.lyrics_url;
      if (url) setGeniusUrl(url);
      if (data.genius?.first_line && !firstLine.trim()) setFirstLine(data.genius.first_line);
      if (data.genius?.hook && !hook.trim()) setHook(data.genius.hook);
    } catch {
      // leave field blank if it fails
    } finally {
      setOpeningGenius(false);
    }
  }

  // Tags enrichment
  const [findingTags, setFindingTags] = useState(false);

  async function handleFindTags() {
    if (!title.trim()) return;
    setFindingTags(true);
    try {
      console.log("[findTags] calling /api/enrich?mode=tags for:", title, displayArtist);
      const t0 = Date.now();
      const res = await fetch(`/api/enrich?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(displayArtist)}&mode=tags`);
      console.log(`[findTags] enrich responded in ${Date.now() - t0}ms — status ${res.status}`);
      const data = await res.json();
      console.log("[findTags] musicbrainz languages:", data.musicbrainz?.languages ?? "none");
      console.log("[findTags] spotify genres:", data.spotify?.genres ?? "none");
      console.log("[findTags] lastfm tags:", data.lastfm?.tags ?? "none (check LASTFM_API_KEY)");

      const lastfmTags: string[] = data.lastfm?.tags ?? [];
      const spotifyGenres: string[] = data.spotify?.genres ?? [];
      const mbLanguages: string[] = data.musicbrainz?.languages ?? [];

      const allGenreSuggestions = [...new Set([...lastfmTags, ...spotifyGenres].map(toTitleCase))];
      console.log("[findTags] genre suggestions:", allGenreSuggestions);
      if (allGenreSuggestions.length) {
        setGenres((prev) => {
          const prevLower = new Set(prev.map((p) => p.toLowerCase()));
          return [...prev, ...allGenreSuggestions.filter((s) => !prevLower.has(s.toLowerCase()))];
        });
      }
      if (mbLanguages.length) {
        const newLangs = mbLanguages.map(langCodeToName);
        console.log("[findTags] language suggestions:", newLangs);
        setLanguages((prev) => {
          const prevLower = new Set(prev.map((p) => p.toLowerCase()));
          return [...prev, ...newLangs.filter((l) => !prevLower.has(l.toLowerCase()))];
        });
      }
    } catch (e) {
      console.error("[findTags] error:", e);
      setError("Could not fetch tag data.");
    } finally {
      setFindingTags(false);
    }
  }

  // New-song chunk-1 state
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState(false);
  const [standardizedTitle, setStandardizedTitle] = useState("");
  const [standardizedArtist, setStandardizedArtist] = useState("");
  const [newSongProduction, setNewSongProduction] = useState("");
  const [newComposerName, setNewComposerName] = useState("");
  const [newLyricistName, setNewLyricistName] = useState("");
  const [newRecordingArtistName, setNewRecordingArtistName] = useState("");
  const [pendingRecordingArtists, setPendingRecordingArtists] = useState<{ name: string; year: number | null; spotify_url: string | null }[]>([]);
  const [pendingAltTitles, setPendingAltTitles] = useState<string[]>([]);
  const [primaryArtist, setPrimaryArtist] = useState<{ name: string; year: number | null } | null>(null);
  const [pendingComposerNames, setPendingComposerNames] = useState<string[]>([]);
  const [pendingLyricistNames, setPendingLyricistNames] = useState<string[]>([]);
  const [composerTraditionalCulture, setComposerTraditionalCulture] = useState(() => {
    const mc = song?.song_cultures.find((x) => x.context === "music");
    return mc ? (allCultures.find((c) => c.id === mc.culture_id)?.name ?? "") : "";
  });
  const [lyricistTraditionalCulture, setLyricistTraditionalCulture] = useState(() => {
    const lc = song?.song_cultures.find((x) => x.context === "lyrics");
    return lc ? (allCultures.find((c) => c.id === lc.culture_id)?.name ?? "") : "";
  });
  const [duplicateSong, setDuplicateSong] = useState<{ id: string; slug: string | null; title: string } | null>(null);
  const [sameTitleSongs, setSameTitleSongs] = useState<{ id: string; slug: string | null; title: string }[]>([]);

  // Clear duplicate warnings when the user manually adjusts composers
  useEffect(() => {
    if (duplicateSong || sameTitleSongs.length > 0) {
      setDuplicateSong(null);
      setSameTitleSongs([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composers]);

  // Find or create a person/artist by canonical name. Returns the DB id.
  async function resolvePersonName(
    name: string,
    table: "people" | "artists",
    allItems: Lookup[]
  ): Promise<string | null> {
    if (!name.trim()) return null;
    const canonical = /^\[traditional\]$/i.test(name.trim()) ? "Traditional" : name.trim();
    const normalised = canonical.toLowerCase();
    const existing = allItems.find((p) => p.name.toLowerCase() === normalised);
    if (existing) return existing.id;

    const { data, error } = await supabase
      .from(table)
      .upsert({ name: canonical }, { onConflict: "name" })
      .select("id, name")
      .single();
    if (error) { setError(error.message); return null; }
    if (!allItems.find((p) => p.id === data.id)) allItems.push(data);
    return data.id;
  }

  function splitExistingAndPending(names: string[], table: Lookup[]) {
    const existingIds: string[] = [];
    const pendingNames: string[] = [];
    for (const n of names) {
      const match = table.find((p) => p.name.toLowerCase() === n.trim().toLowerCase());
      if (match) existingIds.push(match.id);
      else pendingNames.push(n.trim());
    }
    return { existingIds, pendingNames };
  }

  async function handleAILookup() {
    if (!title.trim()) return;
    setFinding(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/songs/ai-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), artist: displayArtist.trim(), production: newSongProduction.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { ai, genius_url } = await res.json();

      const canonicalTitle: string = ai.title ?? title.trim();
      const canonicalArtist: string = ai.display_artist ?? displayArtist.trim();

      setStandardizedTitle(canonicalTitle);
      setStandardizedArtist(canonicalArtist);

      // Scalar fields
      if (ai.year_written) setYearWritten(String(ai.year_written));
      if (ai.year) setYear(String(ai.year));
      if (ai.first_line) setFirstLine(ai.first_line);
      if (ai.hook) setHook(ai.hook);
      if (ai.notes) setNotes(ai.notes);
      if (genius_url) setGeniusUrl(genius_url);
      if (ai.production) {
        setIsFromProduction(true);
        const existingProd = allProductions.find((p) => p.name.toLowerCase() === (ai.production as string).toLowerCase());
        if (existingProd) {
          setProductions(new Set([existingProd.id]));
        } else {
          setPendingProductionNames([ai.production as string]);
        }
      }
      if (ai.tonality && TONALITY_OPTIONS.includes(ai.tonality)) setTonalities([ai.tonality]);
      if (ai.meter && METER_OPTIONS.includes(ai.meter)) setMeters([ai.meter]);
      if (ai.vibe === "Banger" || ai.vibe === "Ballad") setVibe(ai.vibe);

      // Tag arrays — merge with existing to avoid clobbering manual edits
      if (ai.genres?.length) setGenres(ai.genres.slice(0, 3));
      if (ai.languages?.length) setLanguages(ai.languages);
      if (ai.themes?.length) setThemes(ai.themes.slice(0, 3));
      if (ai.cultures?.length) setCultures(ai.cultures);
      if (ai.music_culture) setComposerTraditionalCulture(ai.music_culture);
      if (ai.lyric_culture) setLyricistTraditionalCulture(ai.lyric_culture);

      // People
      const { existingIds: cIds, pendingNames: cPending } = splitExistingAndPending(ai.composers ?? [], allPeople);
      const { existingIds: lIds, pendingNames: lPending } = splitExistingAndPending(ai.lyricists ?? [], allPeople);
      setComposers(new Set(cIds));
      setPendingComposerNames(cPending);
      setLyricists(new Set(lIds));
      setPendingLyricistNames(lPending);

      // Recording artists from AI — split into existing DB records and pending new entries
      const aiArtists: { artist: string; year: number | null; spotify_url: string | null }[] = ai.recording_artists ?? [];
      const existingRAEntries: RecordingArtistEntry[] = [];
      const pendingRAEntries: { name: string; year: number | null; spotify_url: string | null }[] = [];
      for (const ra of aiArtists) {
        const match = allArtists.find((a) => a.name.toLowerCase() === ra.artist.trim().toLowerCase());
        if (match) {
          existingRAEntries.push({ id: match.id, year: ra.year, youtube_url: null, spotify_url: ra.spotify_url ?? null });
        } else {
          pendingRAEntries.push({ name: ra.artist.trim(), year: ra.year, spotify_url: ra.spotify_url ?? null });
        }
      }
      setRecordingArtists(existingRAEntries);
      setPendingRecordingArtists(pendingRAEntries);
      if (aiArtists[0]) setPrimaryArtist({ name: aiArtists[0].artist, year: aiArtists[0].year });

      // Alternate titles
      if (ai.alternate_titles?.length) setPendingAltTitles(ai.alternate_titles);

      // Duplicate check
      const composerNamesForSlug = cIds.map((id) => allPeople.find((p) => p.id === id)?.name).filter((n): n is string => !!n);
      const lyricistNamesForSlug = lIds.map((id) => allPeople.find((p) => p.id === id)?.name).filter((n): n is string => !!n);
      const potentialSlug = generateSlug(canonicalTitle, [...composerNamesForSlug, ...cPending, ...lyricistNamesForSlug, ...lPending], ai.music_culture || undefined);
      const { data: existing } = await supabase
        .from("songs")
        .select("id, slug, title")
        .or(`slug.eq.${potentialSlug},title.ilike.${canonicalTitle}`)
        .limit(10);
      setDuplicateSong((existing?.find((s) => s.slug === potentialSlug) ?? null) as typeof duplicateSong);
      setSameTitleSongs((existing ?? []).filter((s) => s.slug !== potentialSlug) as typeof sameTitleSongs);

      setFound(true);
    } catch {
      setError("AI lookup failed. Check that OPENAI_API_KEY is set.");
    } finally {
      setFinding(false);
    }
  }

  function splitNames(names: string[]) {
    const existingIds: string[] = [];
    const pendingNames: string[] = [];
    for (const n of names) {
      const match = allPeople.find((p) => p.name.toLowerCase() === n.trim().toLowerCase());
      if (match) existingIds.push(match.id);
      else pendingNames.push(n.trim());
    }
    return { existingIds, pendingNames };
  }

  async function handleEnrichWithAI() {
    if (!song?.id) return;
    setEnrichingWithAI(true);
    setError(null);
    setAiSuggestions(null);
    try {
      const res = await fetch(`/api/admin/songs/${song.id}/ai-enrich`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const s = data.suggestions;
      setAiSuggestions(s);
      const initial = new Set<string>();
      if (s.year_written != null) initial.add("year_written");
      if (s.first_line) initial.add("first_line");
      if (s.hook) initial.add("hook");
      if (s.composers?.length) initial.add("composers");
      if (s.lyricists?.length) initial.add("lyricists");
      if (s.primary_recording_year != null) initial.add("primary_recording_year");
      if (s.tonality) initial.add("tonality");
      if (s.meter) initial.add("meter");
      if (s.vibe) initial.add("vibe");
      if (s.genres?.length) initial.add("genres");
      if (s.themes?.length) initial.add("themes");
      if (s.cultures?.length) initial.add("cultures");
      if (s.music_culture) initial.add("music_culture");
      if (s.lyric_culture) initial.add("lyric_culture");
      if (s.languages?.length) initial.add("languages");
      if (s.notes) initial.add("notes");
      if (s.productions?.length) initial.add("productions");
      if (s.alternate_titles?.length) initial.add("alternate_titles");
      if (s.additional_recordings?.length) initial.add("additional_recordings");
      setAcceptedFields(initial);
    } catch {
      setError("AI enrichment failed. Check that OPENAI_API_KEY is set in .env.local.");
    } finally {
      setEnrichingWithAI(false);
    }
  }

  async function applyAISuggestions() {
    if (!aiSuggestions) return;
    if (acceptedFields.has("year_written") && aiSuggestions.year_written != null) {
      setYearWritten(aiSuggestions.year_written.toString());
    }
    if (acceptedFields.has("first_line") && aiSuggestions.first_line) {
      setFirstLine(aiSuggestions.first_line);
    }
    if (acceptedFields.has("hook") && aiSuggestions.hook) {
      setHook(aiSuggestions.hook);
    }
    if (acceptedFields.has("composers") && aiSuggestions.composers.length) {
      const { existingIds, pendingNames } = splitNames(aiSuggestions.composers);
      setComposers(new Set(existingIds));
      setPendingComposerNames(pendingNames);
    }
    if (acceptedFields.has("lyricists") && aiSuggestions.lyricists.length) {
      const { existingIds, pendingNames } = splitNames(aiSuggestions.lyricists);
      setLyricists(new Set(existingIds));
      setPendingLyricistNames(pendingNames);
    }
    if (acceptedFields.has("primary_recording_year") && aiSuggestions.primary_recording_year != null) {
      const yr = aiSuggestions.primary_recording_year;
      setRecordingArtists((prev) => prev.map((e, i) => i === 0 ? { ...e, year: yr } : e));
    }
    if (acceptedFields.has("tonality") && aiSuggestions.tonality) {
      setTonalities([aiSuggestions.tonality]);
    }
    if (acceptedFields.has("meter") && aiSuggestions.meter) {
      setMeters([aiSuggestions.meter]);
    }
    if (acceptedFields.has("vibe") && aiSuggestions.vibe) {
      setVibe(aiSuggestions.vibe);
    }
    if (acceptedFields.has("genres") && aiSuggestions.genres.length) {
      setGenres(aiSuggestions.genres.slice(0, 3));
    }
    if (acceptedFields.has("themes") && aiSuggestions.themes.length) {
      setThemes(aiSuggestions.themes.slice(0, 3));
    }
    if (acceptedFields.has("cultures") && aiSuggestions.cultures.length) {
      setCultures(aiSuggestions.cultures);
    }
    if (acceptedFields.has("music_culture") && aiSuggestions.music_culture) {
      setComposerTraditionalCulture(aiSuggestions.music_culture);
    }
    if (acceptedFields.has("lyric_culture") && aiSuggestions.lyric_culture) {
      setLyricistTraditionalCulture(aiSuggestions.lyric_culture);
    }
    if (acceptedFields.has("languages") && aiSuggestions.languages.length) {
      setLanguages(aiSuggestions.languages);
    }
    if (acceptedFields.has("notes") && aiSuggestions.notes) {
      setNotes(aiSuggestions.notes);
    }
    if (acceptedFields.has("productions") && aiSuggestions.productions.length) {
      const { existingIds, pendingNames } = splitExistingAndPending(aiSuggestions.productions, allProductions);
      setProductions((prev) => new Set([...prev, ...existingIds]));
      setPendingProductionNames((prev) => [...prev, ...pendingNames.filter((n) => !prev.includes(n))]);
    }
    if (acceptedFields.has("additional_recordings") && aiSuggestions.additional_recordings.length) {
      const toAdd: { id: string; year: number | null }[] = [];
      for (const rec of aiSuggestions.additional_recordings) {
        const artistId = await resolvePersonName(rec.artist, "artists", allArtists);
        if (artistId && !recordingArtists.find((e) => e.id === artistId) && !toAdd.find((e) => e.id === artistId)) {
          toAdd.push({ id: artistId, year: rec.year });
        }
      }
      if (toAdd.length) {
        setRecordingArtists((prev) => [
          ...prev,
          ...toAdd.filter((a) => !prev.find((e) => e.id === a.id)).map((a) => ({ ...a, youtube_url: null })),
        ]);
      }
    }
    if (acceptedFields.has("alternate_titles") && aiSuggestions.alternate_titles.length && song?.id) {
      const existingTitles = new Set(altTitles.map((t) => t.title.toLowerCase()));
      for (const title of aiSuggestions.alternate_titles) {
        if (!existingTitles.has(title.toLowerCase())) {
          const { data, error } = await supabase
            .from("song_alternate_titles")
            .insert({ song_id: song.id, title })
            .select("id, title")
            .single();
          if (!error && data) setAltTitles((prev) => [...prev, data]);
        }
      }
    }
    setAiSuggestions(null);
    setAcceptedFields(new Set());
  }

  async function syncJoinTable(
    songId: string,
    table: string,
    fkCol: string,
    newIds: Set<string>,
    originalIds: string[]
  ) {
    const toAdd = [...newIds].filter((id) => !originalIds.includes(id));
    const toRemove = originalIds.filter((id) => !newIds.has(id));

    if (toAdd.length) {
      const { error } = await supabase
        .from(table)
        .insert(toAdd.map((id) => ({ song_id: songId, [fkCol]: id })));
      if (error) throw error;
    }

    if (toRemove.length) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("song_id", songId)
        .in(fkCol, toRemove);
      if (error) throw error;
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const finalTitle = (standardizedTitle || title).trim();
      const composerNamesForSlug = [
        ...[...composers].map((id) => allPeople.find((p) => p.id === id)?.name).filter((n): n is string => !!n),
        ...pendingComposerNames,
      ];
      const lyricistNamesForSlug = [
        ...[...lyricists].map((id) => allPeople.find((p) => p.id === id)?.name).filter((n): n is string => !!n),
        ...pendingLyricistNames,
      ];
      const traditionalId = allPeople.find((p) => p.name === "Traditional")?.id;
      const isTraditionalComposer = (traditionalId && composers.has(traditionalId)) || pendingComposerNames.some((n) => n.toLowerCase() === "traditional");
      const isTraditionalLyricist = (traditionalId && lyricists.has(traditionalId)) || pendingLyricistNames.some((n) => n.toLowerCase() === "traditional");
      const resolvedSlug = slug.trim() || generateSlug(finalTitle, [...composerNamesForSlug, ...lyricistNamesForSlug], (isTraditionalComposer && composerTraditionalCulture) || undefined);
      const originalRecordingArtistIds = song?.song_recording_artists.map((x) => x.artist_id) ?? [];

      const payload = {
        title: finalTitle,
        slug: resolvedSlug,
        display_artist: recordingArtists.map((e) => allArtists.find((a) => a.id === e.id)?.name).filter(Boolean).join(", ") || (originalRecordingArtistIds.length === 0 ? (standardizedArtist || displayArtist).trim() : null) || null,
        first_line: firstLine.trim() || null,
        hook: hook.trim() || null,
        notes: notes.trim() || null,
        genius_url: geniusUrl.trim() || null,
        chord_chart_url: chordChartUrl.trim() || null,
        year: year ? parseInt(year) : null,
        year_written: yearWritten ? parseInt(yearWritten) : null,
        tonality: tonalities.join(", ") || null,
        meter: meters.join(", ") || null,
        vibe: vibe,
        updated_at: new Date().toISOString(),
      };

      let songId = song?.id;

      if (isNew) {
        // Duplicate check before inserting
        const artistVal = payload.display_artist;
        let dupeQuery = supabase.from("songs").select("id, slug").ilike("title", finalTitle);
        dupeQuery = artistVal
          ? dupeQuery.ilike("display_artist", artistVal)
          : dupeQuery.is("display_artist", null);
        const { data: dupe } = await dupeQuery.limit(1).maybeSingle();
        if (dupe) {
          setError(`This song already exists in the library.`);
          setSaving(false);
          return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase.from("songs").insert({ ...payload, submitted_by: user?.id ?? null }).select("id").single();
        if (error) throw error;
        songId = data.id;
      } else {
        const { error } = await supabase.from("songs").update(payload).eq("id", songId!);
        if (error) throw error;
      }

      async function resolveNamesToIds(names: string[], table: string, lookup: Lookup[]) {
        const ids: string[] = [];
        for (const name of names) {
          const existing = lookup.find((l) => l.name === name);
          if (existing) {
            ids.push(existing.id);
          } else {
            const { data: row } = await supabase.from(table).upsert({ name }, { onConflict: "name" }).select("id").single();
            if (row?.id) {
              ids.push(row.id);
              lookup.push({ id: row.id, name });
            }
          }
        }
        return new Set(ids);
      }
      const originalGenres = song?.song_genres.map((x) => x.genre_id) ?? [];
      const originalThemes = song?.song_themes.map((x) => x.theme_id) ?? [];
      const originalCultures = (song?.song_cultures ?? []).filter((x) => !x.context).map((x) => x.culture_id);
      const originalLanguages = song?.song_languages.map((x) => x.language_id) ?? [];
      const [genreIds, themeIds, cultureIds, languageIds] = await Promise.all([
        resolveNamesToIds(genres, "genres", allGenres),
        resolveNamesToIds(themes, "themes", allThemes),
        resolveNamesToIds(cultures, "cultures", allCultures),
        resolveNamesToIds(languages, "languages", allLanguages),
      ]);
      const originalComposers = song?.song_composers.map((x) => x.person_id) ?? [];
      const originalLyricists = song?.song_lyricists.map((x) => x.person_id) ?? [];

      const resolvedPendingComposerIds = await Promise.all(
        pendingComposerNames.map((name) => resolvePersonName(name, "people", allPeople))
      );
      const resolvedPendingLyricistIds = await Promise.all(
        pendingLyricistNames.map((name) => resolvePersonName(name, "people", allPeople))
      );
      const allComposerIds = new Set([...composers, ...resolvedPendingComposerIds.filter((id): id is string => !!id)]);
      const allLyricistIds = new Set([...lyricists, ...resolvedPendingLyricistIds.filter((id): id is string => !!id)]);

      const resolvedPendingArtistIds = await Promise.all(
        pendingRecordingArtists.map((ra) => resolvePersonName(ra.name, "artists", allArtists))
      );
      type ResolvedEntry = RecordingArtistEntry & { spotify_url?: string | null };
      const resolvedPendingEntries: ResolvedEntry[] = resolvedPendingArtistIds
        .map((id, i): ResolvedEntry | null => id ? {
          id,
          year: pendingRecordingArtists[i]?.year ?? null,
          youtube_url: null,
          spotify_url: pendingRecordingArtists[i]?.spotify_url ?? null,
        } : null)
        .filter((e): e is ResolvedEntry => e !== null)
        .filter(({ id }) => !recordingArtists.find((e) => e.id === id));
      const allRecordingArtists: ResolvedEntry[] = [...recordingArtists, ...resolvedPendingEntries];

      const newRecordingArtistIds = allRecordingArtists.map((e) => e.id);
      const toDeleteArtists = originalRecordingArtistIds.filter((id) => !newRecordingArtistIds.includes(id));

      // Sync non-contextual cultures manually so the delete is scoped to context IS NULL
      // (syncJoinTable would delete by culture_id alone, wiping traditional culture rows)
      const toAddCultures = [...cultureIds].filter((id) => !originalCultures.includes(id));
      const toRemoveCultures = originalCultures.filter((id) => !cultureIds.has(id));
      if (toAddCultures.length) {
        const { error } = await supabase.from("song_cultures").insert(toAddCultures.map((id) => ({ song_id: songId!, culture_id: id })));
        if (error) throw error;
      }
      if (toRemoveCultures.length) {
        const { error } = await supabase.from("song_cultures").delete().eq("song_id", songId!).in("culture_id", toRemoveCultures).is("context", null);
        if (error) throw error;
      }

      await Promise.all([
        syncJoinTable(songId!, "song_genres", "genre_id", genreIds, originalGenres),
        syncJoinTable(songId!, "song_themes", "theme_id", themeIds, originalThemes),
        syncJoinTable(songId!, "song_languages", "language_id", languageIds, originalLanguages),
        syncJoinTable(songId!, "song_composers", "person_id", allComposerIds, originalComposers),
        syncJoinTable(songId!, "song_lyricists", "person_id", allLyricistIds, originalLyricists),
        toDeleteArtists.length
          ? supabase.from("song_recording_artists").delete().eq("song_id", songId!).in("artist_id", toDeleteArtists)
          : Promise.resolve(),
        allRecordingArtists.length
          ? supabase.from("song_recording_artists").upsert(
              allRecordingArtists.map((e, i) => {
                const row: Record<string, unknown> = { song_id: songId!, artist_id: e.id, year: e.year, position: i, youtube_url: e.youtube_url ?? null };
                // Only write spotify_url when explicitly provided (pending entries from AI lookup)
                // Omitting it for existing DB entries preserves their current value
                if ("spotify_url" in e) row.spotify_url = e.spotify_url;
                return row;
              }),
              { onConflict: "song_id,artist_id" }
            )
          : Promise.resolve(),
      ]);

      // Sync traditional cultures with context
      await supabase.from("song_cultures").delete().eq("song_id", songId!).in("context", ["music", "lyrics"]);
      const tCultures: { name: string; context: string }[] = [];
      if (isTraditionalComposer && composerTraditionalCulture) {
        tCultures.push({ name: composerTraditionalCulture, context: "music" });
      }
      if (isTraditionalLyricist && lyricistTraditionalCulture) {
        tCultures.push({ name: lyricistTraditionalCulture, context: "lyrics" });
      }
      for (const { name: cultureName, context } of tCultures) {
        const culture = allCultures.find((c) => c.name.toLowerCase() === cultureName.toLowerCase());
        if (culture) {
          await supabase.from("song_cultures").insert({ song_id: songId!, culture_id: culture.id, context });
        }
      }

      // Sync productions
      const resolvedProductionIds = new Set<string>([...productions]);
      for (const id of productions) {
        const year = parseYear(productionYears[id]);
        if (year !== (allProductions.find((p) => p.id === id)?.year ?? null)) {
          await supabase.from("productions").update({ year }).eq("id", id);
        }
      }
      for (const name of pendingProductionNames) {
        const year = parseYear(productionYears[`new:${name}`]);
        const lookup = supabase.from("productions").select("id").eq("name", name);
        const { data: existing } = await (year === null ? lookup.is("year", null) : lookup.eq("year", year)).maybeSingle();
        const id = existing?.id ?? (await supabase.from("productions").insert({ name, year }).select("id").single()).data?.id;
        if (id) resolvedProductionIds.add(id);
      }
      const originalProductionIds = (song?.song_productions ?? []).map((x) => x.production_id);
      await syncJoinTable(songId!, "song_productions", "production_id", resolvedProductionIds, originalProductionIds);

      // Insert pending alternate titles (new-song flow only)
      if (pendingAltTitles.length) {
        const existingTitleSet = new Set(altTitles.map((t) => t.title.toLowerCase()));
        const newTitles = pendingAltTitles.filter((t) => !existingTitleSet.has(t.toLowerCase()));
        if (newTitles.length) {
          const { data: inserted } = await supabase
            .from("song_alternate_titles")
            .insert(newTitles.map((t) => ({ song_id: songId!, title: t })))
            .select("id, title");
          if (inserted) setAltTitles((prev) => [...prev, ...inserted]);
        }
        setPendingAltTitles([]);
      }

      setSlug(resolvedSlug);
      router.push(`${basePath}/${resolvedSlug}`);
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function addAltTitle() {
    if (!newAltTitle.trim() || !song?.id) return;
    const { data, error } = await supabase
      .from("song_alternate_titles")
      .insert({ song_id: song.id, title: newAltTitle.trim() })
      .select("id, title")
      .single();
    if (error) { setError(error.message); return; }
    setAltTitles((prev) => [...prev, data]);
    setNewAltTitle("");
  }

  async function removeAltTitle(id: string) {
    await supabase.from("song_alternate_titles").delete().eq("id", id);
    setAltTitles((prev) => prev.filter((t) => t.id !== id));
  }

  // ── Chunk 1: new song form ────────────────────────────────────────────────
  if (isNew) {
    const composerItems = [...composers]
      .map((id) => allPeople.find((p) => p.id === id))
      .filter((p): p is Lookup => !!p);

    const lyricistItems = [...lyricists]
      .map((id) => allPeople.find((p) => p.id === id))
      .filter((p): p is Lookup => !!p);


    return (
      <div className="space-y-6 pb-16">
        <h1 className="text-xl font-semibold text-slate-900">Add song</h1>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Title *">
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                className="input" placeholder="Song title" />
            </Field>
            <Field label="Artist">
              <input value={displayArtist} onChange={(e) => setDisplayArtist(e.target.value)}
                className="input" placeholder="e.g. The Beatles" />
            </Field>
            <Field label="Show / film (optional)">
              <input value={newSongProduction} onChange={(e) => setNewSongProduction(e.target.value)}
                className="input" placeholder="e.g. Hamilton, The Lion King" />
            </Field>
          </div>
          <button
            onClick={handleAILookup}
            disabled={finding || !title.trim()}
            className="rounded-full border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-40"
          >
            {finding ? "Looking up…" : "✦ Look up with AI"}
          </button>
        </section>

        {found && (() => {
          const traditionalId = allPeople.find((p) => p.name === "Traditional")?.id;
          const composerIsTraditional = traditionalId ? composers.has(traditionalId) : false;
          const lyricistIsTraditional = traditionalId ? lyricists.has(traditionalId) : false;
          return (
            <>
              {/* Credits & recording artists */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <h2 className="text-sm font-semibold text-slate-700">Credits & recordings</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Canonical title">
                    <input value={standardizedTitle} onChange={(e) => setStandardizedTitle(e.target.value)} className="input" />
                  </Field>
                  <Field label="Display artist">
                    <input value={standardizedArtist} onChange={(e) => setStandardizedArtist(e.target.value)} className="input" />
                  </Field>
                </div>
                <PeopleField
                  label="Composers"
                  items={composerItems}
                  query={newComposerName}
                  onQueryChange={setNewComposerName}
                  suggestions={allPeople.filter((p) => !composers.has(p.id) && p.name.toLowerCase().includes(newComposerName.toLowerCase().trim()))}
                  onAdd={(p) => { setComposers((prev) => new Set([...prev, p.id])); setNewComposerName(""); }}
                  onRemove={(id) => { setComposers((prev) => { const s = new Set(prev); s.delete(id); return s; }); if (id === traditionalId) setComposerTraditionalCulture(""); }}
                  onAddNew={(name) => { if (!pendingComposerNames.includes(name)) setPendingComposerNames((prev) => [...prev, name]); setNewComposerName(""); }}
                  pendingItems={pendingComposerNames}
                  onRemovePending={(name) => setPendingComposerNames((prev) => prev.filter((n) => n !== name))}
                />
                {composerIsTraditional && (
                  <TraditionalCultureField value={composerTraditionalCulture} onChange={setComposerTraditionalCulture} allCultures={allCultures} label="Music culture (e.g. English, Irish)" />
                )}
                <PeopleField
                  label="Lyricists"
                  items={lyricistItems}
                  query={newLyricistName}
                  onQueryChange={setNewLyricistName}
                  suggestions={allPeople.filter((p) => !lyricists.has(p.id) && p.name.toLowerCase().includes(newLyricistName.toLowerCase().trim()))}
                  onAdd={(p) => { setLyricists((prev) => new Set([...prev, p.id])); setNewLyricistName(""); }}
                  onRemove={(id) => { setLyricists((prev) => { const s = new Set(prev); s.delete(id); return s; }); if (id === traditionalId) setLyricistTraditionalCulture(""); }}
                  onAddNew={(name) => { if (!pendingLyricistNames.includes(name)) setPendingLyricistNames((prev) => [...prev, name]); setNewLyricistName(""); }}
                  pendingItems={pendingLyricistNames}
                  onRemovePending={(name) => setPendingLyricistNames((prev) => prev.filter((n) => n !== name))}
                />
                {lyricistIsTraditional && (
                  <TraditionalCultureField value={lyricistTraditionalCulture} onChange={setLyricistTraditionalCulture} allCultures={allCultures} label="Lyrics culture (e.g. English, Irish)" />
                )}
                <RecordingArtistField
                  items={recordingArtists}
                  allArtists={allArtists}
                  query={newRecordingArtistName}
                  songTitle={standardizedTitle || title}
                  onQueryChange={setNewRecordingArtistName}
                  onAdd={(a) => { setRecordingArtists((prev) => [...prev, { id: a.id, year: null, youtube_url: null }]); setNewRecordingArtistName(""); }}
                  onRemove={(id) => setRecordingArtists((prev) => prev.filter((e) => e.id !== id))}
                  onYearChange={(id, yr) => setRecordingArtists((prev) => prev.map((e) => e.id === id ? { ...e, year: yr } : e))}
                  onYoutubeUrlChange={(id, url) => setRecordingArtists((prev) => prev.map((e) => e.id === id ? { ...e, youtube_url: url } : e))}
                  onSpotifyUrlChange={(id, url) => setRecordingArtists((prev) => prev.map((e) => e.id === id ? { ...e, spotify_url: url } : e))}
                  onReorder={setRecordingArtists}
                  onAddNew={(name) => { if (!pendingRecordingArtists.find((r) => r.name === name)) setPendingRecordingArtists((prev) => [...prev, { name, year: null, spotify_url: null }]); }}
                  pendingItems={pendingRecordingArtists}
                  onRemovePending={(name) => setPendingRecordingArtists((prev) => prev.filter((r) => r.name !== name))}
                />
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isFromProduction}
                      onChange={(e) => {
                        setIsFromProduction(e.target.checked);
                        if (!e.target.checked) { setProductions(new Set()); setPendingProductionNames([]); setProductionQuery(""); }
                      }}
                      className="rounded border-slate-300"
                    />
                    From theater, film, or TV?
                  </label>
                  {isFromProduction && (
                    <PeopleField
                      label="Production"
                      items={[...productions].map((id) => productionLookups.find((p) => p.id === id)).filter((p): p is Lookup => !!p)}
                      query={productionQuery}
                      onQueryChange={setProductionQuery}
                      suggestions={productionLookups.filter((p) => p.name.toLowerCase().includes(productionQuery.toLowerCase()) && !productions.has(p.id))}
                      onAdd={(p) => { setProductions((prev) => new Set([...prev, p.id])); setProductionYears((prev) => ({ ...prev, [p.id]: String(allProductions.find((x) => x.id === p.id)?.year ?? "") })); setProductionQuery(""); }}
                      onRemove={(id) => setProductions((prev) => { const s = new Set(prev); s.delete(id); return s; })}
                      onAddNew={(name) => { setPendingProductionNames((prev) => [...prev, name]); setProductionQuery(""); }}
                      pendingItems={pendingProductionNames}
                      onRemovePending={(name) => setPendingProductionNames((prev) => prev.filter((n) => n !== name))}
                    />
                  )}
                  {isFromProduction && productionYearRows.length > 0 && (
                    <ProductionYearInputs rows={productionYearRows} years={productionYears} onChange={(key, v) => setProductionYears((prev) => ({ ...prev, [key]: v }))} />
                  )}
                </div>
              </section>

              {/* Lyrics & feel */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <h2 className="text-sm font-semibold text-slate-700">Lyrics & feel</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="First line">
                    <input value={firstLine} onChange={(e) => setFirstLine(e.target.value)} className="input" placeholder="First sung lyric line" />
                  </Field>
                  <Field label="Hook">
                    <input value={hook} onChange={(e) => setHook(e.target.value)} className="input" placeholder="Most recognisable lyric phrase" />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Year written">
                    <input type="number" value={yearWritten} onChange={(e) => setYearWritten(e.target.value)} className="input" placeholder="e.g. 1962" />
                  </Field>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Vibe</label>
                    <div className="flex gap-2">
                      {(["Banger", "Ballad"] as const).map((v) => (
                        <button key={v} type="button" onClick={() => setVibe(vibe === v ? null : v)}
                          className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${vibe === v ? "bg-amber-500 border-amber-500 text-white" : "border-slate-300 text-slate-600 hover:border-amber-400"}`}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Meter</label>
                    <div className="flex flex-wrap gap-1">
                      {METER_OPTIONS.map((m) => (
                        <button key={m} type="button" onClick={() => setMeters((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m])}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${meters.includes(m) ? "bg-amber-500 border-amber-500 text-white" : "border-slate-300 text-slate-600 hover:border-amber-400"}`}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tonality</label>
                  <div className="flex flex-wrap gap-1">
                    {TONALITY_OPTIONS.map((t) => (
                      <button key={t} type="button" onClick={() => setTonalities((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${tonalities.includes(t) ? "bg-amber-500 border-amber-500 text-white" : "border-slate-300 text-slate-600 hover:border-amber-400"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* Tags */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <h2 className="text-sm font-semibold text-slate-700">Tags</h2>
                <TagPillsField label="Genres" value={genres} suggestions={allGenres.map((g) => g.name)} onChange={setGenres} />
                <TagPillsField label="Languages" value={languages} suggestions={allLanguages.map((l) => l.name)} onChange={setLanguages} />
                <TagPillsField label="Themes" value={themes} suggestions={allThemes.map((t) => t.name)} onChange={setThemes} />
                {/* Cultures was missing here while the edit form has it, so AI-suggested
                    cultures were saved on create without ever being shown for review. */}
                <TagPillsField label="Cultures" value={cultures} suggestions={allCultures.map((c) => c.name)} onChange={setCultures} allowNew placeholder="Search cultures…" />
                {pendingAltTitles.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Alternate titles</label>
                    <div className="flex flex-wrap gap-1.5">
                      {pendingAltTitles.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
                          {t}
                          <button type="button" onClick={() => setPendingAltTitles((prev) => prev.filter((x) => x !== t))} className="text-slate-400 hover:text-slate-600 leading-none">×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Additional notes */}
              <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                <h2 className="text-sm font-semibold text-slate-700">Additional notes</h2>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  className="input min-h-[80px] resize-y" placeholder="Any extra context, performance notes, etc." />
              </section>
            </>
          );
        })()}

        {duplicateSong && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            This song already exists in the database.{" "}
            <a
              href={`${basePath}/${duplicateSong.slug ?? duplicateSong.id}`}
              className="font-semibold underline hover:text-red-900"
            >
              Edit "{duplicateSong.title}" →
            </a>
          </div>
        )}

        {!duplicateSong && sameTitleSongs.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="font-medium">Note:</span> A song with this title already exists:{" "}
            {sameTitleSongs.map((s, i) => (
              <span key={s.id}>
                {i > 0 && ", "}
                <a href={`${basePath}/${s.slug ?? s.id}`} className="underline hover:text-amber-900">
                  {s.title}
                </a>
              </span>
            ))}
            . If this is a different arrangement or version, continue saving.
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || !title.trim() || !!duplicateSong}
          className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-40"
        >
          {saving ? "Saving…" : found ? "Save" : "Save & continue"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-slate-900">
          {title || "Edit song"}
        </h1>
        <div className="flex flex-wrap gap-2">
          {slug && (
            <a
              href={`/songs/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              View ↗
            </a>
          )}
          <button
            onClick={handleEnrichWithAI}
            disabled={enrichingWithAI || !song?.id}
            className="rounded-full border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-40"
          >
            {enrichingWithAI ? "Asking AI…" : "✦ Enrich with AI"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {aiSuggestions && (() => {
        const currentComposerNames = [...composers].map((id) => allPeople.find((p) => p.id === id)?.name).filter(Boolean).join(", ");
        const currentLyricistNames = [...lyricists].map((id) => allPeople.find((p) => p.id === id)?.name).filter(Boolean).join(", ");
        const toggleField = (field: string) => (on: boolean) =>
          setAcceptedFields((prev) => { const s = new Set(prev); on ? s.add(field) : s.delete(field); return s; });
        return (
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-violet-900">AI Suggestions</h2>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  aiSuggestions.confidence === "high" ? "bg-green-100 text-green-700" :
                  aiSuggestions.confidence === "medium" ? "bg-amber-100 text-amber-700" :
                  "bg-red-100 text-red-700"
                }`}>
                  {aiSuggestions.confidence} confidence
                </span>
              </div>
              <button onClick={() => setAiSuggestions(null)} className="text-violet-400 hover:text-violet-600 text-lg leading-none">×</button>
            </div>

            {aiSuggestions.notes && (
              <p className="rounded-lg bg-violet-100 px-3 py-2 text-xs text-violet-700">{aiSuggestions.notes}</p>
            )}

            <div className="space-y-2">
              {aiSuggestions.year_written != null && (
                <SuggestionRow label="Year written" current={yearWritten || "—"} suggested={aiSuggestions.year_written.toString()} accepted={acceptedFields.has("year_written")} onChange={toggleField("year_written")} />
              )}
              {aiSuggestions.first_line && (
                <SuggestionRow label="First line" current={firstLine || "—"} suggested={aiSuggestions.first_line} accepted={acceptedFields.has("first_line")} onChange={toggleField("first_line")} />
              )}
              {aiSuggestions.hook && (
                <SuggestionRow label="Hook" current={hook || "—"} suggested={aiSuggestions.hook} accepted={acceptedFields.has("hook")} onChange={toggleField("hook")} />
              )}
              {aiSuggestions.composers.length > 0 && (
                <SuggestionRow label="Composers" current={currentComposerNames || "—"} suggested={aiSuggestions.composers.join(", ")} accepted={acceptedFields.has("composers")} onChange={toggleField("composers")} />
              )}
              {aiSuggestions.lyricists.length > 0 && (
                <SuggestionRow label="Lyricists" current={currentLyricistNames || "—"} suggested={aiSuggestions.lyricists.join(", ")} accepted={acceptedFields.has("lyricists")} onChange={toggleField("lyricists")} />
              )}
              {aiSuggestions.primary_recording_year != null && (
                <SuggestionRow label="Primary recording year" current={recordingArtists[0]?.year?.toString() || "—"} suggested={aiSuggestions.primary_recording_year.toString()} accepted={acceptedFields.has("primary_recording_year")} onChange={toggleField("primary_recording_year")} />
              )}
              {aiSuggestions.tonality && (
                <SuggestionRow label="Tonality" current={tonalities.join(", ") || "—"} suggested={aiSuggestions.tonality} accepted={acceptedFields.has("tonality")} onChange={toggleField("tonality")} />
              )}
              {aiSuggestions.meter && (
                <SuggestionRow label="Meter" current={meters.join(", ") || "—"} suggested={aiSuggestions.meter} accepted={acceptedFields.has("meter")} onChange={toggleField("meter")} />
              )}
              {aiSuggestions.vibe && (
                <SuggestionRow label="Vibe" current={vibe || "—"} suggested={aiSuggestions.vibe} accepted={acceptedFields.has("vibe")} onChange={toggleField("vibe")} />
              )}
              {aiSuggestions.genres.length > 0 && (
                <SuggestionRow label="Genres" current={genres.join(", ") || "—"} suggested={aiSuggestions.genres.join(", ")} accepted={acceptedFields.has("genres")} onChange={toggleField("genres")} />
              )}
              {aiSuggestions.themes.length > 0 && (
                <SuggestionRow label="Themes" current={themes.join(", ") || "—"} suggested={aiSuggestions.themes.join(", ")} accepted={acceptedFields.has("themes")} onChange={toggleField("themes")} />
              )}
              {aiSuggestions.cultures.length > 0 && (
                <SuggestionRow label="Cultures" current={cultures.join(", ") || "—"} suggested={aiSuggestions.cultures.join(", ")} accepted={acceptedFields.has("cultures")} onChange={toggleField("cultures")} />
              )}
              {aiSuggestions.music_culture && (
                <SuggestionRow label="Music culture" current={composerTraditionalCulture || "—"} suggested={aiSuggestions.music_culture} accepted={acceptedFields.has("music_culture")} onChange={toggleField("music_culture")} />
              )}
              {aiSuggestions.lyric_culture && (
                <SuggestionRow label="Lyric culture" current={lyricistTraditionalCulture || "—"} suggested={aiSuggestions.lyric_culture} accepted={acceptedFields.has("lyric_culture")} onChange={toggleField("lyric_culture")} />
              )}
              {aiSuggestions.languages.length > 0 && (
                <SuggestionRow label="Languages" current={languages.join(", ") || "—"} suggested={aiSuggestions.languages.join(", ")} accepted={acceptedFields.has("languages")} onChange={toggleField("languages")} />
              )}
              {aiSuggestions.additional_recordings?.length > 0 && (
                <SuggestionRow label="Additional recordings" current={recordingArtists.map((e) => allArtists.find((a) => a.id === e.id)?.name).filter(Boolean).join(", ") || "—"} suggested={aiSuggestions.additional_recordings.map((r) => r.year ? `${r.artist} (${r.year})` : r.artist).join(", ")} accepted={acceptedFields.has("additional_recordings")} onChange={toggleField("additional_recordings")} />
              )}
              {aiSuggestions.notes && (
                <SuggestionRow label="Notes" current={notes || "—"} suggested={aiSuggestions.notes} accepted={acceptedFields.has("notes")} onChange={toggleField("notes")} />
              )}
              {aiSuggestions.productions?.length > 0 && (
                <SuggestionRow label="Productions" current={[...productions].map((id) => allProductions.find((p) => p.id === id)?.name).filter(Boolean).join(", ") || "—"} suggested={aiSuggestions.productions.join(", ")} accepted={acceptedFields.has("productions")} onChange={toggleField("productions")} />
              )}
              {aiSuggestions.alternate_titles.length > 0 && (
                <SuggestionRow label="Alternate titles" current={altTitles.map((t) => t.title).join(", ") || "—"} suggested={aiSuggestions.alternate_titles.join(", ")} accepted={acceptedFields.has("alternate_titles")} onChange={toggleField("alternate_titles")} />
              )}
            </div>

            <button
              onClick={applyAISuggestions}
              disabled={acceptedFields.size === 0}
              className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
            >
              Apply {acceptedFields.size} suggestion{acceptedFields.size !== 1 ? "s" : ""}
            </button>
          </div>
        );
      })()}

      {/* Scalar fields */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Core fields</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title *">
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="input" placeholder="Song title" />
          </Field>
          <Field label="Slug">
            <input value={slug} onChange={(e) => setSlug(e.target.value)}
              className="input font-mono text-xs" placeholder="e.g. blowin-in-the-wind-bob-dylan" />
          </Field>
        </div>

        {(() => {
          const traditionalId = allPeople.find((p) => p.name === "Traditional")?.id;
          const composerIsTraditional = traditionalId ? composers.has(traditionalId) : false;
          const lyricistIsTraditional = traditionalId ? lyricists.has(traditionalId) : false;
          return (
            <>
              <PeopleField
                label="Composers"
                items={[...composers].map((id) => allPeople.find((p) => p.id === id)).filter((p): p is Lookup => !!p)}
                query={newComposerName}
                onQueryChange={setNewComposerName}
                suggestions={allPeople.filter(
                  (p) => !composers.has(p.id) && p.name.toLowerCase().includes(newComposerName.toLowerCase().trim())
                )}
                onAdd={(p) => { setComposers((prev) => new Set([...prev, p.id])); setNewComposerName(""); }}
                onRemove={(id) => { setComposers((prev) => { const s = new Set(prev); s.delete(id); return s; }); if (id === traditionalId) setComposerTraditionalCulture(""); }}
                onAddNew={(name) => { if (!pendingComposerNames.includes(name)) setPendingComposerNames((prev) => [...prev, name]); setNewComposerName(""); }}
                onRemovePending={(name) => setPendingComposerNames((prev) => prev.filter((n) => n !== name))}
                pendingItems={pendingComposerNames}
              />
              {composerIsTraditional && (
                <TraditionalCultureField
                  value={composerTraditionalCulture}
                  onChange={setComposerTraditionalCulture}
                  allCultures={allCultures}
                  label="Music culture (e.g. English, Irish)"
                />
              )}
              <PeopleField
                label="Lyricists"
                items={[...lyricists].map((id) => allPeople.find((p) => p.id === id)).filter((p): p is Lookup => !!p)}
                query={newLyricistName}
                onQueryChange={setNewLyricistName}
                suggestions={allPeople.filter(
                  (p) => !lyricists.has(p.id) && p.name.toLowerCase().includes(newLyricistName.toLowerCase().trim())
                )}
                onAdd={(p) => { setLyricists((prev) => new Set([...prev, p.id])); setNewLyricistName(""); }}
                onRemove={(id) => { setLyricists((prev) => { const s = new Set(prev); s.delete(id); return s; }); if (id === traditionalId) setLyricistTraditionalCulture(""); }}
                onAddNew={(name) => { if (!pendingLyricistNames.includes(name)) setPendingLyricistNames((prev) => [...prev, name]); setNewLyricistName(""); }}
                onRemovePending={(name) => setPendingLyricistNames((prev) => prev.filter((n) => n !== name))}
                pendingItems={pendingLyricistNames}
              />
              {lyricistIsTraditional && (
                <TraditionalCultureField
                  value={lyricistTraditionalCulture}
                  onChange={setLyricistTraditionalCulture}
                  allCultures={allCultures}
                  label="Lyrics culture (e.g. English, Irish)"
                />
              )}
            </>
          );
        })()}
        <RecordingArtistField
          items={recordingArtists}
          allArtists={allArtists}
          query={newRecordingArtistName}
          songTitle={title}
          onQueryChange={setNewRecordingArtistName}
          onAdd={(a) => { setRecordingArtists((prev) => [...prev, { id: a.id, year: null, youtube_url: null }]); setNewRecordingArtistName(""); }}
          onRemove={(id) => setRecordingArtists((prev) => prev.filter((e) => e.id !== id))}
          onYearChange={(id, year) => setRecordingArtists((prev) => prev.map((e) => e.id === id ? { ...e, year } : e))}
          onYoutubeUrlChange={(id, url) => setRecordingArtists((prev) => prev.map((e) => e.id === id ? { ...e, youtube_url: url } : e))}
          onSpotifyUrlChange={(id, url) => setRecordingArtists((prev) => prev.map((e) => e.id === id ? { ...e, spotify_url: url } : e))}
          onReorder={setRecordingArtists}
          onAddNew={(name) => { if (!pendingRecordingArtists.find((r) => r.name === name)) setPendingRecordingArtists((prev) => [...prev, { name, year: null, spotify_url: null }]); }}
          pendingItems={pendingRecordingArtists}
          onRemovePending={(name) => setPendingRecordingArtists((prev) => prev.filter((r) => r.name !== name))}
        />

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={isFromProduction}
              onChange={(e) => {
                setIsFromProduction(e.target.checked);
                if (!e.target.checked) {
                  setProductions(new Set());
                  setPendingProductionNames([]);
                  setProductionQuery("");
                }
              }}
              className="rounded border-slate-300"
            />
            From theater, movie, or TV?
          </label>
          {isFromProduction && (
            <PeopleField
              label="Production"
              items={[...productions].map((id) => productionLookups.find((p) => p.id === id)).filter((p): p is Lookup => !!p)}
              query={productionQuery}
              onQueryChange={setProductionQuery}
              suggestions={productionLookups.filter(
                (p) => p.name.toLowerCase().includes(productionQuery.toLowerCase()) && !productions.has(p.id)
              )}
              onAdd={(p) => { setProductions((prev) => new Set([...prev, p.id])); setProductionYears((prev) => ({ ...prev, [p.id]: String(allProductions.find((x) => x.id === p.id)?.year ?? "") })); setProductionQuery(""); }}
              onRemove={(id) => setProductions((prev) => { const s = new Set(prev); s.delete(id); return s; })}
              onAddNew={(name) => { setPendingProductionNames((prev) => [...prev, name]); setProductionQuery(""); }}
              pendingItems={pendingProductionNames}
              onRemovePending={(name) => setPendingProductionNames((prev) => prev.filter((n) => n !== name))}
            />
          )}
          {isFromProduction && productionYearRows.length > 0 && (
            <ProductionYearInputs rows={productionYearRows} years={productionYears} onChange={(key, v) => setProductionYears((prev) => ({ ...prev, [key]: v }))} />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Year written</label>
          <input
            type="number"
            value={yearWritten}
            onChange={(e) => setYearWritten(e.target.value)}
            placeholder="e.g. 1929"
            className="w-32 rounded-xl border border-slate-300 px-3 py-1.5 text-sm focus:border-amber-400 focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-400">Only set if different from the first recording year</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TagPillsField label="Tonality" value={tonalities} onChange={setTonalities} suggestions={TONALITY_OPTIONS} allowNew placeholder="Search tonality…" />
          <TagPillsField label="Meter" value={meters} onChange={setMeters} suggestions={METER_OPTIONS} placeholder="Search meter…" />
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Vibe</p>
          <div className="flex gap-6">
            {(["Banger", "Ballad"] as const).map((option) => (
              <label key={option} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                <input
                  type="radio"
                  name="vibe"
                  value={option}
                  checked={vibe === option}
                  onChange={() => setVibe(option)}
                  className="accent-amber-500"
                />
                {option}
              </label>
            ))}
            {vibe && (
              <button
                type="button"
                onClick={() => setVibe(null)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Lyric data */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Lyric data</h2>
          <button
            onClick={handleGetGeniusUrl}
            disabled={openingGenius || !title.trim()}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-amber-400 hover:text-amber-600 disabled:opacity-40 flex items-center gap-1.5"
          >
            {openingGenius ? "Finding…" : "♪ Get Genius URL"}
          </button>
        </div>
        <Field label="Genius URL">
          <div className="flex gap-2">
            <input value={geniusUrl} onChange={(e) => setGeniusUrl(e.target.value)}
              className="input flex-1" placeholder="https://genius.com/…" />
            {geniusUrl && (
              <a href={geniusUrl} target="_blank" rel="noopener noreferrer"
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-amber-400 hover:text-amber-600 shrink-0">
                ↗
              </a>
            )}
          </div>
        </Field>
        <Field label="Chord Chart URL">
          <div className="flex gap-2">
            <input value={chordChartUrl} onChange={(e) => setChordChartUrl(e.target.value)}
              className="input flex-1" placeholder="https://…" />
            {chordChartUrl && (
              <a href={chordChartUrl} target="_blank" rel="noopener noreferrer"
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-amber-400 hover:text-amber-600 shrink-0">
                ↗
              </a>
            )}
          </div>
        </Field>
        <Field label="First line">
          <input value={firstLine} onChange={(e) => setFirstLine(e.target.value)}
            className="input" placeholder="First sung line of the song" />
        </Field>
        <Field label="Hook / excerpt">
          <input value={hook} onChange={(e) => setHook(e.target.value)}
            className="input" placeholder="Memorable lyric excerpt" />
        </Field>
      </section>

      {/* Lookups */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Tags</h2>
          <button
            onClick={handleFindTags}
            disabled={findingTags || !title.trim()}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-amber-400 hover:text-amber-600 disabled:opacity-40"
          >
            {findingTags ? "Finding…" : "✦ Find more information"}
          </button>
        </div>
        <TagPillsField label="Genres" value={genres} onChange={setGenres} suggestions={allGenres.map((g) => g.name)} allowNew placeholder="Search genres…" />
        <TagPillsField label="Themes" value={themes} onChange={setThemes} suggestions={allThemes.map((t) => t.name)} allowNew placeholder="Search themes…" />
        <TagPillsField label="Languages" value={languages} onChange={setLanguages} suggestions={allLanguages.map((l) => l.name)} placeholder="Search languages…" />
        <TagPillsField label="Cultures" value={cultures} onChange={setCultures} suggestions={allCultures.map((c) => c.name)} allowNew placeholder="Search cultures…" />
      </section>
      {/* Alternate titles */}
      {!isNew && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Alternate titles (AKA)</h2>
          <div className="flex gap-2">
            <input
              value={newAltTitle}
              onChange={(e) => setNewAltTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addAltTitle()}
              placeholder="Add alternate title…"
              className="input flex-1"
            />
            <button onClick={addAltTitle}
              className="rounded-full bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {altTitles.map((t) => (
              <span key={t.id}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm">
                {t.title}
                <button onClick={() => removeAltTitle(t.id)}
                  className="text-slate-400 hover:text-red-500">×</button>
              </span>
            ))}
            {!altTitles.length && (
              <span className="text-sm text-slate-400">None added yet.</span>
            )}
          </div>
        </section>
      )}

      {/* Additional notes */}
      {!isNew && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Additional notes</h2>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            className="input min-h-[80px] resize-y" placeholder="Any extra context, performance notes, etc." />
        </section>
      )}

      {!isNew && (
        <div className="border-t border-slate-200 pt-6 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={async () => {
                setFillState("running");
                const res = await fetch(`/api/songs/${song!.id}/enrich`, { method: "POST" });
                setFillState(res.ok ? "started" : "failed");
              }}
              disabled={fillState === "running"}
              title="Fills only empty fields, from sources that agree. Reload in a minute to see what changed."
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {fillState === "started" ? "Filling in — reload in a minute" : fillState === "failed" ? "Couldn't start — try again" : "Fill in blanks automatically"}
            </button>
            {slug && (
              <a
                href={`/songs/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                View ↗
              </a>
            )}
          </div>
          {isAdmin && (
            <button
              onClick={async () => {
                if (!confirm("Delete this song? This cannot be undone.")) return;
                const { error } = await supabase.from("songs").delete().eq("id", song!.id);
                if (error) { setError(error.message); return; }
                router.push(basePath);
                router.refresh();
              }}
              className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Delete song
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type YtResult = { videoId: string; title: string; channel: string; url: string };

function SortableArtistRow({
  e, artist, isSearchingYt, isSearchingSpotify, resultsOpen, searchResults,
  pasteSpotifyId, pasteSpotifyValue, spotifyNotFoundIds, songTitle,
  onRemove, onYearChange, onSpotifyUrlChange, onYoutubeUrlChange,
  onYoutubeSearch, onSpotifySearch, onTogglePasteSpotify, onPasteSpotifyChange,
  onPasteSpotifySave, onCloseResults,
}: {
  e: { id: string; year: number | null; youtube_url: string | null; spotify_url?: string | null };
  artist: { id: string; name: string } | undefined;
  isSearchingYt: boolean;
  isSearchingSpotify: boolean;
  resultsOpen: boolean;
  searchResults: YtResult[];
  pasteSpotifyId: string | null;
  pasteSpotifyValue: string;
  spotifyNotFoundIds: Set<string>;
  songTitle: string;
  onRemove: (id: string) => void;
  onYearChange: (id: string, year: number | null) => void;
  onSpotifyUrlChange: (id: string, url: string | null) => void;
  onYoutubeUrlChange: (id: string, url: string | null) => void;
  onYoutubeSearch: (id: string, artistName: string) => void;
  onSpotifySearch: (id: string, artistName: string) => void;
  onTogglePasteSpotify: (id: string) => void;
  onPasteSpotifyChange: (value: string) => void;
  onPasteSpotifySave: (id: string, url: string) => void;
  onCloseResults: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: e.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="space-y-1">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <span {...listeners} className="cursor-grab touch-none text-slate-400 text-xs active:cursor-grabbing select-none">⠿</span>
          <span className="text-sm font-medium text-slate-800 flex-1 min-w-0 truncate">{artist?.name}</span>
          <input
            type="number"
            value={e.year ?? ""}
            onChange={(ev) => onYearChange(e.id, ev.target.value ? parseInt(ev.target.value) : null)}
            placeholder="year"
            className="w-16 rounded-xl border border-slate-200 bg-white px-2 py-0.5 text-xs focus:border-amber-400 focus:outline-none"
          />
          <button onClick={() => onRemove(e.id)} className="text-slate-400 hover:text-red-500 shrink-0">×</button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pl-4">
          {e.spotify_url ? (
            <>
              <a href={e.spotify_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-green-600 hover:text-green-700 shrink-0">🎵 linked</a>
              <button
                type="button"
                onClick={() => onSpotifySearch(e.id, artist?.name ?? "")}
                disabled={isSearchingSpotify || !songTitle.trim()}
                title="Re-search Spotify"
                className="shrink-0 rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-400 hover:border-green-400 hover:text-green-600 disabled:opacity-40"
              >
                {isSearchingSpotify ? "…" : "↺"}
              </button>
              <button
                type="button"
                onClick={() => onTogglePasteSpotify(e.id)}
                className="shrink-0 rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600 hover:border-green-400 hover:text-green-600"
              >
                Paste URL
              </button>
            </>
          ) : spotifyNotFoundIds.has(e.id) ? (
            <>
              <span className="text-xs text-slate-400 shrink-0">Not found</span>
              <button
                type="button"
                onClick={() => onTogglePasteSpotify(e.id)}
                className="shrink-0 rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600 hover:border-green-400 hover:text-green-600"
              >
                Paste URL
              </button>
              <button
                type="button"
                onClick={() => onSpotifySearch(e.id, artist?.name ?? "")}
                disabled={isSearchingSpotify || !songTitle.trim()}
                className="shrink-0 rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600 hover:border-green-400 hover:text-green-600 disabled:opacity-40"
              >
                {isSearchingSpotify ? "…" : "↺ Retry"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onSpotifySearch(e.id, artist?.name ?? "")}
              disabled={isSearchingSpotify || !songTitle.trim()}
              className="shrink-0 rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600 hover:border-green-400 hover:text-green-600 disabled:opacity-40"
            >
              {isSearchingSpotify ? "…" : "🎵 Spotify"}
            </button>
          )}
          {e.youtube_url && (
            <a href={e.youtube_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-green-600 hover:text-green-700 shrink-0">▶ linked</a>
          )}
          <button
            type="button"
            onClick={() => {
              if (resultsOpen) { onCloseResults(); return; }
              onYoutubeSearch(e.id, artist?.name ?? "");
            }}
            disabled={isSearchingYt || !songTitle.trim()}
            className="shrink-0 rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600 hover:border-amber-400 hover:text-amber-600 disabled:opacity-40"
          >
            {isSearchingYt ? "…" : "▶ YouTube"}
          </button>
        </div>
      </div>
      {pasteSpotifyId === e.id && (
        <div className="ml-6 flex items-center gap-2 pt-1">
          <input
            autoFocus
            value={pasteSpotifyValue}
            onChange={(ev) => onPasteSpotifyChange(ev.target.value)}
            placeholder="https://open.spotify.com/track/…"
            className="flex-1 rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs focus:border-green-400 focus:outline-none"
          />
          <button
            type="button"
            disabled={!pasteSpotifyValue.trim().startsWith("https://open.spotify.com/")}
            onClick={() => onPasteSpotifySave(e.id, pasteSpotifyValue.trim())}
            className="shrink-0 rounded border border-green-400 bg-white px-2 py-1 text-xs text-green-700 hover:bg-green-50 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      )}
      {resultsOpen && searchResults.length > 0 && (
        <div className="ml-6 space-y-0 rounded-lg border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {searchResults.map((r) => (
            <div key={r.videoId} className="flex items-center justify-between gap-3 px-3 py-2 bg-white">
              <div className="min-w-0">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-amber-600 hover:underline truncate block">{r.title}</a>
                <div className="text-xs text-slate-400 truncate">{r.channel}</div>
              </div>
              <button
                type="button"
                onClick={() => { onYoutubeUrlChange(e.id, r.url); onCloseResults(); }}
                className="shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-amber-400 hover:text-amber-600"
              >
                Select
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecordingArtistField({
  items, allArtists, query, onQueryChange, onAdd, onRemove, onYearChange, onYoutubeUrlChange, onSpotifyUrlChange, onReorder, songTitle,
  onAddNew, pendingItems = [], onRemovePending,
}: {
  items: { id: string; year: number | null; youtube_url: string | null; spotify_url?: string | null }[];
  allArtists: Lookup[];
  query: string;
  onQueryChange: (v: string) => void;
  onAdd: (a: Lookup) => void;
  onRemove: (id: string) => void;
  onYearChange: (id: string, year: number | null) => void;
  onYoutubeUrlChange: (id: string, url: string | null) => void;
  onSpotifyUrlChange: (id: string, url: string | null) => void;
  onReorder: (items: { id: string; year: number | null; youtube_url: string | null; spotify_url?: string | null }[]) => void;
  songTitle: string;
  onAddNew?: (name: string) => void;
  pendingItems?: { name: string; year: number | null }[];
  onRemovePending?: (name: string) => void;
}) {
  const [searchingId, setSearchingId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<YtResult[]>([]);
  const [openResultsId, setOpenResultsId] = useState<string | null>(null);
  const [searchingSpotifyId, setSearchingSpotifyId] = useState<string | null>(null);
  const [spotifyNotFoundIds, setSpotifyNotFoundIds] = useState<Set<string>>(new Set());
  const [pasteSpotifyId, setPasteSpotifyId] = useState<string | null>(null);
  const [pasteSpotifyValue, setPasteSpotifyValue] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((e) => e.id === active.id);
    const newIndex = items.findIndex((e) => e.id === over.id);
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  async function handleYoutubeSearch(id: string, artistName: string) {
    setSearchingId(id);
    setOpenResultsId(null);
    setSearchResults([]);
    try {
      const res = await fetch(`/api/youtube?title=${encodeURIComponent(songTitle)}&artist=${encodeURIComponent(artistName)}`);
      const data = await res.json();
      setSearchResults(data.items ?? []);
      setOpenResultsId(id);
    } finally {
      setSearchingId(null);
    }
  }

  async function handleSpotifySearch(id: string, artistName: string) {
    setSearchingSpotifyId(id);
    setSpotifyNotFoundIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    try {
      const res = await fetch(
        `/api/admin/songs/spotify-search?title=${encodeURIComponent(songTitle)}&artist=${encodeURIComponent(artistName)}`
      );
      const data = await res.json();
      if (data.spotify_url) {
        onSpotifyUrlChange(id, data.spotify_url);
        setPasteSpotifyId(null);
      } else {
        setSpotifyNotFoundIds((prev) => new Set([...prev, id]));
      }
    } finally {
      setSearchingSpotifyId(null);
    }
  }

  const trimmedQuery = query.trim();
  const showSuggestions = trimmedQuery.length > 0;
  const suggestions = allArtists.filter(
    (a) => !items.find((e) => e.id === a.id) && !pendingItems.find((p) => p.name === a.name) && a.name.toLowerCase().includes(trimmedQuery.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-slate-600">Recording artists <span className="font-normal text-slate-400">(drag to reorder)</span></label>
      <div className="space-y-1">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            {items.map((e) => {
              const artist = allArtists.find((a) => a.id === e.id);
              return (
                <SortableArtistRow
                  key={e.id}
                  e={e}
                  artist={artist}
                  isSearchingYt={searchingId === e.id}
                  isSearchingSpotify={searchingSpotifyId === e.id}
                  resultsOpen={openResultsId === e.id}
                  searchResults={openResultsId === e.id ? searchResults : []}
                  pasteSpotifyId={pasteSpotifyId}
                  pasteSpotifyValue={pasteSpotifyValue}
                  spotifyNotFoundIds={spotifyNotFoundIds}
                  songTitle={songTitle}
                  onRemove={onRemove}
                  onYearChange={onYearChange}
                  onSpotifyUrlChange={onSpotifyUrlChange}
                  onYoutubeUrlChange={onYoutubeUrlChange}
                  onYoutubeSearch={handleYoutubeSearch}
                  onSpotifySearch={handleSpotifySearch}
                  onTogglePasteSpotify={(id) => { setPasteSpotifyId(pasteSpotifyId === id ? null : id); setPasteSpotifyValue(""); }}
                  onPasteSpotifyChange={setPasteSpotifyValue}
                  onPasteSpotifySave={(id, url) => {
                    onSpotifyUrlChange(id, url);
                    setSpotifyNotFoundIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
                    setPasteSpotifyId(null);
                    setPasteSpotifyValue("");
                  }}
                  onCloseResults={() => { setOpenResultsId(null); setSearchResults([]); }}
                />
              );
            })}
          </SortableContext>
        </DndContext>
        {pendingItems.map(({ name, year }) => (
          <div key={name} className="flex items-center gap-2 rounded-lg border border-amber-400 bg-white px-3 py-2">
            <span className="text-sm font-medium text-amber-700 flex-1 min-w-0 truncate">{name}</span>
            {year && <span className="text-xs text-amber-500">{year}</span>}
            <span className="text-xs text-amber-400">(new)</span>
            {onRemovePending && (
              <button onClick={() => onRemovePending(name)} className="text-slate-400 hover:text-red-500 shrink-0">×</button>
            )}
          </div>
        ))}
        {!items.length && !pendingItems.length && <span className="text-sm text-slate-400">None added.</span>}
      </div>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search recording artists…"
          className="input w-full"
        />
        {showSuggestions && (
          <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-md">
            {suggestions.slice(0, 6).map((a) => (
              <li key={a.id}>
                <button onMouseDown={() => onAdd(a)} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                  {a.name}
                </button>
              </li>
            ))}
            {onAddNew && !suggestions.some((a) => a.name.toLowerCase() === trimmedQuery.toLowerCase()) && !pendingItems.some((p) => p.name.toLowerCase() === trimmedQuery.toLowerCase()) && (
              <li>
                <button onMouseDown={() => { onAddNew(trimmedQuery); onQueryChange(""); }} className="w-full px-3 py-2 text-left text-sm text-amber-700 hover:bg-amber-50">
                  Create "{trimmedQuery}" <span className="text-xs opacity-60">(new)</span>
                </button>
              </li>
            )}
            {!suggestions.length && !onAddNew && (
              <li className="px-3 py-2 text-sm text-slate-400">No match — add to database first</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

// A production's year belongs to the production, so changing it here changes it
// for every song from that production.
function ProductionYearInputs({ rows, years, onChange }: {
  rows: { key: string; name: string }[];
  years: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <label key={r.key} className="flex items-center gap-2 text-xs text-slate-600">
          <span className="min-w-0 flex-1 truncate">{r.name} — year</span>
          <input
            type="number"
            value={years[r.key] ?? ""}
            onChange={(e) => onChange(r.key, e.target.value)}
            className="input w-24"
            placeholder="e.g. 1939"
          />
        </label>
      ))}
    </div>
  );
}

function PeopleField({
  label, items, query, onQueryChange, suggestions, onAdd, onRemove, onAddNew, pendingItems = [], onRemovePending,
}: {
  label: string;
  items: Lookup[];
  query: string;
  onQueryChange: (v: string) => void;
  suggestions: Lookup[];
  onAdd: (p: Lookup) => void;
  onRemove: (id: string) => void;
  onAddNew?: (name: string) => void;
  pendingItems?: string[];
  onRemovePending?: (name: string) => void;
}) {
  const showSuggestions = query.trim().length > 0;
  const trimmed = query.trim();
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-slate-600">{label}</label>
      <div className="flex flex-wrap gap-2">
        {items.map((p) => (
          <span key={p.id}
            className="flex items-center gap-1.5 rounded-full border border-amber-500 bg-amber-500 px-3 py-1 text-sm text-white">
            {p.name}
            <button onClick={() => onRemove(p.id)} className="opacity-70 hover:opacity-100">×</button>
          </span>
        ))}
        {pendingItems.map((name) => (
          <span key={name}
            className="flex items-center gap-1.5 rounded-full border border-amber-400 bg-white px-3 py-1 text-sm text-amber-600">
            {name}
            <span className="text-xs opacity-60">(new)</span>
            {onRemovePending && (
              <button onClick={() => onRemovePending(name)} className="opacity-70 hover:opacity-100">×</button>
            )}
          </span>
        ))}
        {!items.length && !pendingItems.length && <span className="text-sm text-slate-400">None found.</span>}
      </div>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}…`}
          className="input w-full"
        />
        {showSuggestions && (
          <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-md">
            {suggestions.slice(0, 6).map((p) => (
              <li key={p.id}>
                <button
                  onMouseDown={() => onAdd(p)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  {p.name}
                </button>
              </li>
            ))}
            {onAddNew && !suggestions.some((p) => p.name.toLowerCase() === trimmed.toLowerCase()) && (
              <li>
                <button
                  onMouseDown={() => { onAddNew(trimmed); }}
                  className="w-full px-3 py-2 text-left text-sm text-amber-700 hover:bg-amber-50"
                >
                  Create "{trimmed}" <span className="text-xs opacity-60">(new)</span>
                </button>
              </li>
            )}
            {!suggestions.length && !onAddNew && (
              <li className="px-3 py-2 text-sm text-slate-400">No match — add to database first</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function TagPillsField({
  label, value, onChange, suggestions, allowNew = false, placeholder,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  allowNew?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");

  const trimmed = query.trim();
  const filtered = trimmed.length > 0
    ? suggestions.filter((s) => s.toLowerCase().includes(trimmed.toLowerCase()) && !value.includes(s))
    : [];
  const exactMatch = suggestions.some((s) => s.toLowerCase() === trimmed.toLowerCase());
  const showCreate = allowNew && trimmed.length > 0 && !exactMatch && !value.find((v) => v.toLowerCase() === trimmed.toLowerCase());

  function add(name: string) {
    if (!value.includes(name)) onChange([...value, name]);
    setQuery("");
  }

  const knownSet = new Set(suggestions.map((s) => s.toLowerCase()));

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-slate-600">{label}</label>
      <div className="flex flex-wrap gap-2">
        {[...new Set(value)].map((v) => {
          const isNew = !knownSet.has(v.toLowerCase());
          return (
            <span key={v} className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${isNew ? "border-amber-400 bg-white text-amber-600" : "border-amber-500 bg-amber-500 text-white"}`}>
              {v}
              {isNew && <span className="text-xs opacity-60">(new)</span>}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="opacity-70 hover:opacity-100 leading-none">×</button>
            </span>
          );
        })}
        {!value.length && <span className="text-sm text-slate-400">None added.</span>}
      </div>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder ?? `Search ${label.toLowerCase()}…`}
          className="input w-full"
        />
        {(filtered.length > 0 || showCreate) && (
          <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-md max-h-48 overflow-y-auto">
            {filtered.slice(0, 8).map((s) => (
              <li key={s}>
                <button onMouseDown={() => add(s)} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                  {s}
                </button>
              </li>
            ))}
            {showCreate && (
              <li>
                <button onMouseDown={() => add(toTitleCase(trimmed))} className="w-full px-3 py-2 text-left text-sm text-amber-600 hover:bg-amber-50">
                  Create "{toTitleCase(trimmed)}" and add to database on save
                </button>
              </li>
            )}
          </ul>
        )}
        {trimmed.length > 0 && filtered.length === 0 && !showCreate && (
          <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-md">
            <li className="px-3 py-2 text-sm text-slate-400">No match in database</li>
          </ul>
        )}
      </div>
    </div>
  );
}

function TraditionalCultureField({
  label, value, onChange, allCultures,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allCultures: Lookup[];
}) {
  const [query, setQuery] = useState("");
  const isSet = allCultures.some((c) => c.name.toLowerCase() === value.toLowerCase().trim());
  const trimmed = query.trim();
  const filtered = allCultures.filter(
    (c) => c.name.toLowerCase().includes(trimmed.toLowerCase()) && c.name.toLowerCase() !== value.toLowerCase()
  );
  return (
    <div className="space-y-2 pl-2 border-l-2 border-amber-200">
      <label className="block text-xs font-medium text-slate-500">{label}</label>
      <div className="flex flex-wrap gap-2">
        {isSet ? (
          <span className="flex items-center gap-1 rounded-full border border-amber-500 bg-amber-500 px-3 py-1 text-sm text-white">
            {value}
            <button type="button" onClick={() => { onChange(""); setQuery(""); }} className="opacity-70 hover:opacity-100 leading-none">×</button>
          </span>
        ) : (
          <span className="text-sm text-slate-400">None set.</span>
        )}
      </div>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cultures…"
          className="input w-full"
        />
        {trimmed.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-md">
            {filtered.slice(0, 6).map((c) => (
              <li key={c.id}>
                <button
                  onMouseDown={() => { onChange(c.name); setQuery(""); }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  {c.name}
                </button>
              </li>
            ))}
            {!filtered.length && (
              <li className="px-3 py-2 text-sm text-slate-400">No match in database</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function SuggestionRow({
  label,
  current,
  suggested,
  accepted,
  onChange,
}: {
  label: string;
  current: string;
  suggested: string;
  accepted: boolean;
  onChange: (v: boolean) => void;
}) {
  const unchanged = current === suggested;
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-violet-100 bg-white px-3 py-2.5">
      <input
        type="checkbox"
        checked={accepted}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
      />
      <div className="min-w-0 flex-1 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        {unchanged ? (
          <span className="ml-2 text-slate-400 text-xs">(no change)</span>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className="text-slate-400 line-through">{current}</span>
            <span className="text-slate-400">→</span>
            <span className="font-medium text-violet-700">{suggested}</span>
          </div>
        )}
      </div>
    </label>
  );
}


