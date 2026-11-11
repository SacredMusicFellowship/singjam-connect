-- Migration 232: Inside SingJam, the monthly engineering blog.
--
-- Posts are written in Markdown and published from /admin/blog. Everyone
-- (signed in or not, web or native) reads published posts; only admins see
-- drafts and write.

create table if not exists public.blog_posts (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        text not null check (length(trim(title)) > 0),
  summary      text,
  body_md      text not null default '',
  cover_image_url text,
  author_name  text,
  status       text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (status = 'draft' or published_at is not null)
);
create index if not exists blog_posts_published_idx
  on public.blog_posts (published_at desc, id) where status = 'published';

alter table public.blog_posts enable row level security;

create policy "anyone reads published blog posts" on public.blog_posts
  for select to anon, authenticated
  using (status = 'published' and published_at <= now());

create policy "admins read all blog posts" on public.blog_posts
  for select to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));

create policy "admins write blog posts" on public.blog_posts
  for all to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));

create or replace function public.blog_posts_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger blog_posts_touch_updated_at
  before update on public.blog_posts
  for each row execute function public.blog_posts_touch_updated_at();

grant select on public.blog_posts to anon;
grant select, insert, update, delete on public.blog_posts to authenticated;
grant select, insert, update, delete on public.blog_posts to service_role;
