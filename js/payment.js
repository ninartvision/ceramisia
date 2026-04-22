/**
 * Ceramisia – Payment Handler (ES Module)
 * Reads product data from button data-attributes, POSTs to /create-payment,
 * and redirects the user to the Bank of Georgia payment page.
 *
 * Expected data-attributes on the button element:
 *   data-id    – product ID / slug
 *   data-price – unit price (number)
 *   data-qty   – quantity (number, default 1)
 *   data-name  – product display name
 */

const PAYMENT_ENDPOINT = '/create-payment';

/**
 * Initiates a BOG payment for a single product.
 *
 * @param {HTMLButtonElement} btn - The clicked Buy button
 */
export async function buyProduct(btn) {
  var productId = btn.dataset.id    || '';
  var price     = parseFloat(btn.dataset.price) || 0;
  var qty       = parseInt(btn.dataset.qty,  10) || 1;
  var name      = btn.dataset.name  || productId;

  if (!productId || price <= 0) {
    console.error('[Ceramisia] buyProduct: missing product id or price on button', btn);
    return;
  }

  var originalText = btn.textContent;
  btn.disabled = true;
  btn.classList.add('btn-buy--loading');
  btn.textContent = '...';

  try {
    var response = await fetch(PAYMENT_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: productId,
        name:       name,
        price:      price,
        quantity:   qty,
      }),
    });

    if (!response.ok) {
      throw new Error('Payment request failed: HTTP ' + response.status);
    }

    var data = await response.json();

    if (!data.redirectUrl) {
      throw new Error('No redirectUrl in server response');
    }

    window.location.href = data.redirectUrl;

  } catch (err) {
    console.error('[Ceramisia] Payment error:', err);
    btn.disabled = false;
    btn.classList.remove('btn-buy--loading');
    btn.textContent = originalText;
  }
}

/**
 * Delegate listener: attach once to a container and handle all .btn-buy clicks.
 * Useful for dynamically rendered grids.
 *
 * @param {HTMLElement} container - e.g. document.body
 */
export function initPaymentButtons(container) {
  (container || document.body).addEventListener('click', function (e) {
    var btn = e.target.closest('.btn-buy');
    if (!btn) return;
    e.stopPropagation();
    buyProduct(btn);
  });
}
