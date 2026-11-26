import { supabaseBrowser } from "@/lib/supabase/client";

// Find a person by exact name, or add them (song editors may add people, migration 192).
export async function personIdFor(name: string, known: { id: string; name: string }[]): Promise<string> {
  const hit = known.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (hit) return hit.id;
  const { data, error } = await supabaseBrowser().from("people").insert({ name }).select("id").single();
  if (error || !data) throw error ?? new Error("Couldn't add that person.");
  return data.id;
}

// Replace a row's tags in a join table (text_tags / tune_tags) with `next`.
export async function syncTags(table: "text_tags" | "tune_tags", key: "text_id" | "tune_id", id: string, current: string[], next: string[]) {
  const db = supabaseBrowser();
  const removed = current.filter((t) => !next.includes(t));
  const added = next.filter((t) => !current.includes(t));
  if (removed.length) {
    const { error } = await db.from(table).delete().eq(key, id).in("tag_id", removed);
    if (error) throw error;
  }
  if (added.length) {
    const { error } = await db.from(table).insert(added.map((tag_id) => ({ [key]: id, tag_id })));
    if (error) throw error;
  }
}

type Lookup = { id: string; name: string };

// A new text, with its authors.
export async function createText(text: { title: string; firstLine?: string; kind?: string; authors?: string[] }, people: Lookup[]) {
  const db = supabaseBrowser();
  const { data, error } = await db.from("texts")
    .insert({ title: text.title, slug: "x", first_line: text.firstLine || null, kind: text.kind ?? null })
    .select("id, title, slug").single();
  if (error || !data) throw error ?? new Error("Couldn't create the text.");
  for (const name of text.authors ?? []) {
    const { error: e } = await db.from("text_credits").insert({ text_id: data.id, person_id: await personIdFor(name, people), role: "author" });
    if (e) throw e;
  }
  return data as { id: string; title: string; slug: string };
}

// A new tune, with its composers, arrangers and community; returns it with its display label.
export async function createTune(tune: { name: string | null; composers?: string[]; arrangers?: string[]; communityId?: string }, people: Lookup[]) {
  const db = supabaseBrowser();
  const { data: row, error } = await db.from("tunes").insert({ name: tune.name, slug: "x" }).select("id").single();
  if (error || !row) throw error ?? new Error("Couldn't create the tune.");
  for (const name of tune.composers ?? []) {
    const { error: e } = await db.from("tune_credits").insert({ tune_id: row.id, person_id: await personIdFor(name, people), role: "composer" });
    if (e) throw e;
  }
  for (const name of tune.arrangers ?? []) {
    const { error: e } = await db.from("tune_credits").insert({ tune_id: row.id, person_id: await personIdFor(name, people), role: "arranger" });
    if (e) throw e;
  }
  if (tune.communityId) {
    const { error: e } = await db.from("tune_tags").insert({ tune_id: row.id, tag_id: tune.communityId });
    if (e) throw e;
  }
  const { data, error: e } = await db.from("tunes").select("id, slug, tune_label").eq("id", row.id).single();
  if (e || !data) throw e ?? new Error("Couldn't load the new tune.");
  return data as { id: string; slug: string; tune_label: string };
}
