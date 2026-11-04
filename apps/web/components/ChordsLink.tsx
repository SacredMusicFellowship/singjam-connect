import { UltimateGuitarIcon } from "@/components/setDetailShared";

// A song's Ultimate Guitar chart: the icon alone on phones, an icon + "Chords"
// pill from sm up. Same link on the set list and My Repertoire.
export default function ChordsLink({
  href,
  size = "sm",
  pill = false,
}: {
  href: string;
  size?: "sm" | "md";
  /** On phones, a black pill that stretches to fill the rest of a row of pills (up to
   *  a pill's width, so it doesn't span a whole line if the row wraps). */
  pill?: boolean;
}) {
  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`sm:hidden shrink-0 transition-opacity hover:opacity-80 ${pill ? "flex flex-1 max-w-20 items-center justify-center rounded-full border border-[#111] bg-[#111] px-3 py-0.5" : "rounded-lg p-1.5"}`}
        title="Chord chart"
        aria-label="Chord chart"
      >
        <UltimateGuitarIcon />
      </a>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white pl-1.5 pr-3 transition-colors hover:border-zinc-300 hover:bg-zinc-50 ${size === "md" ? "py-1.5" : "py-1"}`}
        title="Chord chart"
      >
        <UltimateGuitarIcon />
        <span className={`font-medium text-zinc-600 ${size === "md" ? "text-sm" : "text-xs"}`}>Chords</span>
      </a>
    </>
  );
}
