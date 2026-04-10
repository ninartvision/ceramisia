/**
 * Ceramisia – Sanity Renderers (ES Module)
 * Dynamically renders products, categories, featured items & blog posts.
 *
 * Load with a single script tag:
 *   <script type="module" src="js/sanity-render.js"></script>
 *
 * Static HTML remains as fallback if Sanity fetch fails.
 */

import {
  sanityImageUrl,
  getCategories,
  getProducts,
  getFeaturedProducts,
  getSiteSettings,
  getBlogPosts,
} from './sanity.js';

import { renderHeroSlider, renderAboutStrip, renderFooter } from './render-home.js';
import { renderAboutPage } from './render-about.js';
import { renderContactPage } from './render-contact.js';

const LANG_KEY = 'ceramisia_lang';

function getLang() {
  return localStorage.getItem(LANG_KEY) || 'ge';
}

/** Safely escape HTML to prevent XSS */
function esc(str) {

  if (!str) return '';
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

/** Build a row of N skeleton placeholder cards in a grid */
function showSkeletons(grid, count) {
  grid.innerHTML = '';
  for (var i = 0; i < count; i++) {
    var sk = document.createElement('div');
    sk.className = 'skel-card';
    sk.innerHTML = '<div class="skel-img"></div><div class="skel-line"></div><div class="skel-line short"></div>';
    grid.appendChild(sk);
  }
}

/** Build price HTML from product data */
function buildPriceHtml(p) {
  if (p.salePrice) {
    return '<span class="original">\u20BE ' + esc(String(p.price)) + '</span>\u20BE ' + esc(String(p.salePrice));
  }
  return '\u20BE ' + esc(String(p.price));
}

/** Build badge HTML */
function buildBadge(badge, lang) {
  if (badge === 'new') {
    return '<span class="product-badge new" data-ge="\u10D0\u10EE\u10D0\u10DA\u10D8" data-en="New">' +
      (lang === 'ge' ? '\u10D0\u10EE\u10D0\u10DA\u10D8' : 'New') + '</span>';
  }
  if (badge === 'sale') {
    return '<span class="product-badge sale" data-ge="\u10E4\u10D0\u10E1\u10D3\u10D0\u10D9\u10DA\u10D4\u10D1\u10D0" data-en="Sale">' +
      (lang === 'ge' ? '\u10E4\u10D0\u10E1\u10D3\u10D0\u10D9\u10DA\u10D4\u10D1\u10D0' : 'Sale') + '</span>';
  }
  if (badge === 'bestseller') {
    return '<span class="product-badge bestseller" data-ge="ბესტსელერი" data-en="Bestseller">' +
      (lang === 'ge' ? 'ბესტსელერი' : 'Bestseller') + '</span>';
  }
  return '';
}

/** Create a product card DOM element */
function createProductCard(p, lang, extraClass) {
  const name     = lang === 'ge' ? (p.name || '') : (p.nameEn || p.name || '');
  const catLabel = lang === 'ge' ? (p.categoryTitle || '') : (p.categoryTitleEn || '');
  const imgUrl   = sanityImageUrl(p.mainImage, 600);
  const badge    = buildBadge(p.badge, lang);
  const priceHtml = buildPriceHtml(p);

  const card = document.createElement('div');
  card.className = 'product-card revealed' + (extraClass ? ' ' + extraClass : '');
  card.dataset.category = p.categorySlug || '';
  if (p.badge) card.dataset.status = p.badge;

  // Build gallery: mainImage + gallery array
  const galleryImages = [imgUrl];
  if (p.gallery && p.gallery.length) {
    p.gallery.forEach(function (img) {
      const url = sanityImageUrl(img, 800);
      if (url) galleryImages.push(url);
    });
  }
  card.dataset.gallery = galleryImages.join(',');

  card.innerHTML =
    '<div class="product-img-wrap">' +
      (imgUrl
        ? '<img src="' + esc(imgUrl) + '" alt="' + esc(name) + '" loading="lazy">'
        : '<div style="aspect-ratio:1;background:var(--clr-bg-alt,#f5f0eb)"></div>') +
      badge +
      '<div class="product-actions">' +
        '<button class="btn-add-cart" data-ge="\u10D9\u10D0\u10DA\u10D0\u10D7\u10D0\u10E8\u10D8" data-en="Add to Cart">' +
          (lang === 'ge' ? '\u10D9\u10D0\u10DA\u10D0\u10D7\u10D0\u10E8\u10D8' : 'Add to Cart') +
        '</button>' +
      '</div>' +
    '</div>' +
    '<div class="product-info">' +
      '<p class="product-category" data-ge="' + esc(p.categoryTitle || '') + '" data-en="' + esc(p.categoryTitleEn || '') + '">' + esc(catLabel) + '</p>' +
      '<h3 class="product-name" data-ge="' + esc(p.name || '') + '" data-en="' + esc(p.nameEn || '') + '">' + esc(name) + '</h3>' +
      '<p class="product-price">' + priceHtml + '</p>' +
    '</div>';

  return card;
}

// ── Build & bind filter bar buttons ─────────────────
function buildFilterBar(bar, categoryList) {
  const lang = getLang();
  bar.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'filter-btn active';
  allBtn.dataset.filter = 'all';
  allBtn.dataset.ge = 'ყველა';
  allBtn.dataset.en = 'All';
  allBtn.textContent = lang === 'ge' ? 'ყველა' : 'All';
  bar.appendChild(allBtn);

  categoryList.forEach(function (cat) {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.filter = cat.slug;
    btn.dataset.ge = cat.title || '';
    btn.dataset.en = cat.titleEn || cat.title || '';
    btn.textContent = lang === 'ge' ? (cat.title || '') : (cat.titleEn || cat.title || '');
    bar.appendChild(btn);
  });

  bar.querySelectorAll('.filter-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      bar.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      const slug = btn.dataset.filter;
      const url = new URL(window.location);
      if (slug === 'all') { url.searchParams.delete('cat'); }
      else { url.searchParams.set('cat', slug); }
      window.history.replaceState({}, '', url);
      renderProductsGrid(slug);
    });
  });
}

// ── Render Filter Bar from Sanity Categories ─────────
async function renderFilterBar() {
  const bar = document.querySelector('.filter-bar');
  if (!bar) return;

  try {
    // Try dedicated Category documents first
    let categories = await getCategories();

    // Fallback: extract unique categories from product list
    if (!categories || !categories.length) {
      const products = await getProducts('all');
      if (products && products.length) {
        const seen = new Set();
        categories = [];
        products.forEach(function (p) {
          if (p.categorySlug && !seen.has(p.categorySlug)) {
            seen.add(p.categorySlug);
            categories.push({
              slug:    p.categorySlug,
              title:   p.categoryTitle   || p.categorySlug,
              titleEn: p.categoryTitleEn || p.categorySlug,
            });
          }
        });
      }
    }

    if (!categories || !categories.length) return; // keep static buttons

    buildFilterBar(bar, categories);
  } catch (err) {
    console.warn('Categories fetch failed, keeping static filter bar:', err);
  }
}

// ── Render Products Grid ─────────────────────────────
async function renderProductsGrid(categorySlug) {
  const grid = document.querySelector('#products') || document.querySelector('.products-grid');
  if (!grid) return;

  // Show loading state
  grid.innerHTML = '<div class="products-loading" style="grid-column:1/-1;text-align:center;padding:3rem 0;color:var(--clr-text-muted,#888)">' +
    '<p data-ge="იტვირთება..." data-en="Loading...">' +
    (getLang() === 'ge' ? 'იტვირთება...' : 'Loading...') + '</p></div>';

  try {
    const cat = categorySlug || new URLSearchParams(window.location.search).get('cat') || 'all';
    const products = await getProducts(cat);
    const lang = getLang();

    grid.innerHTML = '';

    if (!products || !products.length) {
      grid.innerHTML =
        '<div class="products-empty" style="grid-column:1/-1;text-align:center;padding:4rem 1rem">' +
          '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--clr-text-muted,#999)" stroke-width="1.2" style="margin-bottom:1rem">' +
            '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' +
          '</svg>' +
          '<p style="font-size:1.1rem;color:var(--clr-text-muted,#888)" data-ge="პროდუქტები ვერ მოიძებნა" data-en="No products found">' +
            (lang === 'ge' ? 'პროდუქტები ვერ მოიძებნა' : 'No products found') +
          '</p>' +
        '</div>';
      return;
    }

    products.forEach(function (p) {
      grid.appendChild(createProductCard(p, lang));
    });

    // Re-init cart & modal for dynamically rendered cards
    if (typeof window.initCart === 'function') window.initCart();
    if (typeof window.initProductModal === 'function') window.initProductModal();

  } catch (err) {
    console.warn('Sanity products fetch failed, keeping static HTML:', err);
  }
}

// ── Render Featured Products (homepage popular grid) ──
async function renderFeaturedProducts() {
  const grid = document.querySelector('.popular-grid');
  if (!grid) return;

  try {
    // Get count from siteSettings (default 4)
    const settings = await getSiteSettings().catch(function () { return null; });
    const count = (settings && settings.featuredProductCount) ? settings.featuredProductCount : 4;

    // Try featured first; fall back to first N products if none are marked featured
    let products = await getFeaturedProducts();
    if (!products || !products.length) {
      products = await getProducts('all');
      if (products && products.length) products = products.slice(0, count);
    } else {
      products = products.slice(0, count);
    }

    // Only replace static HTML when Sanity returns real data
    if (!products || !products.length) return;

    const lang = getLang();
    grid.innerHTML = '';
    products.forEach(function (p) {
      grid.appendChild(createProductCard(p, lang));
    });

    if (typeof window.initCart === 'function') window.initCart();
    if (typeof window.initProductModal === 'function') window.initProductModal();
    reinitPopularSlider();

  } catch (err) {
    // Fetch failed — leave static HTML untouched
    console.warn('Featured products fetch failed, keeping static HTML:', err);
  }
}

// ── Render Categories Grid (homepage) ────────────────
async function renderCategoriesGrid() {
  const grid = document.querySelector('.categories-grid');
  if (!grid) return;

  try {
    let categories = await getCategories();

    // Fallback: if no Category documents exist, extract unique categories from products
    if (!categories || !categories.length) {
      const products = await getProducts('all');
      if (products && products.length) {
        const seen = new Set();
        categories = [];
        products.forEach(function (p) {
          if (p.categorySlug && !seen.has(p.categorySlug)) {
            seen.add(p.categorySlug);
            categories.push({
              title:   p.categoryTitle    || p.categorySlug || '',
              titleEn: p.categoryTitleEn  || p.categorySlug || '',
              slug:    p.categorySlug,
              image:   p.mainImage || null,
            });
          }
        });
      }
    }

    // Only replace static HTML when Sanity returns real data
    if (!categories || !categories.length) return;

    const lang = getLang();
    grid.innerHTML = '';

    categories.forEach(function (cat, i) {
      const title  = lang === 'ge' ? (cat.title || '') : (cat.titleEn || cat.title || '');
      const imgUrl = sanityImageUrl(cat.image, 600);

      const link = document.createElement('a');
      link.href = 'products.html?cat=' + encodeURIComponent(cat.slug);
      link.className = 'category-card';
      link.setAttribute('data-reveal', '');
      link.setAttribute('data-reveal-delay', String((i % 3) * 80));
      link.innerHTML =
        '<div class="category-img-wrap">' +
          (imgUrl
            ? '<img src="' + esc(imgUrl) + '" alt="' + esc(title) + '" loading="lazy">'
            : '<div style="aspect-ratio:1;background:var(--clr-bg-alt,#f5f0eb)"></div>') +
        '</div>' +
        '<div class="category-info">' +
          '<h3 data-ge="' + esc(cat.title || '') + '" data-en="' + esc(cat.titleEn || '') + '">' + esc(title) + '</h3>' +
        '</div>';
      grid.appendChild(link);
    });

    reinitScrollReveal();

  } catch (err) {
    // Fetch failed — leave static HTML untouched
    console.warn('Categories grid fetch failed, keeping static HTML:', err);
  }
}

// ── Render Blog Cards (homepage) ─────────────────────
async function renderBlogCards() {
  const grid = document.querySelector('.blog-section .blog-grid');
  if (!grid) return;

  try {
    const posts = await getBlogPosts(3);
    if (!posts || !posts.length) return;

    const lang = getLang();
    grid.innerHTML = '';

    posts.forEach(function (post) {
      const title   = lang === 'ge' ? post.title : (post.titleEn || post.title);
      const excerpt = lang === 'ge' ? post.excerpt : (post.excerptEn || post.excerpt);
      const imgUrl  = sanityImageUrl(post.image, 600);
      const date    = new Date(post.publishedAt);
      const dateStr = lang === 'ge'
        ? date.getDate() + ' ' + getGeorgianMonth(date.getMonth()) + ', ' + date.getFullYear()
        : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      const card = document.createElement('article');
      card.className = 'blog-card revealed';
      card.innerHTML =
        '<a href="blog.html#' + esc(post.slug) + '" class="blog-card-img-link">' +
          (imgUrl ? '<img src="' + esc(imgUrl) + '" alt="' + esc(title) + '" loading="lazy">' : '') +
        '</a>' +
        '<div class="blog-card-body">' +
          '<span class="blog-date">' + esc(dateStr) + '</span>' +
          '<h3><a href="blog.html#' + esc(post.slug) + '">' + esc(title) + '</a></h3>' +
          '<p>' + esc(excerpt) + '</p>' +
          '<a href="blog.html#' + esc(post.slug) + '" class="read-more">' +
            (lang === 'ge' ? 'სრულად წაკითხვა' : 'Read More') +
          '</a>' +
        '</div>';

      grid.appendChild(card);
    });

  } catch (err) {
    console.warn('Blog fetch failed, keeping static HTML:', err);
  }
}

function getGeorgianMonth(m) {
  const months = [
    'იანვარი','თებერვალი','მარტი','აპრილი','მაისი','ივნისი',
    'ივლისი','აგვისტო','სექტემბერი','ოქტომბერი','ნოემბერი','დეკემბერი'
  ];
  return months[m] || '';
}

// ── Init on DOM ready ────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  var path = window.location.pathname;
  var isProducts = path.endsWith('products.html') || document.querySelector('.filter-bar') !== null;
  var isAbout    = path.endsWith('about.html')    || document.querySelector('.about-hero') !== null;
  var isContact  = path.endsWith('contact.html')  || document.querySelector('.contact-layout') !== null;
  var isHome     = !isProducts && !isAbout && !isContact;

  // Global — runs on every page
  renderFooter();

  // Products page only
  if (isProducts) {
    // Build filter bar first, then load products (so URL ?cat= activates the right button)
    renderFilterBar().then(function () {
      var urlCat = new URLSearchParams(window.location.search).get('cat');
      if (urlCat) {
        var btn = document.querySelector('.filter-btn[data-filter="' + urlCat + '"]');
        if (btn) {
          document.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
        }
      }
    });
    renderProductsGrid();
    return; // nothing else needed on products page
  }

  // Homepage only
  if (isHome) {
    renderHeroSlider();
    renderCategoriesGrid();
    renderFeaturedProducts();
    renderAboutStrip();
    renderBlogCards();
    return;
  }

  // About page only
  if (isAbout) {
    renderAboutPage();
    return;
  }

  // Contact page only
  if (isContact) {
    renderContactPage();
  }
});
