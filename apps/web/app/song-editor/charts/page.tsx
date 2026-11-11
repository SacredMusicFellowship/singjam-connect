import type { Metadata } from "next";
import ChartsToReview from "@/components/ChartsToReview";

export const metadata: Metadata = {
  title: "Charts to review",
};

export default function Page() {
  return <ChartsToReview basePath="/song-editor/songs" />;
}
