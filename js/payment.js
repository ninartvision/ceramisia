/**
 * Ceramisia – BOG Payment Handler (ES Module)
 *
 *   • 💳 Buy         → buyProduct(btn)      → POST /api/pay → window.location = redirect
 *   • 💸 Installment → openInstallment(btn) → BOG.Calculator.open() → POST /api/pay
 *
 * Button data-attributes:
 *   data-id    – product ID / slug
 *   data-price – unit price (number)
 *   data-qty   – quantity (number, default 1)
 *   data-name  – product display name
 *   data-slug  – Sanity slug (matches `products.slug` in Supabase catalog)
 */

const PAYMENT_ENDPOINT = '/api/pay';

// ── Helpers ─────────────────────────────────────────────────────────────────

function _setBtnState(btn, loading, text) {
  btn.disabled = loading;
  btn.classList.toggle('btn-buy--loading',         loading);
  btn.classList.toggle('btn-installment--loading', loading);
  if (text !== undefined) btn.textContent = text;
}

// Extract redirect URL from any shape BOG / our backend may return.
function extractRedirectUrl(data) {
  if (!data || typeof data !== 'object') return null;
  return (
    (data._links && data._links.redirect && data._links.redirect.href) ||
    (data.links  && data.links.redirect  && data.links.redirect.href)  ||
    data.payment_url  ||
    data.redirect_url ||
    data.url          ||
    (data.data && data.data._links && data.data._links.redirect && data.data._links.redirect.href) ||
    (data.data && data.data.payment_url) ||
    (data.data && data.data.url) ||
    null
  );
}

// Single source of truth for /api/pay calls — full debug logs, raw-text
// fallback, multi-shape redirect URL extraction, and proper async error
// surfacing (no Promise <pending> issues).
async function callPayApi(payload) {
  console.log('[Ceramisia] DEBUG /api/pay request payload:', payload);

  const res = await fetch(PAYMENT_ENDPOINT, {
    method:      'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'Accept':       'application/json',
    },
    body: JSON.stringify(payload),
  });

  // Read raw text first so non-JSON responses can still be logged.
  const rawText = await res.text();
  let data = null;
  let parseError = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch (e) {
    parseError = e && e.message ? e.message : String(e);
  }

  console.log('[Ceramisia] DEBUG /api/pay response:', {
    status:      res.status,
    ok:          res.ok,
    contentType: res.headers.get('content-type'),
    parseError,
    rawText,
    data,
  });

  if (!res.ok) {
    const serverErr =
      (data && (data.error || (data.details && data.details.message))) ||
      ('HTTP ' + res.status);
    throw new Error(String(serverErr));
  }

  const redirectUrl = extractRedirectUrl(data);
  console.log('[Ceramisia] DEBUG extracted redirect URL:', redirectUrl);

  if (!redirectUrl) {
    console.error('[Ceramisia] No redirect URL in response. Full body:', data);
    const err = new Error('NO_REDIRECT_URL');
    err.data = data;
    throw err;
  }

  return redirectUrl;
}

function _showError(err) {
  const msg = err && err.message ? String(err.message) : '';
  if (msg === 'NO_REDIRECT_URL') {
    alert('გადახდის ლინკი ვერ მოიძებნა (იხ. console)');
  } else {
    alert('გადახდის შეცდომა: ' + msg);
  }
}

// ── Buy / Pay ───────────────────────────────────────────────────────────────

export async function buyProduct(btn) {
  const productId = btn.dataset.id    || '';
  const slug        = btn.dataset.slug || productId || '';
  const price     = parseFloat(btn.dataset.price) || 0;
  const qty       = parseInt(btn.dataset.qty, 10) || 1;

  if (!productId || price <= 0) {
    console.error('[Ceramisia] buyProduct: missing data-id or data-price on', btn);
    return;
  }

  const originalText = btn.textContent;
  _setBtnState(btn, true, '...');

  try {
    const payload = {
      amount: parseFloat((price * qty).toFixed(2)),
      items: [
        { product_id: productId, slug: slug || undefined, quantity: qty, unit_price: price },
      ],
    };
    const redirectUrl = await callPayApi(payload);
    console.log('[Ceramisia] Redirecting to bank page →', redirectUrl);
    window.location.href = redirectUrl;
  } catch (err) {
    console.error('[Ceramisia] buyProduct error:', err);
    _setBtnState(btn, false, originalText);
    _showError(err);
  }
}

// ── Installment ─────────────────────────────────────────────────────────────

export function openInstallment(btn) {
  const price       = parseFloat(btn.dataset.price) || 0;
  const productId   = btn.dataset.id    || '';
  const slug        = btn.dataset.slug || productId || '';
  const name        = btn.dataset.name || productId;

  if (!window.BOG || !window.BOG.Calculator) {
    console.warn('[Ceramisia] BOG SDK not loaded.');
    return;
  }

  window.BOG.Calculator.open({
    productPrice: price,
    productName:  name,
    merchantId:   window.BOG_CLIENT_ID || '',
    onConfirm: async function (installmentData) {
      const originalText = btn.textContent;
      _setBtnState(btn, true, '...');
      try {
        const payload = {
          amount: parseFloat(price.toFixed(2)),
          items: [
            { product_id: productId, slug: slug || undefined, quantity: 1, unit_price: price },
          ],
          installment: installmentData,
        };
        const redirectUrl = await callPayApi(payload);
        console.log('[Ceramisia] Redirecting to bank page →', redirectUrl);
        window.location.href = redirectUrl;
      } catch (err) {
        console.error('[Ceramisia] installment error:', err);
        _setBtnState(btn, false, originalText);
        _showError(err);
      }
    },
  });
}

// ── Delegate listener ───────────────────────────────────────────────────────

export function initPaymentButtons(container) {
  (container || document.body).addEventListener('click', function (e) {
    const buyBtn  = e.target.closest('.btn-buy');
    const instBtn = e.target.closest('.btn-installment');
    if (buyBtn)  { e.stopPropagation(); buyProduct(buyBtn);       return; }
    if (instBtn) { e.stopPropagation(); openInstallment(instBtn); }
  });
}

// ── Globals (for inline onclick= and non-module scripts) ────────────────────
window.pay             = function (btn) { buyProduct(btn); };
window.openInstallment = function (btn) { openInstallment(btn); };
