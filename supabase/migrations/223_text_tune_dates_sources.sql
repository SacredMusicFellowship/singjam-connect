-- Migration 223: when and where texts and tunes come from.
--
-- Tune and text pages lead with one line of facts: culture or community ·
-- year · source · writers · meter or language.
--   texts.year, texts.period   when the words were written; `period` holds a
--                              rough date when that's all that's known
--                              ("16th c.", "c. 1750"), shown when year is empty.
--   tunes.period               the same for tunes (tunes.year exists, 208).
--   tunes.published_in         where the tune was first printed or published
--                              ("Friday Evening Melodies", "Psalmodia Sacra (Gotha)").
-- song_card_identity() also returns the source's relation and corpus, so a
-- card says "After Psalm 90" for a paraphrase and links the passage's page.

alter table public.texts add column if not exists year int;
alter table public.texts add column if not exists period text;
alter table public.tunes add column if not exists period text;
alter table public.tunes add column if not exists published_in text;

create or replace function public.song_card_identity(s public.songs)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'tune', (select nullif(trim(t.name), '') from public.tunes t where t.id = s.tune_id),
    'tune_slug', (select t.slug from public.tunes t where t.id = s.tune_id),
    'text_slug', (select x.slug from public.texts x where x.id = s.text_id),
    'source', (
      select jsonb_build_object('book', ts.book, 'chapter_start', ts.chapter_start, 'verse_start', ts.verse_start,
                                'chapter_end', ts.chapter_end, 'verse_end', ts.verse_end, 'citation', ts.citation,
                                'relation', ts.relation, 'corpus', ts.corpus)
      from public.text_sources ts
      where ts.text_id = s.text_id and ts.relation <> 'inspired'
      order by array_position(array['quoted', 'metrical', 'paraphrase'], ts.relation), ts.id
      limit 1
    ),
    'first_line', nullif(trim(s.first_line), '')
  );
$$;
