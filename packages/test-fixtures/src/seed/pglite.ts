import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";

// An in-process Postgres with just enough of Supabase (roles, auth, storage, extensions schema)
// for the migrations and the seed to run. It checks that the seed fits the schema without Docker.
// It is not a substitute for real local Supabase: RLS, GoTrue and storage behave differently.
const SUPABASE_STUBS = `
  set check_function_bodies = off;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create schema storage;
  create schema extensions;
  create extension pgcrypto schema extensions;
  create publication supabase_realtime;
  create table auth.users (
    instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text,
    email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
    created_at timestamptz, updated_at timestamptz, last_sign_in_at timestamptz,
    confirmation_token text, recovery_token text, email_change_token_new text, email_change text,
    is_anonymous boolean default false, deleted_at timestamptz
  );
  create table auth.identities (
    id uuid primary key, user_id uuid references auth.users(id) on delete cascade, provider_id text, provider text,
    identity_data jsonb, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
  );
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[], owner uuid, created_at timestamptz default now(), updated_at timestamptz default now());
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
`;

export async function createMigratedDatabase(migrationsDir: string): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm, pgcrypto, unaccent } });
  await db.exec(SUPABASE_STUBS);

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    try {
      // Each migration gets a clean slate of pg_temp helpers, as it would in its own session.
      await db.exec(`discard temp;\nbegin;\n${sql}\n;commit;`);
    } catch (error) {
      await db.exec("rollback;").catch(() => {});
      throw new Error(`${file}: ${(error as Error).message}`);
    }
  }
  return db;
}
