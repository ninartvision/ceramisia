-- 2026-06-03: add missing customer fields used by savePendingOrder()
-- Applies to both pending_orders and completed_orders.

begin;

alter table public.pending_orders
  add column if not exists customer_name text,
  add column if not exists customer_first_name text,
  add column if not exists customer_surname text,
  add column if not exists phone_number text,
  add column if not exists email text,
  add column if not exists message text;

alter table public.completed_orders
  add column if not exists customer_name text,
  add column if not exists customer_first_name text,
  add column if not exists customer_surname text,
  add column if not exists phone_number text,
  add column if not exists email text,
  add column if not exists message text;

commit;
