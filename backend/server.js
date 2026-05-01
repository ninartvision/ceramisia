/**
 * Local-only Express dev server (NOT used on Vercel).
 *
 * Production: serverless functions in `/api` at the repo root
 * (`/api/pay`, `/api/payment`, `/api/callback`).
 * Match production locally: `npx vercel dev` from repo root.
 *
 * Usage (legacy local):
 *   npm install --prefix backend
 *   cp .env.example .env && npm start --prefix backend
 */

import 'dotenv/config';
import express  from 'express';
import cors     from 'cors';
import fetch    from 'node-fetch';

const PORT           = process.env.PORT           || 3000;
const BOG_CLIENT_ID  = process.env.BOG_CLIENT_ID;
const BOG_SECRET_KEY = process.env.BOG_SECRET_KEY;
const CALLBACK_URL   = process.env.CALLBACK_URL   || 'https://ceramisia.com/payment-callback';
const SUCCESS_URL    = process.env.SUCCESS_URL    || 'https://ceramisia.com/payment-success';
const FAIL_URL       = process.env.FAIL_URL       || 'https://ceramisia.com/payment-fail';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://ceramisia.com';

const BOG_ORDER_URL = 'https://api.bog.ge/payments/v1/ecommerce/orders';
const BOG_TOKEN_URL = 'https://api.bog.ge/oauth2/token';

// â”€â”€ OAuth token cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let _tokenCache = { value: null, expiresAt: 0 };

async function getBogToken() {
  const now = Date.now();
  // Return cached token if it still has >60 s of life
  if (_tokenCache.value && now < _tokenCache.expiresAt - 60_000) {
    return _tokenCache.value;
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

  // expires_in is in seconds; default to 300 s if not provided
  const ttl = (data.expires_in || 300) * 1000;
  _tokenCache = { value: data.access_token, expiresAt: now + ttl };

  return _tokenCache.value;
}

const app = express();

// â”€â”€ Middleware â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.use(express.json());

app.use(cors({
  origin: function (origin, cb) {
    // Allow server-to-server (no origin) and the configured frontend origin
    if (!origin || origin === ALLOWED_ORIGIN) return cb(null, true);
    cb(new Error('CORS: origin not allowed â€“ ' + origin));
  },
}));

// â”€â”€ POST /pay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Body:   { amount: number, items?: array }
 * Returns { payment_url: string }
 */
app.post('/pay', async (req, res) => {
  const amount = parseFloat(req.body?.amount);

  if (!amount || isNaN(amount) || amount <= 0 || amount > 100000) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  if (!BOG_CLIENT_ID || !BOG_SECRET_KEY) {
    console.error('[BOG] BOG_CLIENT_ID or BOG_SECRET_KEY is not set in .env');
    return res.status(500).json({ error: 'Payment gateway not configured' });
  }

  const externalOrderId = `order_${Date.now()}`;

  const payload = {
    callback_url:      CALLBACK_URL,
    external_order_id: externalOrderId,
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

    return res.status(200).json({ payment_url: redirectUrl });

  } catch (err) {
    console.error('[BOG] /pay error:', err.message);
    return res.status(502).json({ error: 'Payment service unavailable. Please try again.' });
  }
});

// â”€â”€ Health check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// â”€â”€ Start â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.listen(PORT, () => {
  console.log(`[Ceramisia] Payment server running on http://localhost:${PORT}`);
});

