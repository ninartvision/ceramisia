/**
 * CMS mirror for checkout / payment success. Never blocks payment.
 * Set SANITY_SKIP_ORDER_SYNC=1 to disable.
 * Token must allow create + update on "order" (Editor role recommended).
 */

import crypto from "node:crypto";
import {
  buildSanityOrderFields,
  mergeCustomerWithBank,
  parseCustomerFromBody,
  validateCustomer,
} from "./orderCustomer.js";

function skipSyncEnabled() {
  const v = process.env.SANITY_SKIP_ORDER_SYNC;
  if (v == null || v === "") return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/**
 * Build the `selectedProducts` array for the order schema from raw cart items
 * (as posted by js/cart.js → /api/pay etc.).
 *
 * For every cart item we:
 *  - generate a stable `_key`,
 *  - record `quantity`, `unitPrice`, `lineTotal`,
 *  - store the product display name in `variant` (so it stays visible in
 *    Sanity even if the product is later deleted/renamed),
 *  - and if a Sanity `product` document can be resolved by slug, attach a
 *    proper `{ _type: 'reference', _ref }` so the admin can drill into it.
 *
 * Resolution is best-effort: a Sanity fetch failure (network, token, schema)
 * never blocks the order — items still come through with all the price /
 * quantity / name data, just without the deep link.
 *
 * @param {import('@sanity/client').SanityClient} client
 * @param {Array<{slug?: string, product_id?: string|number, name?: string, title?: string, product_name?: string, quantity?: number|string, unit_price?: number|string}>} items
 * @returns {Promise<Array<object>>}
 */
export async function buildOrderSelectedProducts(client, items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];

  const slugs = [
    ...new Set(
      list
        .map((i) => (typeof i?.slug === "string" ? i.slug.trim() : ""))
        .filter((s) => s.length > 0)
    ),
  ];

  /** @type {Map<string, string>} slug → Sanity product._id */
  const slugToId = new Map();
  if (slugs.length > 0 && client && typeof client.fetch === "function") {
    try {
      const rows = await client.fetch(
        '*[_type=="product" && slug.current in $slugs]{_id, "slug": slug.current}',
        { slugs }
      );
      for (const row of rows || []) {
        if (row?.slug && row?._id) slugToId.set(String(row.slug), String(row._id));
      }
    } catch (err) {
      console.error(
        "[sanityOrderSync] product slug lookup failed (will store items without reference):",
        err?.message || err
      );
    }
  }

  return list.map((i) => {
    const qty = Math.max(1, Number(i?.quantity) || 1);
    const unit = Number(i?.unit_price);
    const validUnit = Number.isFinite(unit) && unit >= 0 ? Number(unit.toFixed(2)) : null;
    const line = validUnit != null ? Number((validUnit * qty).toFixed(2)) : null;

    const displayName =
      (typeof i?.name === "string" && i.name.trim()) ||
      (typeof i?.title === "string" && i.title.trim()) ||
      (typeof i?.product_name === "string" && i.product_name.trim()) ||
      `Product ${i?.product_id ?? ""}`.trim();

    /** @type {{_key: string, quantity: number, variant: string, unitPrice?: number, lineTotal?: number, product?: {_type: string, _ref: string}}} */
    const entry = {
      _key: crypto.randomUUID().replace(/-/g, ""),
      quantity: qty,
      variant: displayName,
    };
    if (validUnit != null) entry.unitPrice = validUnit;
    if (line != null) entry.lineTotal = line;

    const slug = typeof i?.slug === "string" ? i.slug.trim() : "";
    const productId = slug ? slugToId.get(slug) : null;
    if (productId) {
      entry.product = { _type: "reference", _ref: productId };
    }

    return entry;
  });
}

function getToken() {
  return process.env.SANITY_API_TOKEN?.trim() || "";
}

/** Stable Sanity document id per payment order_id (Supabase / Flitt / BOG). */
export function sanityOrderDocumentId(orderId) {
  const s = String(orderId || "").trim();
  if (!s) return null;
  const safe = s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
  return `order.pay.${safe}`;
}

export function formatPaymentProvider(provider, paymentType) {
  const p = String(provider || "").toLowerCase();
  const t = String(paymentType || "card").toLowerCase();
  if (p === "flitt" || p === "tbc") {
    return t === "installment" ? "Flitt / TBC (installment)" : "Flitt / TBC";
  }
  if (p === "bog") {
    return t === "installment" ? "BOG (installment)" : "BOG";
  }
  return p ? p.toUpperCase() : "Unknown";
}

function logSanityError(tag, err) {
  const msg = String(err?.message || err);
  const status = err?.statusCode ?? err?.response?.statusCode;
  const desc = Array.isArray(err?.details)
    ? err.details.map((d) => String(d?.description || "")).join(" ")
    : "";
  const permDenied =
    status === 403 ||
    /\bpermission\b.*\b(create|update)\b|\b(create|update)\b.*required|insufficient permissions/i.test(
      `${msg} ${desc}`
    );

  console.error(`[Sanity:${tag}] failed:`, msg);
  if (err?.response?.body != null) {
    const b = err.response.body;
    console.error(
      "[Sanity] response body:",
      typeof b === "string" ? b : JSON.stringify(b, null, 2).slice(0, 4000)
    );
  }
  if (permDenied) {
    console.error(
      `[Sanity:${tag}] FIX: token needs create/update on "order" — https://sanity.io/manage → API → Tokens`
    );
  }
  return { ok: false, permissionDenied: permDenied };
}

/**
 * Checkout start — cart snapshot (status: new). Uses stable _id when orderId is set.
 */
export async function trySanityCreateOrder(client, doc, contextTag) {
  const tag = contextTag || "checkout";

  if (skipSyncEnabled()) {
    console.log(`[Sanity:${tag}] skipped — SANITY_SKIP_ORDER_SYNC`);
    return { skipped: true, reason: "SANITY_SKIP_ORDER_SYNC" };
  }

  if (!getToken()) {
    console.error(
      `[Sanity:${tag}] SANITY_API_TOKEN missing — add token at https://sanity.io/manage → API → Tokens`
    );
    return { skipped: true, reason: "NO_TOKEN" };
  }

  const orderId = doc?.orderId != null ? String(doc.orderId).trim() : "";
  const docId = sanityOrderDocumentId(orderId);
  const customer = parseCustomerFromBody(doc);
  const validation = validateCustomer(customer);
  if (!validation.ok) {
    console.error(`[Sanity:${tag}] invalid customer — skip create`, {
      orderId: orderId || null,
      errors: validation.errors,
    });
    return { skipped: true, reason: "INVALID_CUSTOMER", errors: validation.errors };
  }

  const payload = buildSanityOrderFields(validation.customer, {
    ...doc,
    orderId,
    customerName: validation.customer.customerName,
    customerSurname: validation.customer.customerSurname,
    phoneNumber: validation.customer.phoneNumber,
    email: validation.customer.email,
    message: validation.customer.message || doc.message || "",
  });
  if (docId) payload._id = docId;

  try {
    await client.createOrReplace(payload);
    console.log(`[Sanity:${tag}] order document saved`, {
      orderId: orderId || null,
      documentId: docId || null,
    });
    return { ok: true };
  } catch (err) {
    return logSanityError(tag, err);
  }
}

/**
 * Payment success — merge with existing checkout doc (keeps line items) and mark completed.
 */
export async function syncSanityOrderOnPaymentSuccess(client, data, contextTag) {
  const tag = contextTag || "payment-success";

  if (skipSyncEnabled()) {
    console.log(`[Sanity:${tag}] skipped — SANITY_SKIP_ORDER_SYNC`);
    return { skipped: true, reason: "SANITY_SKIP_ORDER_SYNC" };
  }

  if (!getToken()) {
    console.error(
      `[Sanity:${tag}] SANITY_API_TOKEN missing — add token at https://sanity.io/manage → API → Tokens`
    );
    return { skipped: true, reason: "NO_TOKEN" };
  }

  const orderId = String(data?.orderId || "").trim();
  if (!orderId) {
    console.error(`[Sanity:${tag}] missing orderId`);
    return { skipped: true, reason: "NO_ORDER_ID" };
  }

  const docId = sanityOrderDocumentId(orderId);
  if (!docId) {
    return { skipped: true, reason: "INVALID_ORDER_ID" };
  }

  const providerLabel = formatPaymentProvider(
    data.provider,
    data.paymentType
  );
  const paymentStatus = String(data.paymentStatus || "approved");
  const amount =
    data.amount != null && Number.isFinite(Number(data.amount))
      ? Number(data.amount)
      : undefined;

  let existing = null;
  try {
    existing = await client.getDocument(docId);
  } catch {
    /* new doc */
  }

  // Prefer the enriched cart snapshot persisted at checkout start (it has the
  // proper product references + prices). If that snapshot is missing or empty
  // (e.g., the checkout-start Sanity write failed earlier), fall back to
  // whatever the callback handler was able to pass in. Crucially, treat an
  // empty array as "missing" — JS truthiness considers `[]` truthy, which
  // would otherwise silently clobber a non-empty `data.selectedProducts`.
  const existingItems = Array.isArray(existing?.selectedProducts)
    ? existing.selectedProducts
    : null;
  const dataItems = Array.isArray(data?.selectedProducts)
    ? data.selectedProducts
    : null;
  const selectedProducts =
    existingItems && existingItems.length > 0
      ? existingItems
      : dataItems && dataItems.length > 0
        ? dataItems
        : [];

  const checkoutCustomer = parseCustomerFromBody({
    customerName: existing?.customerName ?? data?.customerName,
    customerSurname: existing?.customerSurname ?? data?.customerSurname,
    phoneNumber:
      existing?.phoneNumber ?? existing?.phone ?? data?.phoneNumber ?? data?.phone,
    email: existing?.email ?? data?.email,
    message: existing?.message ?? data?.message,
  });

  const bankBuyer = data?.bankBuyer && typeof data.bankBuyer === "object" ? data.bankBuyer : null;
  const mergedCustomer = mergeCustomerWithBank(checkoutCustomer, bankBuyer);
  const validation = validateCustomer(mergedCustomer);
  if (!validation.ok) {
    console.error(`[Sanity:${tag}] cannot sync — customer data incomplete`, {
      orderId,
      errors: validation.errors,
    });
    return { skipped: true, reason: "INVALID_CUSTOMER", errors: validation.errors };
  }

  const doc = buildSanityOrderFields(validation.customer, {
    _id: docId,
    orderId,
    message:
      validation.customer.message ||
      existing?.message ||
      data?.message ||
      `Payment completed via ${providerLabel}`,
    amount: amount ?? existing?.amount,
    paymentProvider: providerLabel,
    paymentStatus,
    status: "completed",
    selectedProducts,
    createdAt: existing?.createdAt || data.createdAt || new Date().toISOString(),
  });

  if (selectedProducts.length === 0) {
    console.warn(
      `[Sanity:${tag}] order has no line items — the checkout-start sync may have failed for this orderId`,
      { orderId, documentId: docId }
    );
  }

  try {
    await client.createOrReplace(doc);
    console.log(`[Sanity:${tag}] order synced to Studio`, {
      orderId,
      documentId: docId,
      paymentProvider: providerLabel,
      paymentStatus,
    });
    return { ok: true };
  } catch (err) {
    return logSanityError(tag, err);
  }
}

/** Non-blocking wrapper for payment callbacks. */
export function fireSanityOrderOnPaymentSuccess(client, data, contextTag) {
  syncSanityOrderOnPaymentSuccess(client, data, contextTag).catch((err) => {
    console.error(
      `[Sanity:${contextTag || "payment-success"}] async sync error:`,
      err?.message
    );
  });
}
