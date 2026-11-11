import IndexPage from "@/components/browse/IndexPage";

export const revalidate = 3600;

export const metadata = { title: "Recording artists", description: "Every one of SingJam's recording artists with songs, A–Z." };

export default function Page() {
  return <IndexPage kind="artist" title="Recording artists" />;
}
