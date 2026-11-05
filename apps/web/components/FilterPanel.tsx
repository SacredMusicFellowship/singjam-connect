"use client";

import Select from "@/components/Select";

type FilterOptions = {
  genres: string[];
  languages: string[];
  themes: string[];
  cultures: string[];
  vibes: string[];
  tonalities: string[];
  meters: string[];
};

export function FilterPanel({
  filterOptions,
  selectedGenres,
  selectedLanguages,
  selectedThemes,
  selectedCultures,
  selectedVibe,
  setSelectedVibe,
  selectedTonality,
  setSelectedTonality,
  selectedMeter,
  setSelectedMeter,
  yearMin,
  setYearMin,
  yearMax,
  setYearMax,
  yearBounds,
  activeFilterCount,
  toggleGenre,
  toggleLanguage,
  toggleTheme,
  toggleCulture,
  clearFilters,
}: {
  filterOptions: FilterOptions;
  selectedGenres: Set<string>;
  selectedLanguages: Set<string>;
  selectedThemes: Set<string>;
  selectedCultures: Set<string>;
  selectedVibe: string;
  setSelectedVibe: (v: string) => void;
  selectedTonality: string;
  setSelectedTonality: (v: string) => void;
  selectedMeter: string;
  setSelectedMeter: (v: string) => void;
  yearMin: string;
  setYearMin: (v: string) => void;
  yearMax: string;
  setYearMax: (v: string) => void;
  yearBounds: { min: number; max: number } | null;
  activeFilterCount: number;
  toggleGenre: (g: string) => void;
  toggleLanguage: (l: string) => void;
  toggleTheme: (t: string) => void;
  toggleCulture: (c: string) => void;
  clearFilters: () => void;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm space-y-4">
      {activeFilterCount > 0 && (
        <button
          onClick={clearFilters}
          className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
        >
          ✕ Clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
        </button>
      )}
      {filterOptions.genres.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Genre</div>
          <div className="flex flex-wrap gap-1.5">
            {filterOptions.genres.map((g) => (
              <button
                key={g}
                onClick={() => toggleGenre(g)}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  selectedGenres.has(g)
                    ? "border-amber-400 bg-amber-50 text-amber-700"
                    : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-zinc-500 uppercase tracking-wide">Year</label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={yearMin}
              onChange={(e) => setYearMin(e.target.value)}
              placeholder={yearBounds ? String(yearBounds.min) : "From"}
              className="w-full rounded-xl border border-zinc-300 px-2 py-1.5 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-xs text-zinc-400 shrink-0">–</span>
            <input
              type="number"
              value={yearMax}
              onChange={(e) => setYearMax(e.target.value)}
              placeholder={String(new Date().getFullYear())}
              className="w-full rounded-xl border border-zinc-300 px-2 py-1.5 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
        </div>

        {filterOptions.vibes.length > 0 && (
          <div className="flex-1 min-w-[120px]">
            <label className="mb-1 block text-xs font-medium text-zinc-500 uppercase tracking-wide">Vibe</label>
            <Select
              value={selectedVibe}
              onChange={(e) => setSelectedVibe(e.target.value)}
              size="sm"
              wrapperClassName="w-full"
            >
              <option value="">Any</option>
              {filterOptions.vibes.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </Select>
          </div>
        )}

        {filterOptions.tonalities.length > 0 && (
          <div className="flex-1 min-w-[120px]">
            <label className="mb-1 block text-xs font-medium text-zinc-500 uppercase tracking-wide">Tonality</label>
            <Select
              value={selectedTonality}
              onChange={(e) => setSelectedTonality(e.target.value)}
              size="sm"
              wrapperClassName="w-full"
            >
              <option value="">Any</option>
              {filterOptions.tonalities.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>
        )}

        {filterOptions.meters.length > 0 && (
          <div className="flex-1 min-w-[120px]">
            <label className="mb-1 block text-xs font-medium text-zinc-500 uppercase tracking-wide">Meter</label>
            <Select
              value={selectedMeter}
              onChange={(e) => setSelectedMeter(e.target.value)}
              size="sm"
              wrapperClassName="w-full"
            >
              <option value="">Any</option>
              {filterOptions.meters.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {filterOptions.cultures.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Culture</div>
          <div className="flex flex-wrap gap-1.5">
            {filterOptions.cultures.map((c) => (
              <button
                key={c}
                onClick={() => toggleCulture(c)}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  selectedCultures.has(c)
                    ? "border-amber-400 bg-amber-50 text-amber-700"
                    : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {filterOptions.languages.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Language</div>
          <div className="flex flex-wrap gap-1.5">
            {filterOptions.languages.map((l) => (
              <button
                key={l}
                onClick={() => toggleLanguage(l)}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  selectedLanguages.has(l)
                    ? "border-amber-400 bg-amber-50 text-amber-700"
                    : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      )}

      {filterOptions.themes.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Theme</div>
          <div className="flex flex-wrap gap-1.5">
            {filterOptions.themes.map((t) => (
              <button
                key={t}
                onClick={() => toggleTheme(t)}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  selectedThemes.has(t)
                    ? "border-amber-400 bg-amber-50 text-amber-700"
                    : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

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
