import crypto from "crypto";
import fetch from "node-fetch";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const amount = Number(
      body.amount || body.total_amount || body.totalAmount
    );

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const items = (body.items || []).map((i) => ({
      product_id: String(i.product_id),
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
    }));

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

    const token = tokenData.access_token;

    const orderRes = await fetch(
      "https://api.bog.ge/payments/v1/ecommerce/orders",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
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
        }),
      }
    );

    const data = await orderRes.json();

    const redirectUrl =
      data?._links?.redirect?.href ||
      data?.payment_url ||
      data?.redirect_url;

    if (!redirectUrl) {
      return res.status(500).json({ error: "No payment URL", data });
    }

    return res.status(200).json({
      payment_url: redirectUrl,
    });

  } catch (err) {
    console.error("ERROR:", err);
    return res.status(500).json({
      error: "Server error",
      message: err.message,
    });
  }
}