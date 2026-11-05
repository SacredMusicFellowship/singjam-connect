import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase/server";
import Link from "next/link";
import type { JSX } from "react";
import ApproveButton from "./ApproveButton";

export const metadata: Metadata = {
  title: "Review Songs",
};
import { FormattedDate } from "@/components/FormattedTime";

export default async function ReviewSongsPage() {
  const supabase = await supabaseServer();

  const { data: songs } = await supabase
    .from("songs")
    .select("id, title, display_artist, slug, created_at, submitted_by, profiles!submitted_by(display_name, last_name, username)")
    .eq("needs_review", true)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Songs needing review</h1>

      {!songs || songs.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-400">
          No songs pending review.
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white overflow-hidden">
          {(songs as any[]).map((song) => {
            const submitter = song.profiles;
            const fullName = [submitter?.display_name, submitter?.last_name].filter(Boolean).join(" ");
            const username = submitter?.username;
            const submitterNode: JSX.Element = username ? (
              <Link href={`/u/${username}`} className="font-medium text-zinc-600 hover:underline">
                {fullName || username}{fullName && username ? ` (${username})` : ""}
              </Link>
            ) : (
              <span className="font-medium text-zinc-600">{fullName || "Unknown user"}</span>
            );

            return (
              <div key={song.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link href={`/songs/${song.slug}`} className="text-sm font-medium text-zinc-900 hover:underline truncate">
                      {song.title}
                    </Link>
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Needs review
                    </span>
                  </div>
                  {song.display_artist && (
                    <p className="text-xs text-zinc-500 mt-0.5">{song.display_artist}</p>
                  )}
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Submitted by {submitterNode} · <FormattedDate iso={song.created_at} options={{ month: "short", day: "numeric", year: "numeric" }} />
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/admin/songs/${song.id}`}
                    className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    Edit
                  </Link>
                  <ApproveButton songId={song.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
