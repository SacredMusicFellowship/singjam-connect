import Link from "next/link";
import { songMissingFields } from "@singjam/core";
import { supabaseServer } from "@/lib/supabase/server";
import { FormattedDate } from "@/components/FormattedTime";

const LIMIT = 50;

// Replaces the old review queue: new songs fill themselves in, so the job now is
// spotting what the automatic fill got wrong or couldn't find.
export default async function RecentlyAddedSongs({ basePath }: { basePath: string }) {
  const supabase = await supabaseServer();
  const { data: songs } = await supabase
    .from("songs")
    .select(`
      id, title, slug, display_artist, created_at, submitted_by,
      first_line, hook, genius_url, chord_chart_url, youtube_url, tonality, meter, vibe,
      song_composers(person_id), song_lyricists(person_id), song_recording_artists(youtube_url),
      song_tags(context, tags(name, type)),
      profiles!submitted_by(display_name, last_name, username)
    `)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(LIMIT);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Recently added</h1>
        <p className="text-sm text-slate-500">
          The {LIMIT} newest songs. Their details fill in automatically within about a minute — check for anything wrong, and add a chord chart.
        </p>
      </div>
      {!songs?.length ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-400">No songs yet.</div>
      ) : (
        <div className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {(songs as any[]).map((song) => {
            const p = song.profiles;
            const adder = p ? [p.display_name, p.last_name].filter(Boolean).join(" ") || p.username : null;
            const missing = songMissingFields(song);
            return (
              <div key={song.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/songs/${song.slug ?? song.id}`} className="block truncate text-sm font-medium text-zinc-900 hover:underline">
                    {song.title}
                  </Link>
                  {song.display_artist && <p className="mt-0.5 truncate text-xs text-zinc-500">{song.display_artist}</p>}
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Added <FormattedDate iso={song.created_at} options={{ month: "short", day: "numeric", year: "numeric" }} />
                    {" · "}
                    {song.submitted_by ? (
                      p?.username ? (
                        <Link href={`/u/${p.username}`} className="font-medium text-zinc-600 hover:underline">{adder}</Link>
                      ) : (
                        <span className="font-medium text-zinc-600">{adder ?? "Unknown user"}</span>
                      )
                    ) : (
                      "before tracking"
                    )}
                  </p>
                  {missing.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {missing.map((m) => (
                        <span key={m} className="rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs text-red-500">{m}</span>
                      ))}
                    </div>
                  )}
                </div>
                <Link
                  href={`${basePath}/${song.slug ?? song.id}`}
                  className="w-fit shrink-0 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
                >
                  Edit
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
