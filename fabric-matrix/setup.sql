-- ============================================================
-- Jawda Fabric Matrix — one-time setup
-- Supabase → SQL Editor → New query → paste this → Run
-- Uses the same project and shared login as the Jawda Board.
-- ============================================================

create table if not exists public.fabric_matrix (
  design_id  text not null,
  fabric_id  text not null,
  state      smallint not null check (state in (1, 2)),   -- 1 = can be made, 2 = should be made
  note       text,
  updated_at timestamptz not null default now(),
  primary key (design_id, fabric_id)
);

alter table public.fabric_matrix enable row level security;

drop policy if exists "team can read fabric matrix"  on public.fabric_matrix;
drop policy if exists "team can write fabric matrix" on public.fabric_matrix;

create policy "team can read fabric matrix"
  on public.fabric_matrix for select
  to authenticated using (true);

create policy "team can write fabric matrix"
  on public.fabric_matrix for all
  to authenticated using (true) with check (true);
