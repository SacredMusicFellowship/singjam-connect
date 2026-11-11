-- Migration 218: a set's "Add songs" lists show songs the way cards do.
--
-- song_card_fields(song) returns what a song card needs in one value (the
-- line under the title, writers, cultures, recordings, and what identifies it,
-- migrations 204 and 211-212). set_shared_songs and solo_set_songs gain it as a
-- last column, card; same arguments, grants restated.

create or replace function public.song_card_fields(p_song_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'byline', public.byline(s),
    'composers', coalesce((
      select array_agg(name order by name) from (
        select p.name from public.song_composers sc join public.people p on p.id = sc.person_id where sc.song_id = s.id
        union
        select p.name from public.song_lyricists sl join public.people p on p.id = sl.person_id where sl.song_id = s.id
      ) names), '{}'),
    'cultures', public.song_tag_names(s.id, 'culture'),
    'recording_artists', (
      select coalesce(jsonb_agg(jsonb_build_object('name', a.name, 'year', ra.year) order by ra.position nulls last, a.name), '[]'::jsonb)
      from public.song_recording_artists ra join public.artists a on a.id = ra.artist_id where ra.song_id = s.id),
    'card_identity', public.song_card_identity(s)
  )
  from public.songs s
  where s.id = p_song_id;
$$;
grant execute on function public.song_card_fields(uuid) to anon, authenticated, service_role;

-- set_shared_songs
drop function if exists public.set_shared_songs(uuid);
CREATE FUNCTION public.set_shared_songs(set_id_param uuid)
 RETURNS TABLE(song_id uuid, slug text, title text, display_artist text, viewer_has boolean, viewer_leads boolean, who_else text[], who_else_leads text[], in_set boolean, card jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with viewer_is_participant as (
    select 1
    from public.sets s
    where s.id = set_id_param and s.owner_user_id = auth.uid()
    union all
    select 1
    from public.set_collaborators sc
    where sc.set_id = set_id_param
      and sc.user_id = auth.uid()
      and sc.status = 'accepted'
  ),
  participants as (
    select s.owner_user_id as user_id
    from public.sets s
    where s.id = set_id_param
      and s.owner_user_id <> auth.uid()

    union

    select sc.user_id
    from public.set_collaborators sc
    where sc.set_id = set_id_param
      and sc.status = 'accepted'
      and sc.user_id <> auth.uid()
      and sc.user_id is not null
  ),
  viewer_songs as (
    select song_id, confidence
    from public.user_songs
    where user_id = auth.uid()
      and confidence in ('lead', 'support', 'learn')
      and exists (select 1 from viewer_is_participant)
  ),
  others_knowledge as (
    select
      os.song_id,
      coalesce(nullif(trim(p.display_name), ''), p.username) as other_name,
      os.confidence                                           as other_conf
    from public.user_songs os
    join participants pt on pt.user_id = os.user_id
    join public.profiles p on p.id = os.user_id
    where os.confidence in ('lead', 'support', 'learn')
  ),
  viewer_shared as (
    select
      s.id                                                                                            as song_id,
      s.slug,
      s.title,
      s.display_artist,
      true                                                                                            as viewer_has,
      bool_or(vs.confidence = 'lead')                                                                  as viewer_leads,
      coalesce(array_agg(distinct ok.other_name order by ok.other_name) filter (where ok.other_name is not null), '{}') as who_else,
      coalesce(array_agg(distinct ok.other_name order by ok.other_name) filter (where ok.other_conf = 'lead'), '{}')   as who_else_leads
    from viewer_songs vs
    join public.songs s on s.id = vs.song_id
    left join others_knowledge ok on ok.song_id = vs.song_id
    group by s.id, s.slug, s.title, s.display_artist
  ),
  others_shared as (
    select
      s.id                                                                                            as song_id,
      s.slug,
      s.title,
      s.display_artist,
      false                                                                                           as viewer_has,
      false                                                                                           as viewer_leads,
      array_agg(distinct ok.other_name order by ok.other_name)                                        as who_else,
      coalesce(array_agg(distinct ok.other_name order by ok.other_name) filter (where ok.other_conf = 'lead'), '{}') as who_else_leads
    from others_knowledge ok
    join public.songs s on s.id = ok.song_id
    where ok.song_id not in (select song_id from viewer_songs)
      and exists (select 1 from viewer_is_participant)
    group by s.id, s.slug, s.title, s.display_artist
    having bool_or(ok.other_conf = 'lead')
  ),
  set_songs_already as (
    select song_id
    from public.set_songs
    where set_id = set_id_param
  )
  select
    combined.song_id,
    combined.slug,
    combined.title,
    combined.display_artist,
    combined.viewer_has,
    combined.viewer_leads,
    combined.who_else,
    combined.who_else_leads,
    exists (select 1 from set_songs_already where song_id = combined.song_id) as in_set,
    public.song_card_fields(combined.song_id) as card
  from (
    select * from viewer_shared
    union all
    select * from others_shared
  ) combined
  order by (cardinality(combined.who_else) = 0), cardinality(combined.who_else) desc, combined.title;
$function$;
revoke all on function public.set_shared_songs(uuid) from public, anon, authenticated;
grant execute on function public.set_shared_songs(uuid) to anon, authenticated, service_role;

-- solo_set_songs
drop function if exists public.solo_set_songs(uuid);
CREATE FUNCTION public.solo_set_songs(set_id_param uuid)
 RETURNS TABLE(song_id uuid, slug text, title text, display_artist text, viewer_has boolean, viewer_leads boolean, who_else text[], who_else_leads text[], in_set boolean, popularity bigint, card jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with viewer_is_participant as (
    select 1 from public.sets
    where id = set_id_param and owner_user_id = auth.uid()
    union all
    select 1 from public.set_collaborators sc
    where sc.set_id = set_id_param
      and sc.user_id = auth.uid()
      and sc.status = 'accepted'
  ),
  set_songs_already as (
    select song_id from public.set_songs
    where set_id = set_id_param
  ),
  global_popularity as (
    select song_id, count(*) as user_count
    from public.user_songs
    group by song_id
  )
  select
    s.id                                                              as song_id,
    s.slug,
    s.title,
    s.display_artist,
    true                                                              as viewer_has,
    (us.confidence = 'lead')                                          as viewer_leads,
    '{}'::text[]                                                      as who_else,
    '{}'::text[]                                                      as who_else_leads,
    exists (select 1 from set_songs_already where song_id = s.id)    as in_set,
    coalesce(gp.user_count, 0)                                        as popularity,
    public.song_card_fields(s.id)                                     as card
  from public.user_songs us
  join public.songs s on s.id = us.song_id
  left join global_popularity gp on gp.song_id = s.id
  where us.user_id = auth.uid()
    and us.confidence in ('lead', 'support', 'learn')
    and exists (select 1 from viewer_is_participant)
  order by coalesce(gp.user_count, 0) desc, s.title;
$function$;
revoke all on function public.solo_set_songs(uuid) from public, anon, authenticated;
grant execute on function public.solo_set_songs(uuid) to anon, authenticated, service_role;
