import { sortRecordingsByYear } from "./formatRecordingArtists";

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

// A song card's credits. Known by its recording: the writers in brackets after
// the title, and the recordings under it. Otherwise the title stands alone and
// the line under it is the byline (its writers, or "Traditional · <origin>"),
// as on the song page, so the "line under the title" override reaches cards too.
export function songCardCredits(o: {
  byline?: string | null;
  displayArtist: string | null;
  composers: string[];
  cultures: string[];
  recordingArtists: { name: string; year: number | null; position?: number | null }[] | null | undefined;
}): { writers: CardCredit[]; line: CardCredit[] } {
  if (!knownByRecording(o.byline, o.displayArtist)) {
    const parts = !o.byline ? [] : o.byline.startsWith("Traditional") ? [o.byline] : o.byline.split(", ");
    return { writers: [], line: parts.map((p) => ({ text: p, link: p.startsWith("Traditional") ? null : { kind: "person", name: p } })) };
  }
  const traditional = o.composers.some((c) => c.toLowerCase() === "traditional");
  const cultures = [...new Set(o.cultures)];
  const writers: CardCredit[] = [
    ...(traditional ? [{ text: cultures.length ? `Trad. · ${cultures.join(", ")}` : "Trad.", link: null }] : []),
    ...o.composers.filter((c) => c.toLowerCase() !== "traditional").map((name): CardCredit => {
      const w = name.trim().split(" ");
      return { text: w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(" ")}` : name, link: { kind: "person", name } };
    }),
  ];
  const line: CardCredit[] = o.recordingArtists?.length
    ? sortRecordingsByYear(o.recordingArtists).map((a): CardCredit => ({ text: a.year ? `${a.name} (${a.year})` : a.name, link: { kind: "artist", name: a.name } }))
    : o.displayArtist?.trim() ? [{ text: o.displayArtist.trim(), link: null }] : [];
  return { writers, line };
}
