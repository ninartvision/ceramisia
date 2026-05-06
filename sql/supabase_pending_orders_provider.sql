-- =============================================================================
-- pending_orders: provider + payment_type + provider CHECK (bog | flitt | tbc)
-- Supabase → SQL Editor: paste and run as one block.
-- Safe: IF NOT EXISTS, DROP CONSTRAINT IF EXISTS, no DELETE; only UPDATE backfill.
-- =============================================================================

begin;

-- 1) Columns (no data loss)
alter table public.pending_orders
  add column if not exists provider text;

alter table public.pending_orders
  add column if not exists payment_type text;

-- 2) Backfill NULL / empty only (existing non-empty values kept unless invalid provider)
update public.pending_orders
set provider = 'bog'
where provider is null
   or btrim(provider) = '';

update public.pending_orders
set payment_type = 'card'
where payment_type is null
   or btrim(payment_type) = '';

-- 3) Normalize provider so the new CHECK always applies (unknown → 'bog')
update public.pending_orders
set provider = 'bog'
where provider is not null
  and lower(btrim(provider)) not in ('bog', 'flitt', 'tbc');

-- 4) Defaults for future INSERTs
alter table public.pending_orders
  alter column provider set default 'bog';

alter table public.pending_orders
  alter column payment_type set default 'card';

-- 5) CHECK on provider: replace named constraint if present, then add
alter table public.pending_orders
  drop constraint if exists pending_orders_provider_check;

alter table public.pending_orders
  add constraint pending_orders_provider_check
  check (
    provider is null
    or provider in ('bog', 'flitt', 'tbc')
  );

commit;
