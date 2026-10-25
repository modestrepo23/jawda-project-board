-- ============================================================
-- Jawda Samples + Swatch Collections — one-time setup
-- Supabase → SQL Editor → New query → paste this → Run
-- ============================================================

-- A sample collection, e.g. "Ramadan Collection" (one per SAMPLES tab in the tracker)
create table if not exists public.sample_collections (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  launch      text,                 -- e.g. "Ramadan 2027"
  tracker_gid bigint,               -- the SAMPLES tab in the Bangladesh tracker
  archived    boolean not null default false,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A fabric swatch we might make samples from
create table if not exists public.swatches (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,          -- SW001…
  name        text not null,
  group_name  text,                 -- the swatch collection it belongs to, e.g. "Nice Fabrics – mill fabrics"
  supplier    text,                 -- Nice, Sadia, a market store…
  composition text,
  weight      text,                 -- e.g. 250 GSM, medium, heavy
  description text,                 -- how it feels, what it's like
  colours     text,                 -- colours available and quantities, free text
  price       text,                 -- e.g. $2.20 / yd
  status      text not null default 'Considering' check (status in ('Considering','Sampling','Approved','Ordered','Rejected')),
  stock_name  text,                 -- matching fabric name in Fabric Stock (pf_fabrics.name), to show yards held
  images      jsonb not null default '[]'::jsonb,   -- [{"path":"swatches/…jpg"}]
  notes       text,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A sample (one row per design + fabric option, like the tracker)
create table if not exists public.samples (
  id               uuid primary key default gen_random_uuid(),
  collection_id    uuid not null references public.sample_collections(id) on delete cascade,
  item_no          text,            -- e.g. JUW26-49
  name             text not null,
  launch_group     text,            -- P1, P2…
  type             text,            -- Abaya, Dress, Two-Piece…
  sizing           text,            -- 50-60, XS-XL
  pcs              int,
  techpack_status  text,
  sample_status    text,
  fabric_status    text,
  feedback_status  text,
  detailing        text,
  techpack_name    text,
  techpack_link    text,
  swatch_ids       uuid[] not null default '{}',
  fabric_note      text,            -- fabric as written in the tracker / extra fabric notes
  colours          text,
  accessories      text,
  accessories_qty  text,
  notes            text,
  feedback         text,
  changes          text,
  images           jsonb not null default '[]'::jsonb,  -- [{"path":"samples/…jpg","kind":"sample"|"reference"}]
  sort             int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists samples_collection on public.samples(collection_id);

do $$
declare t text;
begin
  foreach t in array array['sample_collections','swatches','samples'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "team read %1$s" on public.%1$I', t);
    execute format('drop policy if exists "team write %1$s" on public.%1$I', t);
    execute format('create policy "team read %1$s" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "team write %1$s" on public.%1$I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Private picture store (sample photos, references, swatch photos). Signed-in team only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('jawda-media', 'jawda-media', false, 10485760, array['image/jpeg','image/png','image/webp','image/gif','image/heic'])
on conflict (id) do nothing;
drop policy if exists "team read media"   on storage.objects;
drop policy if exists "team add media"    on storage.objects;
drop policy if exists "team change media" on storage.objects;
drop policy if exists "team remove media" on storage.objects;
create policy "team read media"   on storage.objects for select to authenticated using (bucket_id = 'jawda-media');
create policy "team add media"    on storage.objects for insert to authenticated with check (bucket_id = 'jawda-media');
create policy "team change media" on storage.objects for update to authenticated using (bucket_id = 'jawda-media');
create policy "team remove media" on storage.objects for delete to authenticated using (bucket_id = 'jawda-media');
