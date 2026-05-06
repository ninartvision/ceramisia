import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Supabase client (lazy) — validates env before first query.
// MODULE-LEVEL createClient(undefined, …) crashes or misbehaves when env is
// missing; lazy init avoids opaque cold-start crashes.
// ---------------------------------------------------------------------------
let _supabase = null;

/** Trim BOM/quotes — fixes common copy-paste issues in Vercel/hosting env. */
function normalizeEnvString(v) {
  if (v == null) return "";
  return String(v)
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function wrapDb(operation, error) {
  const e = new Error(error?.message ?? "Supabase error");
  e.name = "SupabasePostgrestError";
  e.dbOperation = operation;
  const code = error?.code ?? null;
  e.code = code;
  e.pgCode = code;
  e.hint = error?.hint ?? null;
  if (error?.details != null) e.details = error.details;
  return e;
}

function getSupabase() {
  if (_supabase) return _supabase;

  let url = normalizeEnvString(process.env.SUPABASE_URL);
  const key = normalizeEnvString(process.env.SUPABASE_SERVICE_ROLE_KEY);
  while (url.endsWith("/")) url = url.slice(0, -1);
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

  if (!/^https?:\/\//i.test(url)) {
    const e = new Error("SUPABASE_URL must start with http:// or https://");
    e.name = "SupabaseEnvError";
    e.code = "SUPABASE_URL_INVALID";
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

export async function savePendingOrder(
  orderId,
  amount,
  provider = "bog",
  paymentType = "card"
) {
  const supabase = getSupabase();
  const amountNum = parseFloat(Number(amount).toFixed(2));
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    const e = new Error("savePendingOrder: invalid amount");
    e.name = "SupabasePostgrestError";
    e.dbOperation = "savePendingOrder.validate";
    e.pgCode = "CLIENT_VALIDATION";
    throw e;
  }

  const payload = {
    order_id: String(orderId),
    amount: amountNum,
    status: "pending",
    provider: String(provider),
    payment_type: String(paymentType),
  };

  console.log("[savePendingOrder] inserting pending_orders", {
    order_id: payload.order_id,
    amount: payload.amount,
    provider: payload.provider,
    payment_type: payload.payment_type,
  });

  const { error } = await supabase.from("pending_orders").insert(payload);

  if (error) {
    console.error("[savePendingOrder] Supabase insert failed", {
      order_id: payload.order_id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw wrapDb("savePendingOrder.insert", error);
  }
}

/**
 * @returns {Promise<{ amount: number, provider: string, payment_type: string } | null>}
 */
export async function getPendingOrder(orderId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("pending_orders")
    .select("amount, provider, payment_type")
    .eq("order_id", orderId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw wrapDb("getPendingOrder.select", error);
  }

  if (!data) return null;
  const amount = data.amount != null ? Number(data.amount) : null;
  if (!Number.isFinite(amount)) return null;
  const provider =
    typeof data.provider === "string" && data.provider.trim() !== ""
      ? data.provider.trim()
      : "bog";
  const paymentType =
    typeof data.payment_type === "string" && data.payment_type.trim() !== ""
      ? data.payment_type.trim()
      : "card";
  return { amount, provider, payment_type: paymentType };
}

export async function getExpectedAmount(orderId) {
  const row = await getPendingOrder(orderId);
  return row?.amount ?? null;
}

export async function saveOrderToDB({
  orderId,
  status,
  amount,
  customerName,
  phone,
  payload,
  provider = "bog",
  payment_type = "card",
}) {
  const supabase = getSupabase();
  const { error } = await supabase.from("completed_orders").insert({
    order_id: orderId,
    status,
    amount,
    customer_name: customerName,
    phone,
    payload,
    provider,
    payment_type,
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
