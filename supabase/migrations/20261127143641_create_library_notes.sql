create table public.library_notes (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  title text not null check (btrim(title) <> ''),
  markdown text not null,
  subjects text[] not null default '{}',
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);

alter table public.library_notes enable row level security;
revoke all on public.library_notes from public, anon, authenticated;
grant select, insert, update, delete on public.library_notes to authenticated;

create policy "Vault members can manage their own notes"
on public.library_notes for all to authenticated
using (owner_id = (select auth.uid()) and exists (select 1 from public.library_members))
with check (owner_id = (select auth.uid()) and exists (select 1 from public.library_members));
