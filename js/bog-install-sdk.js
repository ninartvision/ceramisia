/**
 * BOG Installment SDK loader — single client_id, duplicate-safe, deep calculate telemetry.
 *
 * HTML:
 *   window.__BOG_MERCHANT_CLIENT_ID__ = 'YOUR_BOG_OAUTH_CLIENT_ID';
 *
 * Flags:
 *   window.__BOG_INSTALL_DEBUG__ === true   → verbose OK responses + extra traces
 *   window.__BOG_CAPTURE_BOG_API__ === true → log ALL XHR/fetch to *.bog.ge POST/PUT/PATCH (noisy)
 *
 * Console: window.__CeramisiaBOG.diagnose()
 *
 * @see https://webstatic.bog.ge/bog-sdk/
 */
(function () {
  if (window.__BOG_INSTALL_SDK_SINGLETON__) {
    console.warn(
      '[Ceramisia][BOG] bog-install-sdk.js ran twice — duplicate <script>? Second run ignored.'
    );
    return;
  }
  window.__BOG_INSTALL_SDK_SINGLETON__ = true;

  var DEBUG = window.__BOG_INSTALL_DEBUG__ === true;
  var CAPTURE_ALL_BOG =
    typeof window.__BOG_CAPTURE_BOG_API__ !== 'undefined'
      ? !!window.__BOG_CAPTURE_BOG_API__
      : false;

  var MAX_RAW_OK = 262144;
  var MAX_RAW_ERR = 1048576;

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
    lastCalculateWatchUrl: null,
    lastCalculateHttpStatus: null,
    lastBOGInitClientIdArg: null,
    lastCalculatorOpenAmount: null,
  };

  window.__CeramisiaBOG.lastCalculateCapture = null;

  window.BOG_CLIENT_ID = CID;

  function parseClientIdFromSdkUrl(src) {
    try {
      var m = String(src || '').match(/client_id=([^&]+)/i);
      return m ? decodeURIComponent(m[1]) : '';
    } catch (_e) {
      return '';
    }
  }

  /** Infer sandbox/test vs prod from request URL */
  function inferEnvironmentHint(url) {
    var u = String(url || '').toLowerCase();
    var hints = [];
    if (/sandbox|test|staging|uat|dev|mock/i.test(u)) hints.push('URL suggests non-production host/path — verify client_id matches that BOG environment.');
    if (/installment\.bog\.ge/i.test(u) && /api\.bog\.ge/i.test(window.location.href))
      hints.push('Mixed domains in page vs API URL — confirm BOG_INSTALLMENT_BASE_URL on server matches calculator environment.');
    return hints;
  }

  /** Heuristics on BOG error payloads / plain text */
  function analyzeCalculateFailure(status, url, json, rawText) {
    var hints = [];
    var flat =
      (json && typeof json === 'object' && (JSON.stringify(json) + ' ' + (json.message || '') + (json.error || ''))) ||
      String(rawText || '');
    flat = flat.toLowerCase();

    if (/merchant/.test(flat) && (/not found|unknown|invalid/i.test(flat) || status === 400))
      hints.push('merchant/client: BOG message mentions merchant — verify installment registration & correct OAuth client_id.');
    if (/client/.test(flat) && /invalid|unauthorized|forbidden/.test(flat))
      hints.push('client_id: Response suggests invalid client — compare script URL client_id, BOG.init arg, and bonline credentials.');
    if (/amount|sum|minimum|maximum|limit/i.test(flat))
      hints.push('amount: Validation failed on amount — ensure Calculator.open receives a finite Number > 0 (not string).');
    if (/bnpl|standard|product|not allowed|inactive/i.test(flat))
      hints.push('product: BNPL vs STANDARD / product activation — try bnpl:false or confirm merchant has BNPL if bnpl:true.');
    if (/scope|token|auth/i.test(flat))
      hints.push('auth: Calculator uses public client_id; if message is OAuth-related, escalate with BOG support with this response body.');
    hints = hints.concat(inferEnvironmentHint(url));
    if (hints.length === 0 && status === 400)
      hints.push('HTTP 400: Read responseJson/responseRawText below — BOG validation rejected this calculate call.');
    return hints;
  }

  /** Full capture: raw text + JSON parse attempt (works for application/json and text/plain) */
  function parseResponseBodyForLog(text, contentType, isError) {
    var raw = text == null ? '' : String(text);
    var max = isError ? MAX_RAW_ERR : MAX_RAW_OK;
    var truncated = raw.length > max;
    var slice = truncated ? raw.slice(0, max) : raw;
    var ct = (contentType || '').toLowerCase();
    var out = {
      contentType: contentType || '(missing)',
      rawLength: raw.length,
      truncated: truncated,
      rawText: truncated ? slice + '\n…[truncated at ' + max + ' chars]' : slice,
      responseRawText: truncated ? slice + '\n…[truncated at ' + max + ' chars]' : slice,
      json: null,
      responseJson: null,
      jsonParseError: null,
    };
    if (raw.trim()) {
      try {
        out.json = JSON.parse(raw);
        out.responseJson = out.json;
      } catch (e) {
        out.jsonParseError = e && e.message ? e.message : String(e);
      }
    }
    out.isPlainText = !/json/i.test(ct) && !!raw.trim();
    return out;
  }

  function isBogGeoHost(url) {
    return /(^|\.)bog\.ge\b/i.test(String(url || ''));
  }

  function isLikelyBogCalculateTraffic(method, url, bodyStr) {
    var u = String(url || '');
    var m = String(method || 'GET').toUpperCase();
    var b = String(bodyStr || '');

    if (CAPTURE_ALL_BOG && isBogGeoHost(u) && (m === 'POST' || m === 'PUT' || m === 'PATCH'))
      return true;

    if (/calculate|calc-installment|loan-calc|installment-calc|preview-installment/i.test(u)) return true;
    if (isBogGeoHost(u) && /installment|bnpl|split-pay|loan/i.test(u) && (m === 'POST' || m === 'PUT' || m === 'PATCH'))
      return true;
    if (/calculate/i.test(b)) return true;
    return false;
  }

  function summarizeRequestBody(body) {
    if (body == null || body === '') return '';
    try {
      if (typeof body === 'string')
        return body.length > MAX_RAW_OK ? body.slice(0, MAX_RAW_OK) + '…' : body;
      if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return body.toString();
      return String(body);
    } catch (_e) {
      return '[unreadable body]';
    }
  }

  function xhrAllResponseHeaders(xhr) {
    try {
      return xhr.getAllResponseHeaders ? xhr.getAllResponseHeaders() : '';
    } catch (_e) {
      return '';
    }
  }

  function buildCalculatePayload(method, url, status, statusText, parsed, reqBodyStr, transport, extra) {
    var isErr = Number(status) >= 400;
    var diagHints = analyzeCalculateFailure(Number(status), url, parsed.json, parsed.rawText);
    var payload = {
      transport: transport,
      method: method,
      url: url,
      httpStatus: status,
      statusText: statusText,
      requestBodyPreview: reqBodyStr ? reqBodyStr.slice(0, Math.min(reqBodyStr.length, MAX_RAW_OK)) : '',
      responseContentType: parsed.contentType,
      responseRawLength: parsed.rawLength,
      responseTruncated: parsed.truncated,
      responseRawText: parsed.responseRawText,
      responseJson: parsed.responseJson,
      jsonParseError: parsed.jsonParseError,
      client_id_window: window.BOG_CLIENT_ID,
      client_id_loader: window.__CeramisiaBOG.state.loaderClientId,
      client_id_matches:
        String(window.BOG_CLIENT_ID || '') === String(window.__CeramisiaBOG.state.loaderClientId),
      diagnose_hints: diagHints,
    };
    if (extra) Object.assign(payload, extra);
    window.__CeramisiaBOG.lastCalculateCapture = payload;
    window.__CeramisiaBOG.state.lastCalculateWatchUrl = url;
    window.__CeramisiaBOG.state.lastCalculateHttpStatus = status;
    if (Number(status) >= 400) {
      try {
        var ana = buildDiagnoseAnalysis();
        console.error('[Ceramisia][BOG] calculate FAILED — analysis.conclusion:', ana.conclusion);
      } catch (_err) {}
    }
    return payload;
  }

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
            environment_hints: inferEnvironmentHint(url),
            body: bodyStr || '(empty)',
          });
        }

        if (watch) {
          xhr.addEventListener('error', function () {
            console.error('[Ceramisia][BOG] calculate XHR NETWORK ERROR', {
              method: method,
              url: url,
            });
          });
          xhr.addEventListener('load', function () {
            var ct = '';
            try {
              ct = xhr.getResponseHeader && xhr.getResponseHeader('Content-Type');
            } catch (_h) {}
            var rt = xhr.responseText || '';
            var parsed = parseResponseBodyForLog(rt, ct, xhr.status >= 400);
            var payload = buildCalculatePayload(
              method,
              url,
              xhr.status,
              xhr.statusText,
              parsed,
              bodyStr,
              'xhr',
              xhr.status >= 400 ? { responseHeaders: xhrAllResponseHeaders(xhr) } : {}
            );
            if (xhr.status >= 400) {
              console.error('[Ceramisia][BOG] calculate XHR RESPONSE (error)', payload);
              console.error('[Ceramisia][BOG] calculate DUPLICATE_KEYS_FOR_SEARCH', {
                responseRawText: payload.responseRawText,
                responseJson: payload.responseJson,
              });
            } else if (DEBUG || CAPTURE_ALL_BOG) {
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
          environment_hints: inferEnvironmentHint(reqUrl),
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
            var parsed = parseResponseBodyForLog(text, ct, !res.ok);
            var payload = buildCalculatePayload(
              method,
              reqUrl,
              res.status,
              res.statusText,
              parsed,
              reqBodyStr,
              'fetch',
              {}
            );
            if (!res.ok) {
              console.error('[Ceramisia][BOG] calculate fetch RESPONSE (error)', payload);
              console.error('[Ceramisia][BOG] calculate DUPLICATE_KEYS_FOR_SEARCH', {
                responseRawText: payload.responseRawText,
                responseJson: payload.responseJson,
              });
            } else if (DEBUG || CAPTURE_ALL_BOG) {
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

  function flattenBogMessage(j) {
    if (!j || typeof j !== 'object') return '';
    return (
      (typeof j.message === 'string' && j.message) ||
      (typeof j.error_description === 'string' && j.error_description) ||
      (typeof j.error === 'string' && j.error) ||
      (j.details && typeof j.details === 'object' && typeof j.details.message === 'string' && j.details.message) ||
      ''
    );
  }

  function buildDiagnoseAnalysis() {
    var sdkScripts = Array.prototype.slice
      .call(document.querySelectorAll('script[src*="bog-sdk.js"]'))
      .filter(function (s) {
        return /webstatic\.bog\.ge/i.test(s.src || '');
      });
    var idsFromDom = sdkScripts.map(function (el) {
      return parseClientIdFromSdkUrl(el.src);
    });

    var st = window.__CeramisiaBOG.state;
    var cap = window.__CeramisiaBOG.lastCalculateCapture;
    var htmlCid =
      typeof window.__BOG_MERCHANT_CLIENT_ID__ === 'string'
        ? window.__BOG_MERCHANT_CLIENT_ID__.trim()
        : '';

    var urlCidFromLoader = '';
    try {
      urlCidFromLoader = parseClientIdFromSdkUrl(st.bogSdkScriptSrcUsed || '');
    } catch (_e) {}

    var initArg = st.lastBOGInitClientIdArg;
    var chainAllMatch =
      !!htmlCid &&
      htmlCid === String(window.BOG_CLIENT_ID || '') &&
      htmlCid === CID &&
      (!urlCidFromLoader || urlCidFromLoader === htmlCid) &&
      (initArg == null || initArg === '' || String(initArg) === htmlCid);

    var chain = {
      html___BOG_MERCHANT_CLIENT_ID__: htmlCid || '(not set)',
      window_BOG_CLIENT_ID: String(window.BOG_CLIENT_ID || ''),
      loader_CID: CID,
      sdk_dynamic_url_decoded_client_id: urlCidFromLoader || '(loader did not build URL — e.g. duplicate DOM tag path)',
      last_BOG_init_client_id_argument: initArg != null && initArg !== '' ? initArg : '(not yet / internal)',
      client_id_chain_sync_ok: chainAllMatch,
    };

    var dup = {
      webstatic_bog_sdk_script_tags: sdkScripts.length,
      multiple_webstatic_sdk_tags_risk: sdkScripts.length > 1,
      bog_async_init_invocations: st.bogAsyncInitCalls,
      second_bogAsyncInit_skipped_duplicate_BOG_init: st.bogAsyncInitCalls > 1,
      bog_init_invocations: st.bogInitCalls,
      unusual_many_BOG_inits: st.bogInitCalls > 2,
      loader_skipped_inject_dom_had_sdk: !!st.sdkScriptSkippedDuplicateTag,
      client_ids_from_existing_dom_scripts: idsFromDom,
    };

    var amt = st.lastCalculatorOpenAmount;
    var fixFront = [];
    if (!chainAllMatch) {
      fixFront.push(
        'Align client_id: window.__BOG_MERCHANT_CLIENT_ID__, window.BOG_CLIENT_ID, ?client_id= on webstatic URL, and BOG.init(client_id) must be the same string.'
      );
    }
    if (dup.multiple_webstatic_sdk_tags_risk) {
      fixFront.push('Remove extra <script src="https://webstatic.bog.ge/...bog-sdk.js"> — keep only js/bog-install-sdk.js.');
    }
    if (dup.second_bogAsyncInit_skipped_duplicate_BOG_init) {
      fixFront.push('Duplicate SDK load: bogAsyncInit ran >1; second BOG.init was skipped — fix duplicate scripts.');
    }
    if (amt && amt.amount_validation_ok === false) {
      fixFront.push(
        'Invalid Calculator.open amount (raw/coerced) — use finite Number > 0 (see lastCalculatorOpenAmount).'
      );
    }
    if (st.sdkScriptSkippedDuplicateTag && idsFromDom.length && idsFromDom.some(function (id) { return id && id !== CID; })) {
      fixFront.push(
        'Pre-existing webstatic script client_id differs from loader CID — remove manual bog-sdk tag or match client_id.'
      );
    }

    var bogSays = flattenBogMessage(cap && cap.responseJson);
    if (!bogSays && cap && typeof cap.responseRawText === 'string' && cap.responseRawText.trim()) {
      bogSays = String(cap.responseRawText).trim().slice(0, 600);
    }

    var capHints = (cap && cap.diagnose_hints) || [];
    var conclusionParts = [];
    if (bogSays) conclusionParts.push('BOG body: ' + bogSays);
    if (capHints.length) conclusionParts.push('Hints: ' + capHints.join(' | '));
    if (fixFront.length) conclusionParts.push('Frontend checks: ' + fixFront.join(' '));

    var likelyBankConfig =
      !!cap &&
      Number(cap.httpStatus) >= 400 &&
      fixFront.length === 0 &&
      chainAllMatch &&
      (!amt || amt.amount_validation_ok !== false);

    var conclusion;
    if (!cap || cap.httpStatus == null) {
      conclusion =
        'No calculate response captured in this page session yet. Open installment (or set __BOG_CAPTURE_BOG_API__ = true), reproduce 400, then diagnose() again — use lastCalculateCapture.responseRawText for the authoritative reason.';
    } else if (fixFront.length) {
      conclusion =
        'Frontend / integration misconfig likely: ' +
        fixFront.join(' ') +
        (bogSays ? ' | BOG said: ' + bogSays : '');
    } else if (likelyBankConfig) {
      conclusion =
        'Frontend client_id + amount look consistent; HTTP ' +
        cap.httpStatus +
        ' on BOG calculate is almost certainly merchant/product activation, wrong OAuth client for installment calculator, or test/prod mismatch — fix in BOG Business / bonline (not by changing page layout). Details: ' +
        (bogSays || '(see responseJson/responseRawText in lastCalculateCapture)');
    } else {
      conclusion = conclusionParts.join(' | ') || 'See lastCalculateCapture and client_id_chain.';
    }

    return {
      client_id_chain: chain,
      duplicate_and_init: dup,
      last_open_amount: amt,
      last_calculate_capture_summary: cap
        ? {
            httpStatus: cap.httpStatus,
            url: cap.url,
            transport: cap.transport,
            diagnose_hints: cap.diagnose_hints,
          }
        : null,
      bog_message_excerpt: bogSays || null,
      conclusion: conclusion,
      likely_requires_bog_portal_or_env_not_layout:
        likelyBankConfig && !fixFront.length,
    };
  }

  window.__CeramisiaBOG.diagnose = function () {
    var sdkScripts = Array.prototype.slice
      .call(document.querySelectorAll('script[src*="bog-sdk.js"]'))
      .filter(function (s) {
        return /webstatic\.bog\.ge/i.test(s.src || '');
      });
    var idsFromDom = sdkScripts.map(function (el) {
      return parseClientIdFromSdkUrl(el.src);
    });
    var loaderMatchesDom =
      idsFromDom.length === 0 ||
      idsFromDom.every(function (id) {
        return !id || id === CID;
      });

    return {
      page_host: typeof location !== 'undefined' ? location.hostname : '',
      page_is_https: typeof location !== 'undefined' ? location.protocol === 'https:' : null,
      loader_client_id: CID,
      window_BOG_CLIENT_ID: window.BOG_CLIENT_ID,
      client_id_sync_ok: String(window.BOG_CLIENT_ID || '') === String(CID),
      bog_sdk_script_tags_in_dom: sdkScripts.length,
      bog_sdk_script_srcs: sdkScripts.map(function (s) {
        return s.src || '';
      }),
      client_ids_parsed_from_dom_scripts: idsFromDom,
      loader_vs_dom_script_client_id_ok: loaderMatchesDom,
      sdk_loader_singleton_ok: !!window.__BOG_INSTALL_SDK_SINGLETON__,
      bog_async_init_calls: window.__CeramisiaBOG.state.bogAsyncInitCalls,
      bog_init_calls: window.__CeramisiaBOG.state.bogInitCalls,
      calculator_open_calls: window.__CeramisiaBOG.state.calculatorOpenCalls,
      sdk_injected: window.__CeramisiaBOG.state.sdkScriptInjected,
      skipped_duplicate_tag: window.__CeramisiaBOG.state.sdkScriptSkippedDuplicateTag,
      bog_sdk_url_used: window.__CeramisiaBOG.state.bogSdkScriptSrcUsed,
      BOG_global_loaded: !!window.BOG,
      Calculator_loaded: !!(window.BOG && window.BOG.Calculator),
      BOG_init_matches_CID_flag: window.__CeramisiaBOG.state.BOG_init_matches_CID,
      last_BOG_init_client_id_argument: window.__CeramisiaBOG.state.lastBOGInitClientIdArg,
      last_calculator_open_amount: window.__CeramisiaBOG.state.lastCalculatorOpenAmount,
      last_calculate_url: window.__CeramisiaBOG.state.lastCalculateWatchUrl,
      last_calculate_http_status: window.__CeramisiaBOG.state.lastCalculateHttpStatus,
      capture_all_bog_api: CAPTURE_ALL_BOG,
      debug_verbose: DEBUG,
      tip_capture_more_traffic:
        'If calculate requests are missing from logs, set window.__BOG_CAPTURE_BOG_API__ = true and reload.',
      tip_last_error: window.__CeramisiaBOG.lastCalculateCapture,
      analysis: buildDiagnoseAnalysis(),
    };
  };

  console.info(
    '[Ceramisia][BOG] Telemetry: window.__CeramisiaBOG.diagnose() → read .analysis.conclusion (and analysis.likely_requires_bog_portal_or_env_not_layout)'
  );

  /** bogAsyncInit — first invocation only runs BOG.init */
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
        '[Ceramisia][BOG] bogAsyncInit invoked again — skipping duplicate BOG.init (duplicate SDK loads?).'
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

  function tryPatchBOGInit() {
    if (window.__bog_init_wrap_done__) return !!window.BOG;
    if (!window.BOG || typeof BOG.init !== 'function') return false;
    window.__bog_init_wrap_done__ = true;
    var orig = BOG.init;
    BOG.init = function (clientId) {
      window.__CeramisiaBOG.state.bogInitCalls += 1;
      window.__CeramisiaBOG.state.lastBOGInitClientIdArg = clientId != null ? String(clientId) : '';
      var matches = String(clientId) === String(CID);
      console.log('[Ceramisia][BOG] BOG.init wrapper call #' + window.__CeramisiaBOG.state.bogInitCalls, {
        passed_client_id_length: String(clientId || '').length,
        matches_loader_CID: matches,
        loader_CID_length: String(CID).length,
      });
      if (!matches) {
        console.error('[Ceramisia][BOG] BOG.init client_id !== loader CID — calculate 400 likely.', {
          init_arg_sample: String(clientId || '').slice(0, 8) + '…',
          loader_sample: String(CID || '').slice(0, 8) + '…',
        });
      }
      if (window.__CeramisiaBOG.state.bogInitCalls > 1) {
        console.warn('[Ceramisia][BOG] BOG.init called multiple times — duplicate SDK injection?');
      }
      return orig.apply(this, arguments);
    };
    return true;
  }

  function tryPatchCalculatorOpen() {
    if (window.__bog_calc_open_wrap_done__) return !!(window.BOG && window.BOG.Calculator);
    if (!window.BOG || !window.BOG.Calculator || typeof window.BOG.Calculator.open !== 'function')
      return false;
    window.__bog_calc_open_wrap_done__ = true;
    var orig = window.BOG.Calculator.open.bind(window.BOG.Calculator);
    window.BOG.Calculator.open = function (opts) {
      window.__CeramisiaBOG.state.calculatorOpenCalls += 1;
      var o = opts || {};
      var rawAmt = o.amount;
      var numAmt = typeof rawAmt === 'number' ? rawAmt : Number(rawAmt);
      var amountOk = Number.isFinite(numAmt) && numAmt > 0;
      window.__CeramisiaBOG.state.lastCalculatorOpenAmount = {
        amount_raw: rawAmt,
        typeof_amount: typeof rawAmt,
        amount_coerced: numAmt,
        amount_validation_ok: amountOk,
        bnpl: o.bnpl,
      };
      console.log('[Ceramisia][BOG] BOG.Calculator.open #' + window.__CeramisiaBOG.state.calculatorOpenCalls, {
        amount: rawAmt,
        typeof_amount: typeof rawAmt,
        coerced_amount: numAmt,
        amount_validation_ok: amountOk,
        bnpl: o.bnpl,
        client_id_window: window.BOG_CLIENT_ID,
        client_id_matches_loader: String(window.BOG_CLIENT_ID || '') === String(CID),
        sdk_state: Object.assign({}, window.__CeramisiaBOG.state),
      });
      if (!amountOk) {
        console.error(
          '[Ceramisia][BOG] INVALID Calculator.open amount — BOG calculate often returns HTTP 400. Pass a finite Number > 0.',
          { rawAmt: rawAmt, coerced: numAmt }
        );
      }
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
      hint: 'Single SDK load path recommended (bog-install-sdk.js only).',
    });
    already.forEach(function (el) {
      var fromSrc = parseClientIdFromSdkUrl(el.src);
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
      'If calculate returns HTTP 400 before onRequest: fix client_id / merchant installment activation / environment using responseRawText from logs or BOG support.',
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
    });
  };
  document.head.appendChild(s);
})();
