"use client";

import { useEffect, useRef, useState } from "react";
import type { SortBy } from "@/hooks/useSongFilters";

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "popularity", label: "Popular" },
  { value: "title_asc", label: "A → Z" },
  { value: "title_desc", label: "Z → A" },
];

export function SortDropdown({
  value,
  onChange,
  options = SORT_OPTIONS,
  align = "right",
}: {
  value: SortBy;
  onChange: (v: SortBy) => void;
  options?: { value: SortBy; label: string }[];
  // Which edge of the trigger the menu hangs off. Defaults to "right", which
  // suits /repertoire's justify-between toolbar where the control sits at the
  // right edge. /search puts it first in a left-aligned row, so the menu needs
  // to open rightward or it hangs off the side of its own pill.
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-7 flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 text-xs font-medium text-zinc-500 hover:bg-zinc-50 transition-colors"
      >
        <svg className="h-3 w-3 shrink-0 text-zinc-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 6l4 4 4-4" />
        </svg>
        {current?.label}
      </button>
      {open && (
        <div className={`absolute ${align === "left" ? "left-0" : "right-0"} top-full z-20 mt-1 min-w-[100px] rounded-lg border border-zinc-200 bg-white py-1 shadow-md`}>
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full px-3 py-1.5 text-left text-xs font-medium transition-colors hover:bg-zinc-50 ${value === o.value ? "text-amber-600" : "text-zinc-600"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
