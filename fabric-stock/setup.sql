-- ============================================================
-- Jawda Fabric Stock — one-time setup (run after production-forecast/setup.sql)
-- Links each fabric purchase to the stock fabric it adds to.
-- Fabric left = counted stock + purchases logged since the count − yards on runs since the count
-- ============================================================
alter table public.fabric_purchases
  add column if not exists stock_fabric_id uuid references public.pf_fabrics(id) on delete set null;
create index if not exists fabric_purchases_stock on public.fabric_purchases(stock_fabric_id);
