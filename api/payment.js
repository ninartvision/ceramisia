/**
 * POST /api/payment
 *
 * Minimal serverless replacement for the old Express route POST /pay in
 * backend/server.js (amount-only, no Supabase catalog validation).
 *
 * Env (same as /api/pay): BOG_CLIENT_ID, BOG_CLIENT_SECRET, CALLBACK_URL,
 * SUCCESS_URL, FAIL_URL. Optional: BOG_TOKEN_ENDPOINT, ALLOWED_ORIGIN, CORS_ALLOW_ALL
 */
import fetch from "node-fetch";

function applyCors(req, res) {
  const requestOrigin = req.headers.origin;
  const allowAll =
    process.env.CORS_ALLOW_ALL === "1" ||
    process.env.CORS_ALLOW_ALL === "true";
  const allowed = process.env.ALLOWED_ORIGIN || "https://ceramisia.com";
  const origin = allowAll
    ? "*"
    : requestOrigin === allowed
      ? requestOrigin
      : allowed;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

const BOG_ORDER_URL = "https://api.bog.ge/payments/v1/ecommerce/orders";

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body ?? {};
  const amount = Number(body.amount);

  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  if (!process.env.BOG_CLIENT_ID || !process.env.BOG_CLIENT_SECRET) {
    return res.status(500).json({ error: "Payment gateway not configured" });
  }

  if (
    !process.env.CALLBACK_URL ||
    !process.env.SUCCESS_URL ||
    !process.env.FAIL_URL
  ) {
    return res.status(500).json({
      error: "Server misconfiguration",
      details: "Missing CALLBACK_URL / SUCCESS_URL / FAIL_URL",
    });
  }

  const tokenEndpoint =
    process.env.BOG_TOKEN_ENDPOINT ||
    "https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token";

  const credentials = Buffer.from(
    `${process.env.BOG_CLIENT_ID}:${process.env.BOG_CLIENT_SECRET}`
  ).toString("base64");

  try {
    const tokenRes = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
    });

    const tokenText = await tokenRes.text();
    let tokenData;
    try {
      tokenData = tokenText ? JSON.parse(tokenText) : {};
    } catch {
      return res.status(502).json({
        error: "BOG token response was not JSON",
        details: tokenText.slice(0, 200),
      });
    }

    if (!tokenRes.ok || !tokenData.access_token) {
      return res.status(502).json({
        error: "BOG token request failed",
        details: { status: tokenRes.status, body: tokenData },
      });
    }

    const externalOrderId = `order_${Date.now()}`;
    const payload = {
      callback_url: process.env.CALLBACK_URL,
      external_order_id: externalOrderId,
      purchase_units: {
        currency: "GEL",
        total_amount: parseFloat(amount.toFixed(2)),
      },
      redirect_urls: {
        success: process.env.SUCCESS_URL,
        fail: process.env.FAIL_URL,
      },
    };

    const orderRes = await fetch(BOG_ORDER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const orderText = await orderRes.text();
    let orderData;
    try {
      orderData = orderText ? JSON.parse(orderText) : {};
    } catch {
      return res.status(502).json({
        error: "BOG order response was not JSON",
        details: orderText.slice(0, 200),
      });
    }

    if (!orderRes.ok) {
      return res.status(502).json({
        error: "BOG order creation failed",
        details: { status: orderRes.status, body: orderData },
      });
    }

    const paymentUrl =
      orderData?._links?.redirect?.href ||
      orderData?.payment_url ||
      orderData?.url;

    if (!paymentUrl) {
      return res.status(502).json({
        error: "BOG response missing redirect URL",
        details: orderData,
      });
    }

    return res.status(200).json({ payment_url: paymentUrl });
  } catch (err) {
    console.error("[payment]", err);
    return res.status(502).json({
      error: "Payment service unavailable",
      details: err?.message ?? String(err),
    });
  }
}
