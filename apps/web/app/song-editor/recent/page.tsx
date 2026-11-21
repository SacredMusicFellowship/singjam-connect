import type { Metadata } from "next";
import RecentlyAddedSongs from "@/components/RecentlyAddedSongs";

export const metadata: Metadata = {
  title: "Recently added",
};

export default function Page() {
  return <RecentlyAddedSongs basePath="/song-editor/songs" />;
}
