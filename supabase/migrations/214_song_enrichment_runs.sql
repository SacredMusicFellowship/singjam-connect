-- Migration 214: what each song enrichment run cost.
--
-- Every model call already reports its token counts; until now they were
-- thrown away. Each automatic fill ("fill") and each editor's "Suggest
-- improvements" ("review") now stores its usage per model and the cost at the
-- list prices in packages/core modelCost.ts, so an import batch can be totalled
-- (sum cost_usd where ran_at between the batch's start and end).

create table if not exists public.song_enrichment_runs (
  id        uuid primary key default gen_random_uuid(),
  song_id   uuid references public.songs(id) on delete set null,
  kind      text not null check (kind in ('fill', 'review')),
  ran_at    timestamptz not null default now(),
  usage     jsonb not null default '[]'::jsonb,
  cost_usd  numeric(10, 5) not null default 0
);
create index if not exists song_enrichment_runs_ran_at_idx on public.song_enrichment_runs (ran_at desc);

alter table public.song_enrichment_runs enable row level security;

-- Admins can read spend; rows are written by the server (service role) only.
create policy "admins read enrichment runs" on public.song_enrichment_runs
  for select to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));

grant select on public.song_enrichment_runs to anon;
grant select, insert, update, delete on public.song_enrichment_runs to authenticated;
grant select, insert, update, delete on public.song_enrichment_runs to service_role;
