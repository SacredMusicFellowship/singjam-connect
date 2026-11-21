import { createClient } from "@supabase/supabase-js";
import { enrichSong, runEnrichmentReview } from "../../lib/songEnrichment";

// A "-background" Netlify function: the caller gets 202 at once and the work has
// 15 minutes, well past the 60s limit for normal functions.
export const handler = async (event: { httpMethod: string; headers: Record<string, string | undefined>; body: string | null }) => {
  const secret = process.env.ENRICH_SECRET;
  if (event.httpMethod !== "POST" || !secret || event.headers["x-enrich-secret"] !== secret) return { statusCode: 401 };
  const { songId, spotifyReleaseYear, review } = JSON.parse(event.body ?? "{}");
  if (!songId) return { statusCode: 400 };
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  if (review) {
    await runEnrichmentReview(admin, songId, review);
    return { statusCode: 200 };
  }
  try {
    const { decision, usage } = await enrichSong(admin, songId, { spotifyReleaseYear });
    console.log(`[enrich-song] ${songId}: ${Object.keys(decision).join(", ") || "nothing new"} | usage ${JSON.stringify(usage)}`);
  } catch (e) {
    console.error(`[enrich-song] ${songId} failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { statusCode: 200 };
};
