import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /jam/<ref> and /set/<ref> take either the row's short code (migrations 169,
// 170) or its uuid, so links shared before short codes existed keep working.
// Read as admin: like the uuid, the code is the credential for an unlisted
// private jam or a link-shared set — this only maps it to the id, and the
// page's own access rules still decide what the viewer sees.
async function resolveId(table: "jams" | "sets", ref: string): Promise<string | null> {
  if (UUID.test(ref)) return ref;
  const { data } = await supabaseAdmin()
    .from(table)
    .select("id")
    .eq("short_code", ref.toLowerCase())
    .maybeSingle();
  return (data as any)?.id ?? null;
}

export const resolveJamId = cache((ref: string) => resolveId("jams", ref));
export const resolveSetId = cache((ref: string) => resolveId("sets", ref));
