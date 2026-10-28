-- Small admin-editable settings, one text value per key. First use: the
-- message in official event reminder emails (key 'event_reminder_message'),
-- edited at /admin/settings. No row = the built-in default.
--
-- Only the service role (admin API routes, the reminder job) reads or writes
-- it: RLS is on with no policies.
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.app_settings enable row level security;

grant select on public.app_settings to anon;
grant select, insert, update, delete on public.app_settings to authenticated;
grant select, insert, update, delete on public.app_settings to service_role;
