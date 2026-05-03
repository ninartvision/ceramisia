import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase client (lazy) — validates env before first query.
// MODULE-LEVEL createClient(undefined, …) crashes or misbehaves when env is
// missing; lazy init avoids opaque cold-start crashes.
// ---------------------------------------------------------------------------
let _supabase = null;

function wrapDb(operation, error) {
  const e = new Error(error?.message ?? "Supabase error");
  e.name = "SupabasePostgrestError";
  e.dbOperation = operation;
  e.pgCode = error?.code ?? null;
  e.hint = error?.hint ?? null;
  return e;
}

function getSupabase() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const e = new Error(
      !url && !key
        ? "Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
        : !url
          ? "Missing SUPABASE_URL"
          : "Missing SUPABASE_SERVICE_ROLE_KEY"
    );
    e.name = "SupabaseEnvError";
    e.code = "SUPABASE_ENV_MISSING";
    throw e;
  }

  _supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _supabase;
}

/**
 * Resolve catalog prices keyed by *client line key* (= cart composite id).
 * `lineItems[].client_key` MUST match frontend `product_id`; optional `slug`
 * is used when `products.id` in DB is Sanity slug/uuid rather than composite id.
 *
 * Queries:
 *   1) products where id ∈ client_keys
 *   2) if unresolved & slug provided: products where slug ∈ slugs
 */
export async function getProductPrices(lineItems) {
  const supabase = getSupabase();
  const clientKeys = [
    ...new Set(
      lineItems.map((row) => String(row.client_key ?? row.product_id)).filter(Boolean)
    ),
  ];
  const slugs = [
    ...new Set(
      lineItems.map((row) => row.slug).filter((s) => typeof s === "string" && s.length > 0)
    ),
  ];

  const priceByClientKey = new Map();

  // PostgREST rejects empty `.in()` — never call with [].
  let byIdRows = [];
  if (clientKeys.length > 0) {
    const { data: byId, error: errId } = await supabase
      .from("products")
      .select("id, price")
      .in("id", clientKeys);

    if (errId) throw wrapDb("getProductPrices.id_in", errId);
    byIdRows = byId ?? [];
  }

  for (const row of byIdRows) {
    priceByClientKey.set(String(row.id), Number(row.price));
  }

  const unresolved = lineItems.filter(
    (row) => !priceByClientKey.has(String(row.client_key ?? row.product_id))
  );
  if (unresolved.length && slugs.length > 0) {
    const { data: bySlug, error: errSlug } = await supabase
      .from("products")
      .select("id, price, slug")
      .in("slug", slugs);

    if (errSlug) throw wrapDb("getProductPrices.slug_in", errSlug);

    for (const line of unresolved) {
      const sk = String(line.client_key ?? line.product_id);
      if (priceByClientKey.has(sk)) continue;
      const row = (bySlug ?? []).find((r) => r.slug === line.slug);
      if (row) priceByClientKey.set(sk, Number(row.price));
    }
  }

  return priceByClientKey;
}

export async function savePendingOrder(orderId, amount) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("pending_orders")
    .insert({ order_id: orderId, amount, status: "pending" });

  if (error) throw wrapDb("savePendingOrder.insert", error);
}

export async function getExpectedAmount(orderId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("pending_orders")
    .select("amount")
    .eq("order_id", orderId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw wrapDb("getExpectedAmount.select", error);
  }

  return data?.amount ?? null;
}

export async function saveOrderToDB({
  orderId,
  status,
  amount,
  customerName,
  phone,
  payload,
}) {
  const supabase = getSupabase();
  const { error } = await supabase.from("completed_orders").insert({
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
    throw wrapDb("saveOrderToDB.insert", error);
  }
}

export async function updatePendingOrderStatus(orderId, status) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("pending_orders")
    .update({ status })
    .eq("order_id", orderId);

  if (error) throw wrapDb("updatePendingOrderStatus.update", error);
}

export async function getCompletedOrder(orderId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("completed_orders")
    .select("order_id, amount, status, refunded_amount")
    .eq("order_id", orderId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw wrapDb("getCompletedOrder.select", error);
  }

  return data ?? null;
}

export async function recordRefund(orderId, refundAmount) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("increment_refunded_amount", {
    p_order_id: orderId,
    p_refund_amount: refundAmount,
  });

  if (error) throw wrapDb("recordRefund.rpc", error);
  return data === 1;
}
