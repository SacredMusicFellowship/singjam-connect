"use client";

import { useState } from "react";
import Link from "next/link";
import LeaderSpotControls from "@/components/LeaderSpotControls";

export default function LeaderSpot({ token, showPublicly, eventPath }: { token: string; showPublicly: boolean; eventPath: string }) {
  const [withdrawn, setWithdrawn] = useState(false);

  if (withdrawn) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <p className="text-sm text-zinc-700">
          Thanks for letting us know — you&apos;ve stepped down and the host has been told. We hope to sing with you
          another time.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-3">
      <p className="text-sm text-amber-900">Thank you for leading! Your ticket is in your email.</p>
      <LeaderSpotControls token={token} initialShowPublicly={showPublicly} onWithdrawn={() => setWithdrawn(true)} />
      <Link href={eventPath} className="inline-block text-sm font-medium text-amber-800 hover:underline">
        View event →
      </Link>
    </div>
  );
}
