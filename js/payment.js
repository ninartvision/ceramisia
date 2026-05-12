/**
 * Ceramisia – BOG Payment Handler (ES Module)
 *
 *   • 💳 Buy         → buyProduct(btn)      → POST /api/pay → redirect
 *   • 💸 Installment → openInstallment(btn) → BOG.Calculator (official SDK)
 *       → onRequest → POST /api/bog-installment → successCb(order_id)
 *
 * BOG modal docs: https://api.bog.ge/docs/en/installment/modal
 */

const PAYMENT_ENDPOINT = '/api/pay';
const BOG_INSTALLMENT_ENDPOINT = '/api/bog-installment';

// ── Helpers ─────────────────────────────────────────────────────────────────

function _setBtnState(btn, loading, text) {
  btn.disabled = loading;
  btn.classList.toggle('btn-buy--loading', loading);
  btn.classList.toggle('btn-installment--loading', loading);
  if (text !== undefined) btn.textContent = text;
}

// Extract redirect URL from any shape BOG / our backend may return.
function extractRedirectUrl(data) {
  if (!data || typeof data !== 'object') return null;
  return (
    (data._links && data._links.redirect && data._links.redirect.href) ||
    (data.links && data.links.redirect && data.links.redirect.href) ||
    data.payment_url ||
    data.redirect_url ||
    data.url ||
    (data.data && data.data._links && data.data._links.redirect && data.data._links.redirect.href) ||
    (data.data && data.data.payment_url) ||
    (data.data && data.data.url) ||
    null
  );
}

async function callPayApi(payload) {
  console.log('[Ceramisia] DEBUG /api/pay request payload:', payload);

  const res = await fetch(PAYMENT_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();
  let data = null;
  let parseError = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch (e) {
    parseError = e && e.message ? e.message : String(e);
  }

  console.log('[Ceramisia] DEBUG /api/pay response:', {
    status: res.status,
    ok: res.ok,
    contentType: res.headers.get('content-type'),
    parseError,
    rawText,
    data,
  });

  if (!res.ok) {
    const serverErr =
      (data && (data.error || (data.details && data.details.message))) ||
      `HTTP ${res.status}`;
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
  const productId = btn.dataset.id || '';
  const slug = btn.dataset.slug || productId || '';
  const price = parseFloat(btn.dataset.price) || 0;
  const qty = parseInt(btn.dataset.qty, 10) || 1;

  if (!productId || price <= 0) {
    console.error('[Ceramisia] buyProduct: missing data-id or data-price on', btn);
    return;
  }

  const originalText = btn.textContent;
  _setBtnState(btn, true, '...');

  try {
    const payload = {
      amount: parseFloat((price * qty).toFixed(2)),
      items: [{ product_id: productId, slug: slug || undefined, quantity: qty, unit_price: price }],
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

// ── Installment (BOG Calculator modal → /api/bog-installment) ────────────────

export function openInstallment(btn) {
  const price = parseFloat(btn.dataset.price) || 0;
  const qty = parseInt(btn.dataset.qty, 10) || 1;
  const productId = btn.dataset.id || '';
  const slug = btn.dataset.slug || productId || '';
  const name = btn.dataset.name || productId;
  const loanAmount = Number(Number(price * qty).toFixed(2));

  if (!productId || !Number.isFinite(loanAmount) || loanAmount <= 0) {
    console.error('[Ceramisia] openInstallment: missing data-id or invalid amount', btn);
    return;
  }

  if (!window.BOG || !window.BOG.Calculator || typeof window.BOG.Calculator.open !== 'function') {
    console.error('[Ceramisia] BOG.Calculator missing — check webstatic SDK script + client_id', {
      hasBOG: !!window.BOG,
    });
    alert(
      'Installment calculator failed to load. Ensure BOG_CLIENT_ID is set and the bog-sdk script URL matches.'
    );
    return;
  }

  const cid = window.BOG_CLIENT_ID;
  if (!cid || cid === 'YOUR_CLIENT_ID') {
    console.warn('[Ceramisia] BOG_CLIENT_ID placeholder — replace in HTML');
  }

  /** Cart total for loan; NOT selected.amount from modal (that is monthly payment per BOG docs). */
  const items = [
    {
      product_id: productId,
      slug: slug || undefined,
      quantity: qty,
      unit_price: price,
      ...(name ? { name } : {}),
    },
  ];

  const defaultType =
    (btn.dataset.installmentType && String(btn.dataset.installmentType).trim()) || 'STANDARD';

  const originalText = btn.textContent;

  function releaseBtn() {
    _setBtnState(btn, false, originalText);
  }

  const bnplFlag =
    typeof window.__BOG_INSTALLMENT_BNPL__ === 'boolean'
      ? window.__BOG_INSTALLMENT_BNPL__
      : false;

  console.log('[Ceramisia] BOG.Calculator.open', {
    amount: loanAmount,
    amountType: typeof loanAmount,
    bnpl: bnplFlag,
    itemsLen: items.length,
    defaultInstallmentType: defaultType,
    bog_client_id_length: String(window.BOG_CLIENT_ID || '').length,
  });

  _setBtnState(btn, true, '...');

  window.BOG.Calculator.open({
    amount: loanAmount,
    bnpl: bnplFlag,
    onClose() {
      console.log('[Ceramisia] BOG Calculator onClose');
      releaseBtn();
    },
    onRequest(selected, successCb, closeCb) {
      console.log('[Ceramisia] BOG Calculator onRequest raw selected=', selected);

      const month = selected && selected.month != null ? Number(selected.month) : NaN;
      if (!Number.isFinite(month) || month <= 0) {
        console.error('[Ceramisia] invalid selected.month', selected);
        closeCb();
        alert('Please select an installment term.');
        return;
      }

      const discountCode =
        selected && selected.discount_code != null && String(selected.discount_code).trim() !== ''
          ? String(selected.discount_code).trim()
          : '';
      const installment_type = discountCode || defaultType || 'STANDARD';

      const payload = {
        amount: loanAmount,
        items,
        installment_month: month,
        installment_type,
      };

      console.log('[Ceramisia] POST /api/bog-installment', {
        installment_month: month,
        installment_type,
        orderAmount: loanAmount,
      });

      fetch(BOG_INSTALLMENT_ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      })
        .then((res) =>
          res.text().then((txt) => {
            let data = {};
            try {
              data = txt ? JSON.parse(txt) : {};
            } catch {
              data = { parse_error: true, raw: txt };
            }
            return { res, data };
          })
        )
        .then(({ res, data }) => {
          console.log('[Ceramisia] bog-installment HTTP', res.status, data);

          if (!res.ok) {
            const msg =
              (data && (data.error || data.message)) || `HTTP ${res.status}`;
            console.error('[Ceramisia] bog-installment rejected', {
              msg,
              failure_stage: data.failure_stage,
              debug_public: data.debug_public,
              details: data.details,
            });
            alert('Payment error: ' + String(msg));
            closeCb();
            return;
          }

          const oid = String(data.order_id || data.orderId || '').trim();
          if (!oid) {
            console.error('[Ceramisia] missing order_id for successCb', data);
            alert('Incomplete server response (order_id).');
            closeCb();
            return;
          }

          console.log('[Ceramisia] successCb(BOG order_id)', oid);
          successCb(oid);
        })
        .catch((err) => {
          console.error('[Ceramisia] bog-installment network', err);
          alert('Network error. Please try again.');
          closeCb();
        });
    },
    onComplete(info) {
      console.log('[Ceramisia] BOG Calculator onComplete', info);
      releaseBtn();
    },
  });
}

// ── Delegate listener ───────────────────────────────────────────────────────

export function initPaymentButtons(container) {
  (container || document.body).addEventListener('click', function (e) {
    const buyBtn = e.target.closest('.btn-buy');
    const instBtn = e.target.closest('.btn-installment');
    if (buyBtn) {
      e.stopPropagation();
      buyProduct(buyBtn);
      return;
    }
    if (instBtn) {
      e.stopPropagation();
      openInstallment(instBtn);
    }
  });
}

window.pay = function (btn) {
  buyProduct(btn);
};
window.openInstallment = function (btn) {
  openInstallment(btn);
};
