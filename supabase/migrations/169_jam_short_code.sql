-- Migration 169: short, shareable codes for jams (singjam.org/jam/<code>).
--
-- The page accepts either the code or the uuid, so every existing link keeps
-- working. Private jams are unlisted rather than access-controlled (160): the
-- link is the credential, so the code is 8 characters from a 31-letter
-- alphabet (~8.5e11 values) — short to type, too sparse to enumerate. The
-- alphabet drops 0/o, 1/l/i so a code read aloud or retyped survives.

create or replace function public.generate_jam_short_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  alphabet constant text := '23456789abcdefghjkmnpqrstuvwxyz';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    -- security definer so the check sees every jam, private ones included,
    -- whatever role is inserting.
    exit when not exists (select 1 from public.jams where short_code = code);
  end loop;
  return code;
end;
$$;

alter table public.jams add column if not exists short_code text;

update public.jams set short_code = public.generate_jam_short_code() where short_code is null;

alter table public.jams alter column short_code set default public.generate_jam_short_code();
alter table public.jams alter column short_code set not null;

create unique index if not exists jams_short_code_key on public.jams (short_code);

-- The column default runs as whoever inserts the jam (members from the
-- browser and native, our routes as service_role); nobody else needs it.
revoke execute on function public.generate_jam_short_code() from public, anon;
grant execute on function public.generate_jam_short_code() to authenticated, service_role;
