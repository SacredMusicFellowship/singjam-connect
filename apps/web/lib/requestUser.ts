import { supabaseServer } from "@/lib/supabase/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";

// Web sends the session cookie; native sends a bearer token.
export async function requestUser(req: Request) {
  const supabase = await supabaseServer();
  const user = (await supabase.auth.getUser()).data.user ?? null;
  if (user) return user;
  const bearer = req.headers.get("Authorization")?.replace("Bearer ", "");
  return bearer ? (await supabaseFromBearer(bearer).auth.getUser()).data.user ?? null : null;
}
