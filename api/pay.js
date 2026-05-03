import crypto from "crypto";
import fetch from "node-fetch";

// ---------------- CONFIG ----------------
function resolveBogSecret() {
  return process.env.BOG_CLIENT_SECRET || process.env.BOG_SECRET_KEY || "";
}

// ---------------- HELPERS ----------------
function parseJsonBody(req) {
  const raw = req.body;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("Invalid JSON body");
    }
  }
  return raw;
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractRedirectUrl(payload) {
  return (
    payload?._links?.redirect?.href ||
    payload?.payment_url ||
    payload?.url ||
    payload?.redirect_url ||
    null
  );
}

function extractOrderId(payload) {
  return payload?.id || payload?.order_id || null;
}

// ---------------- TOKEN ----------------
let cachedToken = null;
let tokenExpiresAt = 0;

async function getBogToken() {
  if (cachedToken && tokenExpiresAt > Date.now()) {
    return cachedToken;
  }

  const credentials = Buffer.from(
    `${process.env.BOG_CLIENT_ID}:${resolveBogSecret()}`
  ).toString("base64");

  const res = await fetch(
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

  const data = await res.json();

  if (!data.access_token) {
    throw new Error("Failed to get BOG token");
  }

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;

  return cachedToken;
}

// ---------------- ORDER ----------------
async function createBogOrder(token, body) {
  const res = await fetch(
    "https://api.bog.ge/payments/v1/ecommerce/orders",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  return { ok: res.ok, data, raw: text };
}

// ---------------- HANDLER ----------------
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    const body = parseJsonBody(req);

    const amount = toFiniteNumber(
      body.amount || body.total_amount || body.totalAmount
    );

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const rawItems = body.items || [];

    // ✅ სუფთა basket
    const items = rawItems
      .filter(
        (i) => i.product_id && i.quantity && i.unit_price
      )
      .map((i) => ({
        product_id: String(i.product_id),
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
      }));

    const token = await getBogToken();

    const requestBody = {
      callback_url: process.env.CALLBACK_URL,
      external_order_id: `order_${crypto.randomUUID()}`,
      purchase_units: {
        currency: "GEL",
        total_amount: amount,
        basket: items,
      },
      redirect_urls: {
        success: process.env.SUCCESS_URL,
        fail: process.env.FAIL_URL,
      },
    };

    const result = await createBogOrder(token, requestBody);

    if (!result.ok) {
      return res.status(500).json({
        error: "BOG error",
        details: result.raw,
      });
    }

    const redirectUrl = extractRedirectUrl(result.data);

    if (!redirectUrl) {
      return res.status(500).json({
        error: "No payment URL",
        data: result.data,
      });
    }

    return res.status(200).json({
      payment_url: redirectUrl,
      order_id: extractOrderId(result.data),
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
}