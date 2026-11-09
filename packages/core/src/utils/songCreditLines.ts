import { formatScriptureRef, type ScriptureRef } from "./scripture";
import { traditionalCredit, type CardCredit } from "./songSubtitle";

export type CreditPerson = { name: string; slug?: string | null };
export type CreditTextRef = { slug: string; songs?: { count: number }[] | null; text_sources?: (ScriptureRef & { relation?: string | null })[] | null } | null | undefined;
export type CreditTune = { name: string | null; slug: string } | null | undefined;

// One line of a song page's Songwriters section: "Words & music", "Words" or
// "Music", then groups of linked parts shown " · " apart (names in a group are
// comma-separated).
export type SongCreditLine = { label: "Words & music" | "Words" | "Music"; groups: CardCredit[][] };

function writers(people: CreditPerson[], cultures: string[]): CardCredit[] {
  const traditional = people.some((p) => p.name.toLowerCase() === "traditional");
  return [
    ...(traditional ? [traditionalCredit(cultures[0] ? `Traditional · ${cultures[0]}` : "Traditional")] : []),
    ...people.filter((p) => p.name.toLowerCase() !== "traditional").map((p): CardCredit => ({ text: p.name, link: { kind: "person", key: p.slug ?? p.name } })),
  ];
}

// "Words" and "Music" for every song, as on sheet music; one "Words & music"
// line when the same people wrote both. A named tune leads the Music line and
// opens its page; the words show the scripture they set and, when other songs
// sing them too, link the text's page ("also sung as 2 other songs").
export function songCreditLines(o: {
  composers: CreditPerson[];
  lyricists: CreditPerson[];
  musicCultures: string[];
  lyricsCultures: string[];
  text?: CreditTextRef;
  tune?: CreditTune;
}): SongCreditLine[] {
  const text = o.text ?? null;
  const tune = o.tune?.name ? o.tune : null;
  // A text "inspired" by a verse (Amazing Grace and 1 Chronicles 17) doesn't set it.
  const source = text?.text_sources?.filter((s) => s.relation !== "inspired").map(formatScriptureRef).find(Boolean) ?? null;
  const others = Math.max(0, (text?.songs?.[0]?.count ?? 1) - 1);
  const key = (p: CreditPerson[]) => p.map((x) => x.name.toLowerCase()).sort().join("|");
  if (o.composers.length && key(o.composers) === key(o.lyricists) && !tune && !source && !others) {
    return [{ label: "Words & music", groups: [writers(o.composers, o.musicCultures)] }];
  }
  const words: CardCredit[][] = [
    writers(o.lyricists, o.lyricsCultures),
    source && text ? [{ text: source, link: { kind: "text" as const, key: text.slug } }] : [],
    others && text ? [{ text: `also sung as ${others} other song${others === 1 ? "" : "s"}`, link: { kind: "text" as const, key: text.slug } }] : [],
  ].filter((g) => g.length);
  const music: CardCredit[][] = [
    tune ? [{ text: tune.name!, link: { kind: "tune" as const, key: tune.slug } }] : [],
    writers(o.composers, o.musicCultures),
  ].filter((g) => g.length);
  return [
    ...(words.length ? [{ label: "Words" as const, groups: words }] : []),
    ...(music.length ? [{ label: "Music" as const, groups: music }] : []),
  ];
}
