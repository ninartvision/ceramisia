import fetch from "node-fetch";

let _installToken = null;
let _installTokenExpiresAt = 0;

/** Trim BOM/quotes — same idea as flitt-pay / _db (Vercel copy-paste). */
function trimEnv(v) {
  if (v == null) return "";
  return String(v)
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

/** Safe log fingerprint for client_id (never log full secret). */
function maskClientId(clientId) {
  const s = String(clientId || "");
  if (!s) return "(empty)";
  if (s.length <= 8) return `*** len=${s.length}`;
  return `${s.slice(0, 4)}…${s.slice(-4)} (len=${s.length})`;
}

export function getInstallmentApiBase() {
  const raw =
    process.env.BOG_INSTALLMENT_BASE_URL || "https://installment.bog.ge/v1";
  return String(raw).replace(/\/+$/, "");
}

/**
 * Full OAuth token URL. Override if BOG gives a non-standard host/path.
 * Examples:
 *   (unset) → {BOG_INSTALLMENT_BASE_URL}/oauth2/token
 *   https://installment.bog.ge/v1/oauth2/token
 */
export function getInstallmentOAuthTokenUrl() {
  const override = trimEnv(process.env.BOG_INSTALL_OAUTH_URL);
  if (override) return override.replace(/\/+$/, "");
  return `${getInstallmentApiBase()}/oauth2/token`;
}

export function clearInstallmentTokenCache() {
  _installToken = null;
  _installTokenExpiresAt = 0;
}

/**
 * Installment Loan API uses merchant credentials issued for **Online Installment**
 * (bonline.bog.ge registration), not necessarily the ecommerce Payments API pair.
 */
export function getInstallmentCredentialSourceLabel() {
  const idSrc = trimEnv(process.env.BOG_INSTALL_CLIENT_ID)
    ? "BOG_INSTALL_CLIENT_ID"
    : "BOG_CLIENT_ID_fallback";
  const secretSrc = trimEnv(process.env.BOG_INSTALL_SECRET_KEY)
    ? "BOG_INSTALL_SECRET_KEY"
    : trimEnv(process.env.BOG_INSTALL_CLIENT_SECRET)
      ? "BOG_INSTALL_CLIENT_SECRET"
      : trimEnv(process.env.BOG_CLIENT_SECRET)
        ? "BOG_CLIENT_SECRET"
        : trimEnv(process.env.BOG_SECRET_KEY)
          ? "BOG_SECRET_KEY"
          : "(none)";
  return { clientIdEnv: idSrc, secretEnv: secretSrc };
}

export function getInstallmentCredentials() {
  const clientId =
    trimEnv(process.env.BOG_INSTALL_CLIENT_ID) ||
    trimEnv(process.env.BOG_CLIENT_ID);
  const secret =
    trimEnv(process.env.BOG_INSTALL_SECRET_KEY) ||
    trimEnv(process.env.BOG_INSTALL_CLIENT_SECRET) ||
    trimEnv(process.env.BOG_CLIENT_SECRET) ||
    trimEnv(process.env.BOG_SECRET_KEY);
  return { clientId, secret };
}

/**
 * OAuth for Installment Loan API (server-side only).
 * @see https://api.bog.ge/docs/en/installment/authentication
 */
export async function getInstallmentAccessToken() {
  const { clientId, secret } = getInstallmentCredentials();
  const labels = getInstallmentCredentialSourceLabel();

  if (!clientId || !secret) {
    const err = new Error("Installment API credentials missing");
    err.stage = "oauth_precheck";
    err.debug = {
      has_client_id: Boolean(clientId),
      has_secret: Boolean(secret),
      client_id_env: labels.clientIdEnv,
      secret_env: labels.secretEnv,
    };
    throw err;
  }

  const now = Date.now();
  if (_installToken && _installTokenExpiresAt - now > 60_000) {
    console.log("[bog-install-oauth] using cached access_token (still fresh)");
    return _installToken;
  }

  const tokenUrl = getInstallmentOAuthTokenUrl();
  const basic = Buffer.from(`${clientId}:${secret}`).toString("base64");

  console.log("[bog-install-oauth] POST token request", {
    token_url: tokenUrl,
    api_base_configured: getInstallmentApiBase(),
    oauth_override: Boolean(trimEnv(process.env.BOG_INSTALL_OAUTH_URL)),
    client_id_masked: maskClientId(clientId),
    secret_length: String(secret).length,
    credential_sources: labels,
    VERCEL_ENV: process.env.VERCEL_ENV ?? null,
  });

  let tokenRes;
  const t0 = Date.now();
  try {
    tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
    });
  } catch (netErr) {
    clearInstallmentTokenCache();
    const err = new Error(
      `Installment OAuth network error: ${netErr?.message || netErr}`
    );
    err.stage = "oauth_fetch_throw";
    err.cause = netErr;
    err.debug = { token_url: tokenUrl };
    console.error("[bog-install-oauth] fetch threw", {
      message: netErr?.message,
      token_url: tokenUrl,
    });
    throw err;
  }

  const elapsedMs = Date.now() - t0;
  const tokenText = await tokenRes.text();

  let tokenData;
  try {
    tokenData = tokenText ? JSON.parse(tokenText) : {};
  } catch {
    clearInstallmentTokenCache();
    const err = new Error("Installment OAuth response was not JSON");
    err.stage = "oauth_not_json";
    err.status = tokenRes.status;
    err.debug = {
      token_url: tokenUrl,
      http_status: tokenRes.status,
      body_preview: tokenText.slice(0, 500),
    };
    console.error("[bog-install-oauth] non-JSON token response", {
      http_status: tokenRes.status,
      elapsed_ms: elapsedMs,
      preview: tokenText.slice(0, 800),
    });
    throw err;
  }

  if (!tokenRes.ok || !tokenData.access_token) {
    clearInstallmentTokenCache();
    const err = new Error("Installment access token request failed");
    err.stage = "oauth_denied";
    err.status = tokenRes.status;
    err.body = tokenData;
    err.debug = {
      token_url: tokenUrl,
      http_status: tokenRes.status,
      bog_response_keys:
        tokenData && typeof tokenData === "object"
          ? Object.keys(tokenData)
          : [],
      /** Typical: invalid_client, unauthorized_client */
      error_field: tokenData?.error ?? null,
      error_description: tokenData?.error_description ?? null,
      message_field: tokenData?.message ?? null,
      elapsed_ms: elapsedMs,
    };
    console.error("[bog-install-oauth] token rejected or missing access_token", {
      http_status: tokenRes.status,
      elapsed_ms: elapsedMs,
      bog_body: tokenData,
      client_id_masked: maskClientId(clientId),
      credential_sources: labels,
    });
    throw err;
  }

  const sec = Number(tokenData.expires_in);
  if (Number.isFinite(sec) && sec > 0 && sec <= 604800) {
    _installTokenExpiresAt = now + sec * 1000;
  } else {
    _installTokenExpiresAt = now + 3600_000;
  }

  console.log("[bog-install-oauth] token OK", {
    http_status: tokenRes.status,
    elapsed_ms: elapsedMs,
    token_type: tokenData.token_type ?? null,
    expires_in_raw: tokenData.expires_in ?? null,
    access_token_length: String(_installToken).length,
  });

  return _installToken;
}

/**
 * @see https://api.bog.ge/docs/en/installment/installment-details
 */
export async function fetchInstallmentCheckoutDetails(orderId) {
  const token = await getInstallmentAccessToken();
  const base = getInstallmentApiBase();
  const detailRes = await fetch(
    `${base}/installment/checkout/${encodeURIComponent(orderId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    }
  );

  const text = await detailRes.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const err = new Error("Installment details not JSON");
    err.raw = text.slice(0, 300);
    throw err;
  }

  if (!detailRes.ok) {
    const err = new Error(`Installment details HTTP ${detailRes.status}`);
    err.body = data;
    throw err;
  }

  return data;
}
