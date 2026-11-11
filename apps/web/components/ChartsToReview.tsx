import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { FormattedDate } from "@/components/FormattedTime";
import ChartReviewActions from "@/components/ChartReviewActions";

// Charts anyone added (or reported) that a song editor hasn't checked yet.
// Bounded: the queue is worked from the oldest end; anything past the first 100
// shows up once those are done.
export default async function ChartsToReview({ basePath }: { basePath: string }) {
  const supabase = await supabaseServer();
  const [{ data: { user } }, { data: rows }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("chord_chart_submissions")
      .select("id, url, created_at, note, submitted_by, songs(id, title, slug, display_artist, chord_chart_url), profiles!submitted_by(display_name, last_name, username)")
      .eq("status", "pending")
      .order("created_at")
      .order("id")
      .limit(100),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Charts to review</h1>
        <p className="text-sm text-slate-500">
          Open each chart and check it&apos;s the right song and a usable arrangement. You can&apos;t review a chart you added.
        </p>
      </div>
      {!rows?.length ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-400">Nothing to review.</div>
      ) : (
        <div className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {(rows as any[]).map((r) => {
            const p = r.profiles;
            const adder = p ? [p.display_name, p.last_name].filter(Boolean).join(" ") || p.username : null;
            const song = r.songs;
            const isLive = song?.chord_chart_url === r.url;
            return (
              <div key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <Link href={`${basePath}/${song?.slug ?? song?.id}`} className="block truncate text-sm font-medium text-zinc-900 hover:underline">
                    {song?.title ?? "Unknown song"}
                  </Link>
                  {song?.display_artist && <p className="truncate text-xs text-zinc-500">{song.display_artist}</p>}
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-amber-600 hover:underline">
                    Open chart ↗
                  </a>
                  <p className="text-xs text-zinc-400">
                    {adder ? `Added by ${adder}` : "Existing chart"} · <FormattedDate iso={r.created_at} options={{ month: "short", day: "numeric", year: "numeric" }} />
                    {isLive ? " · showing on the song now" : " · waiting to replace the current chart"}
                  </p>
                  {r.note && <p className="text-xs text-zinc-600">{r.note}</p>}
                </div>
                <ChartReviewActions submissionId={r.id} ownSubmission={!!user && r.submitted_by === user.id} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
