type Credit = { role: string; people: { name: string } | null };
type Tag = { tags: { name: string; type: string } | null };

export type SongText = { title: string; text_credits?: Credit[] | null } | null | undefined;
export type SongTune = { tune_label: string; year: number | null; tune_credits?: Credit[] | null; tune_tags?: Tag[] | null } | null | undefined;

// The song page's "Words:" and "Tune:" lines for a song linked to a text or a
// tune (migration 208): "John Newton; tr. Jane Doe" and "New Britain · American, 1829".
// The tune's label already falls back to its composers or community, so those
// aren't repeated after it.
export function textTuneLines(text: SongText, tune: SongTune): { words: string | null; tune: string | null } {
  const names = (credits: Credit[] | null | undefined, role: string) =>
    (credits ?? []).filter((c) => c.role === role && c.people && c.people.name.toLowerCase() !== "traditional").map((c) => c.people!.name);
  let words: string | null = null;
  if (text) {
    const authors = names(text.text_credits, "author");
    const translators = names(text.text_credits, "translator");
    words = [authors.join(", "), translators.length ? `tr. ${translators.join(", ")}` : ""].filter(Boolean).join("; ") || null;
  }
  let tuneLine: string | null = null;
  if (tune) {
    const label = tune.tune_label;
    const origins = (tune.tune_tags ?? [])
      .map((t) => t.tags)
      .filter((t): t is { name: string; type: string } => !!t && (t.type === "culture" || t.type === "community") && t.name !== label)
      .map((t) => t.name);
    const detail = [[...new Set(origins)].join(", "), tune.year ? String(tune.year) : ""].filter(Boolean).join(", ");
    tuneLine = detail ? `${label} · ${detail}` : label;
  }
  return { words, tune: tuneLine };
}
