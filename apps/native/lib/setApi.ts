import { supabase } from '@/lib/supabase';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://singjam.org';

// Set mutations go through the web API (service-role client + role checks), the
// single source of set authorization — same as web. This is what lets co-owners
// act: RLS on set_songs/sets is owner/editor-only and doesn't know the co-owner
// role, but the API routes do. Auth travels as a bearer token.
export async function setApi(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown
): Promise<{ ok: boolean; status: number; json: any }> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${WEB_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, json };
}
