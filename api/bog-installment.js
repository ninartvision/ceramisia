import crypto from "crypto";
import fetch from "node-fetch";
import { client } from "../lib/sanity.js";
import { savePendingOrder } from "./_db.js";
import {
  getInstallmentAccessToken,
  getInstallmentApiBase,
  getInstallmentCredentials,
} from "./_bogInstallmentApi.js";

const INSTALL_ORDER_ID_RE = /^[a-zA-Z0-9._-]{8,128}$/;

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

function extractInstallmentRedirect(links) {
  if (!Array.isArray(links)) return null;
  const target = links.find((l) => l && l.rel === "target");
  if (target?.href && typeof target.href === "string") return target.href.trim();
  return null;
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

    const amount = Number(
      body.amount || body.total_amount || body.totalAmount
    );

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const amountRounded = parseFloat(Number(amount).toFixed(2));
    const rawItems = body.items || [];

    const monthRaw =
      body.installment_month ??
      body.installmentMonth ??
      process.env.BOG_INSTALL_DEFAULT_MONTH;
    const typeRaw =
      body.installment_type ??
      body.installmentType ??
      process.env.BOG_INSTALL_DEFAULT_TYPE;

    const installmentMonth = Number(monthRaw);
    const installmentType = String(typeRaw || "STANDARD").trim() || "STANDARD";

    if (!Number.isFinite(installmentMonth) || installmentMonth <= 0) {
      return res.status(400).json({
        error: "Invalid installment_month",
        details:
          "Send installment_month or set BOG_INSTALL_DEFAULT_MONTH (e.g. 6)",
      });
    }

    console.log("[bog-installment] POST /api/bog-installment", {
      amount: amountRounded,
      itemCount: Array.isArray(rawItems) ? rawItems.length : 0,
      installmentMonth,
      installmentType,
    });

    const { clientId, secret } = getInstallmentCredentials();
    if (!clientId || !secret) {
      console.error(
        "[bog-installment] missing BOG_INSTALL_* or BOG_CLIENT_ID / BOG_CLIENT_SECRET"
      );
      return res.status(500).json({ error: "Installment gateway not configured" });
    }

    const successUrl =
      process.env.BOG_INSTALL_SUCCESS_URL || process.env.SUCCESS_URL;
    const failUrl =
      process.env.BOG_INSTALL_FAIL_URL || process.env.FAIL_URL;
    const rejectUrl =
      process.env.BOG_INSTALL_REJECT_URL || process.env.FAIL_URL;

    if (!successUrl || !failUrl || !rejectUrl) {
      console.error(
        "[bog-installment] missing success/fail/reject URLs (installment-specific or shared SUCCESS_URL / FAIL_URL)"
      );
      return res.status(500).json({
        error: "Redirect URLs not configured",
        details:
          "Set BOG_INSTALL_SUCCESS_URL, BOG_INSTALL_FAIL_URL, BOG_INSTALL_REJECT_URL or SUCCESS_URL / FAIL_URL",
      });
    }

    const cartItems = (Array.isArray(rawItems) ? rawItems : []).map((i) => {
      const qty = Math.max(1, Number(i.quantity) || 1);
      const unit = Number(i.unit_price) || 0;
      const lineTotal = parseFloat((unit * qty).toFixed(2));
      const slug = i.slug ? String(i.slug) : "";
      const desc =
        (i.name && String(i.name).trim()) ||
        (i.title && String(i.title).trim()) ||
        (i.product_name && String(i.product_name).trim()) ||
        `Product ${i.product_id}`;
      const row = {
        total_item_amount: lineTotal.toFixed(2),
        item_description: desc.slice(0, 300),
        total_item_qty: String(qty),
        item_vendor_code: String(i.product_id),
      };
      if (i.image && /^https?:\/\//i.test(String(i.image))) {
        row.product_image_url = String(i.image).slice(0, 2000);
      }
      if (slug) {
        row.item_site_detail_url = `https://ceramisia.com/products/${encodeURIComponent(slug)}/`;
      }
      return row;
    });

    if (cartItems.length === 0) {
      return res.status(400).json({ error: "items array required" });
    }

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
        message: body.message ? String(body.message) : "BOG installment order",
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
      console.log("[bog-installment] Sanity order document created");
    } catch (sanityErr) {
      logSanityError(sanityErr, "create order document (installment)");
    }

    const shopOrderId = `shp_${crypto.randomUUID()}`;

    const payload = {
      intent: "LOAN",
      installment_month: installmentMonth,
      installment_type: installmentType,
      shop_order_id: shopOrderId,
      success_redirect_url: successUrl,
      fail_redirect_url: failUrl,
      reject_redirect_url: rejectUrl,
      validate_items: true,
      locale: "ka",
      purchase_units: [
        {
          amount: {
            currency_code: "GEL",
            value: amountRounded.toFixed(2),
          },
        },
      ],
      cart_items: cartItems,
    };

    let accessToken;
    try {
      accessToken = await getInstallmentAccessToken();
    } catch (tokErr) {
      console.error("[bog-installment] token error", {
        message: tokErr?.message,
        status: tokErr?.status,
        body: tokErr?.body,
      });
      return res.status(502).json({
        error: "Installment token error",
        details: tokErr?.body ?? tokErr?.message,
      });
    }

    const base = getInstallmentApiBase();
    console.log("[bog-installment] creating installment checkout", {
      base,
      shop_order_id: shopOrderId,
    });

    const apiRes = await fetch(`${base}/installment/checkout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const apiText = await apiRes.text();
    let data;
    try {
      data = apiText ? JSON.parse(apiText) : {};
    } catch {
      console.error("[bog-installment] response not JSON", {
        httpStatus: apiRes.status,
      });
      return res.status(502).json({
        error: "Installment API invalid response",
        raw: apiText.slice(0, 400),
      });
    }

    console.log("[bog-installment] create checkout HTTP", {
      status: apiRes.status,
      ok: apiRes.ok,
      keys: data && typeof data === "object" ? Object.keys(data) : [],
    });

    if (!apiRes.ok) {
      return res.status(502).json({
        error: "Installment order creation failed",
        details: data,
      });
    }

    const orderId =
      data.order_id != null && String(data.order_id).trim() !== ""
        ? String(data.order_id).trim()
        : "";

    if (!orderId || !INSTALL_ORDER_ID_RE.test(orderId)) {
      console.error("[bog-installment] invalid order_id in response", {
        orderId: orderId || null,
      });
      return res.status(502).json({
        error: "Invalid installment response",
        details: "missing or invalid order_id",
      });
    }

    const redirectUrl = extractInstallmentRedirect(data.links);
    if (!redirectUrl) {
      console.error("[bog-installment] no target link in response", {
        order_id: orderId,
      });
      return res.status(502).json({
        error: "No installment redirect URL",
        details: data,
      });
    }

    try {
      await savePendingOrder(orderId, amountRounded, "bog", "installment");
      console.log("[bog-installment] pending_orders saved", {
        order_id: orderId,
        amount: amountRounded,
        provider: "bog",
        payment_type: "installment",
        shop_order_id: shopOrderId,
      });
    } catch (dbErr) {
      console.error("[bog-installment] savePendingOrder failed", {
        order_id: orderId,
        dbName: dbErr?.name,
        dbCode: dbErr?.code ?? dbErr?.pgCode,
        message: dbErr?.message,
      });
      return res.status(502).json({
        error: "Order tracking unavailable; installment not started",
        details:
          dbErr?.name === "SupabaseEnvError"
            ? "Supabase is not configured on the server"
            : undefined,
      });
    }

    console.log("[bog-installment] returning redirect URL", { order_id: orderId });

    return res.status(200).json({
      payment_url: redirectUrl,
    });
  } catch (err) {
    console.error("[bog-installment] FATAL", {
      message: err?.message,
      stack: err?.stack,
    });
    return res.status(500).json({
      error: "Server crash",
      message: err.message,
    });
  }
}
