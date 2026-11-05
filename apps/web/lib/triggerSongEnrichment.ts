import { createClient } from "@supabase/supabase-js";
import { enrichSong } from "./songEnrichment";

// On Netlify the enrichment runs in the background function; locally (next dev)
// there's no function runtime, so it runs in-process without blocking the response.
export async function triggerSongEnrichment(songId: string, spotifyReleaseYear: number | null) {
  const siteUrl = process.env.URL;
  if (process.env.NETLIFY && siteUrl) {
    await fetch(`${siteUrl}/.netlify/functions/enrich-song-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-enrich-secret": process.env.ENRICH_SECRET ?? "" },
      body: JSON.stringify({ songId, spotifyReleaseYear }),
    }).catch((e) => console.error("[enrich-song] trigger failed:", e));
    return;
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  void enrichSong(admin, songId, { spotifyReleaseYear }).catch((e) => console.error("[enrich-song] local run failed:", e));
}
