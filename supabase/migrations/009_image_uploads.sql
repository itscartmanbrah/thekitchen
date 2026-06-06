-- Add avatar_url to profiles
alter table profiles add column if not exists avatar_url text;

-- Add banner_image_url to leagues
alter table leagues add column if not exists banner_image_url text;

-- ── Storage buckets ──────────────────────────────────────────────────────────

-- Avatars bucket (public read)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- League banners bucket (public read)
insert into storage.buckets (id, name, public)
values ('league-banners', 'league-banners', true)
on conflict (id) do nothing;

-- ── Storage RLS policies ─────────────────────────────────────────────────────

-- Avatars: anyone can read
create policy "Public avatar read"
  on storage.objects for select
  using ( bucket_id = 'avatars' );

-- Avatars: authenticated users can upload their own (path = user_id/*)
create policy "Own avatar upload"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Avatars: users can update/delete their own
create policy "Own avatar update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Own avatar delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- League banners: anyone can read
create policy "Public banner read"
  on storage.objects for select
  using ( bucket_id = 'league-banners' );

-- League banners: authenticated users can upload
create policy "Auth banner upload"
  on storage.objects for insert
  with check (
    bucket_id = 'league-banners'
    and auth.role() = 'authenticated'
  );

-- League banners: authenticated users can update/delete
create policy "Auth banner update"
  on storage.objects for update
  using (
    bucket_id = 'league-banners'
    and auth.role() = 'authenticated'
  );

create policy "Auth banner delete"
  on storage.objects for delete
  using (
    bucket_id = 'league-banners'
    and auth.role() = 'authenticated'
  );
