import crypto from "crypto";
import fetch from "node-fetch";
import { client } from "../lib/sanity.js";
import { savePendingOrder } from "./_db.js";
import { signFlittPayload } from "./_flittSignature.js";

const DEFAULT_CHECKOUT_URL = "https://pay.flitt.com/api/checkout/url";
/** Test / sandbox host per Flitt integration docs (override with FLITT_CHECKOUT_URL). */
const DEFAULT_SANDBOX_CHECKOUT_URL =
  "https://sandbox.pay.flitt.dev/api/checkout/url";

function normalizeEnvValue(val) {
  if (val == null) return "";
  return String(val)
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function firstEnvTrimmed(...names) {
  for (const name of names) {
    const v = normalizeEnvValue(process.env[name]);
    if (v) return v;
  }
  return "";
}

/** Mirror _flittSignature filtering — logs only, no secret. */
function describeSignInputs(requestCoreNoSig) {
  const filtered = {};
  for (const [k, v] of Object.entries(requestCoreNoSig)) {
    if (k === "signature" || k === "response_signature_string") continue;
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v === "") continue;
    filtered[k] = v;
  }
  const sortedKeys = Object.keys(filtered).sort();
  const valuesOnly = sortedKeys.map((k) => String(filtered[k]));
  return {
    sorted_keys: sortedKeys,
    values_joined_after_secret: valuesOnly.join("|"),
    types: sortedKeys.reduce((acc, k) => {
      acc[k] = Array.isArray(filtered[k])
        ? "array"
        : filtered[k] === null
          ? "null"
          : typeof filtered[k];
      return acc;
    }, {}),
  };
}

function safeUrlParts(label, url) {
  try {
    const u = new URL(url);
    return {
      label,
      href: u.href,
      protocol: u.protocol,
      host: u.host,
      pathname: u.pathname,
      hasTrailingSlashPath:
        u.pathname.length > 1 && u.pathname.endsWith("/"),
    };
  } catch {
    return { label, href: url, parse_error: true };
  }
}

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

/** GEL: amount in tetri (integer) for Flitt API. */
function toMinorUnits(major, currency) {
  const c = String(currency || "GEL").toUpperCase();
  const decimals = c === "JPY" ? 0 : 2;
  const f = 10 ** decimals;
  return Math.round(Number(major) * f);
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

    const amountMajor = Number(
      body.amount || body.total_amount || body.totalAmount
    );

    if (!amountMajor || amountMajor <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const amountRounded = parseFloat(Number(amountMajor).toFixed(2));
    const rawItems = body.items || [];
    const currency = String(
      body.currency || process.env.FLITT_CURRENCY || "GEL"
    )
      .toUpperCase()
      .slice(0, 3);

    const merchantIdRaw = process.env.FLITT_MERCHANT_ID;
    const merchantId = parseInt(normalizeEnvValue(merchantIdRaw), 10);
    const secret = normalizeEnvValue(process.env.FLITT_PRIVATE_KEY);
    const publicKey = normalizeEnvValue(process.env.FLITT_PUBLIC_KEY);

    if (!Number.isFinite(merchantId) || merchantId <= 0 || !secret) {
      console.error(
        "[flitt-pay] missing FLITT_MERCHANT_ID or FLITT_PRIVATE_KEY",
        {
          merchant_id_env_present: Boolean(merchantIdRaw),
          merchant_id_numeric_ok:
            Number.isFinite(merchantId) && merchantId > 0,
        }
      );
      return res.status(500).json({ error: "Flitt not configured" });
    }

    if (!publicKey) {
      console.warn(
        "[flitt-pay] FLITT_PUBLIC_KEY empty — optional for /checkout/url; set if required by your portal"
      );
    }

    const responseUrl = firstEnvTrimmed(
      "FLITT_RESPONSE_URL",
      "TBC_SUCCESS_URL",
      "SUCCESS_URL"
    );
    const serverCallbackUrl = normalizeEnvValue(
      process.env.FLITT_SERVER_CALLBACK_URL
    );

    if (!responseUrl || !serverCallbackUrl?.startsWith("https://")) {
      console.error(
        "[flitt-pay] set FLITT_RESPONSE_URL and FLITT_SERVER_CALLBACK_URL (callback must be HTTPS)",
        {
          response_url_ok: Boolean(responseUrl),
          response_url_https:
            typeof responseUrl === "string" &&
            responseUrl.startsWith("https://"),
          server_callback_https:
            typeof serverCallbackUrl === "string" &&
            serverCallbackUrl.startsWith("https://"),
        }
      );
      return res.status(500).json({
        error: "Flitt URLs not configured",
        details:
          "FLITT_RESPONSE_URL and FLITT_SERVER_CALLBACK_URL must be set; server_callback must be HTTPS (response_url may be HTTP per Flitt docs, but set HTTPS in production).",
      });
    }

    // Flitt only requires HTTPS for server_callback_url; response_url can be http in docs examples.
    if (!String(responseUrl).startsWith("http://") &&
        !String(responseUrl).startsWith("https://")) {
      console.error("[flitt-pay] FLITT_RESPONSE_URL must start with http:// or https://");
      return res.status(500).json({
        error: "Invalid FLITT_RESPONSE_URL",
        details: "response_url must be an absolute URL",
      });
    }

    const orderId = `flt_${crypto.randomUUID()}`;
    const amountMinor = toMinorUnits(amountRounded, currency);

    console.log("[flitt-pay] POST /api/flitt-pay", {
      order_id: orderId,
      order_id_format_ok: /^flt_[0-9a-f-]{36}$/i.test(orderId),
      amount_major: amountRounded,
      amount_minor: amountMinor,
      amount_minor_is_integer: Number.isInteger(amountMinor),
      currency,
      merchant_id: merchantId,
      merchant_id_type: typeof merchantId,
      itemCount: Array.isArray(rawItems) ? rawItems.length : 0,
    });

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
        message: body.message ? String(body.message) : "Flitt order",
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
      console.log("[flitt-pay] Sanity order document created");
    } catch (sanityErr) {
      logSanityError(sanityErr, "create order document (Flitt)");
    }

    const orderDesc = normalizeEnvValue(
      String(body.order_desc || body.orderDesc || "Ceramisia").slice(0, 1024)
    );

    /**
     * Request shape aligned with Flitt docs + official @flittpayments/node-js-sdk:
     * wrapper `{ "request": { ... } }`, no `signature` in signing set.
     * SDK does not inject `version` / `lang` by default — omit unless env overrides
     * so signature matches typical merchant / portal setups.
     */
    const requestCore = {
      merchant_id: merchantId,
      order_id: orderId,
      order_desc: orderDesc || "Ceramisia",
      amount: amountMinor,
      currency,
      response_url: responseUrl,
      server_callback_url: serverCallbackUrl,
    };

    const ver = normalizeEnvValue(process.env.FLITT_REQUEST_VERSION);
    if (ver) {
      requestCore.version = ver;
    }

    const lang = normalizeEnvValue(process.env.FLITT_LANG);
    if (lang) {
      requestCore.lang = lang;
    }

    const cancelU = normalizeEnvValue(process.env.FLITT_CANCEL_URL);
    if (cancelU) {
      requestCore.cancel_url = cancelU;
    }

    const resData = normalizeEnvValue(process.env.FLITT_RESERVATION_DATA);
    if (resData) {
      requestCore.reservation_data = resData;
    }

    const sandbox =
      normalizeEnvValue(process.env.FLITT_SANDBOX) === "1" ||
      normalizeEnvValue(process.env.FLITT_ENV).toLowerCase() === "sandbox";
    const checkoutUrlOverride = normalizeEnvValue(process.env.FLITT_CHECKOUT_URL);
    const checkoutUrl = checkoutUrlOverride
      ? checkoutUrlOverride
      : sandbox
        ? DEFAULT_SANDBOX_CHECKOUT_URL
        : DEFAULT_CHECKOUT_URL;

    const signature = signFlittPayload(secret, requestCore);
    const requestPayload = { ...requestCore, signature };

    const signDbg = describeSignInputs(requestCore);
    console.log("[flitt-pay] request summary (pre-Flitt)", {
      checkoutUrl,
      sandbox_mode: sandbox,
      wrapper: "request object root per Flitt docs",
      response_url: safeUrlParts("response_url", responseUrl),
      server_callback_url: safeUrlParts("server_callback_url", serverCallbackUrl),
      signature: {
        length: signature.length,
        prefix: signature.slice(0, 8),
        algorithm: "sha1 pipe-sorted values after secret",
      },
      sign_sorted_keys: signDbg.sorted_keys,
      sign_value_types: signDbg.types,
    });
    console.log(
      "[flitt-pay] signature debug: values after secret (pipe-joined, NO secret) — compare to Flitt 'Invalid signature' / response_signature_string hints:",
      signDbg.values_joined_after_secret
    );

    const outboundJson = JSON.stringify({ request: requestPayload });

    console.log("[flitt-pay] calling Flitt checkout/url", {
      checkoutUrl,
      sandbox_mode: sandbox,
      body_shape: { request: Object.keys(requestPayload).sort() },
      merchant_id_json_type: "number",
      amount_json_type: typeof requestPayload.amount,
    });
    console.log("[flitt-pay] outbound JSON body (no secrets):", outboundJson);

    const flittRes = await fetch(checkoutUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
        "User-Agent": "Ceramisia-flitt-pay/1.0",
      },
      body: outboundJson,
    });

    const rawText = await flittRes.text();
    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      console.error("[flitt-pay] non-JSON response", {
        status: flittRes.status,
      });
      return res.status(502).json({
        error: "Flitt invalid response",
        raw: rawText.slice(0, 400),
      });
    }

    const topKeys =
      data && typeof data === "object" ? Object.keys(data) : [];
    const resp = data.response && typeof data.response === "object"
      ? data.response
      : data;

    const flittError = {
      http_status: flittRes.status,
      http_ok: flittRes.ok,
      top_level_keys: topKeys,
      response_status: resp?.response_status ?? null,
      error_code: resp?.error_code ?? null,
      error_message: resp?.error_message ?? null,
      request_id: resp?.request_id ?? null,
      response_signature_string:
        typeof resp?.response_signature_string === "string"
          ? resp.response_signature_string
          : null,
    };

    console.log("[flitt-pay] Flitt raw response (parsed)", {
      ...flittError,
      full_response_object: resp,
    });
    if (flittRes.status >= 400 || resp?.response_status !== "success") {
      console.error("[flitt-pay] Flitt declined or HTTP error", flittError);
      console.error(
        "[flitt-pay] Flitt raw response body (full):",
        rawText.length > 32000 ? rawText.slice(0, 32000) + "…[truncated]" : rawText
      );
    }

    if (resp?.response_status !== "success") {
      return res.status(502).json({
        error: "Flitt declined request",
        /** Mirrors Flitt `response` — use for support tickets / portal checks */
        flitt_response: resp,
        flitt_error_summary: {
          http_status: flittRes.status,
          response_status: resp?.response_status,
          error_code: resp?.error_code,
          error_message: resp?.error_message,
          request_id: resp?.request_id,
        },
        debug_request: {
          checkout_url_used: checkoutUrl,
          sandbox_mode: sandbox,
          merchant_id: merchantId,
          order_id: orderId,
          amount_minor: amountMinor,
          currency,
          response_url: responseUrl,
          server_callback_url: serverCallbackUrl,
          sorted_request_keys: Object.keys(requestCore).sort(),
          hint:
            "If test merchant (e.g. 1549901 / secret 'test'): set FLITT_SANDBOX=1 or FLITT_CHECKOUT_URL to sandbox host. For Georgian UI set FLITT_LANG=ka. To match docs sample with version use FLITT_REQUEST_VERSION=1.0.1",
        },
      });
    }

    const checkoutHref =
      typeof resp.checkout_url === "string" ? resp.checkout_url.trim() : "";

    if (!checkoutHref) {
      console.error("[flitt-pay] missing checkout_url", resp);
      return res.status(502).json({
        error: "No checkout URL",
        details: resp,
      });
    }

    try {
      await savePendingOrder(orderId, amountRounded, "flitt", "card");
      console.log("[flitt-pay] pending_orders saved", {
        order_id: orderId,
        amount: amountRounded,
        provider: "flitt",
        payment_type: "card",
      });
    } catch (dbErr) {
      console.error("[flitt-pay] savePendingOrder failed", {
        order_id: orderId,
        message: dbErr?.message,
        code: dbErr?.code ?? dbErr?.pgCode,
      });
      return res.status(502).json({
        error: "Order tracking unavailable",
        details:
          dbErr?.name === "SupabaseEnvError"
            ? "Supabase not configured"
            : undefined,
      });
    }

    console.log("[flitt-pay] returning checkout_url to client", { order_id: orderId });

    return res.status(200).json({
      payment_url: checkoutHref,
      order_id: orderId,
    });
  } catch (err) {
    console.error("[flitt-pay] FATAL", err?.message, err?.stack);
    return res.status(500).json({
      error: "Server crash",
      message: err.message,
    });
  }
}
