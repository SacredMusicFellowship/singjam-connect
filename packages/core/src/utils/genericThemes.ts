// "Faith" and "Spirituality" say nothing about a song already known as
// religious (every worship song would carry them, like tagging pop songs
// "Music"), so enrichment leaves them off such songs. They stay useful on a
// secular song about faith.
export const GENERIC_FAITH_THEMES = ["Faith", "Spirituality"];

const RELIGIOUS_FORMS = new Set(["Worship song", "Hymn", "Lined hymn", "Psalm setting", "Liturgical setting", "Nigun", "Zemer", "Piyyut", "Chant", "Carol", "Mantra"]);
const RELIGIOUS_GENRES = new Set([
  "Contemporary Christian", "Contemporary Gospel", "Gospel", "Southern Gospel", "Country Gospel", "Traditional Gospel",
  "Spiritual", "Sacred", "Jewish Music", "Contemporary Jewish", "Cantorial", "Kirtan", "Qawwali",
]);

export function isReligiousSong(tags: { communities?: string[]; forms?: string[]; genres?: string[] }): boolean {
  return (tags.communities?.length ?? 0) > 0
    || (tags.forms ?? []).some((f) => RELIGIOUS_FORMS.has(f))
    || (tags.genres ?? []).some((g) => RELIGIOUS_GENRES.has(g));
}

export function withoutGenericFaithThemes(themes: string[], tags: { communities?: string[]; forms?: string[]; genres?: string[] }): string[] {
  return isReligiousSong(tags) ? themes.filter((t) => !GENERIC_FAITH_THEMES.includes(t)) : themes;
}
