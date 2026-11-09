import BrowsePage, { browseMetadata } from "@/components/browse/BrowsePage";

export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ traditional?: string }> }) {
  return browseMetadata("genre", (await params).slug, (await searchParams).traditional === "1");
}

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ traditional?: string }> }) {
  return <BrowsePage kind="genre" slug={(await params).slug} traditional={(await searchParams).traditional === "1"} />;
}
