-- Migration 215: "Barbershop tag" as a form. In barbershop a tag is a short
-- closing phrase sung on its own (the Barberpole Cat songbook prints several);
-- a song row can be one, linked to the Barbershop genre.

insert into public.tags (type, name, slug, is_top_level)
select 'form', 'Barbershop tag', public.tag_slug('Barbershop tag'), false
where not exists (select 1 from public.tags where type = 'form' and lower(name) = 'barbershop tag');

insert into public.tag_relations (tag_id, related_tag_id, kind)
select f.id, g.id, 'related'
from public.tags f, public.tags g
where f.type = 'form' and f.name = 'Barbershop tag' and g.type = 'genre' and g.name = 'Barbershop'
on conflict do nothing;
