"use client";

import { supabaseBrowser } from "@/lib/supabase/client";

export default function DeleteSongButton({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  async function handleDelete() {
    if (!confirm("Delete this song? This cannot be undone.")) return;
    const supabase = supabaseBrowser();
    const { error } = await supabase.from("songs").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    onDeleted();
  }

  return (
    <button onClick={handleDelete} className="text-red-400 hover:text-red-600">
      Delete
    </button>
  );
}
