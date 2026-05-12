/**
 * BOG Installment / Calculator SDK loader (single client_id source).
 *
 * 1) Set window.__BOG_MERCHANT_CLIENT_ID__ before this file (recommended).
 *    Falls back to window.BOG_CLIENT_ID if already set.
 * 2) Loads official script with version=2 + client_id query (payments modal docs).
 * 3) Calls BOG.init(client_id) via bogAsyncInit when the SDK invokes it (demo pattern).
 *
 * Optional: window.__BOG_INSTALLMENT_BNPL__ — used by js/cart.js only when set.
 *
 * @see https://webstatic.bog.ge/bog-sdk/
 * @see https://api.bog.ge/docs/en/payments/external-orders/modal
 */
(function () {
  /** Log BOG installment “calculate” XHR/fetch failures (helps debug HTTP 400). */
  function installBogCalculateFetchLogger() {
    if (window.__bog_calc_fetch_logger__) return;
    window.__bog_calc_fetch_logger__ = true;

    try {
      var XPO = XMLHttpRequest.prototype.open;
      var XPS = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) {
        try {
          this.__bog_xhr_url = typeof url === 'string' ? url : '';
        } catch (_e) {
          this.__bog_xhr_url = '';
        }
        return XPO.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function () {
        var xhr = this;
        var url = String(xhr.__bog_xhr_url || '');
        if (/calculate/i.test(url) || (/bog\.ge/i.test(url) && /installment/i.test(url))) {
          xhr.addEventListener('load', function () {
            if (xhr.status >= 400) {
              console.error('[Ceramisia][BOG] calculate XHR error', {
                status: xhr.status,
                url: url.slice(0, 250),
              });
              try {
                var rt = xhr.responseText || '';
                console.error('[Ceramisia][BOG] calculate XHR body (snippet)', rt.slice(0, 800));
              } catch (_e2) {}
            } else if (url) {
              console.log('[Ceramisia][BOG] calculate XHR OK', {
                status: xhr.status,
                url: url.slice(0, 160),
              });
            }
          });
        }
        return XPS.apply(this, arguments);
      };
    } catch (xhrPatchErr) {
      console.warn('[Ceramisia][BOG] XHR calculate logger not installed', xhrPatchErr);
    }
    var orig = window.fetch;
    window.fetch = function () {
      var reqUrl = '';
      try {
        var input = arguments[0];
        reqUrl =
          typeof input === 'string'
            ? input
            : input && typeof input.url === 'string'
              ? input.url
              : '';
      } catch (_e) {
        reqUrl = '';
      }
      var chain = orig.apply(this, arguments);
      return chain.then(
        function (res) {
          try {
            var u = reqUrl || '';
            var looksCalc =
              /calculate/i.test(u) ||
              /calc-installment/i.test(u) ||
              (/bog\.ge/i.test(u) && /installment/i.test(u));
            if (looksCalc) {
              if (!res.ok) {
                console.error('[Ceramisia][BOG] calculate error', {
                  status: res.status,
                  statusText: res.statusText,
                  url: u.slice(0, 250),
                });
                res
                  .clone()
                  .text()
                  .then(function (t) {
                    console.error('[Ceramisia][BOG] calculate body (snippet)', (t || '').slice(0, 800));
                  })
                  .catch(function () {});
              } else {
                console.log('[Ceramisia][BOG] calculate OK', {
                  status: res.status,
                  url: u.slice(0, 160),
                });
              }
            }
          } catch (logErr) {
            console.warn('[Ceramisia][BOG] calculate logger', logErr);
          }
          return res;
        },
        function (err) {
          return Promise.reject(err);
        }
      );
    };
  }

  installBogCalculateFetchLogger();

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

  console.log('[Ceramisia][BOG] Loading official bog-sdk', {
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
    console.log('[Ceramisia][BOG] bog-sdk loaded (BOG global)', {
      hasBOG: !!window.BOG,
      hasCalculator: !!(window.BOG && window.BOG.Calculator),
      client_id_length: String(CID).length,
    });
  };
  document.head.appendChild(s);
})();
