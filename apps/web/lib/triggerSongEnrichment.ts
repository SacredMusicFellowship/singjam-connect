import { createClient } from "@supabase/supabase-js";
import { enrichSong } from "./songEnrichment";

// Deployed builds hand the work to the background function (15-minute limit) —
// work started in-process would be frozen once the response is sent. Netlify's
// build-time NETLIFY/URL variables aren't reliably set inside the Next.js
// handler at runtime, so this keys off the production build instead. Under
// `next dev` there's no function runtime, so the enrichment runs in-process.
export async function triggerSongEnrichment(songId: string, spotifyReleaseYear: number | null) {
  if (process.env.NODE_ENV === "production") {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://singjam.org";
    try {
      const res = await fetch(`${siteUrl}/.netlify/functions/enrich-song-background`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-enrich-secret": process.env.ENRICH_SECRET ?? "" },
        body: JSON.stringify({ songId, spotifyReleaseYear }),
      });
      if (res.status !== 202) console.error(`[enrich-song] trigger for ${songId} returned ${res.status}`);
    } catch (e) {
      console.error("[enrich-song] trigger failed:", e);
    }
    return;
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  void enrichSong(admin, songId, { spotifyReleaseYear }).catch((e) => console.error("[enrich-song] local run failed:", e));
}
