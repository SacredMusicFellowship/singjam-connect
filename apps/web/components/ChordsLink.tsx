import { ScoreIcon, UltimateGuitarIcon } from "@/components/setDetailShared";

// A song's chart: its Ultimate Guitar chords, or (kind "score") its sheet music.
// The icon alone on phones, an icon + "Chords" or "Score" pill from sm up. Same
// link on the set list and My Repertoire.
export default function ChordsLink({
  href,
  kind = "chords",
  size = "sm",
  pill = false,
}: {
  href: string;
  kind?: "chords" | "score";
  size?: "sm" | "md";
  /** On phones, an outlined pill just wide enough for the icon. */
  pill?: boolean;
}) {
  const label = kind === "score" ? "Score" : "Chord chart";
  const icon = kind === "score" ? <ScoreIcon /> : <UltimateGuitarIcon />;
  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`sm:hidden shrink-0 transition-opacity hover:opacity-80 ${pill ? "inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-2.5 py-0.5" : "rounded-lg p-1.5"}`}
        title={label}
        aria-label={label}
      >
        {icon}
      </a>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white pl-1.5 pr-3 transition-colors hover:border-zinc-300 hover:bg-zinc-50 ${size === "md" ? "py-1.5" : "py-1"}`}
        title={label}
      >
        {icon}
        <span className={`font-medium text-zinc-600 ${size === "md" ? "text-sm" : "text-xs"}`}>{kind === "score" ? "Score" : "Chords"}</span>
      </a>
    </>
  );
}
