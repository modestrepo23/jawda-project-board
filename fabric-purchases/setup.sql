-- ============================================================
-- Jawda Fabric Purchases — one-time setup
-- Supabase → SQL Editor → New query → paste this → Run
-- Same project and shared login as the Jawda Board.
-- ============================================================

create table if not exists public.fabric_purchases (
  id           uuid primary key default gen_random_uuid(),
  entered_on   date not null default current_date,          -- date it was input into the system
  fabric_code  text unique,                                  -- e.g. Nct001: source letter + fabric type + number
  source       text not null check (source in ('Nice','Sadia','Market')),
  fabric_type  text not null check (fabric_type ~ '^[a-z]{2}$'),  -- two-letter type, e.g. ct = cotton tencel
  description  text not null,                                -- e.g. Fleece Fabric
  colour       text not null,
  measure      text not null check (measure in ('kg','yards')),
  quantity     numeric(12,2) not null check (quantity >= 0),
  can_make     text,                                         -- what we can make from it (free text for now)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Give every new purchase its ID: first letter of the source + fabric type + next number for that prefix
create or replace function public.fabric_purchases_assign_code()
returns trigger language plpgsql as $$
declare
  prefix text;
  next_n int;
begin
  if new.fabric_code is null or new.fabric_code = '' then
    prefix := upper(left(new.source, 1)) || lower(new.fabric_type);
    perform pg_advisory_xact_lock(hashtext('fabric_purchases_' || prefix));
    select coalesce(max(substring(fabric_code from 4)::int), 0) + 1
      into next_n
      from public.fabric_purchases
     where fabric_code like prefix || '%'
       and substring(fabric_code from 4) ~ '^[0-9]+$';
    new.fabric_code := prefix || lpad(next_n::text, 3, '0');
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists fabric_purchases_code on public.fabric_purchases;
create trigger fabric_purchases_code
  before insert or update on public.fabric_purchases
  for each row execute function public.fabric_purchases_assign_code();

alter table public.fabric_purchases enable row level security;

drop policy if exists "team can read fabric purchases"  on public.fabric_purchases;
drop policy if exists "team can write fabric purchases" on public.fabric_purchases;

create policy "team can read fabric purchases"
  on public.fabric_purchases for select
  to authenticated using (true);

create policy "team can write fabric purchases"
  on public.fabric_purchases for all
  to authenticated using (true) with check (true);
