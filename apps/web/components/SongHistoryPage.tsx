import { supabaseServer } from "@/lib/supabase/server";
import { getSongHistoryStats } from "@/lib/songPlayStats";
import SongHistoryTable from "@/components/SongHistoryTable";

// Shared by the admin and song-editor panels.
export default async function SongHistoryPage() {
  const supabase = await supabaseServer();
  const stats = await getSongHistoryStats(supabase);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Song History</h1>
          <p className="text-sm text-slate-500">How often each song has been played at official SingJam events.</p>
        </div>
        <div className="w-fit rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{stats.length}</span> unique {stats.length === 1 ? "song" : "songs"} played
        </div>
      </div>
      <SongHistoryTable stats={stats} />
    </div>
  );
}
