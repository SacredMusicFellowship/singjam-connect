"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ApproveButton({ songId }: { songId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    await fetch("/api/admin/songs/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId }),
    });
    router.refresh();
  }

  return (
    <button
      onClick={approve}
      disabled={busy}
      className="rounded-full bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
    >
      {busy ? "Approving…" : "Approve"}
    </button>
  );
}
