import { schedule } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { parseDbMemoryMetrics } from "../../lib/dbMemoryReport";

export const handler = schedule("0 */6 * * *", async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const res = await fetch(`${url}/customer/v1/privileged/metrics`, {
    headers: { Authorization: `Basic ${Buffer.from(`service_role:${key}`).toString("base64")}` },
  });
  if (!res.ok) {
    console.error(`db-memory-sample: metrics returned ${res.status}`);
    return { statusCode: 500 };
  }
  const sample = parseDbMemoryMetrics(await res.text());
  if (!sample) {
    console.error("db-memory-sample: memory figures missing from metrics");
    return { statusCode: 500 };
  }

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin.from("db_memory_samples").insert(sample);
  if (error) {
    console.error("db-memory-sample:", error.message);
    return { statusCode: 500 };
  }
  return { statusCode: 200 };
});
