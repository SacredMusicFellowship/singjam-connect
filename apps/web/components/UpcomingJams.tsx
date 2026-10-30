import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { summarizeTicketTiers, type JamTicketSummary, type JamTicketTier } from "@singjam/core";
import JamEventCard, { type JamEventCardData } from "@/components/JamEventCard";
import UpcomingJamsCta from "@/components/UpcomingJamsCta";

const getUpcomingJams = unstable_cache(
  async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase
      .from("jams")
      .select("id, short_code, name, starts_at, ends_at, timezone, neighborhood, tickets_url, image_url")
      .eq("visibility", "official")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(3);
    const jams = data ?? [];

    // One call for the whole teaser rather than per-tier availability lookups.
    const { data: tiers } = jams.length
      ? await supabase.rpc("jam_ticket_tiers", { jam_ids: jams.map((j) => j.id) })
      : { data: [] };

    // Folded here rather than at render time so the summaries ride the same
    // 60s cache as the jams and the page does no work per request.
    const summaries = Array.from(summarizeTicketTiers(tiers as JamTicketTier[] | null).values());
    return { jams, summaries };
  },
  ["upcoming-jams"],
  { revalidate: 60, tags: ["upcoming-jams"] }
);

export function UpcomingJamsSkeleton() {
  return (
    <section className="space-y-3">
      <div className="h-3.5 w-32 animate-pulse rounded bg-zinc-200" />
      <div className="grid gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="flex overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="shrink-0 w-20 animate-pulse bg-zinc-100 border-r border-zinc-100 py-10" />
            <div className="flex-1 p-4 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-200" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function UpcomingJams() {
  const { jams, summaries } = await getUpcomingJams();
  const summaryByJam = new Map((summaries as JamTicketSummary[]).map((s) => [s.jam_id, s]));

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-zinc-700">Upcoming events</h2>
      {jams.length === 0 ? (
        <div className="flex overflow-hidden rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50">
          <div className="shrink-0 w-20 flex items-center justify-center border-r border-dashed border-zinc-300 px-2 py-4">
            <svg className="w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <div className="flex-1 min-w-0 p-4">
            <p className="font-semibold text-zinc-500">More events coming soon!</p>
            <p className="text-xs text-zinc-400 mt-0.5">We&apos;ll post here as soon as the next one&apos;s announced.</p>
            <UpcomingJamsCta />
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {jams.map((jam) => (
            <JamEventCard
              key={jam.id}
              jam={jam as JamEventCardData}
              ticketSummary={summaryByJam.get(jam.id) ?? null}
            />
          ))}
        </div>
      )}
    </section>
  );
}
