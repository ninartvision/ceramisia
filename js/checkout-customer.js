/**
 * Guest checkout customer form — cart drawer + product-page modal.
 * Exposes window.CeramisiaCheckoutCustomer
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'ceramisia_checkout_customer';

  function trim(v) {
    return v == null ? '' : String(v).trim();
  }

  function getLang() {
    try {
      return localStorage.getItem('ceramisia_lang') === 'en' ? 'en' : 'ge';
    } catch (_e) {
      return 'ge';
    }
  }

  function labels(lang) {
    if (lang === 'en') {
      return {
        title: 'Your details',
        firstName: 'First name',
        lastName: 'Last name',
        phone: 'Phone',
        email: 'Email',
        message: 'Note (optional)',
        required: 'Please fill in all required fields.',
        invalidEmail: 'Enter a valid email address.',
        invalidPhone: 'Enter a valid phone number.',
      };
    }
    return {
      title: 'თქვენი მონაცემები',
      firstName: 'სახელი',
      lastName: 'გვარი',
      phone: 'ტელეფონი',
      email: 'ელფოსტა',
      message: 'შენიშვნა (არასავალდებულო)',
      required: 'გთხოვთ შეავსოთ ყველა სავალდებულო ველი.',
      invalidEmail: 'შეიყვანეთ სწორი ელფოსტა.',
      invalidPhone: 'შეიყვანეთ სწორი ტელეფონის ნომერი.',
    };
  }

  function readFromRoot(root) {
    var el = root || document;
    function val(id) {
      var node = el.querySelector ? el.querySelector('#' + id) : document.getElementById(id);
      return node ? trim(node.value) : '';
    }
    return {
      customerName: val('checkoutCustomerName'),
      customerSurname: val('checkoutCustomerSurname'),
      phoneNumber: val('checkoutPhoneNumber'),
      email: val('checkoutEmail'),
      message: val('checkoutMessage'),
    };
  }

  function validateCustomer(c) {
    var lang = getLang();
    var L = labels(lang);
    if (!c.customerName || c.customerName.length < 2) return { ok: false, message: L.required };
    if (!c.customerSurname || c.customerSurname.length < 2) return { ok: false, message: L.required };
    var phone = c.phoneNumber.replace(/\s+/g, '');
    if (!phone || phone.length < 9) return { ok: false, message: L.invalidPhone };
    if (!c.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) {
      return { ok: false, message: L.invalidEmail };
    }
    return { ok: true, customer: c };
  }

  function saveToStorage(c) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(c));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    } catch (_e) { /* ignore */ }
  }

  function loadFromStorage() {
    var raw = '';
    try {
      raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY) || '';
    } catch (_e) { /* ignore */ }
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_e) {
      return null;
    }
  }

  function fillForm(root, data) {
    if (!data || !root) return;
    var map = {
      checkoutCustomerName: data.customerName,
      checkoutCustomerSurname: data.customerSurname,
      checkoutPhoneNumber: data.phoneNumber,
      checkoutEmail: data.email,
      checkoutMessage: data.message,
    };
    Object.keys(map).forEach(function (id) {
      var node = root.querySelector('#' + id);
      if (node && map[id]) node.value = map[id];
    });
  }

  function formFieldsHtml(lang) {
    var L = labels(lang);
    return (
      '<div class="cart-checkout-customer" id="cartCheckoutCustomer">' +
        '<h4 class="cart-checkout-customer__title">' + L.title + '</h4>' +
        '<div class="cart-checkout-customer__grid">' +
          '<label class="cart-checkout-customer__field">' +
            '<span>' + L.firstName + ' *</span>' +
            '<input type="text" id="checkoutCustomerName" name="customerName" autocomplete="given-name" required minlength="2" />' +
          '</label>' +
          '<label class="cart-checkout-customer__field">' +
            '<span>' + L.lastName + ' *</span>' +
            '<input type="text" id="checkoutCustomerSurname" name="customerSurname" autocomplete="family-name" required minlength="2" />' +
          '</label>' +
          '<label class="cart-checkout-customer__field">' +
            '<span>' + L.phone + ' *</span>' +
            '<input type="tel" id="checkoutPhoneNumber" name="phoneNumber" autocomplete="tel" required />' +
          '</label>' +
          '<label class="cart-checkout-customer__field">' +
            '<span>' + L.email + ' *</span>' +
            '<input type="email" id="checkoutEmail" name="email" autocomplete="email" required />' +
          '</label>' +
          '<label class="cart-checkout-customer__field cart-checkout-customer__field--full">' +
            '<span>' + L.message + '</span>' +
            '<textarea id="checkoutMessage" name="message" rows="2" maxlength="2000"></textarea>' +
          '</label>' +
        '</div>' +
        '<p class="cart-checkout-customer__error" id="checkoutCustomerError" hidden></p>' +
      '</div>'
    );
  }

  function showError(msg) {
    var err = document.getElementById('checkoutCustomerError');
    if (!err) return;
    if (msg) {
      err.textContent = msg;
      err.hidden = false;
    } else {
      err.textContent = '';
      err.hidden = true;
    }
  }

  /** @returns {{ ok: boolean, customer?: object, message?: string }} */
  function getValidatedPayload() {
    var c = readFromRoot(document);
    var v = validateCustomer(c);
    if (!v.ok) {
      showError(v.message);
      return v;
    }
    showError('');
    saveToStorage(v.customer);
    return v;
  }

  function bindDrawerForm() {
    var root = document.getElementById('cartCheckoutCustomer');
    if (!root || root._customerBound) return;
    root._customerBound = true;
    var saved = loadFromStorage();
    if (saved) fillForm(root, saved);
  }

  function showModal() {
    var lang = getLang();
    var L = labels(lang);
    var saved = loadFromStorage() || {};

    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'checkout-modal-overlay';
      overlay.innerHTML =
        '<div class="checkout-modal" role="dialog" aria-modal="true">' +
          '<button type="button" class="checkout-modal__close" aria-label="Close">&times;</button>' +
          '<h3>' + L.title + '</h3>' +
          formFieldsHtml(lang) +
          '<div class="checkout-modal__actions">' +
            '<button type="button" class="btn btn-primary" id="checkoutModalSubmit">' +
              (lang === 'en' ? 'Continue to payment' : 'გადახდაზე გადასვლა') +
            '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);
      var modalRoot = overlay.querySelector('.cart-checkout-customer');
      fillForm(modalRoot, saved);

      function close(result) {
        overlay.remove();
        resolve(result);
      }

      overlay.querySelector('.checkout-modal__close').addEventListener('click', function () {
        close({ ok: false });
      });
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close({ ok: false });
      });

      overlay.querySelector('#checkoutModalSubmit').addEventListener('click', function () {
        var c = readFromRoot(modalRoot);
        var v = validateCustomer(c);
        if (!v.ok) {
          var errEl = modalRoot.querySelector('#checkoutCustomerError');
          if (errEl) {
            errEl.textContent = v.message;
            errEl.hidden = false;
          }
          return;
        }
        saveToStorage(v.customer);
        close({ ok: true, customer: v.customer });
      });
    });
  }

  /**
   * For cart payment — validate drawer form.
   * For product buy — open modal if needed.
   */
  function ensureCustomerForPayment(fromDrawer) {
    if (fromDrawer) {
      return Promise.resolve(getValidatedPayload());
    }
    var saved = loadFromStorage();
    if (saved) {
      var v = validateCustomer(saved);
      if (v.ok) return Promise.resolve(v);
    }
    return showModal();
  }

  global.CeramisiaCheckoutCustomer = {
    formFieldsHtml: formFieldsHtml,
    bindDrawerForm: bindDrawerForm,
    getValidatedPayload: getValidatedPayload,
    ensureCustomerForPayment: ensureCustomerForPayment,
    customerPayload: function (c) {
      return {
        customerName: c.customerName,
        customerSurname: c.customerSurname,
        phoneNumber: c.phoneNumber,
        email: c.email,
        message: c.message || '',
      };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
