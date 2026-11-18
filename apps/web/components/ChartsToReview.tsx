import Link from "next/link";
import { canReviewChart, fetchAllRows } from "@singjam/core";
import { supabaseServer } from "@/lib/supabase/server";
import { getServerUserRole } from "@/lib/supabase/cached";
import { FormattedDate } from "@/components/FormattedTime";
import ChartReviewActions from "@/components/ChartReviewActions";

type Person = { display_name: string | null; last_name: string | null; username: string | null } | null;
type Comment = {
  id: string;
  kind: string;
  body: string;
  created_at: string;
  submission_id: string;
  chord_chart_submissions: { song_id: string; url: string };
  profiles: Person;
};

const personName = (p: Person) => (p ? [p.display_name, p.last_name].filter(Boolean).join(" ") || p.username : null);

const KIND_LABEL: Record<string, string> = {
  report: "Reported",
  approve: "Approved",
  reject: "Rejected",
  replace: "Replaced",
};

// Charts anyone added (or reported) that a song editor hasn't checked yet.
// Bounded: the queue is worked from the oldest end; anything past the first 100
// shows up once those are done.
export default async function ChartsToReview({ basePath }: { basePath: string }) {
  const supabase = await supabaseServer();
  const [{ data: { user } }, role, { data: rows }] = await Promise.all([
    supabase.auth.getUser(),
    getServerUserRole(),
    supabase
      .from("chord_chart_submissions")
      .select("id, url, created_at, submitted_by, songs(id, title, slug, display_artist, chord_chart_url), profiles!submitted_by(display_name, last_name, username)")
      .eq("status", "pending")
      .order("created_at")
      .order("id")
      .limit(100),
  ]);

  // The whole discussion for each song in the queue, across all its charts, so
  // earlier rejections and their reasons are in view.
  const songIds = [...new Set((rows ?? []).map((r: any) => r.songs?.id).filter(Boolean))];
  const comments = songIds.length
    ? await fetchAllRows<Comment>((from, to) =>
        supabase
          .from("chord_chart_comments")
          .select("id, kind, body, created_at, submission_id, chord_chart_submissions!inner(song_id, url), profiles!author_id(display_name, last_name, username)")
          .in("chord_chart_submissions.song_id", songIds)
          .order("created_at")
          .order("id")
          .range(from, to) as any,
      )
    : [];
  const bySong = new Map<string, Comment[]>();
  for (const c of comments) {
    const list = bySong.get(c.chord_chart_submissions.song_id) ?? [];
    list.push(c);
    bySong.set(c.chord_chart_submissions.song_id, list);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Charts to review</h1>
        <p className="text-sm text-slate-500">
          Open each chart and check it&apos;s the right song and a usable arrangement. Song editors can&apos;t review a chart they added; admins can.
        </p>
      </div>
      {!rows?.length ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-400">Nothing to review.</div>
      ) : (
        <div className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {(rows as any[]).map((r) => {
            const adder = personName(r.profiles);
            const song = r.songs;
            const isLive = song?.chord_chart_url === r.url;
            const thread = bySong.get(song?.id) ?? [];
            const report = thread.filter((c) => c.submission_id === r.id && c.kind === "report").at(-1);
            return (
              <div key={r.id} className="space-y-3 px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
                    {report && (
                      <p className="text-xs font-medium text-red-600">
                        Reported{personName(report.profiles) ? ` by ${personName(report.profiles)}` : ""} · <FormattedDate iso={report.created_at} options={{ month: "short", day: "numeric", year: "numeric" }} />
                      </p>
                    )}
                  </div>
                  <ChartReviewActions submissionId={r.id} canReview={!!user && canReviewChart({ id: user.id, role }, r.submitted_by)} />
                </div>
                {thread.length > 0 && (
                  <ul className="space-y-2 rounded-xl bg-zinc-50 px-3 py-2.5">
                    {thread.map((c) => {
                      const who = personName(c.profiles);
                      const label = KIND_LABEL[c.kind];
                      return (
                        <li key={c.id} className="text-xs">
                          <p className="text-zinc-400">
                            {[who, label].filter(Boolean).join(" · ")}
                            {(who || label) && " · "}
                            <FormattedDate iso={c.created_at} options={{ month: "short", day: "numeric", year: "numeric" }} />
                            {c.submission_id !== r.id && (
                              <>
                                {" · "}
                                <a href={c.chord_chart_submissions.url} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:underline">
                                  another chart ↗
                                </a>
                              </>
                            )}
                          </p>
                          <p className="whitespace-pre-wrap text-zinc-700">{c.body}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
