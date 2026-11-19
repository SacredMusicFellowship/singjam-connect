-- Tags the wave-1 song seeding needs: barbershop, gospel styles, cowboy songs,
-- children's forms, sea songs, two sacraments and New Zealand.

-- A fresh replay (local, e2e) runs every migration in one session; start without the pg_temp
-- helpers earlier migrations defined under the same names.
discard temp;

create function pg_temp.t(p_type text, p_name text, p_top boolean default false)
returns uuid language plpgsql as $$
declare v uuid;
begin
  select id into v from public.tags where type = p_type and lower(name) = lower(p_name);
  if v is null then
    insert into public.tags (type, name, slug, is_top_level) values (p_type, p_name, public.tag_slug(p_name), p_top) returning id into v;
  end if;
  return v;
end $$;

create function pg_temp.under(p_type text, p_child text, p_parents text[])
returns void language plpgsql as $$
declare p text; child uuid := pg_temp.t(p_type, p_child);
begin
  foreach p in array p_parents loop
    insert into public.tag_relations (tag_id, related_tag_id, kind) values (child, pg_temp.t(p_type, p), 'parent') on conflict do nothing;
  end loop;
end $$;

select pg_temp.t('genre', 'Barbershop', true);
select pg_temp.under('genre', 'Southern Gospel', array['Gospel']);
select pg_temp.under('genre', 'Country Gospel', array['Gospel', 'Country']);
select pg_temp.under('genre', 'Cowboy & Western', array['Country', 'Folk']);

select pg_temp.t('form', 'Nursery rhyme');
select pg_temp.t('form', 'Singing game');
select pg_temp.t('form', 'Cumulative song');
select pg_temp.t('form', 'Sea song');
update public.tags set aliases = array['Forebitter'] where type = 'form' and name = 'Sea song';

select pg_temp.under('occasion', 'Communion', array['Worship service']);
select pg_temp.under('occasion', 'Baptism', array['Life events']);

select pg_temp.t('culture', 'New Zealand', true);

insert into public.tag_relations (tag_id, related_tag_id, kind)
values
  (pg_temp.t('form', 'Sea song'), pg_temp.t('theme', 'Sea'), 'related'),
  (pg_temp.t('form', 'Shanty'), pg_temp.t('form', 'Sea song'), 'related'),
  (pg_temp.t('form', 'Singing game'), pg_temp.t('genre', 'Children''s Music'), 'related'),
  (pg_temp.t('form', 'Nursery rhyme'), pg_temp.t('genre', 'Children''s Music'), 'related')
on conflict do nothing;
