-- =============================================================================
-- Unique order_id constraint for pending_orders and completed_orders
-- Supabase SQL Editor: paste and run as one block.
-- WARNING: if duplicate order_id values already exist, remove or dedupe them
-- before applying this migration.
-- =============================================================================

begin;

alter table public.pending_orders
  add constraint if not exists pending_orders_order_id_unique unique (order_id);

alter table public.completed_orders
  add constraint if not exists completed_orders_order_id_unique unique (order_id);

commit;
