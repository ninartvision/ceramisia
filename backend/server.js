/**
 * Ceramisia – BOG Payment Backend
 * ES Module · Express · node-fetch
 *
 * Usage:
 *   npm install
 *   cp .env.example .env   ← fill in your BOG credentials
 *   npm start
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

// ── OAuth token cache ─────────────────────────────────────────────────────────

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

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json());

app.use(cors({
  origin: function (origin, cb) {
    // Allow server-to-server (no origin) and the configured frontend origin
    if (!origin || origin === ALLOWED_ORIGIN) return cb(null, true);
    cb(new Error('CORS: origin not allowed – ' + origin));
  },
}));

// ── POST /create-order ────────────────────────────────────────────────────────

/**
 * Body:   { amount: number }
 * Returns { redirectUrl: string }
 */
app.post('/create-order', async (req, res) => {
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

    return res.json({ redirectUrl });

  } catch (err) {
    console.error('[BOG] /create-order error:', err.message);
    return res.status(502).json({ error: 'Payment service unavailable. Please try again.' });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[Ceramisia] Payment server running on http://localhost:${PORT}`);
});


const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json());

// Allow requests only from your production domain (and localhost for dev)
const ALLOWED_ORIGINS = [
  'https://ceramisia.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];
app.use(cors({
  origin: function (origin, cb) {
    // Allow server-to-server requests (no origin) and listed origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origin not allowed – ' + origin));
  },
}));

// ── BOG API helpers ───────────────────────────────────────────────────────────

const BOG_TOKEN_URL = 'https://api.bog.ge/auth/oauth2/token';
const BOG_ORDER_URL = 'https://api.bog.ge/payments/v1/ecommerce/orders';

/**
 * Fetch a short-lived BOG OAuth2 bearer token using client credentials.
 * Tokens are valid for a few minutes; for high-traffic sites, cache this.
 */
async function getBogToken() {
  const clientId     = process.env.BOG_CLIENT_ID;
  const clientSecret = process.env.BOG_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('BOG_CLIENT_ID or BOG_CLIENT_SECRET is not set in .env');
  }

  const credentials = Buffer.from(clientId + ':' + clientSecret).toString('base64');

  const res = await fetch(BOG_TOKEN_URL, {
    method:  'POST',
    headers: {
      'Authorization': 'Basic ' + credentials,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('BOG token request failed (' + res.status + '): ' + text);
  }

  const data = await res.json();
  return data.access_token;
}

/**
 * Create a BOG ecommerce order and return the redirect URL.
 *
 * @param {string} productId
 * @param {string} productName
 * @param {number} unitPrice
 * @param {number} quantity
 * @returns {Promise<string>} redirectUrl
 */
async function createBogOrder(productId, productName, unitPrice, quantity) {
  const totalAmount = parseFloat((unitPrice * quantity).toFixed(2));

  const token = await getBogToken();

  const orderPayload = {
    callback_url: process.env.BOG_CALLBACK_URL || 'https://ceramisia.com/payment-callback',
    purchase_units: {
      currency:     'GEL',
      total_amount: totalAmount,
      basket: [
        {
          product_id:  productId,
          quantity:    quantity,
          unit_price:  unitPrice,
          description: productName,
        },
      ],
    },
    redirect_urls: {
      success: process.env.BOG_SUCCESS_URL || 'https://ceramisia.com/payment-success',
      fail:    process.env.BOG_FAIL_URL    || 'https://ceramisia.com/payment-fail',
    },
  };

  const res = await fetch(BOG_ORDER_URL, {
    method:  'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(orderPayload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('BOG order creation failed (' + res.status + '): ' + text);
  }

  const data = await res.json();

  // BOG returns the payment page URL in _links.redirect.href
  const redirectUrl = data?._links?.redirect?.href;
  if (!redirectUrl) {
    throw new Error('BOG response missing _links.redirect.href: ' + JSON.stringify(data));
  }

  // BOG may signal a POST 3DS redirect via _links.redirect.method
  const method = data?._links?.redirect?.method || 'GET';
  const params = data?._links?.redirect?.params || null;

  return { redirectUrl, method, params };
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /create-payment
 *
 * Body: { product_id, name, price, quantity, installment? }
 * Returns: { redirectUrl, method, params }
 *   method  – 'GET' (standard) or 'POST' (3DS ACS)
 *   params  – hidden form fields for POST 3DS (null for GET)
 */
app.post('/create-payment', async function (req, res) {
  var { product_id, name, price, quantity } = req.body;

  // Input validation
  if (!product_id || typeof product_id !== 'string' || product_id.length > 200) {
    return res.status(400).json({ error: 'Invalid product_id' });
  }
  var unitPrice = parseFloat(price);
  var qty       = parseInt(quantity, 10) || 1;

  if (isNaN(unitPrice) || unitPrice <= 0 || unitPrice > 100000) {
    return res.status(400).json({ error: 'Invalid price' });
  }
  if (qty < 1 || qty > 100) {
    return res.status(400).json({ error: 'Invalid quantity' });
  }

  var productName = typeof name === 'string' ? name.slice(0, 200) : product_id;

  try {
    var result = await createBogOrder(product_id, productName, unitPrice, qty);
    return res.json({
      redirectUrl: result.redirectUrl,
      method:      result.method,
      params:      result.params,
    });
  } catch (err) {
    console.error('[Payment] createBogOrder error:', err.message);
    return res.status(502).json({ error: 'Payment service unavailable. Please try again.' });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', function (_req, res) {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, function () {
  console.log('[Ceramisia] Payment server running on http://localhost:' + PORT);
});
