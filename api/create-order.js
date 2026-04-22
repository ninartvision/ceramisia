/**
 * Ceramisia – BOG Payment · Vercel Serverless Function
 * Route: POST /api/create-order
 * Body:  { amount: number }
 * Returns: { redirectUrl: string }
 */

import fetch from 'node-fetch';

const BOG_ORDER_URL = 'https://api.bog.ge/payments/v1/ecommerce/orders';
const BOG_TOKEN_URL = 'https://api.bog.ge/oauth2/token';

// ── OAuth token cache (lives as long as the function instance is warm) ────────

let _tokenCache = { value: null, expiresAt: 0 };

async function getBogToken() {
  const now = Date.now();
  // Reuse cached token if it still has >60 s of life
  if (_tokenCache.value && now < _tokenCache.expiresAt - 60_000) {
    return _tokenCache.value;
  }

  const BOG_CLIENT_ID  = process.env.BOG_CLIENT_ID;
  const BOG_SECRET_KEY = process.env.BOG_SECRET_KEY;

  if (!BOG_CLIENT_ID || !BOG_SECRET_KEY) {
    throw new Error('BOG_CLIENT_ID or BOG_SECRET_KEY env var is not set');
  }

  const credentials = Buffer.from(`${BOG_CLIENT_ID}:${BOG_SECRET_KEY}`).toString('base64');

  const res = await fetch(BOG_TOKEN_URL, {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`BOG token request failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  if (!data.access_token) {
    throw new Error('BOG token response missing access_token: ' + JSON.stringify(data));
  }

  // expires_in is in seconds; default to 300 s if absent
  const ttl = (data.expires_in || 300) * 1000;
  _tokenCache = { value: data.access_token, expiresAt: now + ttl };

  return _tokenCache.value;
}

// ── CORS helper ───────────────────────────────────────────────────────────────

function setCorsHeaders(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://ceramisia.com';
  const origin        = req.headers.origin || '';

  if (origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin',  allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods',  'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',  'Content-Type');
  res.setHeader('Vary', 'Origin');
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const amount = parseFloat(req.body?.amount);

  if (!amount || isNaN(amount) || amount <= 0 || amount > 100_000) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  const CALLBACK_URL = process.env.CALLBACK_URL || 'https://ceramisia.com/payment-callback';
  const SUCCESS_URL  = process.env.SUCCESS_URL  || 'https://ceramisia.com/payment-success';
  const FAIL_URL     = process.env.FAIL_URL     || 'https://ceramisia.com/payment-fail';

  const payload = {
    callback_url:      CALLBACK_URL,
    external_order_id: `order_${Date.now()}`,
    purchase_units: {
      currency:     'GEL',
      total_amount: parseFloat(amount.toFixed(2)),
    },
    redirect_urls: {
      success: SUCCESS_URL,
      fail:    FAIL_URL,
    },
  };

  try {
    const token  = await getBogToken();
    const bogRes = await fetch(BOG_ORDER_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!bogRes.ok) {
      const text = await bogRes.text();
      throw new Error(`BOG API error (${bogRes.status}): ${text}`);
    }

    const data = await bogRes.json();

    const redirectUrl = data?._links?.redirect?.href;
    if (!redirectUrl) {
      throw new Error('BOG response missing _links.redirect.href: ' + JSON.stringify(data));
    }

    return res.status(200).json({ redirectUrl });

  } catch (err) {
    console.error('[BOG] /api/create-order error:', err.message);
    return res.status(502).json({ error: 'Payment service unavailable. Please try again.' });
  }
}
