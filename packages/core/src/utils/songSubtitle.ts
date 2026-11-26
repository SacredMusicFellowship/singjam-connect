import { sortRecordingsByYear, type RecordingArtistCredit } from "./formatRecordingArtists";
import { capitalizeFirst, formatSourceRef, scriptureKey, type SourceRef } from "./scripture";
import type { BrowseKind } from "./browsePaths";

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

// One part of a song card's credits: `lead` is plain text before it ("Tune: "),
// and `link` the page it opens. People, artists and tags are linked by name
// (each is unique; see loadBrowseEntity), tunes and texts by slug.
// `suffix` is plain text after the link, such as a recording's year.
// `sep` replaces the list's separator before it (" · " between a maqam and its usul).
export type CardCredit = { lead?: string; text: string; suffix?: string; sep?: string; link: { kind: BrowseKind; key: string; traditional?: boolean } | null };

// What tells a song apart when it isn't known by a recording (migrations 211-212).
export type CardIdentity = {
  tune?: string | null;
  tune_slug?: string | null;
  text_slug?: string | null;
  source?: SourceRef | null;
  first_line?: string | null;
  hook?: string | null;
  line?: CardLine | null;
  origin?: string | null;
  origin_kind?: string | null;
  origin_key?: string | null;
  maqam?: string | null;
  maqam_family?: string | null;
  usul?: string | null;
  usul_family?: string | null;
  poets?: string[] | null;
} | null | undefined;

// "Maqam: Hicaz · Usul: Sofyan" (migration 256). A family named in the singular
// leads its value ("Raga: Yaman"); one named in the plural doesn't ("Tone 8").
export function songModeCredits(identity: CardIdentity): CardCredit[] {
  const lead = (family: string | null | undefined) => (family && !family.endsWith("s") ? `${family}: ` : undefined);
  const out: CardCredit[] = [];
  if (identity?.maqam) out.push({ lead: lead(identity.maqam_family), text: identity.maqam, link: { kind: "mode", key: identity.maqam } });
  if (identity?.usul) out.push({ lead: lead(identity.usul_family), text: identity.usul, sep: " · ", link: { kind: "rhythm", key: identity.usul } });
  return out;
}

// Where a traditional song comes from (song_origins, migration 233): the text
// after "Traditional · " and the community or culture page it opens.
export type SongOrigin = { text: string; kind: "community" | "culture"; key: string };

export function songOrigin(o: { text?: string | null; kind?: string | null; key?: string | null } | null | undefined): SongOrigin | null {
  return o?.text && o.key && (o.kind === "community" || o.kind === "culture") ? { text: o.text, kind: o.kind, key: o.key } : null;
}

// Rows from before migration 233 carry no origin: fall back to the first culture.
function cultureOrigin(culture: string | undefined): SongOrigin | null {
  return culture ? { text: culture, kind: "culture", key: culture } : null;
}

// What a card shows under its title when a song editor has chosen (songs.card_line, migration 232).
export const CARD_LINES = ["recordings", "writers", "tune", "scripture", "first_line", "hook", "none"] as const;
export type CardLine = (typeof CARD_LINES)[number];

const plain = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function tuneCredit(identity: CardIdentity): CardCredit | null {
  return identity?.tune ? { lead: "Tune: ", text: identity.tune, link: identity.tune_slug ? { kind: "tune", key: identity.tune_slug } : null } : null;
}

function scriptureCredit(identity: CardIdentity): CardCredit | null {
  if (!identity?.source) return null;
  const ref = formatSourceRef(identity.source);
  const key = scriptureKey(identity.source);
  return ref ? { text: capitalizeFirst(ref), link: key ? { kind: "scripture", key } : identity.text_slug ? { kind: "text", key: identity.text_slug } : null } : null;
}

// A loop, not /[…]+$/: that regex backtracks quadratically on long runs of spaces.
const TRAILING = /[\s,;:.!?—–-]/u;
function trimTrailingPunctuation(text: string): string {
  let end = text.length;
  while (end > 0 && TRAILING.test(text[end - 1])) end--;
  return text.slice(0, end).trim();
}

// Its first line, when that says more than the title, or whenever a song
// editor chose it.
function firstLineCredit(identity: CardIdentity, title: string, chosen = false): CardCredit | null {
  const line = trimTrailingPunctuation(identity?.first_line ?? "");
  if (!line || (!chosen && plain(title).includes(plain(line)))) return null;
  return { text: `“${line}…”`, link: null };
}

// Its chorus or hook, when a song editor chose it (migration 234).
function hookCredit(identity: CardIdentity): CardCredit | null {
  const hook = trimTrailingPunctuation(identity?.hook ?? "");
  return hook ? { text: `“${hook}…”`, link: null } : null;
}

// Its tune's name, else the scripture it sets, else its first line.
export function songCardIdentity(identity: CardIdentity, title: string): CardCredit | null {
  return tuneCredit(identity) ?? scriptureCredit(identity) ?? firstLineCredit(identity, title);
}

// A song card's credits: its writers in brackets after the title (as on every
// list), and under it the line a song editor chose (`cardLine` previews the
// editor's choice; otherwise identity.line). With no choice, the recordings
// for a song known by them, or what tells the song apart otherwise.
// A traditional song names one culture ("Trad. · Irish"); when the song has a
// named tune, "Traditional" is that tune's credit and the tune line says it.
// `knownByRecording` decides the automatic line outright (the editor's
// preview); otherwise the byline says.
export function songCardCredits(o: {
  title: string;
  byline?: string | null;
  knownByRecording?: boolean | null;
  cardLine?: CardLine | null;
  displayArtist: string | null;
  composers: string[];
  cultures: string[];
  recordingArtists: { name: string; year: number | null; position?: number | null }[] | null | undefined;
  identity?: CardIdentity;
}): { writers: CardCredit[]; line: CardCredit[] } {
  const named = o.composers.filter((c) => c.toLowerCase() !== "traditional");
  const traditional = named.length < o.composers.length && !o.identity?.tune;
  const origin = songOrigin({ text: o.identity?.origin, kind: o.identity?.origin_kind, key: o.identity?.origin_key }) ?? cultureOrigin(o.cultures[0]);
  // A song in a maqam credits its poet alone, by the full name they're known by.
  const poets = o.identity?.maqam ? (o.identity.poets ?? []) : [];
  const writers: CardCredit[] = poets.length
    ? poets.map((name): CardCredit => ({ text: name, link: { kind: "person", key: name } }))
    : [
        ...(traditional ? [traditionalCredit("Trad.", origin)] : []),
        ...named.map((name): CardCredit => {
          const w = name.trim().split(" ");
          return { text: w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(" ")}` : name, link: { kind: "person", key: name } };
        }),
      ];
  const recordings = (): CardCredit[] => o.recordingArtists?.length
    ? sortRecordingsByYear(o.recordingArtists).map((a): CardCredit => ({ text: a.name, ...(a.year ? { suffix: ` (${a.year})` } : {}), link: { kind: "artist", key: a.name } }))
    : o.displayArtist?.trim() ? [{ text: o.displayArtist.trim(), link: null }] : [];
  const one = (c: CardCredit | null) => (c ? [c] : []);
  const chosen = o.cardLine !== undefined ? o.cardLine : o.identity?.line ?? null;
  switch (chosen) {
    case "recordings": return { writers, line: recordings() };
    case "writers": return {
      writers,
      line: [
        ...(named.length < o.composers.length ? [traditionalCredit("Traditional", origin)] : []),
        ...named.map((name): CardCredit => ({ text: name, link: { kind: "person", key: name } })),
      ],
    };
    case "tune": return { writers, line: one(tuneCredit(o.identity)) };
    case "scripture": return { writers, line: one(scriptureCredit(o.identity)) };
    case "first_line": return { writers, line: one(firstLineCredit(o.identity, o.title, true)) };
    case "hook": return { writers, line: one(hookCredit(o.identity)) };
    case "none": return { writers, line: [] };
  }
  if (o.identity?.maqam || o.identity?.usul) return { writers, line: songModeCredits(o.identity) };
  if (!(o.knownByRecording ?? knownByRecording(o.byline, o.displayArtist))) {
    return { writers, line: one(songCardIdentity(o.identity, o.title)) };
  }
  return { writers, line: recordings() };
}

// A compact row's text (My songs, a set's Add songs lists): the card's credits
// as plain text, without recording years, which only cards show. `line` is the
// whole second line; `shows` and `credits` are its parts, for rows that
// italicise the show titles ("from *Hamilton* · Lin-Manuel Miranda").
export function songRowText(o: Parameters<typeof songCardCredits>[0] & { productions?: string[] | null }): { writers: string; line: string; shows: string[]; credits: string } {
  const card = songCardCredits(o);
  const text = (list: CardCredit[]) => list.map((c, i) => `${i > 0 ? c.sep ?? ", " : ""}${c.lead ?? ""}${c.text}`).join("");
  const shows = (o.productions ?? []).filter(Boolean);
  const credits = text(card.line);
  return { writers: text(card.writers), line: shows.length ? `from ${shows.join(", ")}${credits ? ` · ${credits}` : ""}` : credits, shows, credits };
}

// A song's card data as song_cards returns it (its `card` column, and
// set_song_cards / songs.card, migrations 234-235).
export type SongCardData = {
  byline?: string | null;
  composers?: string[] | null;
  cultures?: string[] | null;
  recording_artists?: RecordingArtistCredit[] | null;
  card_identity?: CardIdentity;
};

// songRowText from a song's card data: what every compact list and set row shows.
export function cardRowText(o: { title: string; displayArtist: string | null; productions?: string[] | null; card: SongCardData }) {
  return songRowText({
    title: o.title,
    byline: o.card.byline,
    displayArtist: o.displayArtist,
    composers: o.card.composers ?? [],
    cultures: o.card.cultures ?? [],
    recordingArtists: o.card.recording_artists,
    identity: o.card.card_identity,
    productions: o.productions,
  });
}

// "Traditional" or "Traditional · Jewish (Sephardi)" as a link: to the
// Traditional page, or to that community's or culture's traditional songs.
// `lead` is "Traditional" or "Trad.".
export function traditionalCredit(lead: string, origin: SongOrigin | null): CardCredit {
  return origin
    ? { text: `${lead} · ${origin.text}`, link: { kind: origin.kind, key: origin.key, traditional: true } }
    : { text: lead, link: { kind: "person", key: "Traditional" } };
}

// The line under a song's title (byline(), migration 204) as linked parts:
// "Traditional · Irish" as one link, and each writer or recording artist named
// in it linked to their page. Names are matched whole, longest first, so
// "Peter, Paul and Mary" stays one artist.
export function bylineCredits(byline: string | null | undefined, known: { people: string[]; artists: string[] }, origin?: SongOrigin | null): CardCredit[] {
  const text = byline?.trim();
  if (!text) return [];
  if (/^Traditional( · |$)/.test(text)) {
    const named = text.split(" · ")[1]?.trim();
    return [traditionalCredit("Traditional", origin ?? cultureOrigin(named))];
  }
  const names = [
    ...known.artists.map((n) => ({ n, kind: "artist" as const })),
    ...known.people.filter((n) => n.toLowerCase() !== "traditional").map((n) => ({ n, kind: "person" as const })),
  ].sort((a, b) => b.n.length - a.n.length);
  const parts: CardCredit[] = [];
  let rest = text;
  while (rest) {
    let best: { at: number; n: string; kind: "artist" | "person" } | null = null;
    for (const c of names) {
      const at = rest.indexOf(c.n);
      if (at >= 0 && (!best || at < best.at)) best = { at, ...c };
    }
    if (!best) { parts.push({ text: rest, link: null }); break; }
    if (best.at > 0) parts.push({ text: rest.slice(0, best.at), link: null });
    parts.push({ text: best.n, link: { kind: best.kind, key: best.n } });
    rest = rest.slice(best.at + best.n.length);
  }
  return parts;
}
