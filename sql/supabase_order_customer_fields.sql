-- Customer fields on pending_orders + completed_orders (run in Supabase SQL Editor)
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
