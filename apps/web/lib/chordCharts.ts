import type { SupabaseClient } from "@supabase/supabase-js";
import { canReviewChart, isUltimateGuitarChartUrl, newChartGoesLive, type ChartReviewer } from "@singjam/core";

export class ChartError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function loadSong(db: SupabaseClient, songId: string) {
  const { data } = await db.from("songs").select("id, chord_chart_url, chord_chart_pending").eq("id", songId).maybeSingle();
  if (!data) throw new ChartError("Song not found", 404);
  return data as { id: string; chord_chart_url: string | null; chord_chart_pending: boolean };
}

// Anyone signed in. Goes live as "unreviewed" unless the song already has an
// approved chart, in which case it waits for a reviewer.
export async function submitChart(db: SupabaseClient, songId: string, rawUrl: string, userId: string) {
  const url = rawUrl.trim();
  if (!isUltimateGuitarChartUrl(url)) throw new ChartError("Chord charts need to be an Ultimate Guitar tab link.", 400);
  const song = await loadSong(db, songId);
  const live = newChartGoesLive(song);
  const { error } = await db.from("chord_chart_submissions").insert({ song_id: songId, url, submitted_by: userId });
  if (error) throw new ChartError(error.message, 500);
  if (live) await db.from("songs").update({ chord_chart_url: url, chord_chart_pending: true }).eq("id", songId);
  return { live };
}

// The chart to fall back to when the live one is rejected: the newest approved one.
async function restoreLastApproved(db: SupabaseClient, songId: string, excludeId: string) {
  const { data } = await db
    .from("chord_chart_submissions")
    .select("url")
    .eq("song_id", songId)
    .eq("status", "approved")
    .neq("id", excludeId)
    .order("reviewed_at", { ascending: false })
    .order("id")
    .limit(1)
    .maybeSingle();
  await db.from("songs").update({ chord_chart_url: data?.url ?? null, chord_chart_pending: false }).eq("id", songId);
}

export async function reviewChart(
  db: SupabaseClient,
  submissionId: string,
  reviewer: ChartReviewer,
  action: "approve" | "reject" | "replace",
  replacementUrl?: string,
) {
  const { data: sub } = await db.from("chord_chart_submissions").select("id, song_id, url, submitted_by, status").eq("id", submissionId).maybeSingle();
  if (!sub) throw new ChartError("Submission not found", 404);
  if (!canReviewChart(reviewer, sub.submitted_by)) throw new ChartError("Someone other than the person who added this chart needs to review it.", 403);
  if (action === "replace" && !isUltimateGuitarChartUrl(replacementUrl ?? "")) {
    throw new ChartError("Chord charts need to be an Ultimate Guitar tab link.", 400);
  }
  const reviewedAt = new Date().toISOString();
  const song = await loadSong(db, sub.song_id);

  if (action === "approve") {
    await db.from("chord_chart_submissions").update({ status: "approved", reviewed_by: reviewer.id, reviewed_at: reviewedAt }).eq("id", sub.id);
    await db.from("songs").update({ chord_chart_url: sub.url, chord_chart_pending: false }).eq("id", sub.song_id);
    return;
  }

  await db.from("chord_chart_submissions").update({ status: "rejected", reviewed_by: reviewer.id, reviewed_at: reviewedAt }).eq("id", sub.id);
  if (song.chord_chart_url === sub.url) await restoreLastApproved(db, sub.song_id, sub.id);

  // A reviewer's replacement is itself unreviewed, so someone else checks it.
  if (action === "replace") {
    const url = replacementUrl!.trim();
    await db.from("chord_chart_submissions").insert({ song_id: sub.song_id, url, submitted_by: reviewer.id });
    await db.from("songs").update({ chord_chart_url: url, chord_chart_pending: true }).eq("id", sub.song_id);
  }
}

// Anyone signed in: puts the live chart back in the review queue with their note.
export async function reportChart(db: SupabaseClient, songId: string, note: string) {
  const song = await loadSong(db, songId);
  if (!song.chord_chart_url) throw new ChartError("This song has no chord chart.", 400);
  const reason = `Reported: ${note.trim() || "something's wrong with this chart"}`.slice(0, 500);
  const { data: current } = await db
    .from("chord_chart_submissions")
    .select("id")
    .eq("song_id", songId)
    .eq("url", song.chord_chart_url)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(1)
    .maybeSingle();
  if (current) {
    await db.from("chord_chart_submissions").update({ status: "pending", reviewed_by: null, reviewed_at: null, note: reason }).eq("id", current.id);
  } else {
    await db.from("chord_chart_submissions").insert({ song_id: songId, url: song.chord_chart_url, note: reason });
  }
  await db.from("songs").update({ chord_chart_pending: true }).eq("id", songId);
}
