import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------
// Uses the SERVICE_ROLE key — never expose this on the client side.
// Set both variables in Vercel → Project → Settings → Environment Variables.
//
// SUPABASE_URL           → https://<project-id>.supabase.co
// SUPABASE_SERVICE_ROLE_KEY → found in Supabase → Project Settings → API
// ---------------------------------------------------------------------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------------------------------
// getProductPrices
// ---------------------------------------------------------------------------
// Returns a Map<product_id, unit_price> for the given product IDs.
// Called in pay.js to validate client-supplied prices against the catalog.
// Returns an empty Map if the products table does not exist or has no rows.
//
// @param {string[]} productIds
// @returns {Map<string, number>}
// ---------------------------------------------------------------------------
export async function getProductPrices(productIds) {
  const { data, error } = await supabase
    .from("products")
    .select("id, price")
    .in("id", productIds);

  if (error) throw error;

  const map = new Map();
  for (const row of data ?? []) {
    map.set(String(row.id), Number(row.price));
  }
  return map;
}

// ---------------------------------------------------------------------------
// savePendingOrder
// ---------------------------------------------------------------------------
// Called in pay.js immediately after BOG returns a valid order ID.
// Stores the order so the callback handler can verify the expected amount.
//
// @param {string} orderId  — BOG's order ID (data.id from the create response)
// @param {number} amount   — amount charged, in GEL
// ---------------------------------------------------------------------------
export async function savePendingOrder(orderId, amount) {
  const { error } = await supabase
    .from("pending_orders")
    .insert({ order_id: orderId, amount, status: "pending" });

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// getExpectedAmount
// ---------------------------------------------------------------------------
// Called in callback.js to cross-check the callback amount.
// Returns null if the order does not exist in pending_orders.
//
// @param {string} orderId
// @returns {number|null}
// ---------------------------------------------------------------------------
export async function getExpectedAmount(orderId) {
  const { data, error } = await supabase
    .from("pending_orders")
    .select("amount")
    .eq("order_id", orderId)
    .single();

  if (error) {
    // PGRST116 = no rows found (PostgREST error code)
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data?.amount ?? null;
}

// ---------------------------------------------------------------------------
// saveOrderToDB
// ---------------------------------------------------------------------------
// Inserts a completed payment into completed_orders.
// Throws with code "23505" if this order_id was already inserted (duplicate).
// The caller is responsible for catching "23505" and treating it as a no-op.
//
// @param {{ orderId, status, amount, customerName, phone, payload }}
// ---------------------------------------------------------------------------
export async function saveOrderToDB({ orderId, status, amount, customerName, phone, payload }) {
  const { error } = await supabase
    .from("completed_orders")
    .insert({
      order_id: orderId,
      status,
      amount,
      customer_name: customerName,
      phone,
      payload,
    });

  if (error) {
    if (error.code === "23505") {
      const e = new Error("Duplicate order");
      e.code = "23505";
      throw e;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// updatePendingOrderStatus
// ---------------------------------------------------------------------------
// Updates the status column on pending_orders after the callback is processed.
// Errors here are non-critical (logged but not re-thrown in the callback).
//
// @param {string} orderId
// @param {"success"|"failed"} status
// ---------------------------------------------------------------------------
export async function updatePendingOrderStatus(orderId, status) {
  const { error } = await supabase
    .from("pending_orders")
    .update({ status })
    .eq("order_id", orderId);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// getCompletedOrder
// ---------------------------------------------------------------------------
// Called in index.js /refund to verify the order was actually paid and to
// retrieve the original amount before issuing a refund to BOG.
// Returns null if the order does not exist in completed_orders.
//
// @param {string} orderId
// @returns {{ order_id: string, amount: number, status: string }|null}
// ---------------------------------------------------------------------------
export async function getCompletedOrder(orderId) {
  const { data, error } = await supabase
    .from("completed_orders")
    .select("order_id, amount, status, refunded_amount")
    .eq("order_id", orderId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data ?? null;
}

// ---------------------------------------------------------------------------
// recordRefund
// ---------------------------------------------------------------------------
// Atomically increments refunded_amount by `refundAmount` using a Postgres
// conditional UPDATE. The WHERE clause re-checks that adding the new refund
// does not exceed the original paid amount — prevents a race condition where
// two concurrent refund requests both pass the in-memory check independently.
//
// Returns true if the row was updated (refund recorded), false if it was
// rejected by the DB constraint (concurrent over-refund attempt).
//
// @param {string} orderId
// @param {number} refundAmount
// @returns {boolean}
// ---------------------------------------------------------------------------
export async function recordRefund(orderId, refundAmount) {
  const { data, error } = await supabase.rpc("increment_refunded_amount", {
    p_order_id: orderId,
    p_refund_amount: refundAmount,
  });

  if (error) throw error;
  // The RPC returns the number of rows updated (1 = success, 0 = constraint blocked it)
  return data === 1;
}
