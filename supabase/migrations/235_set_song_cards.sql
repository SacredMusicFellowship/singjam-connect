-- Migration 235: a set's song cards in one call, by set id, so the set page can
-- fetch them alongside its set_songs query instead of after it (one round trip,
-- not two). security invoker: callers see only the set_songs rows RLS lets them.

create or replace function public.set_song_cards(p_set_id uuid)
returns table (song_id uuid, card jsonb)
language sql stable
set search_path to 'public'
as $$
  select c.song_id, c.card
  from public.song_cards(array(select ss.song_id from public.set_songs ss where ss.set_id = p_set_id)) c;
$$;

grant execute on function public.set_song_cards(uuid) to anon, authenticated, service_role;
