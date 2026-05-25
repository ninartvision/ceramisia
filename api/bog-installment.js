import crypto from "crypto";
import fetch from "node-fetch";
import { client } from "../lib/sanity.js";
import {
  buildOrderSelectedProducts,
  trySanityCreateOrder,
} from "../lib/sanityOrderSync.js";
import { savePendingOrder } from "./_db.js";
import {
  getInstallmentAccessToken,
  getInstallmentApiBase,
  getInstallmentCredentials,
  getInstallmentCredentialSourceLabel,
  getInstallmentOAuthTokenUrl,
} from "./_bogInstallmentApi.js";

const INSTALL_ORDER_ID_RE = /^[a-zA-Z0-9._-]{8,128}$/;

function stringifyBogInstallError(data) {
  if (data == null || typeof data !== "object") return "";
  if (typeof data.message === "string") return data.message;
  if (typeof data.error === "string") return data.error;
  if (typeof data.error_description === "string") return data.error_description;
  try {
    return JSON.stringify(data).slice(0, 1200);
  } catch {
    return "";
  }
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
      try {
        body = body ? JSON.parse(body) : {};
      } catch (parseErr) {
        console.error("[bog-installment] invalid JSON body", {
          message: parseErr?.message,
        });
        return res.status(400).json({
          error: "Invalid JSON body",
          details: parseErr?.message,
        });
      }
    }

    if (body == null || typeof body !== "object") {
      return res.status(400).json({ error: "Request body required" });
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

    console.log("[bog-installment] credential profile", {
      client_id_masked:
        String(clientId).length > 8
          ? `${String(clientId).slice(0, 4)}…${String(clientId).slice(-4)}`
          : "(short)",
      client_id_length: String(clientId).length,
      secret_length: String(secret).length,
      credential_sources: getInstallmentCredentialSourceLabel(),
      installment_api_base: getInstallmentApiBase(),
      oauth_token_url: getInstallmentOAuthTokenUrl(),
      VERCEL_ENV: process.env.VERCEL_ENV ?? null,
    });

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

    let accessToken;
    try {
      accessToken = await getInstallmentAccessToken();
    } catch (tokErr) {
      console.error("[bog-installment] OAuth token failed", {
        message: tokErr?.message,
        stage: tokErr?.stage,
        status: tokErr?.status,
        bog_body: tokErr?.body,
        debug: tokErr?.debug,
      });
      return res.status(502).json({
        failure_stage: tokErr?.stage || "bog_oauth_token",
        error: "Installment token error",
        details: tokErr?.body ?? tokErr?.message,
        debug_public: tokErr?.debug
          ? {
              token_url: tokErr.debug.token_url,
              http_status: tokErr.debug.http_status,
              oauth_override: Boolean(
                process.env.BOG_INSTALL_OAUTH_URL &&
                  String(process.env.BOG_INSTALL_OAUTH_URL).trim()
              ),
              api_base: getInstallmentApiBase(),
              credential_sources: getInstallmentCredentialSourceLabel(),
              bog_error: tokErr.body?.error ?? tokErr.debug?.error_field ?? null,
              bog_error_description:
                tokErr.body?.error_description ??
                tokErr.debug?.error_description ??
                null,
            }
          : undefined,
        hint:
          "Set Vercel Production: BOG_INSTALL_CLIENT_ID + BOG_INSTALL_SECRET_KEY from bonline.bog.ge (Online Installment), not ecommerce Payments API. Match BOG_INSTALLMENT_BASE_URL to the bank environment. Optional BOG_INSTALL_OAUTH_URL if BOG gave a full token URL.",
      });
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
    } catch (parseErr) {
      console.error("[bog-installment] checkout JSON parse failed", {
        httpStatus: apiRes.status,
        preview: apiText.slice(0, 1200),
      });
      return res.status(502).json({
        failure_stage: "bog_install_checkout_not_json",
        error: "Installment API invalid response",
        raw_preview: apiText.slice(0, 400),
      });
    }

    console.log("[bog-installment] create checkout HTTP", {
      status: apiRes.status,
      ok: apiRes.ok,
      keys: data && typeof data === "object" ? Object.keys(data) : [],
    });

    if (!apiRes.ok) {
      const flatMsg = stringifyBogInstallError(data);
      const merchantUnknown =
        /merchant.*not found|client_id.*not found/i.test(flatMsg) ||
        /merchant.*not found|client_id.*not found/i.test(apiText);
      console.error("[bog-installment] create checkout rejected", {
        httpStatus: apiRes.status,
        credential_sources: getInstallmentCredentialSourceLabel(),
        message_sample: flatMsg.slice(0, 400),
        response_body_full: data,
      });
      return res.status(502).json({
        failure_stage: merchantUnknown
          ? "bog_install_merchant_not_found"
          : "bog_install_api_error",
        error: "Installment order creation failed",
        details: data,
        hint: merchantUnknown
          ? "Online Installment API expects client_id + secret from bonline.bog.ge (Installment Loan registration), not the ecommerce Payments API pair. Set BOG_INSTALL_CLIENT_ID and BOG_INSTALL_SECRET_KEY in Vercel Production to the installment credentials; ensure BOG_INSTALLMENT_BASE_URL matches the environment the bank gave you."
          : undefined,
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

      const sanitySelectedProducts = await buildOrderSelectedProducts(
        client,
        rawItems
      );
      await trySanityCreateOrder(
        client,
        {
          _type: "order",
          orderId,
          customerName:
            String(body.customerName || body.name || "Unknown").trim() ||
            "Unknown",
          email: body.email ? String(body.email) : "",
          phone: body.phone ? String(body.phone) : "",
          message: body.message ? String(body.message) : "BOG installment order",
          selectedProducts: sanitySelectedProducts,
          amount: amountRounded,
          paymentProvider: "BOG (installment)",
          status: "new",
          createdAt: new Date().toISOString(),
        },
        "bog-installment"
      );
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
      /** Required by BOG.Calculator `successCb(orderId)` flow */
      order_id: orderId,
      orderId,
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
