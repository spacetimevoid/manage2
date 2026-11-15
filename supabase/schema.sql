create table public.library_members (
  email text primary key check (email = lower(email))
);
alter table public.library_members enable row level security;
revoke all on public.library_members from anon, authenticated;
grant select on public.library_members to authenticated;
create policy "Members can check their own access"
on public.library_members for select to authenticated
using (email = lower((select auth.jwt()->>'email')));

create table public.library_documents (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  primary key (owner_id, id)
);
alter table public.library_documents enable row level security;
revoke all on public.library_documents from anon, authenticated;
grant select, insert, update, delete on public.library_documents to authenticated;
create policy "Owner can read library"
on public.library_documents for select to authenticated
using (owner_id = (select auth.uid()) and exists (select 1 from public.library_members));
create policy "Owner can add documents"
on public.library_documents for insert to authenticated
with check (owner_id = (select auth.uid()) and exists (select 1 from public.library_members));
create policy "Owner can edit documents"
on public.library_documents for update to authenticated
using (owner_id = (select auth.uid()) and exists (select 1 from public.library_members))
with check (owner_id = (select auth.uid()) and exists (select 1 from public.library_members));
create policy "Owner can remove documents"
on public.library_documents for delete to authenticated
using (owner_id = (select auth.uid()) and exists (select 1 from public.library_members));

insert into storage.buckets (id, name, public)
values ('manage-files', 'manage-files', false);
create policy "Owner can read private files"
on storage.objects for select to authenticated
using (bucket_id = 'manage-files' and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.library_members));
create policy "Owner can upload private files"
on storage.objects for insert to authenticated
with check (bucket_id = 'manage-files' and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.library_members));
create policy "Owner can replace private files"
on storage.objects for update to authenticated
using (bucket_id = 'manage-files' and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.library_members))
with check (bucket_id = 'manage-files' and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.library_members));
create policy "Owner can remove private files"
on storage.objects for delete to authenticated
using (bucket_id = 'manage-files' and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.library_members));
