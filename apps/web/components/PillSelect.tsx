import type { ReactNode, SelectHTMLAttributes } from "react";

// A visible pill with the real select laid over it invisibly, so the arrow sits
// beside the text and the pill keeps its own size (phones force selects to 16px,
// which made a bare select far bigger than its row). The select still takes
// focus, so the pill shows a ring while it has keyboard focus.
export default function PillSelect({
  face,
  pillClassName,
  chevron = false,
  children,
  ...select
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
  face: ReactNode;
  pillClassName: string;
  chevron?: boolean;
  "aria-label": string;
}) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center gap-1 rounded-full has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-amber-400 has-[select:focus-visible]:ring-offset-1 ${pillClassName}`}
    >
      {face}
      {chevron && (
        <svg className="h-3 w-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      )}
      <select {...select} className="absolute inset-0 w-full cursor-pointer opacity-0 focus:outline-none disabled:cursor-default">
        {children}
      </select>
    </span>
  );
}

// Every label stacked in one grid cell with only the current one visible, so a
// pill is always as wide as its longest option and rows don't shift.
export function StackedLabels({ labels, current, center = false }: { labels: { key: string; label: ReactNode }[]; current: string; center?: boolean }) {
  return (
    <span className={`grid ${center ? "justify-items-center" : ""}`}>
      {labels.map((l) => (
        <span key={l.key} className={`col-start-1 row-start-1 ${l.key === current ? "" : "invisible"}`} aria-hidden={l.key !== current}>
          {l.label}
        </span>
      ))}
    </span>
  );
}
