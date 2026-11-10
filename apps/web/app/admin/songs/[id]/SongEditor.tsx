"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CatalogLinkField from "@/components/catalog/CatalogLinkField";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { songSavePayload } from "@/lib/songSavePayload";
import { MAX_RECORDINGS, samePeople, songCardCredits, songTagNames, songTraditionTag, type CardCredit, type EnrichmentReview, type SongTagRow, type SourceRef } from "@singjam/core";
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

const creditText = (list: CardCredit[]) => list.map((c) => `${c.lead ?? ""}${c.text}${c.suffix ?? ""}`).join(", ");

// How the song's card will read (songCardCredits, as every song card): the
// title with its writers in brackets, and the line under it.
function CardPreview({ credits, title }: { credits: { writers: CardCredit[]; line: CardCredit[] }; title: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="font-medium text-zinc-900">
        {title || "Untitled"}
        {credits.writers.length > 0 && <span className="ml-1 font-normal text-zinc-400">({creditText(credits.writers)})</span>}
      </div>
      {credits.line.length > 0 && <div className="text-sm text-zinc-500">{creditText(credits.line)}</div>}
    </div>
  );
}
type ProductionLookup = Lookup & { year: number | null };

function productionLabel(p: ProductionLookup) {
  return p.year ? `${p.name} (${p.year})` : p.name;
}

type AltTitle = { id: string; title: string };

function toTitleCase(s: string) {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
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
  known_by_recording?: boolean | null;
  text_id?: string | null;
  tune_id?: string | null;
  byline?: string | null;
  song_tags: SongTagRow[];
  song_composers: { person_id: string }[];
  song_lyricists: { person_id: string }[];
  song_recording_artists: { artist_id: string; year: number | null; position: number | null; youtube_url: string | null; spotify_url: string | null }[];
  song_alternate_titles: AltTitle[];
  song_productions: { production_id: string }[];
  enrichment_proposal?: Proposal | null;
};

type Proposal = {
  requested_at: string;
  finished_at?: string;
  error?: boolean;
  suggestions?: EnrichmentReview["suggestions"];
  agreed?: string[];
  fromWikipedia?: string[];
  wikipedia?: { title: string; url: string } | null;
  checks?: { name: string; ok: boolean }[];
};

type Props = {
  song: Song | null;
  allGenres: Lookup[];
  allThemes: Lookup[];
  allCultures: Lookup[];
  allLanguages: Lookup[];
  allForms: Lookup[];
  allOccasions: Lookup[];
  allCommunities: Lookup[];
  allTexts: { id: string; title: string; slug: string }[];
  allTunes: { id: string; slug: string; tune_label: string }[];
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
  allGenres,
  allThemes,
  allCultures,
  allLanguages,
  allForms,
  allOccasions,
  allCommunities,
  allTexts: initialTexts,
  allTunes: initialTunes,
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
  const [knownByRecording, setKnownByRecording] = useState<boolean | null>(song?.known_by_recording ?? null);
  // Which text this song sings, to which tune (migration 208).
  const [textId, setTextId] = useState<string>(song?.text_id ?? "");
  const [tuneId, setTuneId] = useState<string>(song?.tune_id ?? "");
  const [allTexts, setAllTexts] = useState(initialTexts);
  const [allTunes, setAllTunes] = useState(initialTunes);
  // The text's first quoted source, which a card without a named tune shows.
  const [textSource, setTextSource] = useState<SourceRef | null>(null);
  useEffect(() => {
    if (!textId) { setTextSource(null); return; }
    let live = true;
    supabase.from("text_sources").select("corpus, book, chapter_start, verse_start, chapter_end, verse_end, citation, relation")
      .eq("text_id", textId).neq("relation", "inspired").order("id")
      .then(({ data }) => { if (live) setTextSource(((data ?? []) as SourceRef[])[0] ?? null); });
    return () => { live = false; };
  }, [textId, supabase]);

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
  const [genres, setGenres] = useState<string[]>(() => songTagNames(song?.song_tags, "genre", "general"));
  const [themes, setThemes] = useState<string[]>(() => songTagNames(song?.song_tags, "theme", "general"));
  const [cultures, setCultures] = useState<string[]>(() => songTagNames(song?.song_tags, "culture", "general"));
  const [languages, setLanguages] = useState<string[]>(() => songTagNames(song?.song_tags, "language", "general"));
  const [forms, setForms] = useState<string[]>(() => songTagNames(song?.song_tags, "form", "general"));
  const [occasions, setOccasions] = useState<string[]>(() => songTagNames(song?.song_tags, "occasion", "general"));
  const [communities, setCommunities] = useState<string[]>(() => songTagNames(song?.song_tags, "community", "general"));

  // Alternate titles
  const [altTitles, setAltTitles] = useState<AltTitle[]>(song?.song_alternate_titles ?? []);
  const [newAltTitle, setNewAltTitle] = useState("");

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suggestions from the multi-source enrichment, reviewed before applying
  type AISuggestions = EnrichmentReview["suggestions"];
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestions | null>(null);
  const [agreedFields, setAgreedFields] = useState<Set<string>>(new Set());
  const [reviewInfo, setReviewInfo] = useState<{
    fromWikipedia: Set<string>;
    wikipedia: { title: string; url: string } | null;
    checks: { name: string; ok: boolean }[];
  }>({ fromWikipedia: new Set(), wikipedia: null, checks: [] });
  const [suggesting, setSuggesting] = useState(false);
  const [showLessCertain, setShowLessCertain] = useState(false);
  const [acceptedFields, setAcceptedFields] = useState<Set<string>>(new Set());

  const [newComposerName, setNewComposerName] = useState("");
  const [newLyricistName, setNewLyricistName] = useState("");
  const [newRecordingArtistName, setNewRecordingArtistName] = useState("");
  const [pendingRecordingArtists, setPendingRecordingArtists] = useState<{ name: string; year: number | null; spotify_url: string | null }[]>([]);
  const [pendingComposerNames, setPendingComposerNames] = useState<string[]>([]);
  const [pendingLyricistNames, setPendingLyricistNames] = useState<string[]>([]);
  const [composerTraditionalCulture, setComposerTraditionalCulture] = useState(() => songTraditionTag(song?.song_tags, "music")?.name ?? "");
  const [lyricistTraditionalCulture, setLyricistTraditionalCulture] = useState(() => songTraditionTag(song?.song_tags, "lyrics")?.name ?? "");
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

  const formSnapshot = JSON.stringify([
    title, displayArtist, firstLine, hook, notes, geniusUrl, chordChartUrl, year, yearWritten, tonalities, meters, vibe,
    [...composers], [...lyricists], pendingComposerNames, pendingLyricistNames, recordingArtists, pendingRecordingArtists,
    isFromProduction, [...productions], pendingProductionNames, productionYears, genres, themes, cultures, languages,
    forms, occasions, communities, composerTraditionalCulture, lyricistTraditionalCulture, knownByRecording, textId, tuneId,
  ]);
  const [savedSnapshot, setSavedSnapshot] = useState(formSnapshot);

  function confirmLeave(e: React.MouseEvent) {
    if (formSnapshot !== savedSnapshot && !confirm("You have unsaved changes. Leave without saving?")) e.preventDefault();
  }

  function showProposal(proposal: Proposal) {
    if (!proposal.suggestions) return;
    const agreed = new Set(proposal.agreed ?? []);
    // Genres, themes and vibe are matters of taste: two AIs agreeing is no reason
    // to pre-tick replacing what someone already chose.
    const taste = new Set(["genres", "themes", "vibe"]);
    const preTicked = suggestionRows(proposal.suggestions)
      .filter((r) => agreed.has(r.key) && !(taste.has(r.key) && r.current))
      .map((r) => r.key);
    setAiSuggestions(proposal.suggestions);
    setAgreedFields(agreed);
    setAcceptedFields(new Set(preTicked));
    setReviewInfo({ fromWikipedia: new Set(proposal.fromWikipedia ?? []), wikipedia: proposal.wikipedia ?? null, checks: proposal.checks ?? [] });
    setShowLessCertain(false);
  }

  async function waitForReview(requestedAt: string) {
    setSuggesting(true);
    try {
      const deadline = new Date(requestedAt).getTime() + 4 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4000));
        const poll = await fetch(`/api/songs/${song!.id}/enrich`);
        if (!poll.ok) continue;
        const { proposal } = await poll.json();
        if (proposal?.requested_at !== requestedAt) throw new Error("superseded");
        if (!proposal.finished_at) continue;
        if (proposal.error) throw new Error("failed");
        showProposal(proposal);
        return;
      }
      throw new Error("timed out");
    } catch {
      setError("Couldn't gather suggestions. Try again in a minute.");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSuggest() {
    if (!song?.id) return;
    setError(null);
    setAiSuggestions(null);
    const res = await fetch(`/api/songs/${song.id}/enrich`, { method: "POST" });
    if (!res.ok) {
      setError("Couldn't start gathering suggestions. Try again in a minute.");
      return;
    }
    const { requestedAt } = await res.json();
    await waitForReview(requestedAt);
  }

  function closeReview() {
    setAiSuggestions(null);
    if (song?.id) void fetch(`/api/songs/${song.id}/enrich`, { method: "DELETE" });
  }

  // Coming back to the editor picks up a review that is still running or
  // finished in the last half hour.
  useEffect(() => {
    const p = song?.enrichment_proposal;
    if (!p?.requested_at) return;
    const age = Date.now() - new Date(p.requested_at).getTime();
    if (p.finished_at && !p.error && age < 30 * 60_000) showProposal(p);
    else if (!p.finished_at && age < 4 * 60_000) void waitForReview(p.requested_at);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only fields where a suggestion differs from what's in the form are shown
  // (and applied), so a review lists real changes.
  function suggestionRows(s: AISuggestions) {
    const names = (ids: Iterable<string>, list: Lookup[]) => [...ids].map((id) => list.find((p) => p.id === id)?.name).filter((n): n is string => !!n);
    const key = (v: string) => v.toLowerCase().split(/,\s*/).map((x) => x.trim()).sort().join("|");
    const productionNames = names(productions, allProductions).concat(pendingProductionNames);
    const recordingNames = names(recordingArtists.map((e) => e.id), allArtists);
    const newOnly = (list: string[], have: string[]) => list.filter((x) => !have.some((h) => h.toLowerCase() === x.toLowerCase()));
    const rows: { key: string; label: string; current: string; suggested: string }[] = [
      { key: "year_written", label: "Year written", current: yearWritten, suggested: s.year_written?.toString() ?? "" },
      { key: "first_line", label: "First line", current: firstLine, suggested: s.first_line ?? "" },
      { key: "hook", label: "Hook", current: hook, suggested: s.hook ?? "" },
      { key: "composers", label: "Composers", current: names(composers, allPeople).concat(pendingComposerNames).join(", "), suggested: s.composers.join(", ") },
      { key: "lyricists", label: "Lyricists", current: names(lyricists, allPeople).concat(pendingLyricistNames).join(", "), suggested: s.lyricists.join(", ") },
      { key: "primary_recording_year", label: "Primary recording year", current: recordingArtists[0]?.year?.toString() ?? "", suggested: recordingArtists.length ? s.primary_recording_year?.toString() ?? "" : "" },
      { key: "tonality", label: "Tonality", current: tonalities.join(", "), suggested: s.tonality ?? "" },
      { key: "meter", label: "Meter", current: meters.join(", "), suggested: s.meter ?? "" },
      { key: "vibe", label: "Vibe", current: vibe ?? "", suggested: s.vibe ?? "" },
      { key: "genres", label: "Genres", current: genres.join(", "), suggested: s.genres.join(", ") },
      { key: "themes", label: "Themes", current: themes.join(", "), suggested: s.themes.join(", ") },
      { key: "cultures", label: "Cultures", current: cultures.join(", "), suggested: s.cultures.join(", ") },
      { key: "forms", label: "Forms", current: forms.join(", "), suggested: (s.forms ?? []).join(", ") },
      { key: "occasions", label: "Occasions", current: occasions.join(", "), suggested: (s.occasions ?? []).join(", ") },
      { key: "communities", label: "Communities", current: communities.join(", "), suggested: (s.communities ?? []).join(", ") },
      { key: "music_culture", label: "Music culture", current: composerTraditionalCulture, suggested: s.music_culture ?? "" },
      { key: "lyric_culture", label: "Lyric culture", current: lyricistTraditionalCulture, suggested: s.lyric_culture ?? "" },
      { key: "languages", label: "Languages", current: languages.join(", "), suggested: s.languages.join(", ") },
      { key: "additional_recordings", label: "Add recordings", current: "", suggested: s.additional_recordings.filter((r) => newOnly([r.artist], recordingNames).length).map((r) => (r.year ? `${r.artist} (${r.year})` : r.artist)).join(", ") },
      { key: "notes", label: "Notes", current: notes, suggested: s.notes ?? "" },
      { key: "productions", label: "Add productions", current: "", suggested: newOnly(s.productions, productionNames).join(", ") },
      { key: "genius_url", label: "Genius lyrics link", current: geniusUrl, suggested: s.genius_url ?? "" },
      { key: "alternate_titles", label: "Add alternate titles", current: "", suggested: newOnly(s.alternate_titles, altTitles.map((t) => t.title)).join(", ") },
    ];
    const split = (v: string) => v.split(/,\s*/).filter(Boolean);
    const people = new Set(["composers", "lyricists"]);
    return rows.filter(
      (r) => r.suggested && key(r.suggested) !== key(r.current) && !(people.has(r.key) && samePeople(split(r.suggested), split(r.current)))
    );
  }

  async function applyAISuggestions() {
    if (!aiSuggestions) return;
    const visible = new Set(suggestionRows(aiSuggestions).map((r) => r.key));
    const accept = (field: string) => acceptedFields.has(field) && visible.has(field);
    if (accept("year_written") && aiSuggestions.year_written != null) {
      setYearWritten(aiSuggestions.year_written.toString());
    }
    if (accept("first_line") && aiSuggestions.first_line) {
      setFirstLine(aiSuggestions.first_line);
    }
    if (accept("hook") && aiSuggestions.hook) {
      setHook(aiSuggestions.hook);
    }
    if (accept("composers") && aiSuggestions.composers.length) {
      const { existingIds, pendingNames } = splitNames(aiSuggestions.composers);
      setComposers(new Set(existingIds));
      setPendingComposerNames(pendingNames);
    }
    if (accept("lyricists") && aiSuggestions.lyricists.length) {
      const { existingIds, pendingNames } = splitNames(aiSuggestions.lyricists);
      setLyricists(new Set(existingIds));
      setPendingLyricistNames(pendingNames);
    }
    if (accept("primary_recording_year") && aiSuggestions.primary_recording_year != null) {
      const yr = aiSuggestions.primary_recording_year;
      setRecordingArtists((prev) => prev.map((e, i) => i === 0 ? { ...e, year: yr } : e));
    }
    if (accept("tonality") && aiSuggestions.tonality) {
      setTonalities([aiSuggestions.tonality]);
    }
    if (accept("meter") && aiSuggestions.meter) {
      setMeters([aiSuggestions.meter]);
    }
    if (accept("vibe") && aiSuggestions.vibe) {
      setVibe(aiSuggestions.vibe);
    }
    if (accept("genres") && aiSuggestions.genres.length) {
      setGenres(aiSuggestions.genres.slice(0, 3));
    }
    if (accept("themes") && aiSuggestions.themes.length) {
      setThemes(aiSuggestions.themes.slice(0, 3));
    }
    if (accept("cultures") && aiSuggestions.cultures.length) {
      setCultures(aiSuggestions.cultures);
    }
    if (accept("forms") && aiSuggestions.forms?.length) {
      setForms(aiSuggestions.forms);
    }
    if (accept("occasions") && aiSuggestions.occasions?.length) {
      setOccasions(aiSuggestions.occasions);
    }
    if (accept("communities") && aiSuggestions.communities?.length) {
      setCommunities(aiSuggestions.communities);
    }
    if (accept("music_culture") && aiSuggestions.music_culture) {
      setComposerTraditionalCulture(aiSuggestions.music_culture);
    }
    if (accept("lyric_culture") && aiSuggestions.lyric_culture) {
      setLyricistTraditionalCulture(aiSuggestions.lyric_culture);
    }
    if (accept("languages") && aiSuggestions.languages.length) {
      setLanguages(aiSuggestions.languages);
    }
    if (accept("genius_url") && aiSuggestions.genius_url) {
      setGeniusUrl(aiSuggestions.genius_url);
    }
    if (accept("notes") && aiSuggestions.notes) {
      setNotes(aiSuggestions.notes);
    }
    if (accept("productions") && aiSuggestions.productions.length) {
      const { existingIds, pendingNames } = splitExistingAndPending(aiSuggestions.productions, allProductions);
      setProductions((prev) => new Set([...prev, ...existingIds]));
      setPendingProductionNames((prev) => [...prev, ...pendingNames.filter((n) => !prev.includes(n))]);
    }
    if (accept("additional_recordings") && aiSuggestions.additional_recordings.length) {
      const toAdd: { id: string; year: number | null }[] = [];
      const openSlots = MAX_RECORDINGS - recordingArtists.length - pendingRecordingArtists.length;
      for (const rec of aiSuggestions.additional_recordings.slice(0, Math.max(0, openSlots))) {
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
    if (accept("alternate_titles") && aiSuggestions.alternate_titles.length && song?.id) {
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
    closeReview();
    setAcceptedFields(new Set());
  }

  async function handleSave() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // One call, one transaction (migration 200): either all of this is saved
      // or none of it, and the database returns the slug it settles on.
      const { data: newSlug, error: saveError } = await supabase.rpc("save_song", {
        p_song_id: song!.id,
        p: songSavePayload(
          {
            title, displayArtist, firstLine, hook, notes, geniusUrl, chordChartUrl, year, yearWritten, tonalities, meters, vibe, knownByRecording, textId, tuneId,
            genres, themes, languages, cultures, forms, occasions, communities, composers, lyricists, pendingComposerNames, pendingLyricistNames,
            composerTraditionalCulture, lyricistTraditionalCulture, recordingArtists, pendingRecordingArtists,
            productions, pendingProductionNames, productionYears,
            hadRecordingArtists: (song?.song_recording_artists.length ?? 0) > 0,
          },
          { people: allPeople, artists: allArtists },
        ),
      });
      if (saveError) throw saveError;

      setSlug(newSlug ?? slug);
      setSavedSnapshot(formSnapshot);
      router.push(`${basePath}/${newSlug ?? slug}`);
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

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-slate-900">
          {title || "Edit song"}
        </h1>
        <div className="flex flex-wrap gap-2">
          {song?.slug && (
            <Link
              href={`/songs/${song.slug}`}
              onClick={confirmLeave}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              View
            </Link>
          )}
          <button
            onClick={handleSuggest}
            disabled={suggesting || !song?.id}
            title="Asks two AIs, MusicBrainz, LRCLIB, Wikipedia and Genius about every field, then lets you pick what to apply."
            className="rounded-full border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-40"
          >
            {suggesting ? "Gathering suggestions…" : "✦ Suggest improvements"}
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

      {suggesting && (
        <div role="status" className="rounded-xl border border-violet-200 bg-violet-50 px-5 py-4 text-sm text-violet-800">
          Checking GPT, Claude, MusicBrainz, LRCLIB, Wikipedia and Genius — usually about 20 seconds. You can keep editing meanwhile.
        </div>
      )}

      {aiSuggestions && (() => {
        const rows = suggestionRows(aiSuggestions);
        const sourceOf = (key: string) =>
          agreedFields.has(key) ? null : reviewInfo.fromWikipedia.has(key) && reviewInfo.wikipedia ? reviewInfo.wikipedia : ("unconfirmed" as const);
        const rank = (r: (typeof rows)[number]) => (agreedFields.has(r.key) ? 0 : reviewInfo.fromWikipedia.has(r.key) ? 1 : 2);
        // An unconfirmed answer that would overwrite something already filled in
        // is the least useful suggestion, so those wait behind a toggle.
        const lessCertain = (r: (typeof rows)[number]) => sourceOf(r.key) === "unconfirmed" && !!r.current;
        const main = rows.filter((r) => !lessCertain(r)).sort((x, y) => rank(x) - rank(y));
        const extra = rows.filter(lessCertain);
        const acceptedCount = rows.filter((r) => acceptedFields.has(r.key)).length;
        const toggleField = (field: string) => (on: boolean) =>
          setAcceptedFields((prev) => { const s = new Set(prev); on ? s.add(field) : s.delete(field); return s; });
        const renderRow = (r: (typeof rows)[number]) => (
          <SuggestionRow
            key={r.key}
            label={r.label}
            current={r.current}
            suggested={r.suggested}
            source={sourceOf(r.key)}
            accepted={acceptedFields.has(r.key)}
            onChange={toggleField(r.key)}
          />
        );
        return (
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-violet-900">Suggested improvements</h2>
                <p className="mt-0.5 text-xs text-violet-700">Unlabelled items were confirmed by two sources. Genres, themes and vibe you&apos;ve already set are never pre-ticked.</p>
              </div>
              <button onClick={closeReview} aria-label="Close suggestions" className="text-violet-400 hover:text-violet-600 text-lg leading-none">×</button>
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-violet-800">No changes to suggest — the sources match what&apos;s already here.</p>
            ) : (
              <>
                {main.length > 0 ? (
                  <div className="space-y-2">{main.map(renderRow)}</div>
                ) : (
                  <p className="text-sm text-violet-800">Nothing confirmed to change.</p>
                )}
                {extra.length > 0 && (
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowLessCertain((v) => !v)}
                      aria-expanded={showLessCertain}
                      className="text-xs font-medium text-violet-700 hover:text-violet-900"
                    >
                      {showLessCertain ? "Hide" : "Show"} {extra.length} less certain change{extra.length !== 1 ? "s" : ""} to filled-in fields
                    </button>
                    {showLessCertain && extra.map(renderRow)}
                  </div>
                )}
                <button
                  onClick={applyAISuggestions}
                  disabled={acceptedCount === 0}
                  className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
                >
                  Apply {acceptedCount} suggestion{acceptedCount !== 1 ? "s" : ""}
                </button>
              </>
            )}
            {reviewInfo.checks.length > 0 && (
              <p className="text-xs text-violet-700">
                Checked: {reviewInfo.checks.map((c) => `${c.name} ${c.ok ? "✓" : "—"}`).join(" · ")}
              </p>
            )}
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
          <Field label="Address">
            <p className="py-2 font-mono text-xs text-slate-500 break-all">/songs/{slug || "…"}</p>
            <p className="text-xs text-slate-400">Set automatically from the title, first three writers and music culture. Old addresses keep working.</p>
          </Field>
          <Field label="Line under the title">
            <select
              value={knownByRecording === null ? "auto" : knownByRecording ? "recording" : "writers"}
              onChange={(e) => setKnownByRecording(e.target.value === "auto" ? null : e.target.value === "recording")}
              className="input"
            >
              <option value="auto">Automatic</option>
              <option value="recording">Recording artists (known by its recording)</option>
              <option value="writers">Writers or tradition</option>
            </select>
            <p className="text-xs text-slate-400">
              Automatic shows the writers, or &ldquo;Traditional · culture&rdquo;, for traditional songs and hymns, nigunim and other traditional forms, and the recording artists for everything else.
              {song?.byline ? <> Now: <span className="text-slate-600">{song.byline}</span></> : null}
            </p>
          </Field>
          <div className="sm:col-span-2 space-y-1">
            <p className="text-sm font-medium text-slate-700">Card preview</p>
            <CardPreview
              title={title}
              credits={songCardCredits({
                title,
                // The override decides at once; Automatic follows the saved song's line until you save.
                byline: knownByRecording === true ? undefined : knownByRecording === false ? "\u0000writers" : song?.byline,
                displayArtist: knownByRecording === false ? null : displayArtist || null,
                composers: [...composers].map((id) => allPeople.find((p) => p.id === id)?.name).filter((n): n is string => !!n),
                cultures,
                recordingArtists: recordingArtists.map((r, i) => ({ name: allArtists.find((a) => a.id === r.id)?.name ?? "", year: r.year, position: i })).filter((r) => r.name),
                identity: {
                  tune: allTunes.find((t) => t.id === tuneId)?.tune_label ?? null,
                  source: textSource,
                  first_line: firstLine || null,
                },
              })}
            />
          </div>
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
        </div>
        <TagPillsField label="Genres" value={genres} onChange={setGenres} suggestions={allGenres.map((g) => g.name)} allowNew placeholder="Search genres…" />
        <TagPillsField label="Themes" value={themes} onChange={setThemes} suggestions={allThemes.map((t) => t.name)} allowNew placeholder="Search themes…" />
        <TagPillsField label="Languages" value={languages} onChange={setLanguages} suggestions={allLanguages.map((l) => l.name)} placeholder="Search languages…" />
        <TagPillsField label="Cultures" value={cultures} onChange={setCultures} suggestions={allCultures.map((c) => c.name)} allowNew placeholder="Search cultures…" />
        <TagPillsField label="Forms" value={forms} onChange={setForms} suggestions={allForms.map((f) => f.name)} allowNew placeholder="Search forms…" />
        <TagPillsField label="Occasions" value={occasions} onChange={setOccasions} suggestions={allOccasions.map((o) => o.name)} allowNew placeholder="Search occasions…" />
        <TagPillsField label="Communities" value={communities} onChange={setCommunities} suggestions={allCommunities.map((c) => c.name)} allowNew placeholder="Search communities…" />
      </section>
      {/* Text & tune */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Text &amp; tune</h2>
        <p className="text-xs text-slate-500">For songs whose words are sung to more than one melody (hymns, psalms, liturgy) or a melody that carries several texts. Most songs need neither.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <CatalogLinkField
            kind="text"
            songTitle={title}
            options={allTexts.map((t) => ({ id: t.id, name: t.title, slug: t.slug }))}
            value={textId}
            savedValue={song?.text_id ?? ""}
            onChange={setTextId}
            onCreated={(t) => { setAllTexts((prev) => [...prev, { id: t.id, title: t.name, slug: t.slug }]); setTextId(t.id); }}
            people={allPeople}
            communities={allCommunities}
          />
          <CatalogLinkField
            kind="tune"
            songTitle={title}
            options={allTunes.map((t) => ({ id: t.id, name: t.tune_label, slug: t.slug }))}
            value={tuneId}
            savedValue={song?.tune_id ?? ""}
            onChange={setTuneId}
            onCreated={(t) => { setAllTunes((prev) => [...prev, { id: t.id, tune_label: t.name, slug: t.slug }]); setTuneId(t.id); }}
            people={allPeople}
            communities={allCommunities}
          />
        </div>
      </section>

      {/* Alternate titles */}
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

      {/* Additional notes */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Additional notes</h2>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
          className="input min-h-[80px] resize-y" placeholder="Any extra context, performance notes, etc." />
      </section>

      <div className="border-t border-slate-200 pt-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {song?.slug && (
            <Link
              href={`/songs/${song.slug}`}
              onClick={confirmLeave}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              View
            </Link>
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
  const atCap = items.length + pendingItems.length >= MAX_RECORDINGS;
  const suggestions = allArtists.filter(
    (a) => !items.find((e) => e.id === a.id) && !pendingItems.find((p) => p.name === a.name) && a.name.toLowerCase().includes(trimmedQuery.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-slate-600">Recording artists <span className="font-normal text-slate-400">(up to {MAX_RECORDINGS}, drag to reorder)</span></label>
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
      {atCap ? (
        <p className="text-xs text-slate-400">That's the most a song can list — remove one to add another.</p>
      ) : (
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
      )}
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
          <span className="min-w-0 flex-1 truncate">Year for {r.name}</span>
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
  source,
  accepted,
  onChange,
}: {
  label: string;
  current: string;
  suggested: string;
  source: null | "unconfirmed" | { title: string; url: string };
  accepted: boolean;
  onChange: (v: boolean) => void;
}) {
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
        {source === "unconfirmed" && (
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">unconfirmed</span>
        )}
        {source && source !== "unconfirmed" && (
          <a href={source.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 hover:bg-sky-200">
            from Wikipedia
          </a>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {current && (
            <>
              <span className="text-slate-400 line-through">{current}</span>
              <span className="text-slate-400">→</span>
            </>
          )}
          <span className="font-medium text-violet-700">{suggested}</span>
        </div>
      </div>
    </label>
  );
}


