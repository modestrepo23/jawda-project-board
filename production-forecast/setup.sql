-- ============================================================
-- Jawda Production Forecast — one-time setup
-- Supabase → SQL Editor → New query → paste this → Run
-- Same project and shared login as the Jawda Board.
-- ============================================================

-- One row of plan settings (stock on hand, lead times, minimums)
create table if not exists public.pf_settings (
  id         int primary key default 1 check (id = 1),
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Pieces we need available to sell each month
create table if not exists public.pf_months (
  month      date primary key,                 -- first day of the month
  pieces     int  not null default 0 check (pieces >= 0),
  note       text,
  updated_at timestamptz not null default now()
);

-- Production runs (one per tab in the Bangladesh tracker)
create table if not exists public.pf_runs (
  id           uuid primary key default gen_random_uuid(),
  run_date     date not null,
  name         text not null,
  target       int check (target >= 0),         -- null when the run takes whatever is left
  is_remainder boolean not null default false,
  status       text not null default 'Planning' check (status in ('Planning','Approved','In production','Shipped','Delivered')),
  notes        text,
  tracker_gid  bigint,                          -- tab in the Bangladesh Collections & Production Lists sheet
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Every fabric and colour we hold, have on order, or plan to buy
create table if not exists public.pf_fabrics (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  colour        text not null,
  composition   text,
  source        text,                           -- Nice, Sadia, Mollik, Market…
  status        text not null default 'In stock' check (status in ('In stock','Ordered','To order (mill)','Buy locally','Searching','Check stock')),
  in_stock      numeric(12,2) not null default 0,  -- yards in Dhaka, not yet cut
  on_order      numeric(12,2) not null default 0,  -- yards ordered, not yet arrived
  on_order_eta  date,
  planned_order numeric(12,2) not null default 0,  -- yards we plan to order (not placed yet)
  required_by   date,                              -- set by hand; otherwise worked out from the first run that needs it
  price_gbp     numeric(10,2),
  notes         text,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (name, colour)
);

-- The lines on each run: design × fabric colour × sizes
create table if not exists public.pf_lines (
  id                  uuid primary key default gen_random_uuid(),
  run_id              uuid not null references public.pf_runs(id) on delete cascade,
  design              text not null,
  fabric_id           uuid references public.pf_fabrics(id) on delete set null,
  fabric_label        text,                    -- as written in the tracker
  sizes               jsonb not null default '{}'::jsonb,  -- {"50":8,"52":16,…} or {"XS":10,…}
  consumption         numeric(6,2) not null default 0,     -- yards per piece
  sample_approved     boolean not null default false,
  production_approved boolean not null default false,
  notes               text,
  sort                int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists pf_lines_run on public.pf_lines(run_id);
create index if not exists pf_lines_fabric on public.pf_lines(fabric_id);

-- Security: only the signed-in team can read or change anything
do $$
declare t text;
begin
  foreach t in array array['pf_settings','pf_months','pf_runs','pf_fabrics','pf_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "team read %1$s" on public.%1$I', t);
    execute format('drop policy if exists "team write %1$s" on public.%1$I', t);
    execute format('create policy "team read %1$s" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "team write %1$s" on public.%1$I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
