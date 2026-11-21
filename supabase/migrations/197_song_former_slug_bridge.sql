-- Migration 197: keep songs.former_slug pointing at each song's most recent
-- previous slug. Builds deployed before 196 (and older app versions) look up
-- old links through former_slug, not song_slug_history; this keeps those
-- links working for them. New code resolves through resolve_song_slug.

create or replace function public.apply_song_slug(p_song_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_slug text;
  song_title text;
  target text;
begin
  select slug, title into current_slug, song_title from public.songs where id = p_song_id;
  if not found then return; end if;
  target := public.unique_song_slug(coalesce(public.song_slug_base(p_song_id, song_title), p_song_id::text), p_song_id);
  if target is not distinct from current_slug then return; end if;
  if current_slug is not null then
    insert into public.song_slug_history (slug, song_id) values (current_slug, p_song_id) on conflict (slug) do nothing;
  end if;
  delete from public.song_slug_history where slug = target and song_id = p_song_id;
  perform set_config('singjam.slug_write', 'on', true);
  update public.songs set slug = target, former_slug = current_slug where id = p_song_id;
  perform set_config('singjam.slug_write', 'off', true);
end;
$$;

revoke execute on function public.apply_song_slug(uuid) from public, anon, authenticated;

create or replace function public.songs_slug_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.slug := public.unique_song_slug(coalesce(public.song_slug_base(new.id, new.title), new.id::text), new.id);
  elsif new.title is distinct from old.title then
    new.slug := public.unique_song_slug(coalesce(public.song_slug_base(new.id, new.title), new.id::text), new.id);
    if new.slug is distinct from old.slug and old.slug is not null then
      insert into public.song_slug_history (slug, song_id) values (old.slug, new.id) on conflict (slug) do nothing;
      delete from public.song_slug_history where slug = new.slug and song_id = new.id;
      new.former_slug := old.slug;
    end if;
  elsif new.slug is distinct from old.slug and coalesce(current_setting('singjam.slug_write', true), 'off') <> 'on' then
    new.slug := old.slug;
  end if;
  return new;
end;
$$;

-- The slugs 196 just replaced.
update public.songs s
   set former_slug = h.slug
  from (
    select distinct on (song_id) song_id, slug
      from public.song_slug_history
     order by song_id, replaced_at desc, slug
  ) h
 where h.song_id = s.id
   and s.former_slug is distinct from h.slug
   and h.slug <> s.slug;
