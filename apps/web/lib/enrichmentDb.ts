import type { SupabaseClient } from "@supabase/supabase-js";
import { newOutages, OUTAGE_STREAK, usageCost, type RunChecks, type TagType } from "@singjam/core";
import { norm } from "@/lib/enrichmentSources";
import type { ModelUsage } from "@/lib/enrichmentModels";
import { findKnownArtist } from "@/lib/songLookup";

// The catalogue writes enrichment and the add-song route share: names to ids
// (people, artists, tags) and what a run cost.

export async function idsFor(admin: SupabaseClient, table: "people" | "languages" | "artists", names: string[]) {
  const ids: string[] = [];
  for (const name of names) {
    // An artist may be credited with a variant spelling ("Beatles"); people are matched exactly.
    const found = table === "artists" ? await findKnownArtist(admin, name) : (await admin.from(table).select("id").ilike("name", name).limit(1).maybeSingle()).data;
    const id = found?.id ?? (await admin.from(table).insert({ name }).select("id").single()).data?.id;
    if (id) ids.push(id);
  }
  return ids;
}

// A duo or group credit's artists (migration 259), each found or added, in credit order.
export async function linkMembers(admin: SupabaseClient, groupId: string, names: string[]) {
  if (!names.length) return;
  const ids = await idsFor(admin, "artists", names);
  const rows = ids.filter((id) => id !== groupId).map((member_id, position) => ({ group_id: groupId, member_id, position }));
  if (rows.length) await admin.from("artist_members").upsert(rows, { onConflict: "group_id,member_id", ignoreDuplicates: true });
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

// Keeps what a run cost (migration 214) and which sources answered (249).
// Best effort: a failed write never fails the enrichment itself.
export async function recordEnrichmentUsage(
  admin: SupabaseClient,
  songId: string,
  kind: "fill" | "review",
  usage: ModelUsage[],
  checks?: { name: string; ok: boolean }[],
) {
  if (!usage.length) return;
  const { usd, unpriced } = usageCost(usage);
  if (unpriced.length) console.warn(`[song-enrichment] no price for ${unpriced.join(", ")}; cost recorded without them`);
  const { error } = await admin.from("song_enrichment_runs").insert({ song_id: songId, kind, usage, checks: checks ?? null, cost_usd: Number(usd.toFixed(5)) });
  if (error) console.error("[song-enrichment] couldn't record usage:", error.message);
  if (checks?.some((c) => !c.ok)) await alertOnOutage(admin).catch((e) => console.error("[song-enrichment] outage check failed:", e));
}

// Emails the admin when GPT or Claude has just failed OUTAGE_STREAK runs in a row.
async function alertOnOutage(admin: SupabaseClient) {
  const { data } = await admin.from("song_enrichment_runs").select("checks").order("ran_at", { ascending: false }).order("id", { ascending: false }).limit(OUTAGE_STREAK + 1);
  const down = newOutages(((data ?? []) as { checks: RunChecks }[]).map((r) => r.checks));
  if (!down.length) return;
  const names = down.join(" and ");
  console.error(`[song-enrichment] ${names} failed the last ${OUTAGE_STREAK} runs`);
  // Loaded only to send: the mail client needs its key, which enrichment otherwise doesn't.
  const { FROM_ADDRESS, resend } = await import("@/lib/resend");
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: process.env.ADMIN_EMAIL ?? "benkramarz@gmail.com",
    subject: `Song enrichment: ${names} hasn't answered in ${OUTAGE_STREAK} runs`,
    text: `${names} failed on the last ${OUTAGE_STREAK} song enrichment runs, so new songs are being filled in from fewer sources than the two-source rule expects.\n\nThe Netlify function log for enrich-song-background shows the error. Each run's sources are in song_enrichment_runs.checks, and the admin song import page shows failures over the last 24 hours.`,
  });
  if (error) console.error("[song-enrichment] outage email failed:", error.message);
}
