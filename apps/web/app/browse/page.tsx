import { loadBrowseHub } from "@singjam/core";
import { supabaseAnon } from "@/lib/supabase/anon";
import BrowseHubSections from "@/components/browse/BrowseHubSections";

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
      <BrowseHubSections hub={hub} />
    </div>
  );
}
