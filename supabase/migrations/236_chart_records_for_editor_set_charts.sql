-- Migration 236: a review record for every live chord chart. Charts set in the
-- song editor used to skip chord_chart_submissions, so the review queue could
-- restore the wrong chart or mislabel what's live. The song editor now records
-- its charts as approved; this catches up the ones set before that.

insert into public.chord_chart_submissions (song_id, url, status, reviewed_at, note)
select s.id, s.chord_chart_url, case when s.chord_chart_pending then 'pending' else 'approved' end,
  case when s.chord_chart_pending then null else now() end,
  'Set in the song editor'
from public.songs s
where s.chord_chart_url is not null
  and not exists (
    select 1 from public.chord_chart_submissions c
    where c.song_id = s.id and c.url = s.chord_chart_url
  );
