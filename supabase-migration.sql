-- ============================================================================
-- Project Avocado — Supabase SQL Migration
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================

-- 1. Create the `trees` table
create table if not exists public.trees (
  id              uuid            primary key default gen_random_uuid(),
  created_at      timestamptz     not null default now(),
  tree_id         text            not null,
  type            text            not null check (type in ('tree', 'plant')),
  variety         text,
  variety_image_url text, -- Stores image URL (or comma-separated URLs if multiple variety photos are uploaded)
  latitude        double precision not null,
  longitude       double precision not null,
  is_fruiting     boolean         not null default false,
  is_affected     boolean         not null default false,
  is_pruned       boolean         not null default false,
  note            text,
  farm_location   text,
  image_urls      text[]          not null default '{}'
);

-- Allow public (anon) read and write — this is an internal tool, no RLS user-scoping
alter table public.trees enable row level security;

create policy "Allow public read"
  on public.trees for select
  using (true);

create policy "Allow public insert"
  on public.trees for insert
  with check (true);

create policy "Allow public update"
  on public.trees for update
  using (true)
  with check (true);

create policy "Allow public delete"
  on public.trees for delete
  using (true);


-- 2. Create the `tree-images` storage bucket (public, for image uploads)
insert into storage.buckets (id, name, public)
values ('tree-images', 'tree-images', true)
on conflict (id) do nothing;

-- 3. Allow public read access to files in the bucket
--    (Supabase storage uses RLS policies on storage.objects)
create policy "Public read for tree-images"
  on storage.objects for select
  using (bucket_id = 'tree-images');

-- 4. Allow public upload (insert) to the bucket
create policy "Public upload for tree-images"
  on storage.objects for insert
  with check (bucket_id = 'tree-images');
