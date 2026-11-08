import { loadBrowseHub } from "@singjam/core";
import { supabaseAnon } from "@/lib/supabase/anon";
import ChipSection from "@/components/browse/ChipSection";

export const revalidate = 3600;

export const metadata = {
  title: "Browse songs",
  description: "Browse SingJam's songs by genre, form, occasion, community, culture, language, theme, songwriter, recording artist and show.",
};

export default async function BrowseHub() {
  const hub = await loadBrowseHub(supabaseAnon());
  return (
    <div className="space-y-8 pb-16">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Browse songs</h1>
        <p className="text-sm text-slate-500">Numbers are songs on SingJam. A genre or occasion includes the kinds within it.</p>
      </div>
      {hub.sections.map((s) => <ChipSection key={s.type} title={s.title} chips={s.chips} all={s.all} />)}
      {hub.writers.length > 0 && (
        <ChipSection title="Songwriters" chips={hub.writers} more={{ href: "/people", label: `See all ${hub.writerTotal} songwriters` }} />
      )}
      {hub.artists.length > 0 && (
        <ChipSection title="Recording artists" chips={hub.artists} more={{ href: "/artists", label: `See all ${hub.artistTotal} recording artists` }} />
      )}
      {hub.shows.map((g) => <ChipSection key={g.medium} title={`Shows · ${g.label}`} chips={g.chips} />)}
    </div>
  );
}
