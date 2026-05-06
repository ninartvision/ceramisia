import crypto from "crypto";
import fetch from "node-fetch";
import getRawBody from "raw-body";
import {
  getPendingOrder,
  saveOrderToDB,
  updatePendingOrderStatus,
} from "./_db.js";
import { fetchInstallmentCheckoutDetails } from "./_bogInstallmentApi.js";

// Regex for BOG order IDs — used to sanitize before DB queries and API calls
const BOG_ORDER_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const BOG_INSTALL_ORDER_ID_RE = /^[a-zA-Z0-9._-]{8,128}$/;

// Token cache shared by verifyReceiptWithBOG — avoids a fresh OAuth round-trip on every callback.
let _receiptToken = null;
let _receiptTokenExpiresAt = 0;

// Maximum age of a callback we will accept (5 minutes).
// Prevents replaying a legitimately signed request captured earlier.
const MAX_CALLBACK_AGE_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// verifyReceiptWithBOG
// ---------------------------------------------------------------------------
// Independently confirms payment status via the BOG receipt API.
// The callback payload must NEVER be the sole source of truth for a completed
// payment — this second call closes the window where a compromised/forged
// payload with a valid signature could trigger order fulfilment.
//
// Returns true only when BOG confirms:
//   order_status.key === "completed"  AND  payment_detail.code === "000"
//   AND receipt total_amount matches the amount stored at order creation.
// ---------------------------------------------------------------------------
async function verifyReceiptWithBOG(orderId, expectedAmount) {
  // Reuse cached token when still valid (60s buffer)
  const now = Date.now();
  if (!_receiptToken || _receiptTokenExpiresAt - now < 60_000) {
    const credentials = Buffer.from(
      `${process.env.BOG_CLIENT_ID}:${process.env.BOG_CLIENT_SECRET || process.env.BOG_SECRET_KEY}`
    ).toString("base64");

    const tokenRes = await fetch("https://api.bog.ge/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!tokenRes.ok) throw new Error(`BOG token failed: ${tokenRes.status}`);
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error("No access_token from BOG");
    _receiptToken = tokenData.access_token;
    _receiptTokenExpiresAt = now + tokenData.expires_in * 1000;
  }

  const receiptRes = await fetch(
    `https://api.bog.ge/payments/v1/receipt/${orderId}`,
    { headers: { Authorization: `Bearer ${_receiptToken}` } }
  );
  if (!receiptRes.ok) throw new Error(`BOG receipt fetch failed: ${receiptRes.status}`);

  const receipt = await receiptRes.json();
  const statusKey = receipt?.order_status?.key;
  const paymentCode = receipt?.payment_detail?.code;
  const receiptAmount = receipt?.purchase_units?.total_amount;

  console.log("BOG callback: receipt check", { orderId, statusKey, paymentCode, receiptAmount });

  if (statusKey !== "completed" || paymentCode !== "000") return false;

  // Guard against NaN: if BOG omits total_amount from the receipt,
  // Number(undefined) = NaN and NaN > 0.01 = false — bypassing the check.
  // A receipt without an amount is not a safe confirmation.
  const numReceiptAmount = Number(receiptAmount);
  if (!Number.isFinite(numReceiptAmount)) {
    console.error("BOG callback: receipt missing total_amount", { orderId });
    return false;
  }

  // Cross-check receipt amount against what we stored at order creation time.
  // Closes the gap where callback payload and independent receipt could diverge.
  if (Math.abs(numReceiptAmount - Number(expectedAmount)) > 0.01) {
    console.error("BOG callback: receipt amount mismatch", { receiptAmount, expectedAmount, orderId });
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Vercel config — disable built-in body parsing.
// We must read the raw bytes ourselves for correct RSA signature verification.
// ---------------------------------------------------------------------------
export const config = {
  api: { bodyParser: false },
};

// ---------------------------------------------------------------------------
// BOG Installment callback (no RSA signature — often same URL as ecommerce)
// ---------------------------------------------------------------------------
/**
 * @returns {null | { status: string, order_id: string, shop_order_id?: string }}
 */
function tryParseInstallmentCallback(rawBody) {
  const text = rawBody.toString("utf8").trim();
  if (!text) return null;

  if (text.startsWith("{")) {
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      return null;
    }
    if (j.event === "order_payment") return null;
    const pm = String(j.payment_method || "")
      .trim()
      .toUpperCase()
      .replace(/-/g, "_");
    if (pm !== "BOG_LOAN") return null;
    if (!j.order_id || !j.status) return null;
    return {
      status: String(j.status),
      order_id: String(j.order_id),
      shop_order_id: j.shop_order_id != null ? String(j.shop_order_id) : "",
    };
  }

  const params = new URLSearchParams(text);
  const pm = String(params.get("payment_method") || "")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");
  if (pm !== "BOG_LOAN") return null;
  const order_id = params.get("order_id");
  const status = params.get("status");
  if (!order_id || !status) return null;
  return {
    status: String(status),
    order_id: String(order_id),
    shop_order_id: params.get("shop_order_id") || "",
  };
}

async function processBogInstallmentCallback({ status, order_id, shop_order_id }) {
  console.log("[bog-installment] callback inbound", {
    status,
    order_id,
    shop_order_id,
  });

  if (!order_id || !BOG_INSTALL_ORDER_ID_RE.test(order_id)) {
    console.error("[bog-installment] callback invalid order_id");
    return;
  }

  const pending = await getPendingOrder(order_id);
  if (!pending) {
    console.error("[bog-installment] callback unknown order_id", order_id);
    return;
  }
  if (pending.provider !== "bog" || pending.payment_type !== "installment") {
    console.error("[bog-installment] callback pending row mismatch", {
      order_id,
      pending,
    });
    return;
  }

  if (status === "reverse_success") {
    await updatePendingOrderStatus(order_id, "failed").catch((err) =>
      console.error("[bog-installment] pending update:", err?.message)
    );
    return;
  }

  if (status === "error") {
    await updatePendingOrderStatus(order_id, "failed").catch((err) =>
      console.error("[bog-installment] pending update:", err?.message)
    );
    return;
  }

  if (status !== "success") {
    console.log("[bog-installment] callback non-success status — ignored", status);
    return;
  }

  let details;
  try {
    details = await fetchInstallmentCheckoutDetails(order_id);
  } catch (err) {
    console.error("[bog-installment] details API error — will retry", err?.message);
    throw err;
  }

  if (details.status !== "success" || details.installment_status !== "success") {
    console.error("[bog-installment] details not fully successful", {
      order_id,
      status: details.status,
      installment_status: details.installment_status,
    });
    return;
  }

  const expectedAmount = pending.amount;

  try {
    console.log("[bog-installment] saving completed_orders", {
      order_id,
      amount: expectedAmount,
    });
    await saveOrderToDB({
      orderId: order_id,
      status: details.status,
      amount: expectedAmount,
      customerName: undefined,
      phone: undefined,
      payload: {
        callback: { status, order_id, shop_order_id },
        details,
      },
      provider: "bog",
      payment_type: "installment",
    });
    await updatePendingOrderStatus(order_id, "success").catch((err) =>
      console.error("[bog-installment] pending success update:", err?.message)
    );
    console.log("[bog-installment] completed_orders insert ok", { order_id });
  } catch (dbErr) {
    if (dbErr.code === "23505" || dbErr.code === "DUPLICATE") {
      console.log("[bog-installment] duplicate completed order ignored", {
        order_id,
      });
    } else {
      console.error("[bog-installment] DB error", dbErr?.message);
      throw dbErr;
    }
  }
}

// ---------------------------------------------------------------------------
// isValidSignature
// ---------------------------------------------------------------------------
// BOG signs the exact raw request body bytes with RSA-SHA256 (SHA256withRSA).
// Set BOG_PUBLIC_KEY in Vercel → Project → Settings → Environment Variables.
// ---------------------------------------------------------------------------
function isValidSignature(rawBody, signatureHeader) {
  const publicKey = process.env.BOG_PUBLIC_KEY;

  if (!publicKey) {
    console.error("BOG callback: BOG_PUBLIC_KEY is not configured");
    return false;
  }

  if (!signatureHeader) {
    console.error("BOG callback: signature header missing");
    return false;
  }

  try {
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(rawBody);
    return verifier.verify(publicKey, signatureHeader, "base64");
  } catch (err) {
    console.error("BOG callback: signature verification error:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  // BOG retries on any non-200 — ALWAYS respond 200, even on failure.
  try {
    if (req.method !== "POST") {
      return res.status(200).send("OK");
    }

    // 1. Read raw body bytes (required for correct RSA signature verification)
    let rawBody;
    try {
      rawBody = await getRawBody(req, { limit: "1mb" });
    } catch (err) {
      console.error("BOG callback: failed to read request body:", err);
      return res.status(200).send("OK");
    }

    const installmentPayload = tryParseInstallmentCallback(rawBody);
    if (installmentPayload) {
      try {
        await processBogInstallmentCallback(installmentPayload);
      } catch (err) {
        console.error("[bog-installment] callback unhandled:", err);
      }
      return res.status(200).send("OK");
    }

    // 2. E-commerce card: RSA-SHA256 signature on raw JSON body
    const signatureHeader =
      req.headers["x-bog-signature"] || req.headers["x-signature"];

    if (!isValidSignature(rawBody, signatureHeader)) {
      console.error("BOG callback: invalid signature — request rejected");
      return res.status(400).send("Invalid signature");
    }

    console.log("BOG callback: signature verified successfully");

    // 3. Parse JSON only after signature is confirmed valid
    let body;
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch (err) {
      console.error("BOG callback: invalid JSON body:", err);
      return res.status(200).send("OK");
    }

    // Log payload without PII fields
    const { body: _b, ...logSafeBody } = body;
    console.log("BOG callback payload:", JSON.stringify(logSafeBody));

    // 4. Ignore unrecognised event types
    if (body.event !== "order_payment") {
      return res.status(200).send("OK");
    }

    // BOG nests order fields under body.body
    const bogBody = body.body ?? {};
    const order_id = bogBody.order_id;
    const statusKey = bogBody.order_status?.key;
    const amount = bogBody.purchase_units?.request_amount;
    const customerName = bogBody.buyer?.full_name;
    const phone = bogBody.buyer?.phone_number;

    if (!order_id || !statusKey) {
      console.warn("BOG callback: missing required fields", { order_id, statusKey });
      return res.status(200).send("OK");
    }

    // Validate order_id format before using it in DB queries or API calls
    if (!BOG_ORDER_ID_RE.test(order_id)) {
      console.error("BOG callback: invalid order_id format");
      return res.status(200).send("OK");
    }

    // Replay protection — BOG always includes zoned_request_time in every signed payload.
    // Missing field is suspicious; stale field indicates a replayed request.
    if (!body.zoned_request_time) {
      console.error("BOG callback: missing zoned_request_time — rejecting");
      return res.status(200).send("OK");
    }
    const callbackAge = Date.now() - new Date(body.zoned_request_time).getTime();
    if (callbackAge > MAX_CALLBACK_AGE_MS) {
      console.error("BOG callback: request too old, possible replay", {
        ageMs: callbackAge,
      });
      return res.status(200).send("OK");
    }

    console.log("[callback] BOG callback received:", { order_id, statusKey, amount });

    // 5. Amount validation — fetch stored amount and compare
    const pendingRow = await getPendingOrder(order_id);

    if (!pendingRow) {
      // Order not found in pending_orders — could be a forged or stale callback.
      console.error("[callback] unknown order_id (no pending_orders row):", order_id);
      return res.status(200).send("OK");
    }

    if (pendingRow.payment_type !== "card") {
      console.log("[callback] skip ecommerce handler — not card pending", {
        order_id,
        payment_type: pendingRow.payment_type,
      });
      return res.status(200).send("OK");
    }

    const expectedAmount = pendingRow.amount;

    console.log("[callback] pending_orders matched", {
      order_id,
      expectedAmount,
    });

    // Guard against NaN: Number(undefined) = NaN, and NaN > 0.01 = false,
    // which would silently bypass the mismatch check.
    // Amount may legitimately be absent on non-completed callbacks (failed/rejected),
    // but for any callback reaching this point we require a numeric value.
    const numCallbackAmount = Number(amount);
    if (!Number.isFinite(numCallbackAmount)) {
      console.error("BOG callback: missing or non-numeric amount", { order_id, amount });
      return res.status(200).send("OK");
    }

    if (Math.abs(Number(expectedAmount) - numCallbackAmount) > 0.01) {
      console.error(
        "BOG callback: amount mismatch — expected:",
        expectedAmount,
        "received:",
        numCallbackAmount,
        "| order:",
        order_id
      );
      return res.status(200).send("OK");
    }

    // 6. Process result
    if (statusKey === "completed") {
      // Independent receipt verification — never trust the callback payload alone.
      // Confirm directly with BOG API before writing to the database.
      let receiptConfirmed = false;
      try {
        receiptConfirmed = await verifyReceiptWithBOG(order_id, expectedAmount);
      } catch (receiptErr) {
        console.error("BOG callback: receipt verification error:", receiptErr.message);
        // Throw so the outer catch handles it and BOG will retry the callback
        throw receiptErr;
      }

      if (!receiptConfirmed) {
        console.error(
          "[callback] receipt not confirmed by BOG API — skipping completed_orders",
          { order_id }
        );
        return res.status(200).send("OK");
      }

      try {
        console.log("[callback] saving completed_orders", {
          order_id,
          amount: expectedAmount,
        });
        // Store expectedAmount (our DB value, confirmed by receipt) rather than the
        // callback payload amount — it is the most authoritative figure and cannot
        // be undefined (we validated it above).
        await saveOrderToDB({
          orderId: order_id,
          status: statusKey,
          amount: expectedAmount,
          customerName,
          phone,
          payload: body,
          provider: "bog",
          payment_type: "card",
        });
        // Non-critical — update pending_orders status for record-keeping.
        await updatePendingOrderStatus(order_id, "success").catch((err) =>
          console.error("BOG callback: failed to update pending status:", err)
        );
        console.log("BOG callback: payment saved for order:", order_id);
      } catch (dbErr) {
        // Duplicate insert → this order was already processed; safe to ignore.
        if (dbErr.code === "23505" || dbErr.code === "DUPLICATE") {
          console.log("BOG callback: duplicate order ignored:", order_id);
        } else {
          throw dbErr; // Unexpected DB error — bubble up to outer catch.
        }
      }
    } else {
      // Non-critical update — swallow errors so we still return 200.
      await updatePendingOrderStatus(order_id, "failed").catch((err) =>
        console.error("BOG callback: failed to update pending status:", err)
      );
      console.log("BOG callback: non-completed status:", statusKey, "| order:", order_id);
    }
  } catch (err) {
    console.error("BOG callback: unhandled error:", err);
  }

  return res.status(200).send("OK");
}
