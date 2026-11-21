import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How It Works",
  description: "SingJam connects musicians through shared repertoire. Add your songs, find people who know the same tunes, and start jamming.",
};

export default function AboutPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">How it works</h1>
      <ol className="list-decimal space-y-2 pl-5 text-zinc-700">
        <li>Create a profile (instruments, roles, vibe).</li>
        <li>Add songs you can lead/support/follow (start with SingJam packs).</li>
        <li>Find jammers near you based on shared repertoire overlap.</li>
        <li>Post a jam invite or message someone directly.</li>
      </ol>
      <p className="text-sm text-zinc-600">
        Safety-first: a public jam's exact address is only shared with people who RSVP.
      </p>
    </div>
  );
}
