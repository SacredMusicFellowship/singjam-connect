import type { Metadata } from "next";
import SongHistoryPage from "@/components/SongHistoryPage";

export const metadata: Metadata = {
  title: "Song History",
};

export default function Page() {
  return <SongHistoryPage />;
}
