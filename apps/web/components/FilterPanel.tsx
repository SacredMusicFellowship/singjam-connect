"use client";

import { useEffect, useMemo, useState } from "react";
import Select from "@/components/Select";
import { MULTI_FILTER_DIMS, rootFacets, type FacetOption, type MultiFilterDim, type TagHierarchy } from "@singjam/core";
import type { SongFilters } from "@/hooks/useSongFilters";

export const FILTER_DIM_LABEL: Record<MultiFilterDim, string> = {
  genres: "Genre",
  forms: "Form",
  occasions: "Occasion",
  communities: "Community",
  cultures: "Culture",
  languages: "Language",
  themes: "Theme",
};

const TOP_N = 8;

// The filter panel for /search and /repertoire. Each tag section shows its
// most-used options with song counts, nests sub-tags under their parents, and
// can show all; one search box finds a filter in any section.
export function FilterPanel({ filters, hierarchy }: { filters: SongFilters; hierarchy: TagHierarchy | null }) {
  const { facets, selectedTags, toggleTag, filterOptions, activeFilterCount, clearFilters } = filters;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<MultiFilterDim>>(() => new Set(["genres"]));

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return MULTI_FILTER_DIMS.flatMap((dim) =>
      facets[dim].filter((o) => o.value.toLowerCase().includes(q)).map((o) => ({ dim, ...o }))
    )
      .sort((a, b) => Number(!a.value.toLowerCase().startsWith(q)) - Number(!b.value.toLowerCase().startsWith(q)) || b.count - a.count)
      .slice(0, 12);
  }, [query, facets]);

  const toggleOpen = (dim: MultiFilterDim) =>
    setOpen((prev) => { const next = new Set(prev); next.has(dim) ? next.delete(dim) : next.add(dim); return next; });

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
      <div className="space-y-2">
        <input
          id="filter-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a filter: genre, occasion, community…"
          className="w-full rounded-xl border border-zinc-300 px-3 py-1.5 text-sm focus:border-amber-400 focus:outline-none"
        />
        {query.trim() && (
          <div className="flex flex-wrap gap-1.5">
            {matches.length === 0 ? (
              <span className="text-xs text-zinc-400">No filter matches &ldquo;{query.trim()}&rdquo; in these songs.</span>
            ) : (
              matches.map((m) => (
                <Pill
                  key={`${m.dim}:${m.value}`}
                  label={m.value}
                  sublabel={FILTER_DIM_LABEL[m.dim]}
                  count={m.count}
                  selected={selectedTags[m.dim].has(m.value)}
                  onClick={() => { toggleTag(m.dim, m.value); setQuery(""); }}
                />
              ))
            )}
          </div>
        )}
      </div>

      <div className="divide-y divide-zinc-100">
        {MULTI_FILTER_DIMS.map((dim) =>
          facets[dim].length > 0 ? (
            <TagSection
              key={dim}
              dim={dim}
              options={facets[dim]}
              hierarchy={hierarchy}
              childMap={hierarchy?.[dim]?.children}
              selected={selectedTags[dim]}
              onToggle={(v) => toggleTag(dim, v)}
              open={open.has(dim)}
              onToggleOpen={() => toggleOpen(dim)}
            />
          ) : null
        )}
      </div>

      <div className="flex flex-wrap gap-3 pt-1">
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500 uppercase tracking-wide">Year</label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={filters.yearMin}
              onChange={(e) => filters.setYearMin(e.target.value)}
              placeholder={filters.yearBounds ? String(filters.yearBounds.min) : "From"}
              className="w-full rounded-xl border border-zinc-300 px-2 py-1.5 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-xs text-zinc-400 shrink-0">–</span>
            <input
              type="number"
              value={filters.yearMax}
              onChange={(e) => filters.setYearMax(e.target.value)}
              placeholder={String(new Date().getFullYear())}
              className="w-full rounded-xl border border-zinc-300 px-2 py-1.5 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
        </div>
        <ScalarSelect label="Vibe" value={filters.selectedVibe} onChange={filters.setSelectedVibe} options={filterOptions.vibes} />
        <ScalarSelect label="Tonality" value={filters.selectedTonality} onChange={filters.setSelectedTonality} options={filterOptions.tonalities} />
        <ScalarSelect label="Meter" value={filters.selectedMeter} onChange={filters.setSelectedMeter} options={filterOptions.meters} />
      </div>

      {activeFilterCount > 0 && (
        <button
          onClick={clearFilters}
          className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
        >
          ✕ Clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}

function TagSection({ dim, options, hierarchy, childMap, selected, onToggle, open, onToggleOpen }: {
  dim: MultiFilterDim;
  options: FacetOption[];
  hierarchy: TagHierarchy | null;
  childMap: Map<string, string[]> | undefined;
  selected: Set<string>;
  onToggle: (v: string) => void;
  open: boolean;
  onToggleOpen: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const roots = useMemo(() => rootFacets(options, dim, hierarchy), [options, dim, hierarchy]);
  const childOptions = (value: string) => (childMap?.get(value) ?? []).map((c) => byValue.get(c)).filter((o): o is FacetOption => !!o)
    .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : 1));
  const shownRoots = showAll ? roots : roots.filter((o, i) => i < TOP_N || selected.has(o.value));
  const hidden = roots.length - shownRoots.length;

  function renderOption(o: FacetOption, depth: number): React.ReactNode {
    const kids = childOptions(o.value);
    const isOpen = expanded.has(o.value) || kids.some((k) => selected.has(k.value));
    return (
      <div key={`${depth}:${o.value}`} className="contents">
        <span className="inline-flex items-center">
          <Pill label={o.value} count={o.count} selected={selected.has(o.value)} onClick={() => onToggle(o.value)} />
          {kids.length > 0 && (
            <button
              type="button"
              aria-expanded={isOpen}
              aria-label={`${isOpen ? "Hide" : "Show"} kinds of ${o.value}`}
              onClick={() => setExpanded((prev) => { const next = new Set(prev); next.has(o.value) ? next.delete(o.value) : next.add(o.value); return next; })}
              className="ml-0.5 rounded-full px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              {isOpen ? "▾" : "▸"} {kids.length}
            </button>
          )}
        </span>
        {isOpen && kids.length > 0 && (
          <div className="flex w-full flex-wrap gap-1.5 border-l-2 border-amber-100 pl-2">
            {kids.map((k) => renderOption(k, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="py-2">
      <button type="button" onClick={onToggleOpen} aria-expanded={open} className="flex w-full items-center justify-between py-1 text-left">
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
          {FILTER_DIM_LABEL[dim]}
          {selected.size > 0 && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">{selected.size}</span>}
        </span>
        <span className="text-xs text-zinc-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="mt-1.5 flex flex-wrap items-start gap-1.5">
          {shownRoots.map((o) => renderOption(o, 0))}
          {(hidden > 0 || showAll) && roots.length > TOP_N && (
            <button type="button" onClick={() => setShowAll((s) => !s)} className="rounded-full px-2.5 py-0.5 text-xs font-medium text-amber-600 hover:bg-amber-50">
              {showAll ? "Show fewer" : `Show all ${roots.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Pill({ label, sublabel, count, selected, onClick }: { label: string; sublabel?: string; count: number; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
        selected ? "border-amber-400 bg-amber-50 text-amber-700" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
      }`}
    >
      {label}
      {sublabel && <span className="ml-1 text-zinc-400">· {sublabel}</span>}
      <span className={`ml-1 tabular-nums ${selected ? "text-amber-500" : "text-zinc-400"}`}>{count}</span>
    </button>
  );
}

function ScalarSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  if (options.length === 0) return null;
  return (
    <div className="flex-1 min-w-[120px]">
      <label className="mb-1 block text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</label>
      <Select value={value} onChange={(e) => onChange(e.target.value)} size="sm" wrapperClassName="w-full">
        <option value="">Any</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </Select>
    </div>
  );
}

// The filters in effect, as removable chips above the results.
export function ActiveFilterChips({ filters }: { filters: SongFilters }) {
  // Filters come from the address bar, which these statically rendered pages
  // only see in the browser: draw the chips after mount so they don't add a
  // server/client mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const chips: { key: string; label: string; remove: () => void }[] = [];
  for (const dim of MULTI_FILTER_DIMS) {
    for (const v of filters.selectedTags[dim]) chips.push({ key: `${dim}:${v}`, label: v, remove: () => filters.toggleTag(dim, v) });
  }
  if (filters.yearMin || filters.yearMax) {
    chips.push({ key: "year", label: `${filters.yearMin || "…"}–${filters.yearMax || "…"}`, remove: () => { filters.setYearMin(""); filters.setYearMax(""); } });
  }
  if (filters.selectedVibe) chips.push({ key: "vibe", label: filters.selectedVibe, remove: () => filters.setSelectedVibe("") });
  if (filters.selectedTonality) chips.push({ key: "tonality", label: filters.selectedTonality, remove: () => filters.setSelectedTonality("") });
  if (filters.selectedMeter) chips.push({ key: "meter", label: `${filters.selectedMeter} beats`, remove: () => filters.setSelectedMeter("") });
  if (!mounted || chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.remove}
          aria-label={`Remove filter ${c.label}`}
          className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
        >
          {c.label} <span aria-hidden className="text-amber-500">✕</span>
        </button>
      ))}
      {chips.length > 1 && (
        <button type="button" onClick={filters.clearFilters} className="px-1.5 text-xs font-medium text-zinc-500 hover:text-red-600">
          Clear all
        </button>
      )}
    </div>
  );
}
