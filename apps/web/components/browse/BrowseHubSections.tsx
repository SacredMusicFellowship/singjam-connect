"use client";

import { useState } from "react";
import { sortBrowseHub, type BrowseHub, type BrowseHubOrder } from "@singjam/core";
import ChipSection from "@/components/browse/ChipSection";

const ORDERS: { value: BrowseHubOrder; label: string }[] = [
  { value: "count", label: "Most songs" },
  { value: "az", label: "A–Z" },
];

export default function BrowseHubSections({ hub: loaded }: { hub: BrowseHub }) {
  const [order, setOrder] = useState<BrowseHubOrder>("count");
  const hub = sortBrowseHub(loaded, order);
  return (
    <>
      <div className="flex items-center gap-1.5" role="group" aria-label="Sort">
        {ORDERS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setOrder(o.value)}
            aria-pressed={order === o.value}
            className={`rounded-full border px-3 py-1 text-sm ${order === o.value ? "border-amber-500 bg-amber-500 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-amber-300"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hub.sections.map((s) => (
        <ChipSection
          key={s.type}
          title={s.title}
          chips={s.chips}
          all={s.all}
          more={s.type === "culture" ? { href: "/people/traditional", label: "Traditional songs from every culture" } : undefined}
        />
      ))}
      {hub.writers.length > 0 && (
        <ChipSection title="Songwriters" chips={hub.writers} more={{ href: "/people", label: `See all ${hub.writerTotal} songwriters` }} />
      )}
      {hub.artists.length > 0 && (
        <ChipSection title="Recording artists" chips={hub.artists} more={{ href: "/artists", label: `See all ${hub.artistTotal} recording artists` }} />
      )}
      {hub.shows.map((g) => <ChipSection key={g.medium} title={`Shows · ${g.label}`} chips={g.chips} />)}
    </>
  );
}
