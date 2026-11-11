-- Migration 199: recompute a song's slug once, at the end of the transaction,
-- instead of after every writer row. 196's row triggers recomputed after each
-- inserted or deleted writer, so adding three writers (or swapping one) wrote
-- every in-between slug to song_slug_history, where it also blocked other
-- songs from that slug. Deferred constraint triggers run when the transaction
-- commits, against the final data: one slug change per save. A title change
-- moves to the same deferred path, so changing a title and its writers
-- together records a single old slug. The slug is still set immediately on
-- insert, so an insert returning the slug gets a real one.

create or replace function public.songs_slug_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.slug := public.unique_song_slug(coalesce(public.song_slug_base(new.id, new.title), new.id::text), new.id);
  elsif new.slug is distinct from old.slug and coalesce(current_setting('singjam.slug_write', true), 'off') <> 'on' then
    new.slug := old.slug;
  end if;
  return new;
end;
$$;

create or replace function public.songs_title_slug_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_song_slug(new.id);
  return null;
end;
$$;

drop trigger if exists songs_title_slug_refresh on public.songs;
create constraint trigger songs_title_slug_refresh
  after update of title on public.songs
  deferrable initially deferred
  for each row when (new.title is distinct from old.title)
  execute function public.songs_title_slug_refresh();

drop trigger if exists song_composers_slug_refresh on public.song_composers;
create constraint trigger song_composers_slug_refresh
  after insert or update or delete on public.song_composers
  deferrable initially deferred
  for each row execute function public.song_credit_slug_refresh();

drop trigger if exists song_lyricists_slug_refresh on public.song_lyricists;
create constraint trigger song_lyricists_slug_refresh
  after insert or update or delete on public.song_lyricists
  deferrable initially deferred
  for each row execute function public.song_credit_slug_refresh();

drop trigger if exists song_cultures_slug_refresh on public.song_cultures;
create constraint trigger song_cultures_slug_refresh
  after insert or update or delete on public.song_cultures
  deferrable initially deferred
  for each row execute function public.song_culture_slug_refresh();

drop trigger if exists people_name_slug_refresh on public.people;
create constraint trigger people_name_slug_refresh
  after update of name on public.people
  deferrable initially deferred
  for each row when (new.name is distinct from old.name)
  execute function public.people_name_slug_refresh();
