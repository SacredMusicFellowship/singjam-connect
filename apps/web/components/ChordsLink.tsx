import { UltimateGuitarIcon } from "@/components/setDetailShared";

// A song's Ultimate Guitar chart: the icon alone on phones, an icon + "Chords"
// pill from sm up. Same link on the set list and My Repertoire.
export default function ChordsLink({
  href,
  size = "sm",
  outlined = false,
}: {
  href: string;
  size?: "sm" | "md";
  /** On phones, ring the icon like the pills beside it (rows of pill controls). */
  outlined?: boolean;
}) {
  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`sm:hidden shrink-0 transition-opacity hover:opacity-80 ${outlined ? "rounded-full border border-zinc-200 bg-white p-0.5" : "rounded-lg p-1.5"}`}
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
