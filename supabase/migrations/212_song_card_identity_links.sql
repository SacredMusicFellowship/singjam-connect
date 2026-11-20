-- Migration 212: song cards link a song's tune and text to their pages
-- (/tunes/<slug>, /texts/<slug>), so song_card_identity() also returns their
-- slugs. Same signature, so the card RPCs from 211 pick it up unchanged.

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
                                'chapter_end', ts.chapter_end, 'verse_end', ts.verse_end, 'citation', ts.citation)
      from public.text_sources ts
      where ts.text_id = s.text_id and ts.relation <> 'inspired'
      order by array_position(array['quoted', 'metrical', 'paraphrase'], ts.relation), ts.id
      limit 1
    ),
    'first_line', nullif(trim(s.first_line), '')
  );
$$;
