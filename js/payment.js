/**
 * Ceramisia – BOG Payment Handler (ES Module)
 *
 * Handles:
 *   • 💳 Buy  →  pay(btn)          → POST /api/pay → redirect to payment_url
 *   • 💸 Installment → openInstallment(btn) → BOG.Calculator.open()
 *
 * Button data-attributes (same for both buttons):
 *   data-id    – product ID / slug
 *   data-price – unit price (number)
 *   data-qty   – quantity (number, default 1)
 *   data-name  – product display name
 *
 * Exposes window.pay() and window.openInstallment() for inline onclick use.
 */

const PAYMENT_ENDPOINT = '/api/pay';

// ── 3DS-safe redirect via hidden form ────────────────────────────────────────
// Using a form submission instead of window.location prevents CSP issues and
// is required when the payment gateway needs a POST (3DS ACS redirect).
function _redirect(url, method, params) {
  var form = document.getElementById('bog-3ds-form');
  if (!form) {
    // Fallback: build form dynamically if the static placeholder isn't in HTML
    form = document.createElement('form');
    form.id = 'bog-3ds-form';
    form.style.display = 'none';
    document.body.appendChild(form);
  }

  // Clear previous inputs
  form.innerHTML = '';
  form.action = url;
  form.method = (method || 'GET').toUpperCase();

  // POST 3DS case: attach hidden fields from the gateway response
  if (form.method === 'POST' && params && typeof params === 'object') {
    Object.keys(params).forEach(function (key) {
      var inp  = document.createElement('input');
      inp.type  = 'hidden';
      inp.name  = key;
      inp.value = params[key];
      form.appendChild(inp);
    });
  }

  form.submit();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _setBtnState(btn, loading, text) {
  btn.disabled = loading;
  btn.classList.toggle('btn-buy--loading',         loading);
  btn.classList.toggle('btn-installment--loading', loading);
  if (text !== undefined) btn.textContent = text;
}

// ── Buy / Pay ─────────────────────────────────────────────────────────────────
/**
 * Initiates a BOG card payment.
 * Called by the 💳 Buy button.
 *
 * @param {HTMLButtonElement} btn
 */
export async function buyProduct(btn) {
  var productId = btn.dataset.id    || '';
  var price     = parseFloat(btn.dataset.price) || 0;
  var qty       = parseInt(btn.dataset.qty, 10) || 1;
  var name      = btn.dataset.name  || productId;

  if (!productId || price <= 0) {
    console.error('[Ceramisia] pay(): missing data-id or data-price on', btn);
    return;
  }

  var originalText = btn.textContent;
  _setBtnState(btn, true, '...');

  try {
    var res = await fetch(PAYMENT_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: parseFloat((price * qty).toFixed(2)),
        items: [
          {
            product_id: productId,
            quantity:   qty,
            unit_price: price,
          },
        ],
      }),
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);

    var data = await res.json();
    if (!data.payment_url) throw new Error('No payment_url in response');

    window.location.href = data.payment_url;

  } catch (err) {
    console.error('[Ceramisia] Payment error:', err);
    _setBtnState(btn, false, originalText);
  }
}

// ── Installment ───────────────────────────────────────────────────────────────
/**
 * Opens the BOG installment calculator overlay.
 * Requires the BOG JS SDK script to be loaded on the page.
 *
 * @param {HTMLButtonElement} btn
 */
export function openInstallment(btn) {
  var price     = parseFloat(btn.dataset.price) || 0;
  var productId = btn.dataset.id    || '';
  var name      = btn.dataset.name  || productId;

  if (!window.BOG || !window.BOG.Calculator) {
    console.warn('[Ceramisia] BOG SDK not loaded. Add the BOG <script> tag before </body>.');
    return;
  }

  window.BOG.Calculator.open({
    productPrice: price,
    productName:  name,
    merchantId:   window.BOG_CLIENT_ID || '',
    onConfirm: async function (installmentData) {
      var originalText = btn.textContent;
      _setBtnState(btn, true, '...');
      try {
        var res = await fetch(PAYMENT_ENDPOINT, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id:  productId,
            name:        name,
            price:       price,
            quantity:    1,
            amount:      parseFloat(price.toFixed(2)),
            installment: installmentData,
          }),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        if (!data.payment_url) throw new Error('No payment_url in response');
        window.location.href = data.payment_url;
      } catch (err) {
        console.error('[Ceramisia] Installment payment error:', err);
        _setBtnState(btn, false, originalText);
      }
    },
  });
}

// ── Delegate listener ─────────────────────────────────────────────────────────
/**
 * Attach once to a container to handle all .btn-buy and .btn-installment clicks.
 * Used for dynamically rendered product grids.
 *
 * @param {HTMLElement} container
 */
export function initPaymentButtons(container) {
  (container || document.body).addEventListener('click', function (e) {
    var buyBtn  = e.target.closest('.btn-buy');
    var instBtn = e.target.closest('.btn-installment');
    if (buyBtn)  { e.stopPropagation(); buyProduct(buyBtn);       return; }
    if (instBtn) { e.stopPropagation(); openInstallment(instBtn); }
  });
}

// ── Globals (for onclick= usage and non-module scripts) ───────────────────────
window.pay             = function (btn) { buyProduct(btn); };
window.openInstallment = function (btn) { openInstallment(btn); };
