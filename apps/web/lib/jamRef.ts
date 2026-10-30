import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /jam/<ref> takes either a jam's short code (migration 169) or its uuid, so
// links shared before short codes existed keep working. Read as admin: like
// the uuid, the code is the credential for an unlisted private jam.
export const resolveJamId = cache(async (ref: string): Promise<string | null> => {
  if (UUID.test(ref)) return ref;
  const { data } = await supabaseAdmin()
    .from("jams")
    .select("id")
    .eq("short_code", ref.toLowerCase())
    .maybeSingle();
  return (data as any)?.id ?? null;
});
