import type { CardLine } from "@singjam/core";
type Named = { id: string; name: string };
type Recording = { id: string; year: number | null; youtube_url: string | null; spotify_url?: string | null };
type PendingRecording = { name: string; year: number | null; spotify_url: string | null };

export type SongForm = {
  title: string;
  displayArtist: string;
  firstLine: string;
  hook: string;
  notes: string;
  geniusUrl: string;
  chordChartUrl: string;
  year: string;
  yearWritten: string;
  tonalities: string[];
  meters: string[];
  vibe: "Banger" | "Ballad" | null;
  knownByRecording: boolean | null;
  cardLine?: CardLine | null;
  textId?: string;
  tuneId?: string;
  genres: string[];
  themes: string[];
  languages: string[];
  cultures: string[];
  forms: string[];
  occasions: string[];
  communities: string[];
  composers: Iterable<string>;
  lyricists: Iterable<string>;
  pendingComposerNames: string[];
  pendingLyricistNames: string[];
  composerTraditionalCulture: string;
  lyricistTraditionalCulture: string;
  recordingArtists: Recording[];
  pendingRecordingArtists: PendingRecording[];
  productions: Iterable<string>;
  pendingProductionNames: string[];
  productionYears: Record<string, string>;
  hadRecordingArtists: boolean;
};

function parseYear(v: string | undefined): number | null {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : null;
}

const personName = (n: string) => (/^\[traditional\]$/i.test(n.trim()) ? "Traditional" : n.trim());

// The argument save_song (migrations 200 and 202) takes: the whole editor form in one
// object, saved in one transaction.
export function songSavePayload(form: SongForm, lookups: { people: Named[]; artists: Named[] }) {
  const composerIds = [...form.composers];
  const lyricistIds = [...form.lyricists];
  const traditionalId = lookups.people.find((p) => p.name === "Traditional")?.id;
  const isTraditional = (ids: string[], names: string[]) =>
    (!!traditionalId && ids.includes(traditionalId)) || names.some((n) => personName(n) === "Traditional");
  const artistName = (id: string) => lookups.artists.find((a) => a.id === id)?.name;
  const recordingNames = form.recordingArtists.map((e) => artistName(e.id)).filter((n): n is string => !!n);
  const pending = form.pendingRecordingArtists.filter(
    (ra, i, all) =>
      !recordingNames.some((n) => n.toLowerCase() === ra.name.trim().toLowerCase()) &&
      all.findIndex((x) => x.name.trim().toLowerCase() === ra.name.trim().toLowerCase()) === i
  );

  return {
    fields: {
      title: form.title.trim(),
      display_artist: recordingNames.join(", ") || (form.hadRecordingArtists ? null : form.displayArtist.trim() || null),
      first_line: form.firstLine,
      hook: form.hook,
      notes: form.notes,
      genius_url: form.geniusUrl,
      chord_chart_url: form.chordChartUrl,
      year: parseYear(form.year),
      year_written: parseYear(form.yearWritten),
      tonality: form.tonalities.join(", "),
      meter: form.meters.join(", "),
      vibe: form.vibe,
      known_by_recording: form.knownByRecording,
      ...(form.cardLine !== undefined ? { card_line: form.cardLine } : {}),
      ...(form.textId !== undefined ? { text_id: form.textId || null } : {}),
      ...(form.tuneId !== undefined ? { tune_id: form.tuneId || null } : {}),
    },
    tags: {
      genre: form.genres,
      theme: form.themes,
      language: form.languages,
      culture: form.cultures,
      form: form.forms,
      occasion: form.occasions,
      community: form.communities,
    },
    composer_ids: composerIds,
    composer_names: form.pendingComposerNames.map(personName),
    lyricist_ids: lyricistIds,
    lyricist_names: form.pendingLyricistNames.map(personName),
    // Where a traditional melody or text comes from only applies when the
    // composer or lyricist is "Traditional".
    music_tag: isTraditional(composerIds, form.pendingComposerNames) && form.composerTraditionalCulture
      ? { type: "culture", name: form.composerTraditionalCulture } : null,
    lyric_tag: isTraditional(lyricistIds, form.pendingLyricistNames) && form.lyricistTraditionalCulture
      ? { type: "culture", name: form.lyricistTraditionalCulture } : null,
    recordings: [
      // A recording without a spotify_url key keeps the stored link.
      ...form.recordingArtists.map((e) => ({
        artist_id: e.id,
        year: e.year,
        youtube_url: e.youtube_url ?? null,
        ...("spotify_url" in e ? { spotify_url: e.spotify_url ?? null } : {}),
      })),
      ...pending.map((ra) => ({ name: ra.name.trim(), year: ra.year, youtube_url: null, spotify_url: ra.spotify_url ?? null })),
    ],
    productions: [
      ...[...form.productions].map((id) => ({ id, year: parseYear(form.productionYears[id]) })),
      ...form.pendingProductionNames.map((name) => ({ id: null, name, year: parseYear(form.productionYears[`new:${name}`]) })),
    ],
  };
}
