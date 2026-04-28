import crypto from "crypto";
import fetch from "node-fetch";
import { savePendingOrder, getProductPrices } from "./_db.js";

// ---------------------------------------------------------------------------
// Vercel serverless — body parsing is handled by the framework automatically.
// No raw-body needed here (only callback.js needs raw bytes for RSA verify).
// ---------------------------------------------------------------------------

// Token cache — reused across warm instances to avoid redundant OAuth trips.
let cachedToken = null;
let tokenExpiresAt = 0;

// ---------------------------------------------------------------------------
// CORS — apply on every response (including errors and preflight)
// ---------------------------------------------------------------------------
function applyCors(req, res) {
  const requestOrigin = req.headers.origin;
  const allowAllOrigins =
    process.env.CORS_ALLOW_ALL === "1" ||
    process.env.CORS_ALLOW_ALL === "true" ||
    process.env.CORS_ALLOW_ALL === "yes";
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "https://ceramisia.com";
  const corsOrigin = allowAllOrigins
    ? "*"
    : requestOrigin === allowedOrigin
      ? requestOrigin
      : allowedOrigin;

  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function sendJson(res, status, body) {
  console.log("[PAY] response -> frontend", { status, body });
  return res.status(status).json(body);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Read response as TEXT first, then try JSON.parse.
 * Lets us log raw body even when BOG returns non-JSON (HTML error page,
 * empty body, plain text). Critical for debugging "no payment URL" issues.
 */
async function readResponseFully(response) {
  let text = "";
  try {
    text = await response.text();
  } catch (err) {
    return { text: "", data: null, parseError: err?.message ?? String(err) };
  }
  if (!text) return { text: "", data: null, parseError: null };
  try {
    return { text, data: JSON.parse(text), parseError: null };
  } catch (err) {
    return { text, data: null, parseError: err?.message ?? String(err) };
  }
}

function extractRedirectUrl(payload) {
  if (!payload || typeof payload !== "object") return null;
  return (
    payload?._links?.redirect?.href ??
    payload?.links?.redirect?.href ??
    payload?.payment_url ??
    payload?.url ??
    payload?.redirect_url ??
    payload?.data?._links?.redirect?.href ??
    payload?.data?.payment_url ??
    payload?.data?.url ??
    null
  );
}

function extractOrderId(payload) {
  return (
    payload?.id ??
    payload?.order_id ??
    payload?.orderId ??
    payload?.data?.id ??
    null
  );
}

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

// ---------------------------------------------------------------------------
// BOG OAuth token
// ---------------------------------------------------------------------------
async function getBogToken(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedToken && tokenExpiresAt - now > 60_000) {
    console.log("[PAY] token cache hit");
    return cachedToken;
  }

  const credentials = Buffer.from(
    `${process.env.BOG_CLIENT_ID}:${process.env.BOG_CLIENT_SECRET}`
  ).toString("base64");

  const endpoint =
    process.env.BOG_TOKEN_ENDPOINT ||
    "https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token";

  console.log("[PAY] requesting fresh BOG token", { endpoint, forceRefresh });

  const { signal, clear } = createTimeoutSignal(15_000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      const timeoutErr = new Error("token request timed out");
      timeoutErr.code = "TOKEN_TIMEOUT";
      timeoutErr.details = "Token request timed out after 15000ms";
      throw timeoutErr;
    }
    const networkErr = new Error("token request network error");
    networkErr.code = "TOKEN_REQUEST_FAILED";
    networkErr.details = err?.message ?? String(err);
    throw networkErr;
  } finally {
    clear();
  }

  const { text, data, parseError } = await readResponseFully(response);
  console.log("[PAY] BOG token response", {
    status: response.status,
    ok: response.ok,
    hasAccessToken: Boolean(data?.access_token),
    parseError,
    rawBody: response.ok ? "(omitted)" : text,
  });

  if (!response.ok || !data?.access_token) {
    const err = new Error("token request failed");
    err.code = "TOKEN_REQUEST_FAILED";
    err.details = { status: response.status, raw: text };
    throw err;
  }

  cachedToken = data.access_token;
  tokenExpiresAt = now + Number(data.expires_in || 60) * 1000;
  return cachedToken;
}

// ---------------------------------------------------------------------------
// BOG order creation
// ---------------------------------------------------------------------------
async function createBogOrder({ token, requestBody, timeoutMs = 15_000 }) {
  const endpoint = "https://api.bog.ge/payments/v1/ecommerce/orders";

  console.log("[PAY] BOG order request →", {
    endpoint,
    timeoutMs,
    body: requestBody,
  });

  const { signal, clear } = createTimeoutSignal(timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    const { text, data, parseError } = await readResponseFully(response);

    console.log("[PAY] BOG order response ←", {
      endpoint,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type"),
      parseError,
      rawBody: text,
      parsed: data,
      hasRedirect: Boolean(extractRedirectUrl(data)),
      orderId: extractOrderId(data),
    });

    return { response, data, rawText: text, parseError };
  } catch (err) {
    if (err?.name === "AbortError") {
      const timeoutError = new Error("order request timed out");
      timeoutError.code = "ORDER_TIMEOUT";
      timeoutError.details = `Order request timed out after ${timeoutMs}ms`;
      throw timeoutError;
    }
    const requestError = new Error("order request failed");
    requestError.code = "ORDER_REQUEST_FAILED";
    requestError.details = err?.message ?? String(err);
    throw requestError;
  } finally {
    clear();
  }
}

// ---------------------------------------------------------------------------
// POST /api/pay
// Body: { amount: number, items?: Array<{ product_id, quantity, unit_price }> }
// Returns 200: { payment_url, redirect_url, url, order_id, _links }
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  console.log("STEP 1: handler start", {
    method: req.method,
    origin: req.headers.origin,
  });

  applyCors(req, res);

  if (req.method === "OPTIONS") {
    console.log("[PAY] CORS preflight OK", { origin: req.headers.origin });
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, {
      error: "Method Not Allowed",
      details: "Use POST",
    });
  }

  try {
    if (
      !process.env.CALLBACK_URL ||
      !process.env.SUCCESS_URL ||
      !process.env.FAIL_URL
    ) {
      console.error("[PAY] missing required env vars");
      return sendJson(res, 500, {
        error: "Server misconfiguration",
        details: "Missing CALLBACK_URL / SUCCESS_URL / FAIL_URL",
      });
    }

    const body = req.body ?? {};
    const rawItems = body.items ?? body.cartItems ?? body.products;
    const hasItemsPayload = Array.isArray(rawItems);
    const items = hasItemsPayload
      ? rawItems.map((item) => ({
          product_id: item?.product_id ?? item?.productId ?? item?.id,
          quantity: item?.quantity ?? item?.qty,
          unit_price: item?.unit_price ?? item?.unitPrice ?? item?.price,
        }))
      : [];
    const amount = body.amount ?? body.total_amount ?? body.totalAmount;

    console.log("[PAY] DEBUG request body received", {
      headers: {
        origin: req.headers.origin,
        contentType: req.headers["content-type"],
      },
      body,
      derived: {
        amount,
        hasItemsPayload,
        rawItemCount: hasItemsPayload ? rawItems.length : 0,
        normalizedItemCount: items.length,
        firstItem: items[0] ?? null,
      },
    });

    if (hasItemsPayload && items.length === 0) {
      return sendJson(res, 400, {
        error: "items must be a non-empty array when provided",
      });
    }
    if (items.length > 50) {
      return sendJson(res, 400, { error: "Too many items in order (max 50)" });
    }

    if (amount === undefined || amount === null || amount === "") {
      return sendJson(res, 400, { error: "amount is required" });
    }
    const numAmount = toFiniteNumber(amount);
    if (numAmount === null || numAmount <= 0 || numAmount > 100_000) {
      return sendJson(res, 400, {
        error: "amount must be a positive number up to 100000",
      });
    }

    if (items.length > 0) {
      for (const item of items) {
        const qty = toFiniteNumber(item?.quantity);
        const price = toFiniteNumber(item?.unit_price);
        if (!item?.product_id) {
          return sendJson(res, 400, {
            error: "Each item must have a product_id",
          });
        }
        if (qty === null || qty <= 0 || !Number.isInteger(qty)) {
          return sendJson(res, 400, {
            error: "Each item quantity must be a positive integer",
          });
        }
        if (price === null || price <= 0) {
          return sendJson(res, 400, {
            error: "Each item unit_price must be a positive number",
          });
        }
      }

      const productIds = items.map((i) => String(i.product_id));
      const catalogPrices = await getProductPrices(productIds);
      if (catalogPrices.size === 0) {
        console.error("[PAY] product catalog returned no prices");
        return sendJson(res, 500, { error: "Server misconfiguration" });
      }
      for (const item of items) {
        const catalogPrice = catalogPrices.get(String(item.product_id));
        if (catalogPrice === undefined) {
          return sendJson(res, 400, {
            error: `Unknown product: ${item.product_id}`,
          });
        }
        if (Math.abs(Number(item.unit_price) - catalogPrice) > 0.01) {
          return sendJson(res, 400, {
            error: `Price mismatch for product ${item.product_id}`,
          });
        }
      }
      const serverTotal = items.reduce(
        (s, i) =>
          s +
          Number(i.quantity) * (catalogPrices.get(String(i.product_id)) ?? 0),
        0
      );
      if (Math.abs(serverTotal - numAmount) > 0.01) {
        return sendJson(res, 400, {
          error: `Submitted amount (${numAmount}) does not match catalog total (${serverTotal})`,
        });
      }
      const basketSum = items.reduce(
        (s, i) => s + Number(i.quantity) * Number(i.unit_price),
        0
      );
      if (Math.abs(basketSum - numAmount) > 0.01) {
        return sendJson(res, 400, {
          error: `Basket sum (${basketSum}) does not match amount (${numAmount})`,
        });
      }
    } else {
      console.log("[PAY] amount-only mode (no items provided)");
    }

    console.log("STEP 2: before token request");
    const token = await getBogToken();

    console.log("STEP 3: before order request");
    const externalOrderId = `order_${crypto.randomUUID()}`;
    const requestBody = {
      callback_url: process.env.CALLBACK_URL,
      external_order_id: externalOrderId,
      purchase_units: {
        currency: "GEL",
        total_amount: numAmount,
        basket: items.map((item) => ({
          product_id: String(item.product_id),
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
        })),
      },
      redirect_urls: {
        success: process.env.SUCCESS_URL,
        fail: process.env.FAIL_URL,
      },
    };

    console.log("[PAY] DEBUG creating BOG order", {
      externalOrderId,
      numAmount,
      itemCount: items.length,
    });

    let { response: orderResponse, data, rawText, parseError } =
      await createBogOrder({ token, requestBody, timeoutMs: 15_000 });

    console.log("STEP 4: after BOG response", {
      status: orderResponse.status,
      ok: orderResponse.ok,
      parseError,
    });

    if (orderResponse.status === 401) {
      console.warn("[PAY] received 401, refreshing token and retrying");
      const freshToken = await getBogToken(true);
      const retryRequestBody = {
        ...requestBody,
        external_order_id: `order_${crypto.randomUUID()}`,
      };
      ({ response: orderResponse, data, rawText, parseError } =
        await createBogOrder({
          token: freshToken,
          requestBody: retryRequestBody,
          timeoutMs: 15_000,
        }));
    }

    const paymentUrl = extractRedirectUrl(data);
    const orderId = extractOrderId(data);

    console.log("[PAY] DEBUG extracted from BOG response", {
      status: orderResponse.status,
      ok: orderResponse.ok,
      paymentUrl,
      orderId,
    });

    if (!orderResponse.ok) {
      console.error("[PAY] BOG order creation failed", {
        status: orderResponse.status,
        rawText,
        parsed: data,
        parseError,
      });
      return sendJson(res, 502, {
        error: "Failed to create payment order",
        details: data ?? {
          status: orderResponse.status,
          raw: rawText,
          parseError,
          non_json_response: !data,
        },
      });
    }

    if (!paymentUrl) {
      console.error("[PAY] no redirect URL in BOG response", {
        rawText,
        parsed: data,
        parseError,
      });
      return sendJson(res, 502, {
        error: "Failed to create payment order",
        details: {
          message: "BOG response missing redirect URL",
          parsed: data,
          raw: rawText,
          parseError,
        },
      });
    }

    if (!orderId) {
      console.error("[PAY] missing order id in BOG response", { data, rawText });
      return sendJson(res, 502, {
        error: "Failed to create payment order",
        details: { message: "BOG response missing order id", parsed: data },
      });
    }

    await savePendingOrder(orderId, numAmount);
    console.log("[PAY] order created", { orderId, numAmount, paymentUrl });

    console.log("STEP 5: sending response", { orderId, paymentUrl });

    return sendJson(res, 200, {
      payment_url: paymentUrl,
      redirect_url: paymentUrl,
      url: paymentUrl,
      order_id: orderId,
      _links: { redirect: { href: paymentUrl } },
    });
  } catch (err) {
    console.error("[PAY] unhandled error", {
      message: err?.message,
      name: err?.name,
      code: err?.code,
      details: err?.details,
      stack: err?.stack,
    });

    if (err?.code === "TOKEN_TIMEOUT" || err?.code === "ORDER_TIMEOUT" || err?.name === "AbortError") {
      return sendJson(res, 504, {
        error: "Timeout contacting BOG API",
        details: err?.details ?? err?.message ?? null,
      });
    }
    if (err?.code === "ORDER_REQUEST_FAILED") {
      return sendJson(res, 502, {
        error: "BOG order request failed",
        details: err?.details ?? null,
      });
    }
    if (err?.code === "TOKEN_REQUEST_FAILED") {
      return sendJson(res, 502, {
        error: "BOG token request failed",
        details: err?.details ?? null,
      });
    }
    return sendJson(res, 500, {
      error: "Internal server error",
      details: err?.message ?? String(err),
    });
  }
}
