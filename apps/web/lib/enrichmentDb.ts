import type { SupabaseClient } from "@supabase/supabase-js";
import { usageCost, type TagType } from "@singjam/core";
import { norm } from "@/lib/enrichmentSources";
import type { ModelUsage } from "@/lib/enrichmentModels";

// The catalogue writes enrichment and the add-song route share: names to ids
// (people, artists, tags) and what a run cost.

export async function idsFor(admin: SupabaseClient, table: "people" | "languages" | "artists", names: string[]) {
  const ids: string[] = [];
  for (const name of names) {
    const { data: found } = await admin.from(table).select("id").ilike("name", name).limit(1).maybeSingle();
    const id = found?.id ?? (await admin.from(table).insert({ name }).select("id").single()).data?.id;
    if (id) ids.push(id);
  }
  return ids;
}

// Tags of one type by exact name. Only languages may be created; every other
// vocabulary is fixed (the decision already kept to the approved lists).
export async function tagIds(admin: SupabaseClient, type: TagType, names: string[]) {
  const { data } = await admin.from("tags").select("id, name").eq("type", type).in("name", names);
  const ids = (data ?? []).map((r) => r.id as string);
  if (type === "language") {
    const known = new Set((data ?? []).map((r) => norm(r.name as string)));
    for (const name of names.filter((n) => !known.has(norm(n)))) {
      const { data: found } = await admin.from("tags").select("id").eq("type", "language").ilike("name", name).limit(1).maybeSingle();
      const id = found?.id ?? (await admin.from("tags").insert({ type: "language", name, slug: name }).select("id").single()).data?.id;
      if (id) ids.push(id);
    }
  }
  return ids;
}

// Keeps what a run cost (migration 214). Best effort: a failed write never
// fails the enrichment itself.
export async function recordEnrichmentUsage(admin: SupabaseClient, songId: string, kind: "fill" | "review", usage: ModelUsage[]) {
  if (!usage.length) return;
  const { usd, unpriced } = usageCost(usage);
  if (unpriced.length) console.warn(`[song-enrichment] no price for ${unpriced.join(", ")}; cost recorded without them`);
  const { error } = await admin.from("song_enrichment_runs").insert({ song_id: songId, kind, usage, cost_usd: Number(usd.toFixed(5)) });
  if (error) console.error("[song-enrichment] couldn't record usage:", error.message);
}
