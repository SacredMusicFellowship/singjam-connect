"use client";

import { useState } from "react";
import { sortBrowseHub, type BrowseHub, type BrowseHubOrder } from "@singjam/core";
import ChipSection from "@/components/browse/ChipSection";
import OrderToggle, { COUNT_OR_AZ } from "@/components/OrderToggle";

export default function BrowseHubSections({ hub: loaded }: { hub: BrowseHub }) {
  const [order, setOrder] = useState<BrowseHubOrder>("count");
  const hub = sortBrowseHub(loaded, order);
  return (
    <>
      <OrderToggle value={order} onChange={setOrder} options={COUNT_OR_AZ} />
      {hub.sections.slice(0, 1).map((s) => <ChipSection key={s.type} title={s.title} chips={s.chips} all={s.all} />)}
      {hub.traditional.length > 0 && (
        <ChipSection title="Traditional songs" chips={hub.traditional} more={{ href: "/people/traditional", label: "All traditional songs" }} />
      )}
      {hub.sections.slice(1).map((s) => <ChipSection key={s.type} title={s.title} chips={s.chips} all={s.all} />)}
      {hub.scripture.length > 0 && <ChipSection title="Scripture" chips={hub.scripture} />}
      {hub.shows.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stage &amp; screen</h2>
          {hub.shows.map((g) => <ChipSection key={g.medium} sub title={g.label} chips={g.chips} />)}
        </section>
      )}
      {hub.writers.length > 0 && (
        <ChipSection title="Songwriters" chips={hub.writers} more={{ href: "/people", label: `See all ${hub.writerTotal} songwriters` }} />
      )}
      {hub.artists.length > 0 && (
        <ChipSection title="Recording artists" chips={hub.artists} more={{ href: "/artists", label: `See all ${hub.artistTotal} recording artists` }} />
      )}
    </>
  );
}
