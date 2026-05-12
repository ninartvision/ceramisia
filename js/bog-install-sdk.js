/**
 * BOG Installment / Calculator SDK loader (single client_id source).
 *
 * 1) Set window.__BOG_MERCHANT_CLIENT_ID__ before this file (recommended).
 *    Falls back to window.BOG_CLIENT_ID if already set.
 * 2) Loads official script with version=2 + client_id query (payments modal docs).
 * 3) Calls BOG.init(client_id) via bogAsyncInit when the SDK invokes it (demo pattern).
 *
 * Optional: window.__BOG_INSTALLMENT_BNPL__ = true | false | undefined
 *   → forwarded to BOG.Calculator.open({ bnpl }) from cart.js / payment.js when set.
 *   Default in open calls: false (standard installment only).
 *
 * @see https://webstatic.bog.ge/bog-sdk/
 * @see https://api.bog.ge/docs/en/payments/external-orders/modal
 */
(function () {
  var CID =
    (typeof window.__BOG_MERCHANT_CLIENT_ID__ === 'string' &&
      window.__BOG_MERCHANT_CLIENT_ID__.trim()) ||
    (typeof window.BOG_CLIENT_ID === 'string' && window.BOG_CLIENT_ID.trim()) ||
    'YOUR_CLIENT_ID';

  window.BOG_CLIENT_ID = CID;

  window.bogAsyncInit = function () {
    try {
      if (window.BOG && typeof BOG.init === 'function') {
        BOG.init(CID);
        console.log('[Ceramisia][BOG] BOG.init OK', {
          client_id_length: String(CID).length,
          placeholder: CID === 'YOUR_CLIENT_ID',
        });
      } else {
        console.warn('[Ceramisia][BOG] bogAsyncInit: BOG.init missing');
      }
    } catch (e) {
      console.error('[Ceramisia][BOG] BOG.init threw', e);
    }
  };

  var url =
    'https://webstatic.bog.ge/bog-sdk/bog-sdk.js?version=2&client_id=' +
    encodeURIComponent(CID);

  console.log('[Ceramisia][BOG] Loading bog-sdk', {
    version_param: 2,
    client_id_length: String(CID).length,
    url_has_encoded_client_id: true,
  });

  var s = document.createElement('script');
  s.async = true;
  s.src = url;
  s.onerror = function () {
    console.error('[Ceramisia][BOG] Script load failed:', url.split('client_id=')[0] + 'client_id=(redacted)');
  };
  s.onload = function () {
    console.log('[Ceramisia][BOG] bog-sdk script onload');
  };
  document.head.appendChild(s);
})();
