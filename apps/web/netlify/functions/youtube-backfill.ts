import { schedule } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { runYouTubeBackfill } from "../../lib/youtubeBackfill";

// Hourly at :17, 2 searches a run = at most 48 searches (4,800 of 10,000 quota units)
// a day, leaving room for add-song previews and set playlists.
export const handler = schedule("17 * * * *", async () => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error("[youtube-backfill] YOUTUBE_API_KEY is not set");
    return { statusCode: 200 };
  }
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  try {
    const result = await runYouTubeBackfill(admin, apiKey, { searchLimit: 2 });
    console.log(`[youtube-backfill] ${JSON.stringify(result)}`);
  } catch (e) {
    console.error(`[youtube-backfill] failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { statusCode: 200 };
});
