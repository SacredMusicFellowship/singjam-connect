import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView } from 'react-native';
import {
  countActiveFilters,
  MULTI_FILTER_DIMS,
  rootFacets,
  type FacetOption,
  type MultiFilterDim,
  type SongFilterFacets,
  type SongFilterOptions,
  type SongFilterState,
  type TagHierarchy,
} from '@singjam/core';

// The facet filter sheet for both the Song Library and Repertoire screens —
// native's counterpart to web's FilterPanel, which `/search` and `/repertoire`
// likewise share. Each tag section lists its most-used options with song
// counts, nests sub-tags under their parents, and can show all; one search box
// finds a filter in any section.
//
// Generic over the caller's filter state so a screen can carry extra fields
// alongside the shared dimensions (Song Library keeps `sortBy` in the same
// object) and have them preserved through edits and Clear.

export function emptyFilterDimensions(): SongFilterState {
  return {
    genres: new Set(),
    forms: new Set(),
    occasions: new Set(),
    communities: new Set(),
    cultures: new Set(),
    languages: new Set(),
    themes: new Set(),
    vibe: '',
    tonality: '',
    meter: '',
    yearMin: '',
    yearMax: '',
  };
}

export function toggleFilterValue(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  next.has(value) ? next.delete(value) : next.add(value);
  return next;
}

const DIM_LABEL: Record<MultiFilterDim, string> = {
  genres: 'Genre',
  forms: 'Form',
  occasions: 'Occasion',
  communities: 'Community',
  cultures: 'Culture',
  languages: 'Language',
  themes: 'Theme',
};

const TOP_N = 8;

type SingleDim = 'vibe' | 'tonality' | 'meter';
type ChipDim = MultiFilterDim | SingleDim;

// Memoised, and it reports which dimension it belongs to rather than closing over
// a handler: the sheet renders many chips off a full catalog, and rebuilding an
// inline onPress for each of them re-rendered the lot on every tap. With a stable
// onToggle only the chip whose `selected` actually flipped re-renders.
const Chip = memo(function Chip({ label, dim, count, sublabel, selected, onToggle }: {
  label: string;
  dim: ChipDim;
  count?: number;
  sublabel?: string;
  selected: boolean;
  onToggle: (dim: ChipDim, value: string) => void;
}) {
  return (
    <TouchableOpacity
      onPress={() => onToggle(dim, label)}
      className={`px-3 py-1.5 rounded-full border mr-2 mb-2 ${selected ? 'bg-amber-500 border-amber-500' : 'bg-white border-zinc-200'}`}
    >
      <Text className={`text-sm font-medium ${selected ? 'text-white' : 'text-zinc-600'}`}>
        {label}
        {sublabel ? <Text className={selected ? 'text-amber-100' : 'text-zinc-400'}>{` · ${sublabel}`}</Text> : null}
        {count != null ? <Text className={selected ? 'text-amber-100' : 'text-zinc-400'}>{`  ${count}`}</Text> : null}
      </Text>
    </TouchableOpacity>
  );
});

function SectionLabel({ title }: { title: string }) {
  return <Text className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2 mt-4">{title}</Text>;
}

function TagSection({ dim, options, hierarchy, selected, onToggle, open, onToggleOpen }: {
  dim: MultiFilterDim;
  options: FacetOption[];
  hierarchy: TagHierarchy | null;
  selected: Set<string>;
  onToggle: (dim: ChipDim, value: string) => void;
  open: boolean;
  onToggleOpen: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const byValue = useMemo(() => new Map(options.map(o => [o.value, o])), [options]);
  const roots = useMemo(() => rootFacets(options, dim, hierarchy), [options, dim, hierarchy]);
  const childMap = hierarchy?.[dim]?.children;
  const childOptions = (value: string) => (childMap?.get(value) ?? [])
    .map(c => byValue.get(c))
    .filter((o): o is FacetOption => !!o)
    .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : 1));
  const shownRoots = showAll ? roots : roots.filter((o, i) => i < TOP_N || selected.has(o.value));
  const hidden = roots.length - shownRoots.length;

  function renderOption(o: FacetOption, depth: number): React.ReactNode {
    const kids = childOptions(o.value);
    const isOpen = expanded.has(o.value) || kids.some(k => selected.has(k.value));
    return (
      <View key={`${depth}:${o.value}`} className={isOpen && kids.length ? 'w-full' : ''}>
        <View className="flex-row items-center">
          <Chip label={o.value} dim={dim} count={o.count} selected={selected.has(o.value)} onToggle={onToggle} />
          {kids.length > 0 && (
            <TouchableOpacity
              onPress={() => setExpanded(prev => toggleFilterValue(prev, o.value))}
              accessibilityLabel={`${isOpen ? 'Hide' : 'Show'} kinds of ${o.value}`}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
              className="mb-2 -ml-1 mr-2"
            >
              <Text className="text-xs text-zinc-400">{isOpen ? '▾' : '▸'} {kids.length}</Text>
            </TouchableOpacity>
          )}
        </View>
        {isOpen && kids.length > 0 && (
          <View className="flex-row flex-wrap pl-3 ml-1 border-l-2 border-amber-100">
            {kids.map(k => renderOption(k, depth + 1))}
          </View>
        )}
      </View>
    );
  }

  return (
    <View className="border-b border-zinc-100 py-1">
      <TouchableOpacity onPress={onToggleOpen} className="flex-row items-center justify-between py-2">
        <Text className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
          {DIM_LABEL[dim]}{selected.size > 0 ? `  · ${selected.size}` : ''}
        </Text>
        <Text className="text-xs text-zinc-400">{open ? '▾' : '▸'}</Text>
      </TouchableOpacity>
      {open && (
        <View className="flex-row flex-wrap items-start">
          {shownRoots.map(o => renderOption(o, 0))}
          {(hidden > 0 || showAll) && roots.length > TOP_N && (
            <TouchableOpacity onPress={() => setShowAll(s => !s)} className="px-2 py-1.5 mb-2">
              <Text className="text-sm font-medium text-amber-600">{showAll ? 'Show fewer' : `Show all ${roots.length}`}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

export default function SongFilterSheet<T extends SongFilterState>({
  visible,
  filters,
  options,
  facets,
  hierarchy,
  yearBounds,
  emptyHint,
  onChange,
  onClose,
}: {
  visible: boolean;
  filters: T;
  options: SongFilterOptions;
  facets: SongFilterFacets;
  hierarchy: TagHierarchy | null;
  yearBounds: { min: number | null; max: number | null };
  // Shown when the pool has no facets to offer at all — only reachable on
  // Repertoire, where the pool is the user's own (possibly tiny) song list.
  emptyHint?: { title: string; detail: string };
  onChange: (f: T) => void;
  onClose: () => void;
}) {
  const activeCount = countActiveFilters(filters);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set(['genres']));

  function set(patch: Partial<SongFilterState>) {
    onChange({ ...filters, ...patch });
  }

  // Latest-value refs so the chips' onToggle can stay referentially stable across
  // renders without going stale — otherwise memoising Chip buys nothing.
  const latest = useRef({ filters, onChange });
  latest.current = { filters, onChange };

  const handleToggle = useCallback((dim: ChipDim, value: string) => {
    const { filters: f, onChange: emit } = latest.current;
    if ((MULTI_FILTER_DIMS as readonly string[]).includes(dim)) {
      const key = dim as MultiFilterDim;
      emit({ ...f, [key]: toggleFilterValue(f[key], value) });
    } else {
      const key = dim as SingleDim;
      emit({ ...f, [key]: f[key] === value ? '' : value });
    }
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return MULTI_FILTER_DIMS.flatMap(dim => facets[dim].filter(o => o.value.toLowerCase().includes(q)).map(o => ({ dim, ...o })))
      .sort((a, b) => Number(!a.value.toLowerCase().startsWith(q)) - Number(!b.value.toLowerCase().startsWith(q)) || b.count - a.count)
      .slice(0, 12);
  }, [query, facets]);

  const hasAnyOption =
    MULTI_FILTER_DIMS.some(dim => facets[dim].length > 0) ||
    options.vibes.length > 0 ||
    options.tonalities.length > 0 ||
    options.meters.length > 0 ||
    yearBounds.min != null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-white">
        <View className="flex-row items-center px-4 pt-4 pb-3 border-b border-zinc-100">
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text className="text-amber-600 font-medium">Done</Text>
          </TouchableOpacity>
          <Text className="flex-1 text-center font-semibold text-zinc-900">Filters</Text>
          <TouchableOpacity
            onPress={() => onChange({ ...filters, ...emptyFilterDimensions() })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            disabled={activeCount === 0}
          >
            <Text className={`font-medium ${activeCount > 0 ? 'text-red-500' : 'text-zinc-300'}`}>Clear</Text>
          </TouchableOpacity>
        </View>

        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {hasAnyOption && (
            <TextInput
              className="mt-3 border border-zinc-200 rounded-xl px-3 py-2 text-zinc-900"
              placeholder="Find a filter: genre, occasion, community…"
              placeholderTextColor="#a1a1aa"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          )}
          {query.trim() ? (
            <View className="flex-row flex-wrap mt-3">
              {matches.length === 0 ? (
                <Text className="text-sm text-zinc-400">No filter matches “{query.trim()}” in these songs.</Text>
              ) : (
                matches.map(m => (
                  <Chip
                    key={`${m.dim}:${m.value}`}
                    label={m.value}
                    dim={m.dim}
                    sublabel={DIM_LABEL[m.dim]}
                    count={m.count}
                    selected={filters[m.dim].has(m.value)}
                    onToggle={(d, v) => { handleToggle(d, v); setQuery(''); }}
                  />
                ))
              )}
            </View>
          ) : null}

          <View className="mt-2">
            {MULTI_FILTER_DIMS.map(dim =>
              facets[dim].length > 0 ? (
                <TagSection
                  key={dim}
                  dim={dim}
                  options={facets[dim]}
                  hierarchy={hierarchy}
                  selected={filters[dim]}
                  onToggle={handleToggle}
                  open={open.has(dim)}
                  onToggleOpen={() => setOpen(prev => toggleFilterValue(prev, dim))}
                />
              ) : null
            )}
          </View>

          {options.vibes.length > 0 && (
            <>
              <SectionLabel title="Vibe" />
              <View className="flex-row flex-wrap">
                {options.vibes.map(v => <Chip key={v} label={v} dim="vibe" selected={filters.vibe === v} onToggle={handleToggle} />)}
              </View>
            </>
          )}
          {options.tonalities.length > 0 && (
            <>
              <SectionLabel title="Tonality" />
              <View className="flex-row flex-wrap">
                {options.tonalities.map(t => <Chip key={t} label={t} dim="tonality" selected={filters.tonality === t} onToggle={handleToggle} />)}
              </View>
            </>
          )}
          {options.meters.length > 0 && (
            <>
              <SectionLabel title="Meter" />
              <View className="flex-row flex-wrap">
                {options.meters.map(m => <Chip key={m} label={m} dim="meter" selected={filters.meter === m} onToggle={handleToggle} />)}
              </View>
            </>
          )}
          {yearBounds.min != null && (
            <>
              <SectionLabel title="Year" />
              <View className="flex-row items-center" style={{ gap: 8 }}>
                <TextInput
                  className="flex-1 border border-zinc-200 rounded-xl px-3 py-2 text-zinc-900"
                  placeholder={String(yearBounds.min)}
                  placeholderTextColor="#a1a1aa"
                  keyboardType="number-pad"
                  maxLength={4}
                  value={filters.yearMin}
                  onChangeText={t => set({ yearMin: t.replace(/[^0-9]/g, '') })}
                />
                <Text className="text-zinc-400">–</Text>
                <TextInput
                  className="flex-1 border border-zinc-200 rounded-xl px-3 py-2 text-zinc-900"
                  placeholder={yearBounds.max != null ? String(yearBounds.max) : 'To'}
                  placeholderTextColor="#a1a1aa"
                  keyboardType="number-pad"
                  maxLength={4}
                  value={filters.yearMax}
                  onChangeText={t => set({ yearMax: t.replace(/[^0-9]/g, '') })}
                />
              </View>
            </>
          )}
          {!hasAnyOption && emptyHint && (
            <View className="items-center pt-16">
              <Text className="text-zinc-400 text-sm">{emptyHint.title}</Text>
              <Text className="text-zinc-400 text-sm mt-1">{emptyHint.detail}</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
