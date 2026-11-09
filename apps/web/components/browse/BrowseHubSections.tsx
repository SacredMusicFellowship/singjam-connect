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
