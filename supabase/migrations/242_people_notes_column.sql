-- people.notes was added to production outside a migration; the browse page
-- reads it, so a database built from migrations (local, CI) 404'd every
-- songwriter page. A no-op where the column already exists.
alter table public.people add column if not exists notes text;
