import crypto from "crypto";
import fetch from "node-fetch";
import { client } from "../lib/sanity.js";
import { trySanityCreateOrder } from "../lib/sanityOrderSync.js";
import { savePendingOrder } from "./_db.js";
import {
  describeFlittSignInputs,
  signFlittPayload,
} from "./_flittSignature.js";

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

    // Signing uses ONLY FLITT_PRIVATE_KEY (payment secret). Never put the public key here.
    if (secret && publicKey && secret === publicKey) {
      console.error(
        "[flitt-pay] FLITT_PRIVATE_KEY and FLITT_PUBLIC_KEY are identical — paste Payment secret from Flitt merchant portal into FLITT_PRIVATE_KEY only"
      );
    }

    console.log("[flitt-pay] deployment / secrets profile", {
      VERCEL_ENV: process.env.VERCEL_ENV ?? null,
      NODE_ENV: process.env.NODE_ENV ?? null,
      merchant_id: merchantId,
      FLITT_private_key_length: secret.length,
      FLITT_public_key_configured: Boolean(publicKey),
    });

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

    await trySanityCreateOrder(
      client,
      {
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
      },
      "flitt-pay"
    );

    const orderDesc = normalizeEnvValue(
      String(body.order_desc || body.orderDesc || "Ceramisia").slice(0, 1024)
    );

    /**
     * Request shape aligned with Flitt docs + `flittpayments/node-js-sdk` (`lib/util.js`):
     * JSON wrapper `{ "request": { ... } }`, signature = SHA1(secret + "|" + sorted values).
     * Signing matches official Node SDK: skip only `''`; excludes signature keys.
     *
     * `version` defaults to 1.0.1 per https://docs.flitt.com/api/order-parameters/ — same as
     * official curl examples; override with FLITT_REQUEST_VERSION.
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

    const verOverride = normalizeEnvValue(process.env.FLITT_REQUEST_VERSION);
    requestCore.version = verOverride || "1.0.1";

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

    const signDbg = describeFlittSignInputs(requestCore);
    const redactedSha1Input =
      `***SECRET(len=${secret.length})***|${signDbg.values_joined_after_secret}`;
    console.log("[flitt-pay] request summary (pre-Flitt)", {
      checkoutUrl,
      sandbox_mode: sandbox,
      wrapper: "request object root per Flitt docs",
      response_url: safeUrlParts("response_url", responseUrl),
      server_callback_url: safeUrlParts("server_callback_url", serverCallbackUrl),
      signature: {
        length: signature.length,
        prefix: signature.slice(0, 8),
        algorithm:
          "sha1 (node-js-sdk genSignature): secret|…values sorted by key; join maps null/undefined to empty segment",
      },
      sign_sorted_keys: signDbg.sorted_keys,
      sign_value_types: signDbg.types,
    });
    console.log(
      "[flitt-pay] OUTBOUND signature plaintext (redacted secret, full pipe string for SHA1):",
      redactedSha1Input
    );
    console.log(
      "[flitt-pay] signature debug: data segment only (pipe-joined values after secret — compare to Flitt error response_signature_string tail):",
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
        failure_stage: "flitt_non_json",
        error: "Flitt invalid response",
        raw: rawText.slice(0, 400),
        flitt_http_status: flittRes.status,
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
      const flittMsg =
        resp?.error_message != null && String(resp.error_message).trim() !== ""
          ? String(resp.error_message).trim()
          : "";
      const flittCode =
        resp?.error_code !== undefined &&
        resp?.error_code !== null &&
        String(resp.error_code).trim() !== ""
          ? String(resp.error_code).trim()
          : "";
      const errorSummary =
        flittMsg && flittCode
          ? `${flittMsg} (${flittCode})`
          : flittMsg || flittCode || "Flitt declined request";

      const isSignatureError =
        String(flittCode) === "1014" ||
        /invalid\s*signature/i.test(String(flittMsg || ""));

      const payloadBase = {
        failure_stage: "flitt_checkout_rejected",
        error: errorSummary,
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
            "Request uses version 1.0.1 by default (docs / curl). Override with FLITT_REQUEST_VERSION. For sandbox use FLITT_SANDBOX=1. FLITT_LANG=ka for Georgian checkout. Compare OUTBOUND signature plaintext log with Flitt response_signature_string.",
        },
      };

      if (isSignatureError) {
        payloadBase.signature_debug = {
          algorithm:
            "SHA1( UTF-8 bytes of: secret + '|' + pipe_joined_values ) → lowercase hex",
          field_order:
            "Alphabetical by parameter name (ASCII sort). Exclude signature & response_signature_string & empty-string values (official Node SDK rule).",
          deployment_context: {
            VERCEL_ENV: process.env.VERCEL_ENV ?? null,
            flitt_checkout_host: (() => {
              try {
                return new URL(checkoutUrl).host;
              } catch {
                return null;
              }
            })(),
            sandbox_mode: sandbox,
          },
          sorted_keys_in_signature: signDbg.sorted_keys,
          /** Must match the tail of Flitt `response_signature_string` after `**********|` */
          values_pipe_joined_after_secret: signDbg.values_joined_after_secret,
          /** Hex we sent on this request (verify secret used at runtime) */
          outbound_signature_hex: signature,
          compare_hint:
            "If values_pipe_joined_after_secret matches Flitt tail but 1014 persists → wrong FLITT_PRIVATE_KEY (sandbox vs prod). If tails differ → extra/missing params (version, lang, cancel_url, reservation_data), whitespace in URLs, or wrong amount/currency.",
        };
      }

      return res.status(502).json(payloadBase);
    }

    const checkoutHref =
      typeof resp.checkout_url === "string" ? resp.checkout_url.trim() : "";

    if (!checkoutHref) {
      console.error("[flitt-pay] missing checkout_url", resp);
      return res.status(502).json({
        failure_stage: "flitt_missing_checkout_url",
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
        hint: dbErr?.hint,
        details: dbErr?.details,
        name: dbErr?.name,
      });
      const isEnv = dbErr?.name === "SupabaseEnvError";
      return res.status(502).json({
        failure_stage: "pending_order_db",
        error: "Order tracking unavailable",
        details: isEnv
          ? "Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for this environment (Production / Preview)."
          : {
              message: dbErr?.message,
              code: dbErr?.pgCode ?? dbErr?.code,
              hint: dbErr?.hint,
              dbOperation: dbErr?.dbOperation,
            },
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
