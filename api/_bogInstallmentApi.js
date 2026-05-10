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

export function getInstallmentApiBase() {
  const raw =
    process.env.BOG_INSTALLMENT_BASE_URL || "https://installment.bog.ge/v1";
  return String(raw).replace(/\/+$/, "");
}

/**
 * Installment Loan API uses merchant credentials issued for **Online Installment**
 * (bonline.bog.ge registration), not necessarily the ecommerce Payments API pair.
 */
export function getInstallmentCredentialSourceLabel() {
  return trimEnv(process.env.BOG_INSTALL_CLIENT_ID)
    ? "BOG_INSTALL_CLIENT_ID"
    : "BOG_CLIENT_ID_fallback";
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
 * OAuth for Installment API (separate from api.bog.ge ecommerce OAuth).
 * @see https://api.bog.ge/docs/en/installment/authentication
 */
export async function getInstallmentAccessToken() {
  const { clientId, secret } = getInstallmentCredentials();
  if (!clientId || !secret) {
    throw new Error("Installment API credentials missing");
  }

  const now = Date.now();
  if (_installToken && _installTokenExpiresAt - now > 60_000) {
    return _installToken;
  }

  const basic = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const base = getInstallmentApiBase();
  const tokenRes = await fetch(`${base}/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });

  const tokenText = await tokenRes.text();
  let tokenData;
  try {
    tokenData = tokenText ? JSON.parse(tokenText) : {};
  } catch {
    throw new Error(
      `Installment token not JSON: ${tokenText.slice(0, 200)}`
    );
  }

  if (!tokenRes.ok || !tokenData.access_token) {
    const err = new Error("Installment access token request failed");
    err.status = tokenRes.status;
    err.body = tokenData;
    throw err;
  }

  _installToken = tokenData.access_token;
  const sec = Number(tokenData.expires_in);
  if (Number.isFinite(sec) && sec > 0 && sec < 1_000_000) {
    _installTokenExpiresAt = now + sec * 1000;
  } else {
    _installTokenExpiresAt = now + 3600_000;
  }

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
