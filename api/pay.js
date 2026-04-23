import crypto from "crypto";
import fetch from "node-fetch";
import { savePendingOrder, getProductPrices } from "./_db.js";

// ---------------------------------------------------------------------------
// Vercel serverless — body parsing is handled by the framework automatically.
// No raw-body needed here (only callback.js needs raw bytes for RSA verify).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Token cache — reused across warm instances to avoid redundant OAuth trips.
// ---------------------------------------------------------------------------
let cachedToken = null;
let tokenExpiresAt = 0;

async function getBogToken(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedToken && tokenExpiresAt - now > 60_000) return cachedToken;

  const credentials = Buffer.from(
    `${process.env.BOG_CLIENT_ID}:${process.env.BOG_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch("https://api.bog.ge/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`BOG token request failed: ${response.status}`);
  }

  const data = await response.json();
  if (!data.access_token) throw new Error("No access_token in BOG token response");

  cachedToken = data.access_token;
  tokenExpiresAt = now + data.expires_in * 1000;
  return cachedToken;
}

// ---------------------------------------------------------------------------
// POST /api/pay
// Body: { amount: number, items?: Array<{ product_id, quantity, unit_price }> }
// Returns: { payment_url: string }
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    // Guard required env vars early — missing URLs would silently send "undefined" to BOG
    if (!process.env.CALLBACK_URL || !process.env.SUCCESS_URL || !process.env.FAIL_URL) {
      console.error("BOG pay: missing required env vars (CALLBACK_URL / SUCCESS_URL / FAIL_URL)");
      return res.status(500).json({ error: "Server misconfiguration" });
    }

    const { amount, items } = req.body ?? {};

    // Require items — without them the catalog price check is entirely skipped,
    // allowing any client-supplied amount to pass unchallenged.
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array is required" });
    }
    if (items.length > 50) {
      return res.status(400).json({ error: "Too many items in order (max 50)" });
    }

    // Validate amount
    if (amount === undefined || amount === null) {
      return res.status(400).json({ error: "amount is required" });
    }
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > 100_000) {
      return res.status(400).json({ error: "amount must be a positive number up to 100000" });
    }

    // Validate basket items when provided
    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        const qty = Number(item.quantity);
        const price = Number(item.unit_price);
        if (!item.product_id) {
          return res.status(400).json({ error: "Each item must have a product_id" });
        }
        if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
          return res.status(400).json({ error: "Each item quantity must be a positive integer" });
        }
        if (!Number.isFinite(price) || price <= 0) {
          return res.status(400).json({ error: "Each item unit_price must be a positive number" });
        }
      }

      // Server-side price verification — reject any item whose unit_price
      // doesn't match the backend product catalog. This prevents a client
      // from sending an arbitrary low price for a real product_id.
      const productIds = items.map((i) => String(i.product_id));
      const catalogPrices = await getProductPrices(productIds);

      // Catalog must return a price for every submitted product_id.
      // If catalogPrices is empty the products table may be misconfigured —
      // reject rather than silently bypass, to prevent price manipulation.
      if (catalogPrices.size === 0) {
        console.error("BOG pay: product catalog returned no prices — rejecting order");
        return res.status(500).json({ error: "Server misconfiguration" });
      }

      for (const item of items) {
        const catalogPrice = catalogPrices.get(String(item.product_id));
        if (catalogPrice === undefined) {
          return res.status(400).json({ error: `Unknown product: ${item.product_id}` });
        }
        if (Math.abs(Number(item.unit_price) - catalogPrice) > 0.01) {
          return res.status(400).json({
            error: `Price mismatch for product ${item.product_id}`,
          });
        }
      }

      // Recompute total_amount from catalog prices — never trust the client value
      const serverTotal = items.reduce(
        (sum, item) => sum + Number(item.quantity) * (catalogPrices.get(String(item.product_id)) ?? 0),
        0
      );
      if (Math.abs(serverTotal - numAmount) > 0.01) {
        return res.status(400).json({
          error: `Submitted amount (${numAmount}) does not match catalog total (${serverTotal})`,
        });
      }

      // Cross-check: basket sum must equal total_amount (BOG enforces this)
      const basketSum = items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
        0
      );
      // Allow 1-cent floating-point tolerance
      if (Math.abs(basketSum - numAmount) > 0.01) {
        return res.status(400).json({
          error: `Basket sum (${basketSum}) does not match amount (${numAmount})`,
        });
      }
    }

    const token = await getBogToken();

    // Build purchase_units — include basket only when items are provided
    const purchaseUnits = {
      currency: "GEL",
      total_amount: numAmount,
      basket: items.map((item) => ({
        product_id: String(item.product_id),
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
      })),
    };

    const externalOrderId = `order_${crypto.randomUUID()}`;

    console.log("BOG pay: creating order", { externalOrderId, numAmount, itemCount: items?.length ?? 0 });

    const orderResponse = await fetch(
      "https://api.bog.ge/payments/v1/ecommerce/orders",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          callback_url: process.env.CALLBACK_URL,
          external_order_id: externalOrderId,
          purchase_units: purchaseUnits,
          redirect_urls: {
            success: process.env.SUCCESS_URL,
            fail: process.env.FAIL_URL,
          },
        }),
      }
    );

    const data = await orderResponse.json();

    // If BOG returns 401, the cached token was invalidated server-side — retry once with a fresh token
    if (orderResponse.status === 401) {
      console.warn("BOG pay: received 401, refreshing token and retrying");
      const freshToken = await getBogToken(true);
      const retryResponse = await fetch(
        "https://api.bog.ge/payments/v1/ecommerce/orders",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${freshToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            callback_url: process.env.CALLBACK_URL,
            external_order_id: `order_${crypto.randomUUID()}`,
            purchase_units: purchaseUnits,
            redirect_urls: {
              success: process.env.SUCCESS_URL,
              fail: process.env.FAIL_URL,
            },
          }),
        }
      );
      if (!retryResponse.ok) {
        const retryData = await retryResponse.json().catch(() => ({}));
        console.error("BOG pay: order creation failed after token refresh", { status: retryResponse.status, retryData });
        return res.status(502).json({ error: "Failed to create payment order" });
      }
      const retryData = await retryResponse.json();
      if (!retryData._links?.redirect?.href) {
        console.error("BOG pay: no redirect URL after retry", retryData);
        return res.status(502).json({ error: "Failed to create payment order" });
      }
      await savePendingOrder(retryData.id, numAmount);
      console.log("BOG pay: order created (after token refresh)", { orderId: retryData.id, numAmount });
      return res.status(200).json({ payment_url: retryData._links.redirect.href });
    }

    if (!orderResponse.ok || !data._links?.redirect?.href) {
      console.error("BOG pay: order creation failed", { status: orderResponse.status, data });
      return res.status(502).json({ error: "Failed to create payment order" });
    }

    // Save to pending_orders BEFORE returning — ensures callback always finds it
    await savePendingOrder(data.id, numAmount);

    console.log("BOG pay: order created", { orderId: data.id, numAmount });

    return res.status(200).json({ payment_url: data._links.redirect.href });
  } catch (err) {
    console.error("BOG pay: unhandled error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
