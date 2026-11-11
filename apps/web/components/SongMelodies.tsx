import Link from "next/link";
import { songRowText, type SongMelodyItem } from "@singjam/core";

const ROLE_LABEL: Record<string, string> = { lead: "Lead", support: "Support", learn: "Learn" };

// One of the song page's melody lists (song_melodies, migration 220): the same
// words to other tunes, or other songs sung to this tune.
export default function SongMelodies({ title, items }: { title: string; items: SongMelodyItem[] }) {
  if (!items.length) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <ul className="divide-y divide-slate-100">
        {items.map((it) => {
          const row = songRowText({
            title: it.title,
            byline: it.card?.byline,
            displayArtist: it.display_artist,
            composers: it.card?.composers ?? [],
            cultures: it.card?.cultures ?? [],
            recordingArtists: it.card?.recording_artists,
            identity: it.card?.card_identity,
          });
          return (
            <li key={it.song_id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-sm">
                  <Link href={`/songs/${it.slug ?? it.song_id}`} className="font-medium text-zinc-900 hover:text-amber-700 hover:underline">
                    {it.title}
                  </Link>
                  {row.writers && <span className="ml-1 text-zinc-400">({row.writers})</span>}
                </div>
                {row.line && <div className="truncate text-xs text-zinc-500">{row.line}</div>}
              </div>
              {it.viewer_confidence && (
                <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                  {ROLE_LABEL[it.viewer_confidence] ?? it.viewer_confidence}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
