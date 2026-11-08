import { sortRecordingsByYear } from "./formatRecordingArtists";
import { formatScriptureRef, type ScriptureRef } from "./scripture";

export type SongSubtitle = { kind: "production"; text: string } | { kind: "artist"; text: string } | null;

// The line under a song's title in lists (repertoire, set rows, set PDF): the
// show it's from when there is one, otherwise its artist. Song pages show
// production years instead and don't use this.
export function songSubtitle(productions: readonly string[] | null | undefined, displayArtist: string | null | undefined): SongSubtitle {
  const shows = (productions ?? []).filter(Boolean);
  if (shows.length) return { kind: "production", text: shows.join(", ") };
  const artist = displayArtist?.trim();
  return artist ? { kind: "artist", text: artist } : null;
}

// The same line as plain text, for places without italics (PDF, CSV).
export function songSubtitleText(productions: readonly string[] | null | undefined, displayArtist: string | null | undefined): string | null {
  const s = songSubtitle(productions, displayArtist);
  return s ? (s.kind === "production" ? `from ${s.text}` : s.text) : null;
}

// Whether the line under a song's title is its recording artists. byline()
// (migration 204) returns display_artist for a song known by its recording and
// its writers or tradition otherwise; rows from before 204 have no byline.
export function knownByRecording(byline: string | null | undefined, displayArtist: string | null | undefined): boolean {
  return byline === undefined || (byline ?? null) === (displayArtist?.trim() || null);
}

// One name on a song card. `link` is the songwriter or artist page to open;
// names are unique, so the page is found by name (see loadBrowseEntity).
export type CardCredit = { text: string; link: { kind: "person" | "artist"; name: string } | null };

// What tells a song apart when it isn't known by a recording (migration 211).
export type CardIdentity = { tune?: string | null; source?: ScriptureRef | null; first_line?: string | null } | null | undefined;

const plain = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Its tune's name, else the scripture it sets, else its first line (when that
// says more than the title).
export function songCardIdentity(identity: CardIdentity, title: string): string | null {
  if (identity?.tune) return `Tune: ${identity.tune}`;
  if (identity?.source) return formatScriptureRef(identity.source) || null;
  const line = identity?.first_line?.trim().replace(/[\s,;:.!?—–-]+$/u, "");
  if (!line || plain(title).includes(plain(line))) return null;
  return `“${line}…”`;
}

// A song card's credits: its writers in brackets after the title (as on every
// list), and under it the recordings for a song known by them, or what tells
// the song apart otherwise. The "line under the title" override decides which.
export function songCardCredits(o: {
  title: string;
  byline?: string | null;
  displayArtist: string | null;
  composers: string[];
  cultures: string[];
  recordingArtists: { name: string; year: number | null; position?: number | null }[] | null | undefined;
  identity?: CardIdentity;
}): { writers: CardCredit[]; line: CardCredit[] } {
  const traditional = o.composers.some((c) => c.toLowerCase() === "traditional");
  const cultures = [...new Set(o.cultures)];
  const writers: CardCredit[] = [
    ...(traditional ? [{ text: cultures.length ? `Trad. · ${cultures.join(", ")}` : "Trad.", link: null }] : []),
    ...o.composers.filter((c) => c.toLowerCase() !== "traditional").map((name): CardCredit => {
      const w = name.trim().split(" ");
      return { text: w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(" ")}` : name, link: { kind: "person", name } };
    }),
  ];
  if (!knownByRecording(o.byline, o.displayArtist)) {
    const id = songCardIdentity(o.identity, o.title);
    return { writers, line: id ? [{ text: id, link: null }] : [] };
  }
  const line: CardCredit[] = o.recordingArtists?.length
    ? sortRecordingsByYear(o.recordingArtists).map((a): CardCredit => ({ text: a.year ? `${a.name} (${a.year})` : a.name, link: { kind: "artist", name: a.name } }))
    : o.displayArtist?.trim() ? [{ text: o.displayArtist.trim(), link: null }] : [];
  return { writers, line };
}
