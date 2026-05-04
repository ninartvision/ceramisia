import crypto from "crypto";
import fetch from "node-fetch";
import { client } from "../lib/sanity.js";

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

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    console.log("🚀 API HIT");

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

    const rawItems = body.items || [];

    const items = rawItems.map((i) => ({
      product_id: String(i.product_id),
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
    }));

    // 🔐 TOKEN
    const credentials = Buffer.from(
      `${process.env.BOG_CLIENT_ID}:${process.env.BOG_CLIENT_SECRET}`
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
      return res.status(500).json({
        error: "Token error",
        data: tokenData,
      });
    }

    const token = tokenData.access_token;

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

    // Sanity BEFORE payment redirect — must finish before response (serverless-safe)
    try {
      if (!process.env.SANITY_API_TOKEN?.trim()) {
        console.error(
          "[Sanity] SANITY_API_TOKEN is missing — orders will not persist. Set it in .env.local (root) and Vercel env."
        );
      }

      await client.create({
        _type: "order",
        customerName: String(body.customerName || body.name || "Unknown").trim() || "Unknown",
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
      });
      console.log("[Sanity] Order document created");
    } catch (sanityErr) {
      logSanityError(sanityErr, "create order document");
    }

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
      return res.status(500).json({
        error: "BOG არაა JSON",
        raw: text,
      });
    }

    const redirectUrl =
      data?._links?.redirect?.href ||
      data?.payment_url ||
      data?.redirect_url;

    if (!redirectUrl) {
      return res.status(500).json({
        error: "No payment URL",
        data,
      });
    }

    console.log("✅ Redirecting to BOG");

    return res.status(200).json({
      payment_url: redirectUrl,
    });

  } catch (err) {
    console.error("❌ FATAL:", err);

    return res.status(500).json({
      error: "Server crash",
      message: err.message,
    });
  }
}
