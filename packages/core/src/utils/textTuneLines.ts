type Credit = { role: string; people: { name: string } | null };
type Tag = { tags: { name: string; type: string } | null };

export type SongText = { title: string; slug?: string | null; text_credits?: Credit[] | null } | null | undefined;
export type SongTune = { tune_label: string; slug?: string | null; year: number | null; tune_credits?: Credit[] | null; tune_tags?: Tag[] | null } | null | undefined;

// The song page's "Words:" and "Tune:" lines for a song linked to a text or a
// tune (migration 208): "John Newton; tr. Jane Doe" and "New Britain · American, 1829".
// The slugs link each line to the text's and tune's own pages.
// The tune's label already falls back to its composers or community, so those
// aren't repeated after it.
export type TextTuneLines = {
  words: string | null;
  textSlug: string | null;
  tune: { name: string; detail: string | null } | null;
  tuneSlug: string | null;
};

export function textTuneLines(text: SongText, tune: SongTune): TextTuneLines {
  const names = (credits: Credit[] | null | undefined, role: string) =>
    (credits ?? []).filter((c) => c.role === role && c.people && c.people.name.toLowerCase() !== "traditional").map((c) => c.people!.name);
  let words: string | null = null;
  if (text) {
    const authors = names(text.text_credits, "author");
    const translators = names(text.text_credits, "translator");
    words = [authors.join(", "), translators.length ? `tr. ${translators.join(", ")}` : ""].filter(Boolean).join("; ") || null;
  }
  let tuneLine: TextTuneLines["tune"] = null;
  if (tune) {
    const label = tune.tune_label;
    const origins = (tune.tune_tags ?? [])
      .map((t) => t.tags)
      .filter((t): t is { name: string; type: string } => !!t && (t.type === "culture" || t.type === "community") && t.name !== label)
      .map((t) => t.name);
    const detail = [[...new Set(origins)].join(", "), tune.year ? String(tune.year) : ""].filter(Boolean).join(", ");
    tuneLine = { name: label, detail: detail || null };
  }
  return { words, textSlug: text?.slug ?? null, tune: tuneLine, tuneSlug: tune?.slug ?? null };
}
