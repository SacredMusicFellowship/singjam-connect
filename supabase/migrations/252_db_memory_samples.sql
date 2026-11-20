-- Memory and swap readings of the database server, taken every 6 hours by the
-- db-memory-sample Netlify function from the project's metrics endpoint. The
-- weekly db-memory-report function reads them to say whether the Free plan's
-- Nano compute is still coping or it's time for Pro (Supabase warned about the
-- Disk IO budget on 2026-11-20: the server swaps because 0.5 GB RAM is too little).
--
-- Server-only: RLS is on with no policies, so anon and authenticated see nothing.
-- The grants exist because every new table must state them explicitly.
create table public.db_memory_samples (
  id bigint generated always as identity primary key,
  taken_at timestamptz not null default now(),
  mem_total_mb integer not null,
  mem_available_mb integer not null,
  swap_used_mb integer not null,
  swap_in_pages bigint not null,
  swap_out_pages bigint not null
);

create index db_memory_samples_taken_at_idx on public.db_memory_samples (taken_at);

alter table public.db_memory_samples enable row level security;

grant select on public.db_memory_samples to anon;
grant select on public.db_memory_samples to authenticated;
grant select, insert, update, delete on public.db_memory_samples to service_role;
