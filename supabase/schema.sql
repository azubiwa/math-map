create table if not exists public.math_map_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.math_map_snapshots enable row level security;

drop policy if exists "Users can read their own Math Map data" on public.math_map_snapshots;
create policy "Users can read their own Math Map data"
on public.math_map_snapshots for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own Math Map data" on public.math_map_snapshots;
create policy "Users can insert their own Math Map data"
on public.math_map_snapshots for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own Math Map data" on public.math_map_snapshots;
create policy "Users can update their own Math Map data"
on public.math_map_snapshots for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own Math Map data" on public.math_map_snapshots;
create policy "Users can delete their own Math Map data"
on public.math_map_snapshots for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.math_map_snapshots to authenticated;
