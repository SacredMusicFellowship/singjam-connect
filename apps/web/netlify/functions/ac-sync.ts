import { schedule } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { syncContact, ContactProfile } from "../../lib/activecampaign";
import { fetchAllAuthUsers } from "../../lib/authUsers";
import { fetchAllRows } from "@singjam/core";

export const handler = schedule("0 3 * * *", async () => {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const [users, profilesResult] = await Promise.all([
    fetchAllAuthUsers(admin.auth.admin),
    fetchAllRows<Record<string, unknown> & { id: string }>((from, to) =>
      admin
        .from("profiles")
        .select("id,display_name,last_name,neighborhood,instrument_levels,favorite_genres,singing_voice")
        .order("id")
        .range(from, to) as any
    ),
  ]);

  const profileById = new Map(profilesResult.map((p) => [p.id, p]));

  let synced = 0;
  let failed = 0;

  for (const user of users) {
    if (!user.email) continue;
    const p = profileById.get(user.id) ?? {} as Record<string, unknown>;
    const profile: ContactProfile = {
      firstName: (p.display_name as string) || undefined,
      lastName: (p.last_name as string) || undefined,
      neighborhood: (p.neighborhood as string) || undefined,
      singingVoice: (p.singing_voice as string)
        ? (p.singing_voice as string).split(",").map((s) => s.trim())
        : undefined,
      instrumentLevels: (p.instrument_levels as Record<string, string>) || undefined,
      favoriteGenres: (p.favorite_genres as string[]) || undefined,
    };
    const failures = await syncContact(user.email, profile);
    if (failures.length > 0) {
      failed++;
      console.error(`[ac-sync] failed for ${user.email}: ${failures.join(", ")}`);
    } else {
      synced++;
    }
  }

  console.log(`[ac-sync] done: ${synced} synced, ${failed} failed`);
  return { statusCode: 200 };
});
