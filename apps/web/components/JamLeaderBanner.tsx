"use client";

import { useRouter } from "next/navigation";
import LeaderSpotControls from "@/components/LeaderSpotControls";

export default function JamLeaderBanner({ token, showPublicly }: { token: string; showPublicly: boolean }) {
  const router = useRouter();
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
      <p className="text-sm font-medium text-amber-900">You&apos;re leading at this event. Thank you! 🎶</p>
      <LeaderSpotControls token={token} initialShowPublicly={showPublicly} onWithdrawn={() => router.refresh()} />
    </div>
  );
}
