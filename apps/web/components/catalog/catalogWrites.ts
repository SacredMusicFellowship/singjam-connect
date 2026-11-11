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
