-- 0046_profile_avatar.sql
--
-- Phase: CONSOLE-INSTRUMENTO-1 F8e, foto de perfil (founder-approved 2026-10-30,
-- decision card in the F8d thread).
--
-- Purpose: let the owner upload a profile photo. The image lives in a PRIVATE
-- Storage bucket, one object per user at `<user id>/avatar.jpg`, and the path is
-- kept on the caller's own `profiles` row. The browser reads it through a signed
-- URL created server-side, never a public URL.
--
-- RLS: the existing `profiles_update_own` policy already covers the new column.
-- The four storage policies below only ever match objects whose first folder is
-- the caller's own id, so one account can never read or overwrite another's.
-- No service-role path.
--
-- Apply manually in the Supabase SQL editor, after 0045.

alter table public.profiles
  add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "avatars_select_own" on storage.objects;
create policy "avatars_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
