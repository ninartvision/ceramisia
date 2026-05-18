/**
 * CMS mirror for checkout / payment success. Never blocks payment.
 * Set SANITY_SKIP_ORDER_SYNC=1 to disable.
 * Token must allow create + update on "order" (Editor role recommended).
 */

function skipSyncEnabled() {
  const v = process.env.SANITY_SKIP_ORDER_SYNC;
  if (v == null || v === "") return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
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
  const payload = { ...doc };
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

  const doc = {
    _id: docId,
    _type: "order",
    orderId,
    customerName:
      data.customerName ||
      existing?.customerName ||
      "Customer",
    email: data.email != null ? String(data.email) : existing?.email || "",
    phone: data.phone != null ? String(data.phone) : existing?.phone || "",
    message:
      data.message ||
      existing?.message ||
      `Payment completed via ${providerLabel}`,
    amount: amount ?? existing?.amount,
    paymentProvider: providerLabel,
    paymentStatus,
    status: "completed",
    selectedProducts: existing?.selectedProducts || data.selectedProducts || [],
    createdAt: existing?.createdAt || data.createdAt || new Date().toISOString(),
  };

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
