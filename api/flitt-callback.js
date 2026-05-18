import {
  getPendingOrder,
  saveOrderToDB,
  updatePendingOrderStatus,
} from "./_db.js";
import { verifyFlittPayload } from "./_flittSignature.js";
import { client } from "../lib/sanity.js";
import { fireSanityOrderOnPaymentSuccess } from "../lib/sanityOrderSync.js";

/** Match flitt-pay.js env handling — avoids verify failures from BOM/quotes. */
function normalizeEnvValue(v) {
  if (v == null) return "";
  return String(v)
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

/** Match pending order ids created by /api/flitt-pay */
const FLITT_ORDER_ID_RE = /^flt_[0-9a-f-]{36}$/i;

function toMinorUnits(major, currency) {
  const c = String(currency || "GEL").toUpperCase();
  const decimals = c === "JPY" ? 0 : 2;
  const f = 10 ** decimals;
  return Math.round(Number(major) * f);
}

function normalizeCallbackBody(body) {
  if (!body || typeof body !== "object") return null;
  if (body.response && typeof body.response === "object") {
    return body.response;
  }
  return body;
}

function parseCallbackAmountMinor(raw) {
  const v = raw.amount ?? raw.actual_amount;
  if (v === null || v === undefined || v === "") return NaN;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function syncFlittSuccessToSanity(orderId, pending, payload) {
  const email =
    payload.sender_email != null ? String(payload.sender_email).trim() : "";
  const phone =
    payload.sender_cell_phone != null &&
    String(payload.sender_cell_phone).trim() !== ""
      ? String(payload.sender_cell_phone).trim()
      : "";
  fireSanityOrderOnPaymentSuccess(
    client,
    {
      orderId,
      amount: pending.amount,
      customerName: email || undefined,
      email: email || undefined,
      phone: phone || undefined,
      provider: "flitt",
      paymentType: pending.payment_type || "card",
      paymentStatus: "approved",
    },
    "flitt-callback"
  );
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  const ok = () => res.status(200).send("OK");

  try {
    if (req.method !== "POST") {
      return ok();
    }

    let body = req.body;
    if (typeof body === "string") {
      try {
        body = body ? JSON.parse(body) : {};
      } catch {
        console.error("[flitt-callback] body is not JSON");
        return ok();
      }
    }

    const payload = normalizeCallbackBody(body);
    if (!payload || typeof payload !== "object") {
      console.error("[flitt-callback] empty payload");
      return ok();
    }

    const secret = normalizeEnvValue(process.env.FLITT_PRIVATE_KEY);
    if (!secret) {
      console.error("[flitt-callback] FLITT_PRIVATE_KEY not configured");
      return ok();
    }

    if (!verifyFlittPayload(secret, payload)) {
      console.error("[flitt-callback] invalid signature", {
        order_id: payload.order_id ?? null,
      });
      return ok();
    }

    const orderId =
      payload.order_id != null ? String(payload.order_id).trim() : "";
    if (!orderId || !FLITT_ORDER_ID_RE.test(orderId)) {
      console.error("[flitt-callback] invalid order_id", { orderId: orderId || null });
      return ok();
    }

    console.log("[flitt-callback] received", {
      order_id: orderId,
      order_status: payload.order_status ?? null,
      response_status: payload.response_status ?? null,
      payment_system: payload.payment_system ?? null,
    });

    let pending;
    try {
      pending = await getPendingOrder(orderId);
    } catch (dbErr) {
      console.error("[flitt-callback] getPendingOrder failed", {
        order_id: orderId,
        message: dbErr?.message,
        code: dbErr?.code ?? dbErr?.pgCode,
      });
      return ok();
    }

    if (!pending) {
      console.error("[flitt-callback] unknown order (no pending_orders row)", {
        order_id: orderId,
      });
      return ok();
    }

    if (pending.provider !== "flitt") {
      console.error("[flitt-callback] pending row is not Flitt", {
        order_id: orderId,
        provider: pending.provider,
      });
      return ok();
    }

    const currency = String(
      payload.currency || payload.actual_currency || "GEL"
    )
      .toUpperCase()
      .slice(0, 3);
    const expectedMinor = toMinorUnits(pending.amount, currency);
    const receivedMinor = parseCallbackAmountMinor(payload);

    if (!Number.isFinite(receivedMinor) || receivedMinor !== expectedMinor) {
      console.error("[flitt-callback] amount mismatch", {
        order_id: orderId,
        receivedMinor,
        expectedMinor,
        pendingMajor: pending.amount,
        currency,
      });
      return ok();
    }

    const orderStatus = String(payload.order_status || "").toLowerCase();
    const responseStatus = String(payload.response_status || "").toLowerCase();

    if (orderStatus === "created" || orderStatus === "processing") {
      console.log("[flitt-callback] interim order_status, awaiting final callback", {
        order_id: orderId,
        order_status: orderStatus,
        response_status: responseStatus || null,
      });
      return ok();
    }

    if (orderStatus === "approved" && responseStatus === "success") {
      try {
        console.log("[flitt-callback] saving completed_orders", {
          order_id: orderId,
          amount: pending.amount,
          provider: "flitt",
        });
        await saveOrderToDB({
          orderId,
          status: "approved",
          amount: pending.amount,
          customerName:
            payload.sender_email != null
              ? String(payload.sender_email)
              : undefined,
          phone:
            payload.sender_cell_phone != null &&
            String(payload.sender_cell_phone).trim() !== ""
              ? String(payload.sender_cell_phone)
              : undefined,
          payload,
          provider: "flitt",
          payment_type: pending.payment_type || "card",
        });
        await updatePendingOrderStatus(orderId, "success").catch((err) =>
          console.error("[flitt-callback] update pending success:", err?.message)
        );
        console.log("[flitt-callback] completed_orders insert ok", {
          order_id: orderId,
        });
        syncFlittSuccessToSanity(orderId, pending, payload);
      } catch (dbErr) {
        if (dbErr.code === "23505" || dbErr.code === "DUPLICATE") {
          console.log("[flitt-callback] duplicate completed order ignored", {
            order_id: orderId,
          });
          syncFlittSuccessToSanity(orderId, pending, payload);
        } else {
          console.error("[flitt-callback] DB error", {
            order_id: orderId,
            message: dbErr?.message,
            code: dbErr?.code ?? dbErr?.pgCode,
          });
        }
      }
      return ok();
    }

    console.log("[flitt-callback] non-success final state", {
      order_id: orderId,
      order_status: orderStatus || null,
      response_status: responseStatus || null,
    });
    await updatePendingOrderStatus(orderId, "failed").catch((err) =>
      console.error("[flitt-callback] update pending failed:", err?.message)
    );
    return ok();
  } catch (err) {
    console.error("[flitt-callback] unhandled error", {
      message: err?.message,
      stack: err?.stack,
    });
    return ok();
  }
}
