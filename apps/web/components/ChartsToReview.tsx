import { canReviewChart, fetchAllRows } from "@singjam/core";
import { supabaseServer } from "@/lib/supabase/server";
import { getServerUserRole } from "@/lib/supabase/cached";
import ChartReviewQueue, { type QueueComment, type QueueRow } from "@/components/ChartReviewQueue";

type Person = { display_name: string | null; last_name: string | null; username: string | null } | null;
type Submission = {
  id: string;
  url: string;
  created_at: string;
  submitted_by: string | null;
  songs: { id: string; title: string; slug: string | null; display_artist: string | null; chord_chart_url: string | null } | null;
  profiles: Person;
};
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

// Every chart anyone added (or reported) that a song editor hasn't checked yet.
export default async function ChartsToReview({ basePath }: { basePath: string }) {
  const supabase = await supabaseServer();
  const [{ data: { user } }, role, submissions] = await Promise.all([
    supabase.auth.getUser(),
    getServerUserRole(),
    fetchAllRows<Submission>((from, to) =>
      supabase
        .from("chord_chart_submissions")
        .select("id, url, created_at, submitted_by, songs(id, title, slug, display_artist, chord_chart_url), profiles!submitted_by(display_name, last_name, username)")
        .eq("status", "pending")
        .order("created_at")
        .order("id")
        .range(from, to) as any,
    ),
  ]);

  // The whole discussion for each song in the queue, across all its charts, so
  // earlier rejections and their reasons are in view.
  const songIds = [...new Set(submissions.map((r) => r.songs?.id).filter((id): id is string => !!id))];
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

  const rows: QueueRow[] = submissions.map((r) => {
    const song = r.songs;
    const thread = song ? bySong.get(song.id) ?? [] : [];
    const report = thread.filter((c) => c.submission_id === r.id && c.kind === "report").at(-1);
    return {
      id: r.id,
      url: r.url,
      createdAt: r.created_at,
      songTitle: song?.title ?? "Unknown song",
      songHref: `${basePath}/${song?.slug ?? song?.id}`,
      artist: song?.display_artist ?? null,
      currentChartUrl: song?.chord_chart_url ?? null,
      adder: personName(r.profiles),
      reportedAt: report?.created_at ?? null,
      reportedBy: report ? personName(report.profiles) : null,
      canReview: !!user && canReviewChart({ id: user.id, role }, r.submitted_by),
      thread: thread.map(
        (c): QueueComment => ({
          id: c.id,
          kind: c.kind,
          body: c.body,
          createdAt: c.created_at,
          author: personName(c.profiles),
          otherChartUrl: c.submission_id === r.id ? null : c.chord_chart_submissions.url,
        }),
      ),
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Charts to review{rows.length > 0 && <span className="text-slate-400"> · {rows.length.toLocaleString()}</span>}
        </h1>
        <p className="text-sm text-slate-500">
          Open each chart and check it&apos;s the right song and a usable arrangement. Song editors can&apos;t review a chart they added; admins can.
        </p>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-400">Nothing to review.</div>
      ) : (
        <ChartReviewQueue rows={rows} />
      )}
    </div>
  );
}
