/* ================================================
   CERAMISIA – product-modal.js
   Product detail modal with gallery, qty, cart
   ================================================ */

(function () {
  'use strict';

  var LANG_KEY = 'ceramisia_lang';

  function getLang() {
    return localStorage.getItem(LANG_KEY) || 'ge';
  }

  /* ── DOM refs ─────────────────────────────────── */
  var overlay     = document.getElementById('productModal');
  var closeBtn    = document.getElementById('modalClose');
  var mainImg     = document.getElementById('modalMainImg');
  var zoomWrap    = document.getElementById('modalZoomWrap');
  var thumbsWrap  = document.getElementById('modalThumbs');
  var prevBtn     = document.getElementById('modalPrev');
  var nextBtn     = document.getElementById('modalNext');
  var counter     = document.getElementById('modalCounter');
  var badge       = document.getElementById('modalBadge');
  var category    = document.getElementById('modalCategory');
  var title       = document.getElementById('modalTitle');
  var priceRow    = document.getElementById('modalPriceRow');
  var oldPrice    = document.getElementById('modalOldPrice');
  var price       = document.getElementById('modalPrice');
  var desc        = document.getElementById('modalDesc');
  var qtyWrap     = document.getElementById('modalQty');
  var qtyVal      = document.getElementById('qtyVal');
  var qtyMinus    = document.getElementById('qtyMinus');
  var qtyPlus     = document.getElementById('qtyPlus');
  var addCartBtn  = document.getElementById('modalAddCart');
  var giftCheckbox = document.getElementById('giftCheckbox');

  if (!overlay) return;

  var currentQty     = 1;
  var galleryImages  = [];
  var galleryIndex   = 0;
  var isZoomed       = false;
  var GIFT_COST      = 5;

  /* ── Extract data from a product card ────────── */
  function extractCardData(card) {
    var lang = getLang();
    var imgEl       = card.querySelector('.product-img-wrap img');
    var nameEl      = card.querySelector('.product-name');
    var catEl       = card.querySelector('.product-category');
    var priceEl     = card.querySelector('.product-price');
    var badgeEl     = card.querySelector('.product-badge');
    var origPriceEl = priceEl ? priceEl.querySelector('.original') : null;

    // Gallery images: comma-separated in data-gallery, fallback to card image
    var gallerySrc  = card.dataset.gallery || '';
    var images      = gallerySrc ? gallerySrc.split(',').map(function (s) { return s.trim(); }) : [];
    if (!images.length && imgEl) images = [imgEl.src];

    // Description
    var descText = lang === 'ge'
      ? (card.dataset.descGe || '')
      : (card.dataset.descEn || '');

    // Name
    var nameText = nameEl
      ? (lang === 'ge' ? (nameEl.dataset.ge || nameEl.textContent) : (nameEl.dataset.en || nameEl.textContent))
      : '';

    // Category
    var catText = catEl
      ? (lang === 'ge' ? (catEl.dataset.ge || catEl.textContent) : (catEl.dataset.en || catEl.textContent))
      : '';

    // Price parsing
    var currentPrice = '';
    var originalPrice = '';
    if (origPriceEl) {
      originalPrice = origPriceEl.textContent.trim();
      // Get the text after the original span
      var fullText = priceEl.textContent.trim();
      currentPrice = fullText.replace(originalPrice, '').trim();
    } else if (priceEl) {
      currentPrice = priceEl.textContent.trim();
    }

    // Badge / status
    var status = card.dataset.status || '';
    if (!status && badgeEl) {
      if (badgeEl.classList.contains('sale')) status = 'sale';
      else if (badgeEl.classList.contains('new')) status = 'new';
    }

    var badgeText = '';
    if (badgeEl) {
      badgeText = lang === 'ge'
        ? (badgeEl.dataset.ge || badgeEl.textContent)
        : (badgeEl.dataset.en || badgeEl.textContent);
    }

    return {
      images: images,
      name: nameText,
      category: catText,
      currentPrice: currentPrice,
      originalPrice: originalPrice,
      description: descText,
      status: status,
      badgeText: badgeText
    };
  }

  /* ── Gallery helpers ──────────────────────────── */
  function goToImage(index) {
    if (index < 0 || index >= galleryImages.length) return;
    galleryIndex = index;

    // Fade transition
    mainImg.classList.add('img-fade');
    setTimeout(function () {
      mainImg.src = galleryImages[galleryIndex];
      mainImg.classList.remove('img-fade');
    }, 180);

    // Update thumbnails
    thumbsWrap.querySelectorAll('.modal-gallery__thumb').forEach(function (t, i) {
      t.classList.toggle('active', i === galleryIndex);
    });

    // Scroll active thumb into view
    var activeThumb = thumbsWrap.children[galleryIndex];
    if (activeThumb) {
      activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    updateGalleryUI();
    resetZoom();
  }

  function updateGalleryUI() {
    if (prevBtn) prevBtn.classList.toggle('hidden', galleryIndex <= 0);
    if (nextBtn) nextBtn.classList.toggle('hidden', galleryIndex >= galleryImages.length - 1);
    if (counter) {
      counter.textContent = galleryImages.length > 1
        ? (galleryIndex + 1) + ' / ' + galleryImages.length
        : '';
    }
  }

  /* ── Zoom logic ─────────────────────────────── */
  function resetZoom() {
    isZoomed = false;
    mainImg.style.transform = '';
    mainImg.style.transformOrigin = 'center center';
    if (zoomWrap) zoomWrap.classList.remove('is-zoomed');
  }

  function handleZoomMove(e) {
    if (!isZoomed || !zoomWrap) return;
    var rect = zoomWrap.getBoundingClientRect();
    var x = ((e.clientX - rect.left) / rect.width) * 100;
    var y = ((e.clientY - rect.top) / rect.height) * 100;
    mainImg.style.transformOrigin = x + '% ' + y + '%';
  }

  function handleZoomToggle(e) {
    if (!zoomWrap) return;
    // Don't zoom if clicking nav buttons
    if (e.target.closest('.modal-gallery__nav')) return;

    if (isZoomed) {
      resetZoom();
    } else {
      isZoomed = true;
      zoomWrap.classList.add('is-zoomed');
      var rect = zoomWrap.getBoundingClientRect();
      var x = ((e.clientX - rect.left) / rect.width) * 100;
      var y = ((e.clientY - rect.top) / rect.height) * 100;
      mainImg.style.transformOrigin = x + '% ' + y + '%';
      mainImg.style.transform = 'scale(2.2)';
    }
  }

  function handleZoomLeave() {
    if (isZoomed) resetZoom();
  }

  // Touch zoom: double-tap on mobile
  var lastTap = 0;
  function handleTouchZoom(e) {
    var now = Date.now();
    if (now - lastTap < 350) {
      e.preventDefault();
      handleZoomToggle({
        target: e.target,
        clientX: e.changedTouches[0].clientX,
        clientY: e.changedTouches[0].clientY
      });
    }
    lastTap = now;
  }

  if (zoomWrap) {
    zoomWrap.addEventListener('click', handleZoomToggle);
    zoomWrap.addEventListener('mousemove', handleZoomMove);
    zoomWrap.addEventListener('mouseleave', handleZoomLeave);
    zoomWrap.addEventListener('touchend', handleTouchZoom);
  }

  /* ── Gallery prev/next ──────────────────────── */
  if (prevBtn) {
    prevBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      goToImage(galleryIndex - 1);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      goToImage(galleryIndex + 1);
    });
  }

  /* ── Populate modal ──────────────────────────── */
  function populateModal(data) {
    var lang = getLang();

    // Gallery state
    galleryImages = data.images && data.images.length ? data.images : [];
    galleryIndex  = 0;

    // Main image
    if (galleryImages.length) {
      mainImg.src = galleryImages[0];
      mainImg.alt = data.name;
    }

    // Thumbnails
    thumbsWrap.innerHTML = '';
    if (galleryImages.length > 1) {
      galleryImages.forEach(function (src, i) {
        var thumb = document.createElement('button');
        thumb.className = 'modal-gallery__thumb' + (i === 0 ? ' active' : '');
        thumb.type = 'button';
        thumb.setAttribute('aria-label', 'Image ' + (i + 1));
        thumb.innerHTML = '<img src="' + src + '" alt="' + data.name + ' ' + (i + 1) + '" loading="lazy">';
        thumb.addEventListener('click', function () {
          goToImage(i);
        });
        thumbsWrap.appendChild(thumb);
      });
      thumbsWrap.style.display = '';
    } else {
      thumbsWrap.style.display = 'none';
    }

    updateGalleryUI();
    resetZoom();

    // Badge
    badge.textContent = '';
    badge.className = 'modal-details__badge';
    if (data.status === 'sale') {
      badge.textContent = data.badgeText || (lang === 'ge' ? 'ფასდაკლება' : 'Sale');
      badge.classList.add('modal-details__badge--sale');
      badge.style.display = '';
    } else if (data.status === 'soldout') {
      badge.textContent = lang === 'ge' ? 'გაყიდულია' : 'Sold Out';
      badge.classList.add('modal-details__badge--soldout');
      badge.style.display = '';
    } else if (data.status === 'new') {
      badge.textContent = data.badgeText || (lang === 'ge' ? 'ახალი' : 'New');
      badge.classList.add('modal-details__badge--new');
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }

    // Category, title, description
    category.textContent = data.category;
    title.textContent = data.name;
    desc.textContent = data.description;

    // Prices
    if (data.originalPrice) {
      oldPrice.textContent = data.originalPrice;
      oldPrice.style.display = '';
      priceRow.classList.add('modal-details__price--sale');
    } else {
      oldPrice.textContent = '';
      oldPrice.style.display = 'none';
      priceRow.classList.remove('modal-details__price--sale');
    }
    price.textContent = data.currentPrice;

    // Quantity reset
    currentQty = 1;
    qtyVal.textContent = '1';

    // Gift packaging reset
    if (giftCheckbox) giftCheckbox.checked = false;

    // Sold out logic
    if (data.status === 'soldout') {
      addCartBtn.disabled = true;
      var cartLabel = addCartBtn.querySelector('span');
      if (cartLabel) {
        cartLabel.textContent = lang === 'ge' ? 'გაყიდულია' : 'Sold Out';
      }
      qtyWrap.style.opacity = '0.4';
      qtyWrap.style.pointerEvents = 'none';
    } else {
      addCartBtn.disabled = false;
      var cartLabel = addCartBtn.querySelector('span');
      if (cartLabel) {
        cartLabel.textContent = lang === 'ge'
          ? (cartLabel.dataset.ge || 'კალათაში დამატება')
          : (cartLabel.dataset.en || 'Add to Cart');
      }
      qtyWrap.style.opacity = '';
      qtyWrap.style.pointerEvents = '';
    }
  }

  /* ── Open / Close ────────────────────────────── */
  function openModal() {
    overlay.classList.add('active');
    document.body.classList.add('modal-open');
    // Trap focus
    closeBtn.focus();
  }

  function closeModal() {
    overlay.classList.remove('active');
    document.body.classList.remove('modal-open');
    resetZoom();
  }

  /* ── Close handlers ──────────────────────────── */
  closeBtn.addEventListener('click', closeModal);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (!overlay.classList.contains('active')) return;
    if (e.key === 'Escape') {
      closeModal();
    } else if (e.key === 'ArrowLeft' && galleryImages.length > 1) {
      goToImage(galleryIndex - 1);
    } else if (e.key === 'ArrowRight' && galleryImages.length > 1) {
      goToImage(galleryIndex + 1);
    }
  });

  /* ── Quantity controls ───────────────────────── */
  qtyMinus.addEventListener('click', function () {
    if (currentQty > 1) {
      currentQty--;
      qtyVal.textContent = currentQty;
    }
  });

  qtyPlus.addEventListener('click', function () {
    if (currentQty < 99) {
      currentQty++;
      qtyVal.textContent = currentQty;
    }
  });

  /* ── Add to cart from modal ──────────────────── */
  var _modalProduct = null;

  // Store a reference to the current modal product for the cart
  var _origPopulate = populateModal;
  populateModal = function (data) {
    _origPopulate(data);
    _modalProduct = {
      name:   data.name,
      nameEn: data.name, // extracted in current lang
      price:  0,
      image:  data.images && data.images[0] ? data.images[0] : ''
    };
    // Parse current price number
    var priceText = price ? price.textContent.trim() : '';
    var match = priceText.match(/[\d.]+/);
    if (match) _modalProduct.price = parseFloat(match[0]);
  };

  addCartBtn.addEventListener('click', function () {
    if (addCartBtn.disabled) return;

    var lang = getLang();

    // Use real cart system if available
    if (window.CeramisiCart && _modalProduct && _modalProduct.price) {
      var productToAdd = {
        name:     _modalProduct.name,
        nameEn:   _modalProduct.nameEn,
        price:    _modalProduct.price,
        image:    _modalProduct.image,
        giftWrap: giftCheckbox ? giftCheckbox.checked : false
      };
      if (productToAdd.giftWrap) {
        productToAdd.price += GIFT_COST;
      }
      window.CeramisiCart.addToCart(productToAdd, currentQty);
    }

    // Visual feedback
    var cartLabel = addCartBtn.querySelector('span');
    var origText = cartLabel ? cartLabel.textContent : '';
    if (cartLabel) {
      cartLabel.textContent = '✓ ' + (lang === 'ge' ? 'დამატებულია' : 'Added');
    }
    addCartBtn.disabled = true;

    setTimeout(function () {
      if (cartLabel) cartLabel.textContent = origText;
      addCartBtn.disabled = false;
    }, 1400);
  });

  /* ── Bind to product cards ───────────────────── */
  function bindProductCards() {
    document.querySelectorAll('.product-card').forEach(function (card) {
      // Click on card (but not on the add-to-cart button)
      card.addEventListener('click', function (e) {
        // Don't open modal if clicking the card's own add-to-cart button
        if (e.target.closest('.btn-add-cart')) return;

        e.preventDefault();
        var data = extractCardData(card);
        populateModal(data);
        openModal();
      });

      // Make card look clickable
      card.style.cursor = 'pointer';
    });
  }

  /* ── Init ─────────────────────────────────────── */
  function init() {
    bindProductCards();

    // Re-bind after Sanity renders new cards
    var grid = document.querySelector('.products-grid');
    if (grid) {
      var observer = new MutationObserver(function () {
        bindProductCards();
        if (window.CeramisiCart) window.CeramisiCart.bindCardButtons();
      });
      observer.observe(grid, { childList: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for Sanity re-renders
  window.initProductModal = bindProductCards;

})();
