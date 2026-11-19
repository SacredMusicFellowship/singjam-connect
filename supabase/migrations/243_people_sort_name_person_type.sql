-- Like notes (242), these people columns were added to production outside a
-- migration. Same definitions as production; a no-op there.
alter table public.people add column if not exists sort_name text;
alter table public.people add column if not exists person_type text not null default 'person';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'people_person_type_check' and conrelid = 'public.people'::regclass) then
    alter table public.people add constraint people_person_type_check
      check (person_type in ('person', 'group', 'tradition', 'unknown'));
  end if;
end $$;
