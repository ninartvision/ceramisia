import crypto from "crypto";
import fetch from "node-fetch";
import { client } from "../lib/sanity.js";
import { trySanityCreateOrder } from "../lib/sanityOrderSync.js";
import { savePendingOrder } from "./_db.js";

// Same pattern as api/callback.js — BOG order id must match before DB / callback handling.
const BOG_ORDER_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

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

    const amount = Number(
      body.amount || body.total_amount || body.totalAmount
    );

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const amountRounded = parseFloat(Number(amount).toFixed(2));
    console.log("[pay] POST /api/pay", {
      amount: amountRounded,
      itemCount: Array.isArray(body.items) ? body.items.length : 0,
    });

    const rawItems = body.items || [];

    const items = rawItems.map((i) => ({
      product_id: String(i.product_id),
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
    }));

    const bogSecret =
      process.env.BOG_CLIENT_SECRET || process.env.BOG_SECRET_KEY;
    if (!process.env.BOG_CLIENT_ID || !bogSecret) {
      console.error("[pay] missing BOG_CLIENT_ID or BOG_CLIENT_SECRET / BOG_SECRET_KEY");
      return res.status(500).json({ error: "Payment gateway not configured" });
    }

    // 🔐 TOKEN
    const credentials = Buffer.from(
      `${process.env.BOG_CLIENT_ID}:${bogSecret}`
    ).toString("base64");

    const tokenRes = await fetch(
      "https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      }
    );

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("[pay] BOG token error", {
        status: tokenRes.status,
        keys: tokenData && typeof tokenData === "object" ? Object.keys(tokenData) : [],
      });
      return res.status(500).json({
        error: "Token error",
        data: tokenData,
      });
    }

    const token = tokenData.access_token;
    console.log("[pay] BOG access token ok");

    const requestBody = {
      callback_url: process.env.CALLBACK_URL,
      external_order_id: `order_${crypto.randomUUID()}`,
      purchase_units: {
        currency: "GEL",
        total_amount: amountRounded,
        basket: items,
      },
      redirect_urls: {
        success: process.env.SUCCESS_URL,
        fail: process.env.FAIL_URL,
      },
    };

    await trySanityCreateOrder(
      client,
      {
        _type: "order",
        customerName:
          String(body.customerName || body.name || "Unknown").trim() ||
          "Unknown",
        email: body.email ? String(body.email) : "",
        phone: body.phone ? String(body.phone) : "",
        message: body.message ? String(body.message) : "BOG order",
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
      },
      "pay"
    );

    console.log("[pay] creating BOG ecommerce order", {
      external_order_id: requestBody.external_order_id,
      total_amount: requestBody.purchase_units.total_amount,
    });

    // 💳 BOG ORDER
    const bogRes = await fetch(
      "https://api.bog.ge/payments/v1/ecommerce/orders",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    const text = await bogRes.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error("[pay] BOG response is not JSON", { httpStatus: bogRes.status });
      return res.status(500).json({
        error: "BOG არაა JSON",
        raw: text,
      });
    }

    console.log("[pay] BOG create-order HTTP", { status: bogRes.status, ok: bogRes.ok });

    if (!bogRes.ok) {
      console.error("[pay] BOG create-order rejected", {
        status: bogRes.status,
        dataKeys: data && typeof data === "object" ? Object.keys(data) : [],
      });
      return res.status(502).json({
        error: "BOG order creation failed",
        details: data,
      });
    }

    // BOG returns the bank order id as `id` (see api.bog.ge create-order response).
    const bogOrderIdRaw = data?.id ?? data?.order_id;
    const bogOrderId =
      bogOrderIdRaw != null && String(bogOrderIdRaw).trim() !== ""
        ? String(bogOrderIdRaw).trim()
        : "";

    if (!bogOrderId || !BOG_ORDER_ID_RE.test(bogOrderId)) {
      console.error("[pay] BOG response missing or invalid order id", {
        bogOrderId: bogOrderId || null,
        responseKeys: data && typeof data === "object" ? Object.keys(data) : [],
      });
      return res.status(502).json({
        error: "Invalid BOG order response",
        details: "missing or invalid order id",
      });
    }

    const redirectUrl =
      data?._links?.redirect?.href ||
      data?.payment_url ||
      data?.redirect_url;

    if (!redirectUrl) {
      console.error("[pay] BOG response has order id but no redirect URL", {
        order_id: bogOrderId,
      });
      return res.status(500).json({
        error: "No payment URL",
        data,
      });
    }

    try {
      await savePendingOrder(bogOrderId, amountRounded, "bog", "card");
      console.log("[pay] pending_orders saved", {
        order_id: bogOrderId,
        amount: amountRounded,
        external_order_id: requestBody.external_order_id,
      });
    } catch (dbErr) {
      console.error("[pay] savePendingOrder failed — aborting (no redirect)", {
        order_id: bogOrderId,
        dbName: dbErr?.name,
        dbCode: dbErr?.code ?? dbErr?.pgCode,
        message: dbErr?.message,
      });
      return res.status(502).json({
        error: "Order tracking unavailable; payment not started",
        details:
          dbErr?.name === "SupabaseEnvError"
            ? "Supabase is not configured on the server"
            : undefined,
      });
    }

    console.log("[pay] returning redirect URL to client", { order_id: bogOrderId });

    return res.status(200).json({
      payment_url: redirectUrl,
    });

  } catch (err) {
    console.error("[pay] FATAL", { message: err?.message, stack: err?.stack });

    return res.status(500).json({
      error: "Server crash",
      message: err.message,
    });
  }
}
