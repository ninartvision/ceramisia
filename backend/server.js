/**
 * Ceramisia – Payment Backend
 * Node.js + Express server that creates Bank of Georgia (BOG) payment orders.
 *
 * Usage:
 *   npm install
 *   cp .env.example .env   ← fill in your BOG credentials
 *   node server.js
 */

'use strict';

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');

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

  return redirectUrl;
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /create-payment
 *
 * Body: { product_id, name, price, quantity }
 * Returns: { redirectUrl }
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
    var redirectUrl = await createBogOrder(product_id, productName, unitPrice, qty);
    return res.json({ redirectUrl });
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
