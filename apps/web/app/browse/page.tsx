import Link from "next/link";
import { loadBrowseHub, type BrowseChip } from "@singjam/core";
import { supabaseAnon } from "@/lib/supabase/anon";

export const revalidate = 3600;

export const metadata = {
  title: "Browse songs",
  description: "Browse SingJam's songs by genre, form, occasion, community, culture, language, theme, songwriter, recording artist and show.",
};

type Chip = BrowseChip;

function ChipCloud({ chips }: { chips: Chip[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <Link key={c.href} href={c.href} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 hover:border-amber-300 hover:text-amber-700">
          {c.label} <span className="tabular-nums text-slate-400">{c.count}</span>
        </Link>
      ))}
    </div>
  );
}

export default async function BrowseHub() {
  const { sections, writers, artists: recording, shows } = await loadBrowseHub(supabaseAnon());

  return (
    <div className="space-y-8 pb-16">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Browse songs</h1>
        <p className="text-sm text-slate-500">Numbers are songs on SingJam. A genre or occasion includes the kinds within it.</p>
      </div>
      {sections.map((s) => (
        <section key={s.type} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{s.title}</h2>
          <ChipCloud chips={s.chips} />
        </section>
      ))}
      {writers.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Songwriters</h2>
          <ChipCloud chips={writers} />
        </section>
      )}
      {recording.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recording artists</h2>
          <ChipCloud chips={recording} />
        </section>
      )}
      {shows.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shows</h2>
          {shows.map((g) => (
            <div key={g.medium} className="space-y-1.5">
              <h3 className="text-sm text-slate-600">{g.label}</h3>
              <ChipCloud chips={g.chips} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
