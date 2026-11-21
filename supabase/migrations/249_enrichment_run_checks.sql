-- Which sources answered on each enrichment run ([{name, ok}], the same list the
-- editor's review shows). Claude failed silently on every automatic fill from
-- 2026-11-19 and on every review since at least 2026-11-11 before anyone
-- noticed; with this the admin spend panel shows failures, and five failed runs
-- in a row email the admin (core enrichmentHealth). Admin-read RLS and the
-- grants from migration 214 cover the new column.
alter table public.song_enrichment_runs add column if not exists checks jsonb;
