import Link from "next/link";
import { fetchAllRows } from "@singjam/core";
import { getServerSupabase } from "@/lib/supabase/cached";
import CreateCatalogRow from "@/components/catalog/CreateCatalogRow";

// Tunes: melodies, or a mode to sing in (migration 208). Most have no name and
// are known by composer or community (tune_label).
export default async function TunesPage() {
  const supabase = await getServerSupabase();
  const tunes = await fetchAllRows<any>((f, t) =>
    supabase.from("tunes").select("id, slug, name, meter, fixed_melody, tune_label, songs(count)").order("id").range(f, t)
  );
  tunes.sort((a, b) => String(a.tune_label).localeCompare(String(b.tune_label)));
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Tunes</h1>
        <p className="text-sm text-slate-500">Melodies, named or not, and modes (a raga or maqam) for songs with no fixed tune. Known by name, else composer, else community.</p>
      </div>
      <CreateCatalogRow table="tunes" label="New tune" placeholder="Name if it has one, e.g. Nettleton (optional)" />
      <ul className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
        {tunes.length === 0 && <li className="px-4 py-6 text-center text-sm text-zinc-400">No tunes yet.</li>}
        {tunes.map((t) => (
          <li key={t.id}>
            <Link href={`/song-editor/tunes/${t.slug}`} className="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-amber-50/40">
              <span>
                <span className="font-medium text-zinc-900">{t.tune_label}</span>
                <span className="ml-2 text-sm text-zinc-500">{[t.meter, t.fixed_melody ? null : "mode only"].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="text-xs text-zinc-400">{t.songs?.[0]?.count ?? 0} songs</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
