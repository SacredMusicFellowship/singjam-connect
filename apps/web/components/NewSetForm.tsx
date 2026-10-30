"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setPath } from "@singjam/core";

export default function NewSetForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
    });

    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? "Something went wrong");
      setSubmitting(false);
      return;
    }

    router.push(setPath(await res.json()));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">Set name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Friday night gig"
          className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
          required
          autoFocus
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          Description <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Acoustic set for the pub"
          rows={3}
          className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Creating…" : "Create set"}
      </button>
    </form>
  );
}
