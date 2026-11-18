import { supabaseServer } from "@/lib/supabase/server";
import { pendingChartCount } from "@/lib/chordCharts";

export default async function ChartsToReviewCount() {
  const count = await pendingChartCount(await supabaseServer()).catch(() => 0);
  if (!count) return null;
  return (
    <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
      {count.toLocaleString()}
    </span>
  );
}
