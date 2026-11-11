"use client";

export const COUNT_OR_AZ = [
  { value: "count" as const, label: "Most songs" },
  { value: "az" as const, label: "A–Z" },
];

// A small "Most songs / A–Z" switch for chip lists (the Browse hub, the filter panel).
export default function OrderToggle<T extends string>({ value, onChange, options, size = "sm" }: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  size?: "sm" | "xs";
}) {
  const pad = size === "xs" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Sort">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-full border ${pad} ${value === o.value ? "border-amber-500 bg-amber-500 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-amber-300"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
