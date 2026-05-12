/**
 * BOG Installment SDK loader — single client_id, duplicate-safe, calculate telemetry.
 *
 * Before this file (recommended):
 *   window.__BOG_MERCHANT_CLIENT_ID__ = '10007451';
 *
 * Debug verbosity:
 *   window.__BOG_INSTALL_DEBUG__ = true  → log every calculate request body + verbose traces
 *   omit or false                         → still logs calculate HTTP errors with full response body
 *
 * @see https://webstatic.bog.ge/bog-sdk/
 */
(function () {
  if (window.__BOG_INSTALL_SDK_SINGLETON__) {
    console.warn(
      '[Ceramisia][BOG] bog-install-sdk.js ran twice — duplicate <script src="...bog-install-sdk.js">? Second run ignored.'
    );
    return;
  }
  window.__BOG_INSTALL_SDK_SINGLETON__ = true;

  var DEBUG = window.__BOG_INSTALL_DEBUG__ === true;
  var CID =
    (typeof window.__BOG_MERCHANT_CLIENT_ID__ === 'string' &&
      window.__BOG_MERCHANT_CLIENT_ID__.trim()) ||
    (typeof window.BOG_CLIENT_ID === 'string' && window.BOG_CLIENT_ID.trim()) ||
    '10007451';

  window.__CeramisiaBOG = window.__CeramisiaBOG || {};
  window.__CeramisiaBOG.state = {
    loaderClientId: CID,
    loaderClientIdLength: String(CID).length,
    bogAsyncInitCalls: 0,
    bogInitCalls: 0,
    calculatorOpenCalls: 0,
    sdkScriptInjected: false,
    sdkScriptSkippedDuplicateTag: false,
    bogSdkScriptSrcUsed: null,
    BOG_init_matches_CID: null,
  };

  window.BOG_CLIENT_ID = CID;

  /** ── Response body: JSON parse + raw text (handles text/plain) ─────────── */
  function parseResponseBodyForLog(text, contentType) {
    var raw = text == null ? '' : String(text);
    var ct = (contentType || '').toLowerCase();
    var out = {
      contentType: contentType || '(missing)',
      rawLength: raw.length,
      rawText: raw.length <= 262144 ? raw : raw.slice(0, 262144) + '\n…[truncated at 262144 chars]',
      json: null,
      jsonParseError: null,
    };
    if (raw.trim()) {
      try {
        out.json = JSON.parse(raw);
      } catch (e) {
        out.jsonParseError = e && e.message ? e.message : String(e);
        if (/json/i.test(ct)) {
          /* Content-Type says JSON but parse failed — jsonParseError explains */
        }
      }
    }
    return out;
  }

  function isLikelyBogCalculateTraffic(method, url, bodyStr) {
    var u = String(url || '');
    var m = String(method || 'GET').toUpperCase();
    var b = String(bodyStr || '');
    if (/calculate/i.test(u)) return true;
    if (/bog\.ge/i.test(u) && /installment/i.test(u) && (m === 'POST' || m === 'PUT')) return true;
    if (/bog\.ge/i.test(u) && /calc/i.test(u) && /install/i.test(u)) return true;
    if (/calculate/i.test(b)) return true;
    return false;
  }

  function summarizeRequestBody(body) {
    if (body == null || body === '') return '';
    try {
      if (typeof body === 'string') return body.length > 262144 ? body.slice(0, 262144) + '…' : body;
      if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return body.toString();
      return String(body);
    } catch (_e) {
      return '[unreadable body]';
    }
  }

  /** ── installCalculateTracing (XHR + fetch) ──────────────────────────────── */
  function installCalculateTracing() {
    if (window.__bog_calc_trace_installed__) return;
    window.__bog_calc_trace_installed__ = true;

    try {
      var XPO = XMLHttpRequest.prototype.open;
      var XPS = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) {
        try {
          this.__bog_xhr_method = String(method || 'GET').toUpperCase();
          this.__bog_xhr_url = typeof url === 'string' ? url : String(url || '');
        } catch (_e) {
          this.__bog_xhr_method = 'GET';
          this.__bog_xhr_url = '';
        }
        return XPO.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function (body) {
        var xhr = this;
        var url = String(xhr.__bog_xhr_url || '');
        var method = String(xhr.__bog_xhr_method || 'GET');
        var bodyStr = summarizeRequestBody(body);
        var watch = isLikelyBogCalculateTraffic(method, url, bodyStr);

        if (watch) {
          console.log('[Ceramisia][BOG] calculate XHR REQUEST', {
            method: method,
            url: url,
            client_id_prop: window.BOG_CLIENT_ID,
            client_id_matches_loader:
              String(window.BOG_CLIENT_ID || '') === String(window.__CeramisiaBOG.state.loaderClientId),
            body: bodyStr || '(empty)',
          });
        }

        if (watch) {
          xhr.addEventListener('load', function () {
            var ct = '';
            try {
              ct = xhr.getResponseHeader && xhr.getResponseHeader('Content-Type');
            } catch (_h) {}
            var rt = xhr.responseText || '';
            var parsed = parseResponseBodyForLog(rt, ct);
            var payload = {
              method: method,
              url: url,
              httpStatus: xhr.status,
              statusText: xhr.statusText,
              responseContentType: parsed.contentType,
              responseRawLength: parsed.rawLength,
              responseJson: parsed.json,
              jsonParseError: parsed.jsonParseError,
              responseRawText: parsed.rawText,
            };
            if (xhr.status >= 400) {
              console.error('[Ceramisia][BOG] calculate XHR RESPONSE (error)', payload);
            } else if (DEBUG) {
              console.log('[Ceramisia][BOG] calculate XHR RESPONSE (ok)', payload);
            }
          });
        }
        return XPS.apply(this, arguments);
      };
    } catch (xhrPatchErr) {
      console.warn('[Ceramisia][BOG] XHR trace not installed', xhrPatchErr);
    }

    var origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var reqUrl = '';
      try {
        var inp = input;
        reqUrl =
          typeof inp === 'string'
            ? inp
            : inp && typeof inp.url === 'string'
              ? inp.url
              : '';
      } catch (_e) {
        reqUrl = '';
      }
      var method = 'GET';
      try {
        if (init && init.method) method = String(init.method).toUpperCase();
        else if (input && typeof input !== 'string' && input.method) method = String(input.method).toUpperCase();
      } catch (_m) {}
      var reqBodyStr = '';
      try {
        if (init && init.body != null) reqBodyStr = summarizeRequestBody(init.body);
      } catch (_b) {}

      var watch = isLikelyBogCalculateTraffic(method, reqUrl, reqBodyStr);
      if (watch) {
        console.log('[Ceramisia][BOG] calculate fetch REQUEST', {
          method: method,
          url: reqUrl,
          client_id_prop: window.BOG_CLIENT_ID,
          client_id_matches_loader:
            String(window.BOG_CLIENT_ID || '') === String(window.__CeramisiaBOG.state.loaderClientId),
          body: reqBodyStr || '(none)',
        });
      }

      return origFetch.apply(this, arguments).then(function (res) {
        if (!watch) return res;
        return res
          .clone()
          .text()
          .then(function (text) {
            var ct = '';
            try {
              ct = res.headers && res.headers.get ? res.headers.get('Content-Type') || '' : '';
            } catch (_h) {}
            var parsed = parseResponseBodyForLog(text, ct);
            var payload = {
              method: method,
              url: reqUrl,
              httpStatus: res.status,
              statusText: res.statusText,
              responseContentType: parsed.contentType,
              responseRawLength: parsed.rawLength,
              responseJson: parsed.json,
              jsonParseError: parsed.jsonParseError,
              responseRawText: parsed.rawText,
            };
            if (!res.ok) {
              console.error('[Ceramisia][BOG] calculate fetch RESPONSE (error)', payload);
            } else if (DEBUG) {
              console.log('[Ceramisia][BOG] calculate fetch RESPONSE (ok)', payload);
            }
            return res;
          })
          .catch(function () {
            return res;
          });
      });
    };
  }

  installCalculateTracing();

  /** bogAsyncInit — first invocation only runs BOG.init (duplicate protection) */
  window.bogAsyncInit = function () {
    window.__CeramisiaBOG.state.bogAsyncInitCalls += 1;
    var n = window.__CeramisiaBOG.state.bogAsyncInitCalls;
    console.log('[Ceramisia][BOG] bogAsyncInit call #' + n, {
      BOG_present: !!window.BOG,
      BOG_init_present: !!(window.BOG && typeof BOG.init === 'function'),
      client_id: window.BOG_CLIENT_ID,
      client_id_length: String(window.BOG_CLIENT_ID || '').length,
      matches_loader_CID: String(window.BOG_CLIENT_ID) === String(CID),
    });
    if (n > 1) {
      console.warn(
        '[Ceramisia][BOG] bogAsyncInit invoked again — skipping duplicate BOG.init (check duplicate SDK loads).'
      );
      return;
    }
    try {
      tryPatchBOGInit();
      if (window.BOG && typeof BOG.init === 'function') {
        BOG.init(CID);
        window.__CeramisiaBOG.state.BOG_init_matches_CID = String(CID) === String(window.BOG_CLIENT_ID);
        console.log('[Ceramisia][BOG] BOG.init executed from bogAsyncInit', {
          client_id_length: String(CID).length,
          placeholder_missing_html_config:
            typeof window.__BOG_MERCHANT_CLIENT_ID__ !== 'string' ||
            !String(window.__BOG_MERCHANT_CLIENT_ID__ || '').trim(),
          BOG_CLIENT_ID_after: window.BOG_CLIENT_ID,
        });
      } else {
        console.warn('[Ceramisia][BOG] bogAsyncInit: BOG.init missing');
      }
    } catch (e) {
      console.error('[Ceramisia][BOG] BOG.init threw', e);
    }
  };

  /** Wrap BOG.init to count calls & verify client_id matches loader */
  function tryPatchBOGInit() {
    if (window.__bog_init_wrap_done__) return !!window.BOG;
    if (!window.BOG || typeof BOG.init !== 'function') return false;
    window.__bog_init_wrap_done__ = true;
    var orig = BOG.init;
    BOG.init = function (clientId) {
      window.__CeramisiaBOG.state.bogInitCalls += 1;
      var matches = String(clientId) === String(CID);
      console.log('[Ceramisia][BOG] BOG.init wrapper call #' + window.__CeramisiaBOG.state.bogInitCalls, {
        passed_client_id_length: String(clientId || '').length,
        matches_loader_CID: matches,
        loader_CID_length: String(CID).length,
      });
      if (window.__CeramisiaBOG.state.bogInitCalls > 1) {
        console.warn('[Ceramisia][BOG] BOG.init called multiple times — possible duplicate SDK injection.');
      }
      return orig.apply(this, arguments);
    };
    return true;
  }

  /** Intercept Calculator.open — unified payload / client_id logging */
  function tryPatchCalculatorOpen() {
    if (window.__bog_calc_open_wrap_done__) return !!(window.BOG && window.BOG.Calculator);
    if (!window.BOG || !window.BOG.Calculator || typeof window.BOG.Calculator.open !== 'function')
      return false;
    window.__bog_calc_open_wrap_done__ = true;
    var orig = window.BOG.Calculator.open.bind(window.BOG.Calculator);
    window.BOG.Calculator.open = function (opts) {
      window.__CeramisiaBOG.state.calculatorOpenCalls += 1;
      var o = opts || {};
      console.log('[Ceramisia][BOG] BOG.Calculator.open #' + window.__CeramisiaBOG.state.calculatorOpenCalls, {
        amount: o.amount,
        typeof_amount: typeof o.amount,
        bnpl: o.bnpl,
        client_id_window: window.BOG_CLIENT_ID,
        client_id_matches_loader: String(window.BOG_CLIENT_ID || '') === String(CID),
        sdk_state: Object.assign({}, window.__CeramisiaBOG.state),
      });
      return orig.apply(this, arguments);
    };
    return true;
  }

  function startPostLoadPatches() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      tryPatchBOGInit();
      tryPatchCalculatorOpen();
      if ((window.BOG && window.BOG.Calculator && window.__bog_calc_open_wrap_done__) || tries > 600) {
        clearInterval(iv);
      }
    }, 16);
  }

  startPostLoadPatches();

  /** Duplicate <script src="...bog-sdk.js"> detection */
  function existingBogSdkTags() {
    return Array.prototype.slice
      .call(document.querySelectorAll('script[src*="bog-sdk.js"]'))
      .filter(function (s) {
        return /webstatic\.bog\.ge/i.test(s.src || '');
      });
  }

  var already = existingBogSdkTags();
  if (already.length > 0) {
    window.__CeramisiaBOG.state.sdkScriptSkippedDuplicateTag = true;
    console.warn('[Ceramisia][BOG] BOG bog-sdk.js already in DOM — NOT injecting another.', {
      count: already.length,
      srcs: already.map(function (el) {
        return el.src || '';
      }),
      hint: 'Use a single SDK load path (bog-install-sdk.js only) so client_id stays consistent.',
    });
    already.forEach(function (el) {
      var fromSrc = '';
      try {
        var m = String(el.src || '').match(/client_id=([^&]+)/);
        fromSrc = m ? decodeURIComponent(m[1]) : '';
      } catch (_e) {}
      if (fromSrc && fromSrc !== CID) {
        console.error('[Ceramisia][BOG] client_id MISMATCH: loader CID ≠ existing script URL client_id', {
          loader_CID_length: String(CID).length,
          script_client_id_length: String(fromSrc).length,
        });
      }
    });
    return;
  }

  var url =
    'https://webstatic.bog.ge/bog-sdk/bog-sdk.js?version=2&client_id=' + encodeURIComponent(CID);

  window.__CeramisiaBOG.state.bogSdkScriptSrcUsed = url;
  console.log('[Ceramisia][BOG] injecting official bog-sdk', {
    version: 2,
    client_id_length: String(CID).length,
    window_BOG_CLIENT_ID: window.BOG_CLIENT_ID,
    ids_match: String(window.BOG_CLIENT_ID) === String(CID),
    merchant_hint:
      'HTTP 400 on calculate usually means BOG rejected params: wrong client_id for installment product, merchant not registered for calculator/BNPL, amount limits, or sandbox/prod mismatch. Read responseRawText / responseJson from logs above.',
  });

  var s = document.createElement('script');
  s.async = false;
  s.setAttribute('data-ceramisia-bog-sdk', '1');
  s.src = url;
  s.onerror = function () {
    console.error(
      '[Ceramisia][BOG] bog-sdk script failed to load:',
      url.split('client_id=')[0] + 'client_id=(redacted)'
    );
  };
  s.onload = function () {
    window.__CeramisiaBOG.state.sdkScriptInjected = true;
    tryPatchBOGInit();
    tryPatchCalculatorOpen();
    console.log('[Ceramisia][BOG] bog-sdk onload', {
      hasBOG: !!window.BOG,
      hasCalculator: !!(window.BOG && window.BOG.Calculator),
      client_id_length: String(window.BOG_CLIENT_ID || '').length,
      sdk_url_client_id_matches_BOG_CLIENT_ID: true,
      state: window.__CeramisiaBOG.state,
    });
  };
  document.head.appendChild(s);
})();
