/* ================================================
   CERAMISIA – cart.js
   Full cart system: localStorage, drawer, quantities
   ================================================ */

(function () {
  'use strict';

  var LANG_KEY  = 'ceramisia_lang';
  var CART_KEY  = 'ceramisia_cart_items';

  function getLang() {
    return localStorage.getItem(LANG_KEY) || 'ge';
  }

  /* ── Cart data helpers ───────────────────────── */
  function getCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    updateCartCount();
    renderCartDrawer();
  }

  function getTotalItems() {
    return getCart().reduce(function (sum, item) { return sum + item.qty; }, 0);
  }

  function getTotalPrice() {
    return getCart().reduce(function (sum, item) { return sum + (item.price * item.qty); }, 0);
  }

  /* ── Generate unique ID for a product ────────── */
  function productId(name, price) {
    return (name + '_' + price).replace(/\s+/g, '_').toLowerCase();
  }

  /* ── Add item to cart ────────────────────────── */
  function addToCart(product, qty) {
    qty = qty || 1;
    var cart = getCart();
    var id   = productId(product.name, product.price);
    var existing = null;

    for (var i = 0; i < cart.length; i++) {
      if (cart[i].id === id) { existing = cart[i]; break; }
    }

    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        id:       id,
        name:     product.name,
        nameEn:   product.nameEn || product.name,
        price:    product.price,
        image:    product.image,
        category: product.category || '',
        qty:      qty
      });
    }

    saveCart(cart);
    bumpCartBadge();
    return true;
  }

  /* ── Remove item ─────────────────────────────── */
  function removeFromCart(id) {
    var cart = getCart().filter(function (item) { return item.id !== id; });
    saveCart(cart);
  }

  /* ── Update quantity ─────────────────────────── */
  function updateQty(id, delta) {
    var cart = getCart();
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].id === id) {
        cart[i].qty = Math.max(1, cart[i].qty + delta);
        break;
      }
    }
    saveCart(cart);
  }

  /* ── Badge count ─────────────────────────────── */
  function updateCartCount() {
    var total = getTotalItems();
    document.querySelectorAll('#cartCount').forEach(function (el) {
      el.textContent = total;
      el.style.display = total > 0 ? '' : 'none';
    });
    // Also update old localStorage key for backward compat
    localStorage.setItem('ceramisia_cart', total);
  }

  function bumpCartBadge() {
    document.querySelectorAll('#cartCount').forEach(function (el) {
      el.classList.remove('bump');
      void el.offsetWidth; // force reflow
      el.classList.add('bump');
    });
  }

  /* ── Extract product data from a card ────────── */
  function extractFromCard(card) {
    var lang    = getLang();
    var nameEl  = card.querySelector('.product-name');
    var priceEl = card.querySelector('.product-price');
    var imgEl   = card.querySelector('.product-img-wrap img');

    var name   = nameEl ? nameEl.textContent.trim() : '';
    var nameEn = nameEl ? (nameEl.dataset.en || name) : name;

    // Parse price — get the discounted price if present
    var priceNum = 0;
    if (priceEl) {
      var priceText = priceEl.textContent.trim();
      var origEl    = priceEl.querySelector('.original');
      if (origEl) {
        // Remove original price text, get the sale price
        priceText = priceText.replace(origEl.textContent, '').trim();
      }
      var match = priceText.match(/[\d.]+/);
      if (match) priceNum = parseFloat(match[0]);
    }

    var image = imgEl ? imgEl.src : '';

    return {
      name:   name,
      nameEn: nameEn,
      price:  priceNum,
      image:  image
    };
  }

  /* ── Bind add-to-cart buttons on cards ───────── */
  function bindCardButtons() {
    document.querySelectorAll('.btn-add-cart').forEach(function (btn) {
      // Avoid double-binding
      if (btn._cartBound) return;
      btn._cartBound = true;

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        var card = btn.closest('.product-card');
        if (!card) return;

        var product = extractFromCard(card);
        if (!product.name || !product.price) return;

        addToCart(product, 1);

        // Visual feedback on button
        var lang = getLang();
        var orig = btn.textContent;
        btn.textContent = '✓';
        btn.disabled = true;
        setTimeout(function () {
          btn.textContent = lang === 'ge'
            ? (btn.dataset.ge || 'კალათაში')
            : (btn.dataset.en || 'Add to Cart');
          btn.disabled = false;
        }, 1200);
      });
    });
  }

  /* ── Cart Drawer (injected once) ─────────────── */
  var drawer, drawerOverlay, drawerBody, drawerTotal, drawerEmpty, drawerCount;

  function createCartDrawer() {
    // Overlay
    drawerOverlay = document.createElement('div');
    drawerOverlay.className = 'cart-drawer-overlay';
    drawerOverlay.id = 'cartDrawerOverlay';

    // Drawer panel
    drawer = document.createElement('aside');
    drawer.className = 'cart-drawer';
    drawer.id = 'cartDrawer';
    drawer.setAttribute('aria-label', 'Shopping cart');

    var lang = getLang();

    drawer.innerHTML =
      '<div class="cart-drawer__header">' +
        '<h3 data-ge="კალათა" data-en="Cart">' + (lang === 'ge' ? 'კალათა' : 'Cart') + '</h3>' +
        '<span class="cart-drawer__count" id="drawerCount">0</span>' +
        '<button class="cart-drawer__close" id="cartDrawerClose" aria-label="Close cart">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="cart-drawer__body" id="cartDrawerBody"></div>' +
      '<div class="cart-drawer__empty" id="cartDrawerEmpty">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>' +
        '<p data-ge="კალათა ცარიელია" data-en="Your cart is empty">' + (lang === 'ge' ? 'კალათა ცარიელია' : 'Your cart is empty') + '</p>' +
      '</div>' +
      '<div class="cart-drawer__footer">' +
        '<div class="cart-drawer__total">' +
          '<span data-ge="ჯამი" data-en="Total">' + (lang === 'ge' ? 'ჯამი' : 'Total') + '</span>' +
          '<strong id="cartDrawerTotal">₾ 0</strong>' +
        '</div>' +
        '<button type="button" class="btn btn-primary cart-drawer__checkout" id="cartCheckoutBtn" data-ge="შეკვეთა WhatsApp-ით" data-en="Order via WhatsApp">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-3px;margin-right:6px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>' +
          (lang === 'ge' ? 'შეკვეთა WhatsApp-ით' : 'Order via WhatsApp') +
        '</button>' +
      '</div>';

    document.body.appendChild(drawerOverlay);
    document.body.appendChild(drawer);

    // Cache refs
    drawerBody  = document.getElementById('cartDrawerBody');
    drawerTotal = document.getElementById('cartDrawerTotal');
    drawerEmpty = document.getElementById('cartDrawerEmpty');
    drawerCount = document.getElementById('drawerCount');

    // Close handlers
    document.getElementById('cartDrawerClose').addEventListener('click', closeCartDrawer);
    drawerOverlay.addEventListener('click', closeCartDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('open')) closeCartDrawer();
    });

    // Checkout via WhatsApp
    document.getElementById('cartCheckoutBtn').addEventListener('click', handleWhatsAppCheckout);
  }

  function openCartDrawer() {
    renderCartDrawer();
    drawer.classList.add('open');
    drawerOverlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function closeCartDrawer() {
    drawer.classList.remove('open');
    drawerOverlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  /* ── Render cart items in drawer ──────────────── */
  function renderCartDrawer() {
    if (!drawerBody) return;

    var cart = getCart();
    var lang = getLang();

    if (!cart.length) {
      drawerBody.style.display = 'none';
      drawerEmpty.style.display = '';
      drawerCount.textContent = '0';
      drawerTotal.textContent = '₾ 0';
      return;
    }

    drawerBody.style.display = '';
    drawerEmpty.style.display = 'none';
    drawerCount.textContent = getTotalItems();
    drawerTotal.textContent = '₾ ' + getTotalPrice().toFixed(0);

    drawerBody.innerHTML = '';

    cart.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'cart-item';
      row.innerHTML =
        '<div class="cart-item__img">' +
          '<img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.name) + '">' +
        '</div>' +
        '<div class="cart-item__info">' +
          '<p class="cart-item__name">' + escapeHtml(lang === 'ge' ? item.name : (item.nameEn || item.name)) + '</p>' +
          '<p class="cart-item__price">₾ ' + item.price + '</p>' +
          '<div class="cart-item__qty">' +
            '<button class="cart-item__qty-btn" data-action="minus" data-id="' + escapeAttr(item.id) + '" type="button">&minus;</button>' +
            '<span>' + item.qty + '</span>' +
            '<button class="cart-item__qty-btn" data-action="plus" data-id="' + escapeAttr(item.id) + '" type="button">+</button>' +
          '</div>' +
        '</div>' +
        '<button class="cart-item__remove" data-id="' + escapeAttr(item.id) + '" type="button" aria-label="Remove">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>';

      drawerBody.appendChild(row);
    });

    // Bind qty/remove buttons inside drawer
    drawerBody.querySelectorAll('.cart-item__qty-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id     = btn.dataset.id;
        var action = btn.dataset.action;
        updateQty(id, action === 'plus' ? 1 : -1);
      });
    });

    drawerBody.querySelectorAll('.cart-item__remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        removeFromCart(btn.dataset.id);
      });
    });
  }

  /* ── WhatsApp Checkout ─────────────────────────── */
  var WHATSAPP_NUMBER = '995597224407';

  function handleWhatsAppCheckout() {
    var cart = getCart();
    if (!cart.length) return;

    var lang  = getLang();
    var total = getTotalPrice();
    var lines = [];

    // Header
    lines.push(lang === 'ge'
      ? '🛒 *ახალი შეკვეთა — Ceramisia*'
      : '🛒 *New Order — Ceramisia*');
    lines.push('');

    // Product list
    cart.forEach(function (item, i) {
      var name = lang === 'ge' ? item.name : (item.nameEn || item.name);
      lines.push(
        (i + 1) + '. ' + name +
        '  ×' + item.qty +
        '  — ₾ ' + (item.price * item.qty)
      );
    });

    lines.push('');
    lines.push('──────────');
    lines.push((lang === 'ge' ? '*ჯამი:* ₾ ' : '*Total:* ₾ ') + total.toFixed(0));
    lines.push('');
    lines.push(lang === 'ge'
      ? 'გთხოვთ დაადასტუროთ შეკვეთა. 🙏'
      : 'Please confirm this order. 🙏');

    var message = encodeURIComponent(lines.join('\n'));
    window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + message, '_blank', 'noopener,noreferrer');
  }

  /* ── Security helpers ────────────────────────── */
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ── Bind cart icon (open drawer) ────────────── */
  function bindCartButtons() {
    document.querySelectorAll('.cart-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openCartDrawer();
      });
    });
  }

  /* ── Init ─────────────────────────────────────── */
  function init() {
    createCartDrawer();
    bindCartButtons();
    bindCardButtons();
    updateCartCount();
    renderCartDrawer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API for other scripts (product-modal, sanity-render, etc.)
  window.CeramisiCart = {
    addToCart:       addToCart,
    removeFromCart:  removeFromCart,
    getCart:         getCart,
    openDrawer:      openCartDrawer,
    closeDrawer:     closeCartDrawer,
    bindCardButtons: bindCardButtons
  };

  // Backward compat
  window.initCart = bindCardButtons;

})();
