import IndexPage from "@/components/browse/IndexPage";

export const revalidate = 3600;

export const metadata = { title: "Songwriters", description: "Every one of SingJam's songwriters with songs, A–Z." };

export default function Page() {
  return <IndexPage kind="person" title="Songwriters" />;
}
