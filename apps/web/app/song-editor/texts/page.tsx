import Link from "next/link";
import { fetchAllRows, formatScriptureRef } from "@singjam/core";
import { getServerSupabase } from "@/lib/supabase/cached";
import CreateCatalogRow from "@/components/catalog/CreateCatalogRow";

// Texts: words a song sings, which can be set to several tunes (migration 208).
export default async function TextsPage() {
  const supabase = await getServerSupabase();
  const texts = await fetchAllRows<any>((f, t) =>
    supabase.from("texts").select("id, slug, title, kind, text_sources(book, chapter_start, verse_start, verse_end, chapter_end, citation), songs(count)").order("title").order("id").range(f, t)
  );
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Texts</h1>
        <p className="text-sm text-slate-500">Words that can be sung to more than one tune: hymns, psalms, liturgy, poems. A song links one text to one tune.</p>
      </div>
      <CreateCatalogRow table="texts" label="New text" placeholder="Title, e.g. Lecha Dodi" />
      <ul className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
        {texts.length === 0 && <li className="px-4 py-6 text-center text-sm text-zinc-400">No texts yet.</li>}
        {texts.map((t) => (
          <li key={t.id}>
            <Link href={`/song-editor/texts/${t.slug}`} className="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-amber-50/40">
              <span>
                <span className="font-medium text-zinc-900">{t.title}</span>
                <span className="ml-2 text-sm text-zinc-500">
                  {[t.kind, ...(t.text_sources ?? []).map(formatScriptureRef)].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="text-xs text-zinc-400">{t.songs?.[0]?.count ?? 0} songs</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
