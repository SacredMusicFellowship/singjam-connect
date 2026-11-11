import type { ReactNode } from "react";
import { songSubtitle } from "@singjam/core";

// The line under a song title in lists: "from <show>", else the artist.
export default function SongSubtitle({
  productions,
  artist,
  className,
  fallback = null,
}: {
  productions: readonly string[] | null | undefined;
  artist: string | null | undefined;
  className?: string;
  fallback?: ReactNode;
}) {
  const s = songSubtitle(productions, artist);
  if (!s) return fallback === null ? null : <span className={className}>{fallback}</span>;
  return <span className={className}>{s.kind === "production" ? <>from <em>{s.text}</em></> : s.text}</span>;
}
