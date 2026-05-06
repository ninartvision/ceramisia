import crypto from "crypto";
import fetch from "node-fetch";
import { client } from "../lib/sanity.js";
import { savePendingOrder } from "./_db.js";
import { signFlittPayload } from "./_flittSignature.js";

const DEFAULT_CHECKOUT_URL = "https://pay.flitt.com/api/checkout/url";

function logSanityError(err, context) {
  console.error(`[Sanity] ${context}:`, err?.message || err);
  if (err?.response?.body) {
    console.error(
      "[Sanity] response body:",
      typeof err.response.body === "string"
        ? err.response.body
        : JSON.stringify(err.response.body, null, 2)
    );
  }
  if (err?.details) {
    console.error("[Sanity] details:", JSON.stringify(err.details, null, 2));
  }
  console.error("[Sanity] stack:", err?.stack || "(no stack)");
}

/** GEL: amount in tetri (integer) for Flitt API. */
function toMinorUnits(major, currency) {
  const c = String(currency || "GEL").toUpperCase();
  const decimals = c === "JPY" ? 0 : 2;
  const f = 10 ** decimals;
  return Math.round(Number(major) * f);
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    const amountMajor = Number(
      body.amount || body.total_amount || body.totalAmount
    );

    if (!amountMajor || amountMajor <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const amountRounded = parseFloat(Number(amountMajor).toFixed(2));
    const rawItems = body.items || [];
    const currency = String(
      body.currency || process.env.FLITT_CURRENCY || "GEL"
    )
      .toUpperCase()
      .slice(0, 3);

    const merchantId = Number(process.env.FLITT_MERCHANT_ID);
    const secret = process.env.FLITT_PRIVATE_KEY?.trim();
    const publicKey = process.env.FLITT_PUBLIC_KEY?.trim();

    if (!Number.isFinite(merchantId) || merchantId <= 0 || !secret) {
      console.error(
        "[flitt-pay] missing FLITT_MERCHANT_ID or FLITT_PRIVATE_KEY"
      );
      return res.status(500).json({ error: "Flitt not configured" });
    }

    if (!publicKey) {
      console.warn(
        "[flitt-pay] FLITT_PUBLIC_KEY empty — optional for /checkout/url; set if required by your portal"
      );
    }

    const responseUrl =
      process.env.FLITT_RESPONSE_URL ||
      process.env.TBC_SUCCESS_URL ||
      process.env.SUCCESS_URL;
    const serverCallbackUrl = process.env.FLITT_SERVER_CALLBACK_URL?.trim();

    if (!responseUrl || !serverCallbackUrl?.startsWith("https://")) {
      console.error(
        "[flitt-pay] set FLITT_RESPONSE_URL (HTTPS) and FLITT_SERVER_CALLBACK_URL (e.g. https://ceramisia.com/api/flitt-callback)"
      );
      return res.status(500).json({
        error: "Flitt URLs not configured",
        details:
          "FLITT_RESPONSE_URL and FLITT_SERVER_CALLBACK_URL must be full HTTPS URLs",
      });
    }

    const orderId = `flt_${crypto.randomUUID()}`;
    const amountMinor = toMinorUnits(amountRounded, currency);

    console.log("[flitt-pay] POST /api/flitt-pay", {
      order_id: orderId,
      amount_major: amountRounded,
      amount_minor: amountMinor,
      currency,
      itemCount: Array.isArray(rawItems) ? rawItems.length : 0,
    });

    try {
      if (!process.env.SANITY_API_TOKEN?.trim()) {
        console.error("[Sanity] SANITY_API_TOKEN is missing");
      }
      await client.create({
        _type: "order",
        customerName:
          String(body.customerName || body.name || "Unknown").trim() ||
          "Unknown",
        email: body.email ? String(body.email) : "",
        phone: body.phone ? String(body.phone) : "",
        message: body.message ? String(body.message) : "Flitt order",
        selectedProducts: rawItems.map((i) => ({
          _key: crypto.randomUUID().replace(/-/g, ""),
          quantity: Math.max(1, Number(i.quantity) || 1),
          variant:
            i.name ||
            i.title ||
            i.product_name ||
            `Product ${i.product_id}`,
        })),
        status: "new",
        createdAt: new Date().toISOString(),
      });
      console.log("[flitt-pay] Sanity order document created");
    } catch (sanityErr) {
      logSanityError(sanityErr, "create order document (Flitt)");
    }

    const orderDesc =
      String(body.order_desc || body.orderDesc || "Ceramisia").slice(0, 1024);

    const requestCore = {
      version: "1.0.1",
      merchant_id: merchantId,
      order_id: orderId,
      order_desc: orderDesc,
      amount: amountMinor,
      currency,
      response_url: responseUrl,
      server_callback_url: serverCallbackUrl,
      lang: "ka",
    };

    if (process.env.FLITT_CANCEL_URL?.trim()) {
      requestCore.cancel_url = process.env.FLITT_CANCEL_URL.trim();
    }

    if (process.env.FLITT_RESERVATION_DATA?.trim()) {
      requestCore.reservation_data = process.env.FLITT_RESERVATION_DATA.trim();
    }

    const signature = signFlittPayload(secret, requestCore);
    const requestPayload = { ...requestCore, signature };

    const checkoutUrl =
      process.env.FLITT_CHECKOUT_URL?.trim() || DEFAULT_CHECKOUT_URL;

    console.log("[flitt-pay] calling Flitt checkout/url", { checkoutUrl });

    const flittRes = await fetch(checkoutUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ request: requestPayload }),
    });

    const rawText = await flittRes.text();
    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      console.error("[flitt-pay] non-JSON response", {
        status: flittRes.status,
      });
      return res.status(502).json({
        error: "Flitt invalid response",
        raw: rawText.slice(0, 400),
      });
    }

    const resp = data.response && typeof data.response === "object"
      ? data.response
      : data;

    console.log("[flitt-pay] Flitt HTTP", {
      status: flittRes.status,
      ok: flittRes.ok,
      response_status: resp.response_status,
    });

    if (resp.response_status !== "success") {
      return res.status(502).json({
        error: "Flitt declined request",
        details: resp,
      });
    }

    const checkoutHref =
      typeof resp.checkout_url === "string" ? resp.checkout_url.trim() : "";

    if (!checkoutHref) {
      console.error("[flitt-pay] missing checkout_url", resp);
      return res.status(502).json({
        error: "No checkout URL",
        details: resp,
      });
    }

    try {
      await savePendingOrder(orderId, amountRounded, "flitt", "card");
      console.log("[flitt-pay] pending_orders saved", {
        order_id: orderId,
        amount: amountRounded,
        provider: "flitt",
        payment_type: "card",
      });
    } catch (dbErr) {
      console.error("[flitt-pay] savePendingOrder failed", {
        order_id: orderId,
        message: dbErr?.message,
        code: dbErr?.code ?? dbErr?.pgCode,
      });
      return res.status(502).json({
        error: "Order tracking unavailable",
        details:
          dbErr?.name === "SupabaseEnvError"
            ? "Supabase not configured"
            : undefined,
      });
    }

    console.log("[flitt-pay] returning checkout_url to client", { order_id: orderId });

    return res.status(200).json({
      payment_url: checkoutHref,
      order_id: orderId,
    });
  } catch (err) {
    console.error("[flitt-pay] FATAL", err?.message, err?.stack);
    return res.status(500).json({
      error: "Server crash",
      message: err.message,
    });
  }
}
