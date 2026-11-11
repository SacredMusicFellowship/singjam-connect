"use client";

import { useState } from "react";
import Link from "next/link";
import type { BrowseChip } from "@singjam/core";

const TOP_N = 24;

function Chip({ c }: { c: BrowseChip }) {
  return (
    <Link href={c.href} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 hover:border-amber-300 hover:text-amber-700">
      {c.label} <span className="tabular-nums text-slate-400">{c.count}</span>
    </Link>
  );
}

// One /browse section: its most-used entries, and everything on "Show all"
// (for genres, occasions and communities that adds the kinds within each).
export default function ChipSection({ title, chips, all, more, sub = false }: {
  title: string;
  // A group inside a section (a medium under Stage & screen).
  sub?: boolean;
  chips: BrowseChip[];
  all?: BrowseChip[];
  more?: { href: string; label: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const full = all ?? chips;
  const shown = expanded ? full : chips.slice(0, TOP_N);
  const canExpand = !expanded && full.length > shown.length;
  return (
    <section className="space-y-2">
      {sub ? <h3 className="text-sm text-slate-600">{title}</h3> : <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>}
      <div className="flex flex-wrap gap-1.5">
        {shown.map((c) => <Chip key={c.href} c={c} />)}
        {canExpand && (
          <button type="button" onClick={() => setExpanded(true)} className="rounded-full px-3 py-1 text-sm font-medium text-amber-600 hover:bg-amber-50">
            Show all {full.length}
          </button>
        )}
        {expanded && full.length > TOP_N && (
          <button type="button" onClick={() => setExpanded(false)} className="rounded-full px-3 py-1 text-sm font-medium text-amber-600 hover:bg-amber-50">
            Show fewer
          </button>
        )}
        {more && (
          <Link href={more.href} className="rounded-full px-3 py-1 text-sm font-medium text-amber-600 hover:bg-amber-50">
            {more.label}
          </Link>
        )}
      </div>
    </section>
  );
}
