import { sortRecordingsByYear } from "./formatRecordingArtists";
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
export type CardCredit = { lead?: string; text: string; suffix?: string; link: { kind: BrowseKind; key: string; traditional?: boolean } | null };

// What tells a song apart when it isn't known by a recording (migrations 211-212).
export type CardIdentity = {
  tune?: string | null;
  tune_slug?: string | null;
  text_slug?: string | null;
  source?: SourceRef | null;
  first_line?: string | null;
  line?: CardLine | null;
} | null | undefined;

// What a card shows under its title when a song editor has chosen (songs.card_line, migration 232).
export const CARD_LINES = ["recordings", "writers", "tune", "scripture", "first_line", "none"] as const;
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

// Its first line, when that says more than the title.
function firstLineCredit(identity: CardIdentity, title: string): CardCredit | null {
  const line = identity?.first_line?.trim().replace(/[\s,;:.!?—–-]+$/u, "");
  if (!line || plain(title).includes(plain(line))) return null;
  return { text: `“${line}…”`, link: null };
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
  const culture = o.cultures[0];
  const writers: CardCredit[] = [
    ...(traditional ? [traditionalCredit(culture ? `Trad. · ${culture}` : "Trad.")] : []),
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
      writers: [],
      line: [
        ...(named.length < o.composers.length ? [traditionalCredit(culture ? `Traditional · ${culture}` : "Traditional")] : []),
        ...named.map((name): CardCredit => ({ text: name, link: { kind: "person", key: name } })),
      ],
    };
    case "tune": return { writers, line: one(tuneCredit(o.identity)) };
    case "scripture": return { writers, line: one(scriptureCredit(o.identity)) };
    case "first_line": return { writers, line: one(firstLineCredit(o.identity, o.title)) };
    case "none": return { writers, line: [] };
  }
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
  const text = (list: CardCredit[]) => list.map((c) => `${c.lead ?? ""}${c.text}`).join(", ");
  const shows = (o.productions ?? []).filter(Boolean);
  const credits = text(card.line);
  return { writers: text(card.writers), line: shows.length ? `from ${shows.join(", ")}${credits ? ` · ${credits}` : ""}` : credits, shows, credits };
}

// "Traditional" or "Traditional · Irish" as a link: to the Traditional page,
// or to that culture's traditional songs.
export function traditionalCredit(text: string): CardCredit {
  const culture = text.split(" · ")[1]?.trim();
  return { text, link: culture ? { kind: "culture", key: culture, traditional: true } : { kind: "person", key: "Traditional" } };
}

// The line under a song's title (byline(), migration 204) as linked parts:
// "Traditional · Irish" as one link, and each writer or recording artist named
// in it linked to their page. Names are matched whole, longest first, so
// "Peter, Paul and Mary" stays one artist.
export function bylineCredits(byline: string | null | undefined, known: { people: string[]; artists: string[] }): CardCredit[] {
  const text = byline?.trim();
  if (!text) return [];
  if (/^Traditional( · |$)/.test(text)) return [traditionalCredit(text)];
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
