-- =============================================================================
-- completed_orders — provider + payment_type (Supabase SQL Editor: paste all)
-- Safe: ADD COLUMN IF NOT EXISTS, no DELETE/TRUNCATE; backfill via UPDATE only.
-- CHECK: provider ∈ bog|flitt|tbc, payment_type ∈ card|installment
-- =============================================================================

begin;

alter table public.completed_orders
  add column if not exists provider text;

alter table public.completed_orders
  add column if not exists payment_type text;

-- Backfill NULL / empty (existing non-empty valid values unchanged)
update public.completed_orders
set provider = 'bog'
where provider is null
   or btrim(provider) = '';

update public.completed_orders
set payment_type = 'card'
where payment_type is null
   or btrim(payment_type) = '';

-- Normalize invalid provider before CHECK (no data loss — coerced to 'bog')
update public.completed_orders
set provider = 'bog'
where lower(btrim(provider)) not in ('bog', 'flitt', 'tbc');

-- Normalize invalid payment_type before CHECK (coerced to 'card')
update public.completed_orders
set payment_type = 'card'
where lower(btrim(payment_type)) not in ('card', 'installment');

alter table public.completed_orders
  alter column provider set default 'bog';

alter table public.completed_orders
  alter column payment_type set default 'card';

alter table public.completed_orders
  drop constraint if exists completed_orders_provider_check;

alter table public.completed_orders
  add constraint completed_orders_provider_check
  check (provider in ('bog', 'flitt', 'tbc'));

alter table public.completed_orders
  drop constraint if exists completed_orders_payment_type_check;

alter table public.completed_orders
  add constraint completed_orders_payment_type_check
  check (payment_type in ('card', 'installment'));

commit;
