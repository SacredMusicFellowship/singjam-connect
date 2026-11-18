import { formatSourceRef, scriptureKey, sortSources, type SourceRef } from "./scripture";
import { traditionalCredit, type CardCredit, type SongOrigin } from "./songSubtitle";
import { formatYear } from "./yearDisplay";

export type CreditPerson = { name: string; slug?: string | null };
export type CreditTextRef = { slug: string; year?: number | null; year_precision?: string | null; songs?: { count: number }[] | null; text_sources?: SourceRef[] | null } | null | undefined;
export type CreditTune = { name: string | null; slug: string; year?: number | null; year_precision?: string | null } | null | undefined;

// One line of a song page's Songwriters section: "Words & music", "Words" or
// "Music", then groups of linked parts shown " · " apart (names in a group are
// comma-separated).
export type SongCreditLine = { label: "Words & music" | "Words" | "Music"; groups: CardCredit[][] };

// A community origin ("Jewish (Sephardi)") names the whole song; otherwise the
// words and the music each name their own culture.
function writers(people: CreditPerson[], cultures: string[], origin: SongOrigin | null): CardCredit[] {
  const traditional = people.some((p) => p.name.toLowerCase() === "traditional");
  const from: SongOrigin | null = origin?.kind === "community" ? origin : cultures[0] ? { text: cultures[0], kind: "culture", key: cultures[0] } : null;
  return [
    ...(traditional ? [traditionalCredit("Traditional", from)] : []),
    ...people.filter((p) => p.name.toLowerCase() !== "traditional").map((p): CardCredit => ({ text: p.name, link: { kind: "person", key: p.slug ?? p.name } })),
  ];
}

// "Words" and "Music" for every song, as on sheet music; one "Words & music"
// line when the same people wrote both. A named tune leads the Music line and
// opens its page; the words show the scripture they set (opening its scripture
// page) and, when other songs sing them to other tunes, link the text's page
// ("also sung to 2 other tunes").
export function songCreditLines(o: {
  composers: CreditPerson[];
  lyricists: CreditPerson[];
  musicCultures: string[];
  lyricsCultures: string[];
  origin?: SongOrigin | null;
  text?: CreditTextRef;
  tune?: CreditTune;
}): SongCreditLine[] {
  const text = o.text ?? null;
  const tune = o.tune?.name ? o.tune : null;
  // A text "inspired" by a verse (Amazing Grace and 1 Chronicles 17) doesn't set it.
  const ref = sortSources(text?.text_sources ?? []).find((s) => s.relation !== "inspired" && formatSourceRef(s)) ?? null;
  const source = ref ? formatSourceRef(ref) : null;
  const sourceKey = ref ? scriptureKey(ref) : null;
  const others = Math.max(0, (text?.songs?.[0]?.count ?? 1) - 1);
  const key = (p: CreditPerson[]) => p.map((x) => x.name.toLowerCase()).sort().join("|");
  if (o.composers.length && key(o.composers) === key(o.lyricists) && !tune && !source && !others && text?.year == null) {
    return [{ label: "Words & music", groups: [writers(o.composers, o.musicCultures, o.origin ?? null)] }];
  }
  const words: CardCredit[][] = [
    writers(o.lyricists, o.lyricsCultures, o.origin ?? null),
    yearCredit(text?.year, text?.year_precision),
    source && text ? [{ text: source, link: sourceKey ? { kind: "scripture" as const, key: sourceKey } : { kind: "text" as const, key: text.slug } }] : [],
    others && text ? [{ text: `also sung to ${others} other tune${others === 1 ? "" : "s"}`, link: { kind: "text" as const, key: text.slug } }] : [],
  ].filter((g) => g.length);
  const music: CardCredit[][] = [
    tune ? [{ text: tune.name!, link: { kind: "tune" as const, key: tune.slug } }] : [],
    writers(o.composers, o.musicCultures, o.origin ?? null),
    yearCredit(o.tune?.year, o.tune?.year_precision),
  ].filter((g) => g.length);
  return [
    ...(words.length ? [{ label: "Words" as const, groups: words }] : []),
    ...(music.length ? [{ label: "Music" as const, groups: music }] : []),
  ];
}

// When the words or the tune were written, at the precision known ("16th c.").
function yearCredit(year: number | null | undefined, precision: string | null | undefined): CardCredit[] {
  const text = formatYear(year, precision);
  return text ? [{ text, link: null }] : [];
}
