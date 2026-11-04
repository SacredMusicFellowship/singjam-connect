import { UltimateGuitarIcon } from "@/components/setDetailShared";

// A song's Ultimate Guitar chart: the icon alone on phones, an icon + "Chords"
// pill from sm up. Same link on the set list and My Repertoire.
export default function ChordsLink({ href }: { href: string }) {
  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="sm:hidden shrink-0 rounded-lg p-1.5 transition-opacity hover:opacity-80"
        title="Chord chart"
        aria-label="Chord chart"
      >
        <UltimateGuitarIcon />
      </a>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 pl-1.5 pr-3 py-1 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
        title="Chord chart"
      >
        <UltimateGuitarIcon />
        <span className="text-xs font-medium text-zinc-600">Chords</span>
      </a>
    </>
  );
}
