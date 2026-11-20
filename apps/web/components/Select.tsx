import type { SelectHTMLAttributes } from "react";

// The app's form and filter dropdown: a real select with our own arrow at a
// fixed inset, instead of the browser's arrow pinned to the far edge.
// "field" sits with text inputs; "pill" sits with rounded toolbar buttons.
export default function Select({
  shape = "field",
  size = "md",
  wrapperClassName = "",
  children,
  ...select
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "size"> & {
  shape?: "field" | "pill";
  size?: "sm" | "md";
  wrapperClassName?: string;
}) {
  return (
    <span className={`relative inline-flex ${wrapperClassName}`}>
      <select
        {...select}
        className={`w-full cursor-pointer appearance-none border border-zinc-300 bg-white pl-3 pr-8 text-sm text-zinc-700 focus:border-amber-400 focus:outline-none disabled:cursor-default disabled:bg-zinc-50 disabled:text-zinc-400 ${
          shape === "pill" ? "rounded-full" : "rounded-xl"
        } ${size === "sm" ? "py-1.5" : "py-2"}`}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
      </svg>
    </span>
  );
}
