import BrowsePage, { browseMetadata } from "@/components/browse/BrowsePage";

export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return browseMetadata("text", (await params).slug);
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <BrowsePage kind="text" slug={(await params).slug} />;
}
