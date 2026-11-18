import type { Metadata } from "next";
import SongSearch from "@/components/SongSearch";
import Link from "next/link";
import InfoTooltip from "@/components/InfoTooltip";

export const metadata: Metadata = {
  title: "Song Search",
  description: "Search thousands of songs to add to your repertoire. Find music you already know and discover new songs to learn.",
};

export default function SongsPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">Song Library</h1>
          <InfoTooltip text={
            <span className="space-y-1.5">
              <span className="block">Search by title, recording artist, first line or composer.</span>
              <span className="block text-zinc-400">Tip: searching a person name returns songs connected via composer credits or recordings.</span>
            </span>
          } />
        </div>
        <Link href="/browse" className="sm:ml-auto text-sm font-medium text-amber-600 hover:underline">
          Browse by genre, occasion, community…
        </Link>
      </div>
      <SongSearch />
    </div>
  );
}
