/**
 * Ceramisia – Sanity Renderers
 * Example: dynamically render products & blog posts from Sanity CMS.
 *
 * Include AFTER sanity.js and main.js:
 *   <script src="js/sanity.js"></script>
 *   <script src="js/sanity-render.js"></script>
 *
 * The static HTML remains as fallback — this progressively enhances it.
 */

(function () {
  'use strict';

  var CMS = window.CeramisiaCMS;
  if (!CMS) return; // sanity.js not loaded

  var LANG_KEY = 'ceramisia_lang';

  function getLang() {
    return localStorage.getItem(LANG_KEY) || 'ge';
  }

  // ── Render Products Grid ───────────────────────────
  async function renderProducts() {
    var grid = document.querySelector('.products-grid');
    if (!grid) return;

    // Read filter from URL
    var params = new URLSearchParams(window.location.search);
    var cat = params.get('cat') || 'all';

    try {
      var products = await CMS.getProducts(cat);
      if (!products.length) return; // keep static HTML if no results

      var lang = getLang();
      grid.innerHTML = '';

      products.forEach(function (p) {
        var name     = lang === 'ge' ? p.name : p.nameEn;
        var catLabel  = lang === 'ge' ? p.categoryTitle : p.categoryTitleEn;
        var imgUrl   = CMS.sanityImageUrl(p.image, 600);
        var badge    = '';

        if (p.badge === 'new') {
          badge = '<span class="product-badge new">' + (lang === 'ge' ? 'ახალი' : 'New') + '</span>';
        } else if (p.badge === 'sale') {
          badge = '<span class="product-badge sale">' + (lang === 'ge' ? 'ფასდაკლება' : 'Sale') + '</span>';
        }

        var priceHtml = '';
        if (p.originalPrice) {
          priceHtml = '<span class="original">₾ ' + p.originalPrice + '</span>₾ ' + p.price;
        } else {
          priceHtml = '₾ ' + p.price;
        }

        var card = document.createElement('div');
        card.className = 'product-card revealed';
        card.dataset.category = p.categorySlug;
        if (p.description) card.dataset.descGe = p.description;
        if (p.descriptionEn) card.dataset.descEn = p.descriptionEn;
        if (p.badge) card.dataset.status = p.badge;

        // Build gallery string from images array or single image
        var galleryImages = [];
        if (p.images && p.images.length) {
          p.images.forEach(function (img) { galleryImages.push(CMS.sanityImageUrl(img, 800)); });
        } else {
          galleryImages.push(imgUrl);
        }
        card.dataset.gallery = galleryImages.join(',');

        card.innerHTML =
          '<div class="product-img-wrap">' +
            '<img src="' + imgUrl + '" alt="' + name + '" loading="lazy">' +
            badge +
            '<div class="product-actions">' +
              '<button class="btn-add-cart" data-ge="კალათაში" data-en="Add to Cart">' +
                (lang === 'ge' ? 'კალათაში' : 'Add to Cart') +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div class="product-info">' +
            '<p class="product-category">' + catLabel + '</p>' +
            '<h3 class="product-name" data-ge="' + (p.name || '') + '" data-en="' + (p.nameEn || '') + '">' + name + '</h3>' +
            '<p class="product-price">' + priceHtml + '</p>' +
          '</div>';

        grid.appendChild(card);
      });

      // Re-init cart buttons for newly rendered cards
      if (window.initCart) window.initCart();
      if (window.initProductModal) window.initProductModal();

    } catch (err) {
      console.warn('Sanity fetch failed, using static HTML fallback:', err);
    }
  }

  // ── Render Blog Cards (homepage) ───────────────────
  async function renderBlogCards() {
    var grid = document.querySelector('.blog-section .blog-grid');
    if (!grid) return;

    try {
      var posts = await CMS.getBlogPosts(3);
      if (!posts.length) return;

      var lang = getLang();
      grid.innerHTML = '';

      posts.forEach(function (post) {
        var title   = lang === 'ge' ? post.title : post.titleEn;
        var excerpt = lang === 'ge' ? post.excerpt : post.excerptEn;
        var imgUrl  = CMS.sanityImageUrl(post.image, 600);
        var date    = new Date(post.publishedAt);
        var dateStr = lang === 'ge'
          ? date.getDate() + ' ' + getGeorgianMonth(date.getMonth()) + ', ' + date.getFullYear()
          : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        var card = document.createElement('article');
        card.className = 'blog-card revealed';
        card.innerHTML =
          '<a href="blog.html#' + post.slug + '" class="blog-card-img-link">' +
            '<img src="' + imgUrl + '" alt="' + title + '" loading="lazy">' +
          '</a>' +
          '<div class="blog-card-body">' +
            '<span class="blog-date">' + dateStr + '</span>' +
            '<h3><a href="blog.html#' + post.slug + '">' + title + '</a></h3>' +
            '<p>' + excerpt + '</p>' +
            '<a href="blog.html#' + post.slug + '" class="read-more">' +
              (lang === 'ge' ? 'სრულად წაკითხვა' : 'Read More') +
            '</a>' +
          '</div>';

        grid.appendChild(card);
      });

    } catch (err) {
      console.warn('Blog fetch failed, using static HTML fallback:', err);
    }
  }

  function getGeorgianMonth(m) {
    var months = [
      'იანვარი','თებერვალი','მარტი','აპრილი','მაისი','ივნისი',
      'ივლისი','აგვისტო','სექტემბერი','ოქტომბერი','ნოემბერი','დეკემბერი'
    ];
    return months[m] || '';
  }

  // ── Init on DOM ready ──────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    renderProducts();
    renderBlogCards();
  });

})();
