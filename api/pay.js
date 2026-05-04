import { client } from "@/lib/sanity";
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
    return JSON.parse(raw);
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

// ---------------- TOKEN ----------------
async function getBogToken() {
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

  return data.access_token;
}

// ---------------- HANDLER ----------------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    console.log("🚀 API HIT");

    const body = parseJsonBody(req);

    const amount = toFiniteNumber(
      body.amount || body.total_amount || body.totalAmount
    );

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const rawItems = body.items || [];

    const items = rawItems.map((i) => ({
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

    // 🔥 SAVE ORDER TO SANITY (უსაფრთხო)
    (async () => {
      try {
        await client.create({
          _type: "order",
          customerName: body.name || "Unknown",
          email: body.email || "",
          phone: body.phone || "",
          message: "BOG order",
          selectedProducts: rawItems.map((i) => ({
            _type: "object",
            quantity: Number(i.quantity) || 1,
            variant:
              i.name ||
              i.title ||
              i.product_name ||
              `Product ${i.product_id}`,
          })),
          status: "new",
          createdAt: new Date().toISOString(),
        });

        console.log("✅ Order saved to Sanity");
      } catch (err) {
        console.error("❌ Sanity ERROR:", err);
      }
    })();

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

    const data = await bogRes.json();

    const redirectUrl = extractRedirectUrl(data);

    if (!redirectUrl) {
      return res.status(500).json({ error: "No payment URL" });
    }

    console.log("✅ Redirecting to BOG");

    return res.status(200).json({
      payment_url: redirectUrl,
    });

  } catch (err) {
    console.error("❌ ERROR:", err);
    return res.status(500).json({
      error: err.message,
    });
  }
}

// ---------------- NEXT CONFIG ----------------
export const config = {
  api: {
    bodyParser: true,
  },
};