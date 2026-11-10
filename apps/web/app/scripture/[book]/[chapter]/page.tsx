import BrowsePage, { browseMetadata } from "@/components/browse/BrowsePage";

export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

type Params = Promise<{ book: string; chapter: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { book, chapter } = await params;
  return browseMetadata("scripture", `${book}/${chapter}`);
}

export default async function Page({ params }: { params: Params }) {
  const { book, chapter } = await params;
  return <BrowsePage kind="scripture" slug={`${book}/${chapter}`} />;
}
