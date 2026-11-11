import BrowsePage, { browseMetadata } from "@/components/browse/BrowsePage";

export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ book: string }> }) {
  return browseMetadata("scripture", (await params).book);
}

export default async function Page({ params }: { params: Promise<{ book: string }> }) {
  return <BrowsePage kind="scripture" slug={(await params).book} />;
}
