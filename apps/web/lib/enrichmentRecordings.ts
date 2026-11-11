import type { SupabaseClient } from "@supabase/supabase-js";
import {
  agreedLandmarks,
  firstRecordingCandidates,
  firstRecordingYear,
  landmarkYear,
  leadArtist,
  MAX_RECORDINGS,
  sameArtist,
  type LandmarkCandidate,
  type RecordingCandidate,
} from "@singjam/core";
import { findOnSpotify } from "@/lib/songLookup";
import { askClaudeJson, askGptJson, type ModelUsage } from "@/lib/enrichmentModels";
import { musicbrainz, norm } from "@/lib/enrichmentSources";
import { idsFor } from "@/lib/enrichmentDb";

// ---- Other recordings worth listing (landmarkRecordings in core decides) ----

const LANDMARK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recordings"],
  properties: {
    recordings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["artist", "year", "why"],
        properties: { artist: { type: "string" }, year: { type: "integer" }, why: { type: "string", enum: ["original", "iconic"] } },
      },
    },
  },
};

function landmarkPrompt(title: string, artists: string[]) {
  const system = "You are a careful music researcher. Accuracy matters more than coverage: a wrong recording is far worse than a missing one.";
  const user = `Song: "${title}". The database already has recordings by: ${artists.join(", ")}.
List OTHER recordings only if they are iconic: a version many people would name as THE version of this song, or a No. 1 hit or million-selling signature recording in its own era that is still remembered as such. The original recording counts only when it passes the same test.
Never list: artists already in the database (under any name they have recorded as), chart hits that are no longer remembered, talent-show or charity singles, novelty or parody covers, live recordings, or covers that are acclaimed but not widely known.
Most songs have exactly one iconic recording, so an empty list is the expected answer for most songs. At most 3. Use the artist's credited name and the year that recording was first released.
Return JSON: {"recordings": [{"artist", "year", "why"}]} where why is "original" or "iconic".`;
  return { system, user };
}

const askGptLandmarks = (title: string, artists: string[], usage: ModelUsage[]) =>
  askGptJson<LandmarkCandidate[]>(landmarkPrompt(title, artists), "recordings", "landmarks", usage);
const askClaudeLandmarks = (title: string, artists: string[], usage: ModelUsage[]) =>
  askClaudeJson<LandmarkCandidate[]>(landmarkPrompt(title, artists), LANDMARK_SCHEMA, "recordings", 4000, "landmarks", usage);

// Does MusicBrainz have this artist's studio recording of the song? Returns the
// credit naming the same act (else the name the models used) and the earliest
// dated album/single/EP year.
async function musicBrainzRecording(title: string, artist: string) {
  const lead = leadArtist(artist);
  const q = `recording:"${title.replace(/"/g, "")}" AND artist:"${lead.replace(/"/g, "")}"`;
  const json = await musicbrainz(`recording?fmt=json&limit=100&query=${encodeURIComponent(q)}`);
  let found = false;
  let credit: string | null = null;
  const years: number[] = [];
  for (const r of (json?.recordings ?? []) as any[]) {
    const name = (r["artist-credit"] ?? []).map((c: any) => c.name + (c.joinphrase ?? "")).join("");
    if (norm(r.title) !== norm(title) || !norm(name).includes(norm(lead))) continue;
    if (/\b(live|demo|remix|instrumental|karaoke)\b/i.test(`${r.disambiguation ?? ""} ${r.title}`)) continue;
    found = true;
    if (!credit && sameArtist(name, artist)) credit = name;
    for (const rel of r.releases ?? []) {
      const rg = rel["release-group"] ?? {};
      const y = parseInt((rel.date ?? "").slice(0, 4));
      if (["Album", "Single", "EP"].includes(rg["primary-type"]) && !(rg["secondary-types"] ?? []).length && y >= 1890) years.push(y);
    }
  }
  return found ? { credit: credit ?? artist, year: years.length ? Math.min(...years) : null } : null;
}

export type LandmarkResult = { artist: string; year: number | null };

// Adds the iconic other recordings of a song: both models must name the artist,
// and MusicBrainz must have the recording. Most songs get none.
export async function addLandmarkRecordings(admin: SupabaseClient, songId: string, opts: { dryRun?: boolean } = {}) {
  const usage: ModelUsage[] = [];
  const { data: song } = await admin
    .from("songs")
    .select("title, song_recording_artists(position, artists(name))")
    .eq("id", songId)
    .single();
  const existing = ((song as any)?.song_recording_artists ?? []).map((r: any) => r.artists?.name).filter(Boolean) as string[];
  if (!song || !existing.length || existing.length >= MAX_RECORDINGS) return { added: [] as LandmarkResult[], usage };

  const [gpt, claude] = await Promise.all([askGptLandmarks(song.title, existing, usage), askClaudeLandmarks(song.title, existing, usage)]);
  const added: LandmarkResult[] = [];
  let position = Math.max(...((song as any).song_recording_artists ?? []).map((r: any) => r.position ?? 0)) + 1;
  for (const pick of agreedLandmarks(gpt, claude, existing)) {
    const found = await musicBrainzRecording(song.title, pick.artist.length >= pick.altArtist.length ? pick.artist : pick.altArtist);
    if (!found) continue;
    const year = landmarkYear(pick.gptYear, pick.claudeYear, found.year);
    added.push({ artist: found.credit, year });
    if (opts.dryRun) continue;
    const [artistId] = await idsFor(admin, "artists", [found.credit]);
    if (!artistId) continue;
    await admin.from("song_recording_artists").insert({ song_id: songId, artist_id: artistId, year, position: position++ });
  }
  return { added, usage };
}

const FIRST_RECORDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recordings"],
  properties: {
    recordings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["artist", "year", "why", "recorded_title"],
        properties: {
          artist: { type: "string" }, year: { type: "integer" }, why: { type: "string", enum: ["original", "iconic"] }, recorded_title: { type: "string" },
        },
      },
    },
  },
};

type FirstRecordingSong = { title: string; writers: string[]; firstLine: string | null; tags: string[] };

function firstRecordingPrompt(s: FirstRecordingSong) {
  const system = "You are a careful music researcher. Accuracy matters more than coverage: a wrong recording is far worse than a missing one.";
  const user = `Song: "${s.title}"${s.writers.length ? `, written by ${s.writers.join(", ")}` : ""}${s.firstLine ? `, first line "${s.firstLine}"` : ""}${s.tags.length ? ` (${s.tags.join("; ")})` : ""}.
Name the recordings of THIS song (not another song with the same title) that people would most likely know it from: the original recording if it is still known, or the best-known later recording. For a traditional, folk, children's, barbershop or hymn-like song, a widely known recording by a well-known performer or group counts.
Never list: novelty or parody covers, karaoke or "kids' sing-along" compilations by anonymous studio groups, or recordings you are not sure exist. At most 3; an empty list is fine. Use the artist's credited name and the year that recording was first released.
Return JSON: {"recordings": [{"artist", "year", "why", "recorded_title"}]} where why is "original" or "iconic" and recorded_title is the title as printed on that recording.`;
  return { system, user };
}

const askGptFirstRecordings = (s: FirstRecordingSong, usage: ModelUsage[]) =>
  askGptJson<RecordingCandidate[]>(firstRecordingPrompt(s), "recordings", "first recordings", usage);
const askClaudeFirstRecordings = (s: FirstRecordingSong, usage: ModelUsage[]) =>
  askClaudeJson<RecordingCandidate[]>(firstRecordingPrompt(s), FIRST_RECORDING_SCHEMA, "recordings", 4000, "first recordings", usage);

// A Spotify link only when the track really is this recording (title and artist).
async function spotifyFor(title: string, artist: string): Promise<string | null> {
  const hit = await findOnSpotify(title, leadArtist(artist)).catch(() => null);
  return hit && norm(hit.title) === norm(title) && (sameArtist(hit.artist, artist) || norm(hit.artist) === norm(leadArtist(artist))) ? hit.spotify_url : null;
}

export type FirstRecordingResult = { artist: string; year: number | null; title: string };

// A song added with no recording (a folk song, spiritual or hymn added by its
// writers) gets up to two recordings people know it from: named by a model and
// confirmed on MusicBrainz, under the song's title or the title on that record.
// A record's own title ("Erie Canal" for "Low Bridge") is kept on the recording
// (YouTube is searched with it) and as an alternate title (search finds it).
// Runs when a song is added, not from the cron. ~3¢ a song.
export async function addFirstRecordings(admin: SupabaseClient, songId: string, opts: { dryRun?: boolean } = {}) {
  const usage: ModelUsage[] = [];
  const { data: song } = await admin
    .from("songs")
    .select("title, first_line, youtube_url, tune_id, known_by_recording, song_recording_artists(count), song_composers(people(name)), song_lyricists(people(name)), song_tags(context, tags(type, name))")
    .eq("id", songId)
    .single();
  const s = song as any;
  // A song that names its tune (Love Divine to Hyfrydol) or already has a
  // reference recording is left alone: a model can't tell which melody a
  // recording of the words uses. Nor one marked as not known by a recording (a
  // camp song: a model will find a different song with the same title).
  if (!s || s.song_recording_artists?.[0]?.count || s.tune_id || s.youtube_url || s.known_by_recording === false) return { added: [] as FirstRecordingResult[], usage };
  const writers = [...(s.song_composers ?? []), ...(s.song_lyricists ?? [])]
    .map((r: any) => r.people?.name as string | undefined)
    .filter((n, i, all): n is string => !!n && all.indexOf(n) === i);
  const tags = (s.song_tags ?? []).filter((t: any) => t.context === "general" && ["genre", "form", "community"].includes(t.tags?.type)).map((t: any) => t.tags.name as string);
  const ask = { title: s.title as string, writers, firstLine: s.first_line ?? null, tags };
  const [gpt, claude] = await Promise.all([askGptFirstRecordings(ask, usage), askClaudeFirstRecordings(ask, usage)]);

  const added: FirstRecordingResult[] = [];
  for (const pick of firstRecordingCandidates(gpt, claude)) {
    if (added.length >= 2) break;
    const titles = [s.title as string, ...pick.titles].filter((t, i, all) => all.findIndex((u) => norm(u) === norm(t)) === i);
    let found: { credit: string; year: number | null } | null = null;
    let asTitle = s.title as string;
    for (const t of titles) {
      found = await musicBrainzRecording(t, pick.artist);
      if (found) { asTitle = t; break; }
    }
    if (!found || added.some((a) => sameArtist(a.artist, found!.credit))) continue;
    const year = firstRecordingYear(pick.years, found.year);
    added.push({ artist: found.credit, year, title: asTitle });
    if (opts.dryRun) continue;
    const [artistId] = await idsFor(admin, "artists", [found.credit]);
    if (!artistId) continue;
    const recordedTitle = norm(asTitle) === norm(s.title) ? null : asTitle;
    await admin.from("song_recording_artists").insert({
      song_id: songId, artist_id: artistId, year, position: added.length, recorded_title: recordedTitle,
      spotify_url: await spotifyFor(asTitle, found.credit),
    });
    // "Auld Lang Syne (The New Year's Anthem)" is the title plus a subtitle, not another name.
    if (recordedTitle && !norm(recordedTitle).startsWith(norm(s.title))) await admin.from("song_alternate_titles").upsert({ song_id: songId, title: recordedTitle }, { onConflict: "song_id,title", ignoreDuplicates: true });
  }
  return { added, usage };
}
