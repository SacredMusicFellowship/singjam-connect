import { schedule } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { buildDbMemoryReport, renderDbMemoryEmail, type DbMemorySample } from "../../lib/dbMemoryReport";
import { resend, FROM_ADDRESS } from "../../lib/resend";

// Mondays 17:00 UTC (9am Pacific in winter, 10am in summer).
export const handler = schedule("0 17 * * 1", async () => {
  const to = process.env.INFRA_REPORT_TO;
  if (!to) {
    console.log("db-memory-report: INFRA_REPORT_TO not set, skipping");
    return { statusCode: 200 };
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const now = new Date();
  // 14 days at 4 readings a day is ~56 rows, well under one page.
  const { data, error } = await admin
    .from("db_memory_samples")
    .select("taken_at,mem_total_mb,mem_available_mb,swap_used_mb,swap_in_pages,swap_out_pages")
    .gte("taken_at", new Date(now.getTime() - 14 * 86_400_000).toISOString())
    .order("taken_at")
    .order("id");
  if (error) {
    console.error("db-memory-report:", error.message);
    return { statusCode: 500 };
  }

  const { subject, html } = renderDbMemoryEmail(buildDbMemoryReport((data ?? []) as DbMemorySample[], now));
  const { error: sendError } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: to.split(",").map((s) => s.trim()),
    subject,
    html,
  });
  if (sendError) {
    console.error("db-memory-report:", sendError.message);
    return { statusCode: 500 };
  }
  return { statusCode: 200 };
});
