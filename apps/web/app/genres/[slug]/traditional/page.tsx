import BrowsePage, { browseMetadata } from "@/components/browse/BrowsePage";

// Just the page's traditional songs, its own path so it stays cached like the page.
export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return browseMetadata("genre", (await params).slug, true);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <BrowsePage kind="genre" slug={(await params).slug} traditional />;
}
