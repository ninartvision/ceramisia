import { client } from "@/lib/sanity";
import crypto from "crypto";
import fetch from "node-fetch";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    console.log("🚀 API START");

    let body = req.body;
    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    console.log("📦 BODY:", body);

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

    console.log("🛒 ITEMS:", items);

    // ---------------- TOKEN ----------------
    console.log("🔐 STEP 1: Getting token");

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

    const tokenText = await tokenRes.text();

    let tokenData;
    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      return res.status(500).json({
        error: "Token არაა JSON",
        raw: tokenText,
      });
    }

    console.log("🔐 TOKEN:", tokenData);

    if (!tokenData.access_token) {
      return res.status(500).json({
        error: "Token error",
        data: tokenData,
      });
    }

    const token = tokenData.access_token;

    // ---------------- SANITY (SAFE) ----------------
    client
      .create({
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
      })
      .then(() => console.log("✅ Saved to Sanity"))
      .catch((e) => console.log("❌ Sanity error:", e));

    // ---------------- ORDER ----------------
    console.log("💳 STEP 2: Creating order");

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

    console.log("💳 ORDER RESPONSE:", data);

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

    console.log("✅ SUCCESS");

    return res.status(200).json({
      payment_url: redirectUrl,
    });

  } catch (err) {
    console.error("❌ FATAL ERROR:", err);

    return res.status(500).json({
      error: "Server crash",
      message: err.message,
    });
  }
}