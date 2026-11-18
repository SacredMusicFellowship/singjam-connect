import type { SupabaseClient } from "@supabase/supabase-js";
import { canReviewChart, isUltimateGuitarChartUrl, newChartGoesLive, type ChartReviewer } from "@singjam/core";

export class ChartError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// Every write is checked: a failure part-way must not report success.
async function must<T extends { error: { message: string } | null }>(query: PromiseLike<T>): Promise<T> {
  const result = await query;
  if (result.error) throw new ChartError(result.error.message, 500);
  return result;
}

async function loadSong(db: SupabaseClient, songId: string) {
  const { data } = await must(db.from("songs").select("id, chord_chart_url, chord_chart_pending").eq("id", songId).maybeSingle());
  if (!data) throw new ChartError("Song not found", 404);
  return data as { id: string; chord_chart_url: string | null; chord_chart_pending: boolean };
}

export type ChartCommentKind = "comment" | "report" | "approve" | "reject" | "replace";

// Comments are for the people who review charts; reports arrive here too.
export async function addChartComment(db: SupabaseClient, submissionId: string, authorId: string | null, kind: ChartCommentKind, rawBody: string) {
  const body = rawBody.trim();
  if (!body) throw new ChartError("Write a comment first.", 400);
  if (body.length > 1000) throw new ChartError("Comments can be up to 1,000 characters.", 400);
  await must(db.from("chord_chart_comments").insert({ submission_id: submissionId, author_id: authorId, kind, body }));
}

export async function commentOnChart(db: SupabaseClient, submissionId: string, authorId: string, body: string) {
  const { data: sub } = await must(db.from("chord_chart_submissions").select("id").eq("id", submissionId).maybeSingle());
  if (!sub) throw new ChartError("Submission not found", 404);
  await addChartComment(db, submissionId, authorId, "comment", body);
}

function setLive(db: SupabaseClient, songId: string, url: string | null, pending: boolean) {
  return must(db.from("songs").update({ chord_chart_url: url, chord_chart_pending: pending }).eq("id", songId));
}

// Anyone signed in. Goes live as "unreviewed" unless the song already has an
// approved chart, in which case it waits for a reviewer.
export async function submitChart(db: SupabaseClient, songId: string, rawUrl: string, userId: string) {
  const url = rawUrl.trim();
  if (!isUltimateGuitarChartUrl(url)) throw new ChartError("Chord charts need to be an Ultimate Guitar tab link.", 400);
  const song = await loadSong(db, songId);
  const live = newChartGoesLive(song);
  await must(db.from("chord_chart_submissions").insert({ song_id: songId, url, submitted_by: userId }));
  if (live) await setLive(db, songId, url, true);
  return { live };
}

// A song editor setting the chart in the song editor: it counts as approved by them.
// An empty url takes the chart down.
export async function setChartAsEditor(db: SupabaseClient, songId: string, rawUrl: string, editorId: string) {
  const url = rawUrl.trim();
  const song = await loadSong(db, songId);
  if (!url) {
    if (song.chord_chart_url || song.chord_chart_pending) await setLive(db, songId, null, false);
    return;
  }
  if (!isUltimateGuitarChartUrl(url)) throw new ChartError("Chord charts need to be an Ultimate Guitar tab link.", 400);
  if (url === song.chord_chart_url && !song.chord_chart_pending) return;

  const reviewed = { status: "approved", reviewed_by: editorId, reviewed_at: new Date().toISOString() };
  const { data: waiting } = await must(
    db.from("chord_chart_submissions").select("id").eq("song_id", songId).eq("url", url).eq("status", "pending").limit(1).maybeSingle(),
  );
  if (waiting) {
    await must(db.from("chord_chart_submissions").update(reviewed).eq("id", waiting.id));
  } else {
    await must(db.from("chord_chart_submissions").insert({ song_id: songId, url, submitted_by: editorId, ...reviewed }));
  }
  await setLive(db, songId, url, false);
}

// What the song shows after its live chart is rejected: the newest approved chart,
// or failing that the newest one still waiting (live as unreviewed, as when added).
async function fallBack(db: SupabaseClient, songId: string, excludeId: string) {
  const { data: approved } = await must(
    db.from("chord_chart_submissions")
      .select("url")
      .eq("song_id", songId)
      .eq("status", "approved")
      .neq("id", excludeId)
      .order("reviewed_at", { ascending: false })
      .order("id")
      .limit(1)
      .maybeSingle(),
  );
  if (approved) return setLive(db, songId, approved.url, false);
  const { data: waiting } = await must(
    db.from("chord_chart_submissions")
      .select("url")
      .eq("song_id", songId)
      .eq("status", "pending")
      .neq("id", excludeId)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(1)
      .maybeSingle(),
  );
  return setLive(db, songId, waiting?.url ?? null, !!waiting);
}

export async function reviewChart(
  db: SupabaseClient,
  submissionId: string,
  reviewer: ChartReviewer,
  action: "approve" | "reject" | "replace",
  replacementUrl?: string,
  reason?: string,
) {
  const { data: sub } = await must(
    db.from("chord_chart_submissions").select("id, song_id, url, submitted_by, status").eq("id", submissionId).maybeSingle(),
  );
  if (!sub) throw new ChartError("Submission not found", 404);
  if (!canReviewChart(reviewer, sub.submitted_by)) throw new ChartError("Someone other than the person who added this chart needs to review it.", 403);
  if (action === "replace" && !isUltimateGuitarChartUrl(replacementUrl ?? "")) {
    throw new ChartError("Chord charts need to be an Ultimate Guitar tab link.", 400);
  }
  const reviewedAt = new Date().toISOString();
  const song = await loadSong(db, sub.song_id);
  if (reason?.trim()) await addChartComment(db, sub.id, reviewer.id, action, reason);

  if (action === "approve") {
    await must(db.from("chord_chart_submissions").update({ status: "approved", reviewed_by: reviewer.id, reviewed_at: reviewedAt }).eq("id", sub.id));
    await setLive(db, sub.song_id, sub.url, false);
    return;
  }

  await must(db.from("chord_chart_submissions").update({ status: "rejected", reviewed_by: reviewer.id, reviewed_at: reviewedAt }).eq("id", sub.id));

  // A reviewer's replacement is itself unreviewed, so someone else checks it.
  if (action === "replace") {
    const url = replacementUrl!.trim();
    await must(db.from("chord_chart_submissions").insert({ song_id: sub.song_id, url, submitted_by: reviewer.id }));
    await setLive(db, sub.song_id, url, true);
    return;
  }

  if (song.chord_chart_url === sub.url) await fallBack(db, sub.song_id, sub.id);
}

// Anyone signed in: puts the live chart back in the review queue, with their note as a report.
export async function reportChart(db: SupabaseClient, songId: string, note: string, reporterId: string) {
  const song = await loadSong(db, songId);
  if (!song.chord_chart_url) throw new ChartError("This song has no chord chart.", 400);
  const reason = (note.trim() || "Something's wrong with this chart").slice(0, 1000);
  const { data: current } = await must(
    db.from("chord_chart_submissions")
      .select("id")
      .eq("song_id", songId)
      .eq("url", song.chord_chart_url)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(1)
      .maybeSingle(),
  );
  let submissionId = current?.id as string | undefined;
  if (submissionId) {
    await must(db.from("chord_chart_submissions").update({ status: "pending", reviewed_by: null, reviewed_at: null }).eq("id", submissionId));
  } else {
    const { data: created } = await must(db.from("chord_chart_submissions").insert({ song_id: songId, url: song.chord_chart_url }).select("id").single());
    submissionId = (created as { id: string }).id;
  }
  await addChartComment(db, submissionId!, reporterId, "report", reason);
  await must(db.from("songs").update({ chord_chart_pending: true }).eq("id", songId));
}

// How many charts are waiting for review, counted directly rather than from the capped queue.
export async function pendingChartCount(db: SupabaseClient) {
  const { count } = await must(db.from("chord_chart_submissions").select("id", { count: "exact", head: true }).eq("status", "pending"));
  return count ?? 0;
}
