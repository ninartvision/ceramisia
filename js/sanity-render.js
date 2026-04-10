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
  getCategoriesFromProducts,
  getProducts,
  getFeaturedProducts,
  getPage,
  getSiteSettings,
  getHomepage,
  getBlogPosts,
} from './sanity.js';

import { renderHeroSlider, renderAboutStrip, renderFooter, renderNavigation } from './render-home.js';
import { renderAboutPage } from './render-about.js';
import { renderContactPage } from './render-contact.js';

const LANG_KEY = 'ceramisia_lang';

function getLang() {
  return localStorage.getItem(LANG_KEY) || 'ge';
}

// ── Page reveal — called after all Sanity renders complete ───
var _revealed = false;
function revealPage() {
  if (_revealed) return;
  _revealed = true;
  document.body.classList.remove('cms-loading');
  var loader = document.getElementById('cmsLoader');
  if (loader) {
    loader.classList.add('cms-loader--fade');
    setTimeout(function () {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
    }, 400);
  }
}

/** Safely escape HTML to prevent XSS */
function esc(str) {

  if (!str) return '';
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

/** Build a row of N skeleton placeholder cards in a grid (single DOM write) */
function showSkeletons(grid, count) {
  var frag = document.createDocumentFragment();
  for (var i = 0; i < count; i++) {
    var sk = document.createElement('div');
    sk.className = 'skel-card';
    sk.innerHTML = '<div class="skel-img"></div><div class="skel-line"></div><div class="skel-line short"></div>';
    frag.appendChild(sk);
  }
  grid.innerHTML = '';   // single write: clear previous content
  grid.appendChild(frag); // single write: insert all skeletons
}

/**
 * Re-observe [data-reveal] elements added after initial page load.
 * Mirrors initScrollReveal() in main.js for dynamically injected content.
 */
function reinitScrollReveal() {
  var elements = document.querySelectorAll('[data-reveal]:not(.revealed)');
  if (!elements.length) return;
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var delay = entry.target.dataset.revealDelay || 0;
        setTimeout(function () { entry.target.classList.add('revealed'); }, Number(delay));
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  elements.forEach(function (el) { observer.observe(el); });
}

/**
 * Re-init popular slider arrows for a dynamically rendered .popular-grid.
 * Prefers #sanity-home-sections grid if present; falls back to static grid.
 */
function reinitPopularSlider() {
  // Find the grid that's actually visible (dynamic section takes priority)
  var grid    = document.querySelector('#sanity-home-sections .popular-grid')
             || document.querySelector('.popular-grid');
  var prevBtn = document.querySelector('#sanity-home-sections .popular-slider-arrow.prev')
             || document.getElementById('popularPrev');
  var nextBtn = document.querySelector('#sanity-home-sections .popular-slider-arrow.next')
             || document.getElementById('popularNext');
  if (!grid || !prevBtn || !nextBtn) return;

  function isMobile() { return window.innerWidth <= 768; }

  function updateArrows() {
    if (isMobile()) {
      prevBtn.style.display = 'none';
      nextBtn.style.display = 'none';
      return;
    }
    prevBtn.style.display = '';
    nextBtn.style.display = '';
    prevBtn.disabled = grid.scrollLeft <= 4;
    nextBtn.disabled = grid.scrollLeft + grid.offsetWidth >= grid.scrollWidth - 4;
  }

  function scrollByCard(dir) {
    if (isMobile()) return;
    var card = grid.querySelector('.product-card');
    if (!card) return;
    var dist = card.offsetWidth + parseInt(getComputedStyle(grid).gap || '16', 10);
    grid.scrollBy({ left: dir * dist, behavior: 'smooth' });
  }

  prevBtn.addEventListener('click', function () { scrollByCard(-1); });
  nextBtn.addEventListener('click', function () { scrollByCard(1); });
  grid.addEventListener('scroll', updateArrows, { passive: true });
  window.addEventListener('resize', updateArrows);
  updateArrows();
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

  // Build the entire bar as one HTML string — single DOM write avoids
  // multiple reflows and prevents any intermediate state from being visible.
  var html = '<button class="filter-btn active" data-filter="all"' +
    ' data-ge="\u10E7\u10D5\u10D4\u10DA\u10D0" data-en="All">' +
    (lang === 'ge' ? '\u10E7\u10D5\u10D4\u10DA\u10D0' : 'All') + '</button>';

  categoryList.forEach(function (cat) {
    var label = lang === 'ge' ? (cat.title || '') : (cat.titleEn || cat.title || '');
    html += '<button class="filter-btn"' +
      ' data-filter="'  + esc(cat.slug)                        + '"' +
      ' data-ge="'      + esc(cat.title   || '')               + '"' +
      ' data-en="'      + esc(cat.titleEn || cat.title || '') + '">' +
      esc(label) + '</button>';
  });

  bar.innerHTML = html; // single DOM update — no partial render visible

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

    if (!categories || !categories.length) return; // nothing to render — bar stays empty

    buildFilterBar(bar, categories);
  } catch (err) {
    console.warn('Categories fetch failed, filter bar stays empty:', err);
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
    console.warn('Sanity products fetch failed:', err);
    const lang = getLang();
    grid.innerHTML =
      '<div class="products-empty" style="grid-column:1/-1;text-align:center;padding:4rem 1rem">' +
        '<p style="font-size:1.1rem;color:var(--clr-text-muted,#888)">' +
          (lang === 'ge'
            ? 'პროდუქტები ვერ ჩაიტვირთა. გთხოვთ სცადოთ მოგვიანებით.'
            : 'Failed to load products. Please try again later.') +
        '</p>' +
      '</div>';
  }
}

// ── Render Featured Products (homepage popular grid) ──
async function renderFeaturedProducts() {
  var DEFAULT_COUNT = 4;
  const grid = document.querySelector('.popular-grid');
  if (!grid) return;

  const section = grid.closest('.popular-products');

  function hideSection() {
    if (section) section.classList.add('section--hidden');
    grid.innerHTML = '';
  }

  // Show skeleton placeholders immediately — zero latency before visual feedback.
  // Uses default count; real count from siteSettings adjusts the slice below.
  showSkeletons(grid, DEFAULT_COUNT);

  try {
    // Both fetches fire concurrently — neither waits on the other.
    // Individual .catch() guards mean one failure doesn't abort the other.
    const [settings, allFeatured] = await Promise.all([
      getSiteSettings().catch(function () { return null; }),
      getFeaturedProducts().catch(function () { return []; }),
    ]);

    const count    = (settings && settings.featuredProductCount) || DEFAULT_COUNT;
    const products = (allFeatured || []).slice(0, count);

    if (!products.length) {
      hideSection();
      return;
    }

    // Build all cards into a DocumentFragment — one DOM write for the clear,
    // one DOM write for the insert, zero intermediate layout recalculations.
    const lang     = getLang();
    const fragment = document.createDocumentFragment();
    products.forEach(function (p) { fragment.appendChild(createProductCard(p, lang)); });

    grid.innerHTML = '';        // single write: replace skeletons
    grid.appendChild(fragment); // single write: insert all product cards

    // createProductCard() adds .revealed immediately. Strip it from every card,
    // wait one paint cycle via rAF, then re-add with cascading delays so the
    // CSS opacity + transform transition actually fires from the invisible state.
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.product-card'));
    cards.forEach(function (card) { card.classList.remove('revealed'); });
    requestAnimationFrame(function () {
      cards.forEach(function (card, idx) {
        setTimeout(function () { card.classList.add('revealed'); }, idx * 80);
      });
    });

    if (section) section.classList.remove('section--hidden');
    if (typeof window.initCart         === 'function') window.initCart();
    if (typeof window.initProductModal === 'function') window.initProductModal();
    reinitPopularSlider();

  } catch (err) {
    hideSection();
    console.warn('Featured products fetch failed:', err);
  }
}

// ── Render Categories Grid (homepage) ────────────────
async function renderCategoriesGrid() {
  const grid = document.querySelector('.categories-grid');
  if (!grid) return;

  try {
    // Primary: only categories that have actual products
    let categories = await getCategoriesFromProducts();

    // Secondary fallback: all category documents (no product filter)
    if (!categories || !categories.length) {
      categories = await getCategories();
    }

    // Tertiary fallback: extract unique categories from product list data
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

    // No categories returned — hide the static section so empty grid is not shown
    if (!categories || !categories.length) {
      var catSection = document.querySelector('.categories-section[data-static-home-section]');
      if (catSection) catSection.classList.add('section--hidden');
      return;
    }

    const lang = getLang();
    grid.innerHTML = '';

    categories.forEach(function (cat, i) {
      const title  = lang === 'ge' ? (cat.title || '') : (cat.titleEn || cat.title || '');
      const imgUrl = sanityImageUrl(cat.image, 600);

      const link = document.createElement('a');
      link.href = '/products/?cat=' + encodeURIComponent(cat.slug);
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
    // Fetch failed — hide static section rather than show an empty grid
    console.warn('Categories grid fetch failed, hiding section:', err);
    var catSection = document.querySelector('.categories-section[data-static-home-section]');
    if (catSection) catSection.classList.add('section--hidden');
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
        '<a href="/blog/#' + esc(post.slug) + '" class="blog-card-img-link">' +
          (imgUrl ? '<img src="' + esc(imgUrl) + '" alt="' + esc(title) + '" loading="lazy">' : '') +
        '</a>' +
        '<div class="blog-card-body">' +
          '<span class="blog-date">' + esc(dateStr) + '</span>' +
          '<h3><a href="/blog/#' + esc(post.slug) + '">' + esc(title) + '</a></h3>' +
          '<p>' + esc(excerpt) + '</p>' +
          '<a href="/blog/#' + esc(post.slug) + '" class="read-more">' +
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

// ══════════════════════════════════════════════════════════════
// SECTION BUILDERS — each builds a <section> DOM element
// ══════════════════════════════════════════════════════════════

function buildSectionCategories(section, categories, lang) {
  var heading = lang === 'ge'
    ? (section.heading  || 'აღმოაჩინე კოლექცია')
    : (section.headingEn || 'Browse by Collection');
  var label = lang === 'ge'
    ? (section.label  || 'კატეგორიები')
    : (section.labelEn || 'Categories');

  var el = document.createElement('section');
  el.className = 'categories-section section';

  var grid = document.createElement('div');
  grid.className = 'categories-grid';
  categories.forEach(function (cat, i) {
    var title  = lang === 'ge' ? (cat.title || '') : (cat.titleEn || cat.title || '');
    var imgUrl = sanityImageUrl(cat.image, 600);
    var link = document.createElement('a');
    link.href = '/products/?cat=' + encodeURIComponent(cat.slug);
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

  var inner = document.createElement('div');
  inner.className = 'container';
  inner.innerHTML =
    '<div class="section-header" data-reveal>' +
      '<span class="section-label" data-ge="' + esc(section.label || 'კატეგორიები') + '" data-en="' + esc(section.labelEn || 'Categories') + '">' + esc(label) + '</span>' +
      '<h2 class="section-title" data-ge="' + esc(section.heading || 'აღმოაჩინე კოლექცია') + '" data-en="' + esc(section.headingEn || 'Browse by Collection') + '">' + esc(heading) + '</h2>' +
    '</div>';
  inner.appendChild(grid);
  var cta = document.createElement('div');
  cta.className = 'section-cta';
  cta.setAttribute('data-reveal', '');
  cta.innerHTML = '<a href="/products/" class="btn btn-outline" data-ge="ყველა პროდუქტი" data-en="View All Products">' +
    (lang === 'ge' ? 'ყველა პროდუქტი' : 'View All Products') + '</a>';
  inner.appendChild(cta);
  el.appendChild(inner);
  return el;
}

function buildSectionFeatured(section, products, lang) {
  var heading = lang === 'ge'
    ? (section.heading  || 'რჩეული პროდუქტები')
    : (section.headingEn || 'Top Picks');
  var label = lang === 'ge'
    ? (section.label  || 'პოპულარული')
    : (section.labelEn || 'Popular');

  var el = document.createElement('section');
  el.className = 'popular-products section';

  var grid = document.createElement('div');
  grid.className = 'popular-grid';
  products.forEach(function (p) { grid.appendChild(createProductCard(p, lang)); });

  var inner = document.createElement('div');
  inner.className = 'container';
  inner.innerHTML =
    '<div class="section-header" data-reveal>' +
      '<span class="section-label">' + esc(label) + '</span>' +
      '<h2 class="section-title">' + esc(heading) + '</h2>' +
    '</div>' +
    '<div class="popular-slider-wrap">' +
      '<button class="popular-slider-arrow prev" aria-label="Previous" type="button">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>' +
      '</button>' +
      '<button class="popular-slider-arrow next" aria-label="Next" type="button">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
      '</button>' +
    '</div>' +
    '<div class="section-cta" data-reveal>' +
      '<a href="/products/" class="btn btn-outline" data-ge="ყველა პროდუქტის ნახვა" data-en="View All Products">' +
        (lang === 'ge' ? 'ყველა პროდუქტის ნახვა' : 'View All Products') +
      '</a>' +
    '</div>';

  // Insert grid inside slider-wrap (between the arrow buttons)
  inner.querySelector('.popular-slider-wrap').appendChild(grid);
  el.appendChild(inner);
  return el;
}

function buildSectionAbout(section, settings, lang) {
  var heading = lang === 'ge'
    ? (section.heading  || (settings && settings.homepageTitle)          || 'Ceramisia – კერამიკის ხელოვნება')
    : (section.headingEn || (settings && settings.homepageTitleEn)        || 'Ceramisia – The Art of Ceramics');
  var text = lang === 'ge'
    ? (section.text    || (settings && settings.homepageDescription)     || 'ვქმნით ხელნაკეთ კერამიკას, რომელიც აერთიანებს ქართულ ტრადიციებს თანამედროვე დიზაინთან.')
    : (section.textEn  || (settings && settings.homepageDescriptionEn)   || 'We craft handmade ceramics that unite Georgian traditions with modern design.');
  var btnText = lang === 'ge'
    ? (section.buttonText  || 'გაიგე მეტი')
    : (section.buttonTextEn || 'Learn More');
  var btnLink = section.buttonLink || '/about/';
  var imgRef  = (section.image && section.image.asset) ? section.image
              : (settings && settings.heroImage) ? settings.heroImage
              : null;
  var imgUrl = sanityImageUrl(imgRef, 800);

  var el = document.createElement('section');
  el.className = 'about-strip';
  el.innerHTML =
    '<div class="container about-strip-inner">' +
      '<div class="about-strip-text" data-reveal>' +
        '<span class="section-label" data-ge="ჩვენ შესახებ" data-en="About Us">' +
          (lang === 'ge' ? 'ჩვენ შესახებ' : 'About Us') +
        '</span>' +
        '<h2>' + esc(heading) + '</h2>' +
        '<p>' + esc(text) + '</p>' +
        '<a href="' + esc(btnLink) + '" class="btn btn-primary">' + esc(btnText) + '</a>' +
      '</div>' +
      (imgUrl
        ? '<div class="about-strip-image" data-reveal data-reveal-delay="150">' +
            '<img src="' + esc(imgUrl) + '" alt="' + esc(heading) + '" loading="lazy">' +
          '</div>'
        : '') +
    '</div>';
  return el;
}

function buildSectionBlog(section, posts, lang) {
  if (!posts || !posts.length) return null;

  var heading = lang === 'ge'
    ? (section.heading  || 'ბლოგი')
    : (section.headingEn || 'Blog');
  var label = lang === 'ge'
    ? (section.label  || 'სტატიები')
    : (section.labelEn || 'Articles');

  var el = document.createElement('section');
  el.className = 'blog-section section';

  var grid = document.createElement('div');
  grid.className = 'blog-grid';
  posts.forEach(function (post) {
    var title   = lang === 'ge' ? post.title : (post.titleEn || post.title);
    var excerpt = lang === 'ge' ? post.excerpt : (post.excerptEn || post.excerpt);
    var imgUrl  = sanityImageUrl(post.image, 600);
    var date    = new Date(post.publishedAt);
    var dateStr = lang === 'ge'
      ? date.getDate() + ' ' + getGeorgianMonth(date.getMonth()) + ', ' + date.getFullYear()
      : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    var card = document.createElement('article');
    card.className = 'blog-card revealed';
    card.innerHTML =
      '<a href="/blog/#' + esc(post.slug) + '" class="blog-card-img-link">' +
        (imgUrl ? '<img src="' + esc(imgUrl) + '" alt="' + esc(title) + '" loading="lazy">' : '') +
      '</a>' +
      '<div class="blog-card-body">' +
        '<span class="blog-date">' + esc(dateStr) + '</span>' +
        '<h3><a href="/blog/#' + esc(post.slug) + '">' + esc(title) + '</a></h3>' +
        '<p>' + esc(excerpt) + '</p>' +
        '<a href="/blog/#' + esc(post.slug) + '" class="read-more">' +
          (lang === 'ge' ? 'სრულად წაკითხვა' : 'Read More') + '</a>' +
      '</div>';
    grid.appendChild(card);
  });

  var inner = document.createElement('div');
  inner.className = 'container';
  inner.innerHTML =
    '<div class="section-header" data-reveal>' +
      '<span class="section-label">' + esc(label) + '</span>' +
      '<h2 class="section-title">' + esc(heading) + '</h2>' +
    '</div>';
  inner.appendChild(grid);
  el.appendChild(inner);
  return el;
}

function buildSectionTextImage(section, lang) {
  var heading = lang === 'ge'
    ? (section.heading  || '')
    : (section.headingEn || section.heading || '');
  var text = lang === 'ge'
    ? (section.text    || '')
    : (section.textEn  || section.text || '');
  var btnText = lang === 'ge'
    ? (section.buttonText  || '')
    : (section.buttonTextEn || section.buttonText || '');
  var btnLink = section.buttonLink || '#';
  var imgUrl  = sanityImageUrl(section.image, 800);

  var el = document.createElement('section');
  el.className = 'about-strip dynamic-section';
  el.innerHTML =
    '<div class="container about-strip-inner">' +
      '<div class="about-strip-text" data-reveal>' +
        (heading ? '<h2>' + esc(heading) + '</h2>' : '') +
        (text    ? '<p>'  + esc(text)    + '</p>'  : '') +
        (btnText ? '<a href="' + esc(btnLink) + '" class="btn btn-primary">' + esc(btnText) + '</a>' : '') +
      '</div>' +
      (imgUrl
        ? '<div class="about-strip-image" data-reveal data-reveal-delay="150">' +
            '<img src="' + esc(imgUrl) + '" alt="' + esc(heading) + '" loading="lazy">' +
          '</div>'
        : '') +
    '</div>';
  return el;
}

// ── Render Homepage Sections from Sanity ─────────────────────
/**
 * Fetches the "homepage" document from Sanity.
 * If sections are defined, renders them in order into #sanity-home-sections
 * and hides the static fallback sections.
 * Returns true if sections were rendered, false if static HTML should remain.
 */
async function renderHomepageSections() {
  try {
    var homepage = await getHomepage();
    if (!homepage || !homepage.sections || !homepage.sections.length) return false;

    var sections = homepage.sections;
    var lang     = getLang();

    // Determine which data types are needed
    var types         = sections.map(function (s) { return s.type; });
    var needsCats     = types.indexOf('categories') !== -1;
    var needsFeatured = types.indexOf('featured')   !== -1;
    var needsBlog     = types.indexOf('blog')       !== -1;
    var needsAbout    = types.indexOf('about')      !== -1;
    var needsSettings = needsAbout || needsFeatured;

    // Parallel data fetch — only what we actually need
    var results = await Promise.all([
      needsCats     ? getCategoriesFromProducts()               : Promise.resolve(null),
      needsFeatured ? getFeaturedProducts()                    : Promise.resolve(null),
      needsBlog     ? getBlogPosts(3)                          : Promise.resolve(null),
      needsSettings ? getSiteSettings().catch(function () { return null; }) : Promise.resolve(null),
    ]);
    var categories       = results[0];
    var featuredProducts = results[1];
    var blogPosts        = results[2];
    var settings         = results[3];

    // Secondary fallback for categories in section builder
    if (needsCats && (!categories || !categories.length)) {
      categories = await getCategories().catch(function () { return []; }) || [];
    }

    var container = document.getElementById('sanity-home-sections');
    if (!container) return false;

    var fragment    = document.createDocumentFragment();
    var builtCount  = 0;

    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      var el      = null;

      if (section.type === 'slider') {
        // renderHeroSlider() is called separately before renderHomepageSections()
        // and already falls back to checking homepage-doc slider slides (priority 3).
        // Calling it again here would cause a double-render, so we just skip.
        continue;

      } else if (section.type === 'categories') {
        var cats = categories || [];
        // Fallback: extract categories from products if no Category docs
        if (!cats.length && featuredProducts && featuredProducts.length) {
          var seen = new Set();
          cats = [];
          featuredProducts.forEach(function (p) {
            if (p.categorySlug && !seen.has(p.categorySlug)) {
              seen.add(p.categorySlug);
              cats.push({
                title:   p.categoryTitle    || p.categorySlug,
                titleEn: p.categoryTitleEn  || p.categorySlug,
                slug:    p.categorySlug,
                image:   p.mainImage || null,
              });
            }
          });
        }
        if (cats.length) el = buildSectionCategories(section, cats, lang);

      } else if (section.type === 'featured') {
        var count = (settings && settings.featuredProductCount) ? settings.featuredProductCount : 4;
        // No fallback to all products — if no featured products are set in Sanity,
        // the section is simply omitted rather than showing unrelated content.
        var prods = (featuredProducts || []).slice(0, count);
        if (prods.length) el = buildSectionFeatured(section, prods, lang);

      } else if (section.type === 'about') {
        el = buildSectionAbout(section, settings, lang);

      } else if (section.type === 'blog') {
        el = buildSectionBlog(section, blogPosts || [], lang);

      } else if (section.type === 'text_image') {
        el = buildSectionTextImage(section, lang);
      }

      if (el) {
        fragment.appendChild(el);
        builtCount++;
      }
    }

    if (!builtCount) return false;

    // Append all sections at once, then reveal the container
    container.appendChild(fragment);
    container.style.display = '';
    container.removeAttribute('aria-hidden');

    // Only NOW hide static fallback sections (dynamic content is ready)
    document.querySelectorAll('[data-static-home-section]').forEach(function (staticEl) {
      staticEl.style.display = 'none';
    });

    // Re-init dynamic interactions
    if (typeof window.initCart === 'function') window.initCart();
    if (typeof window.initProductModal === 'function') window.initProductModal();
    reinitScrollReveal();
    reinitPopularSlider();

    return true;

  } catch (err) {
    console.warn('Homepage sections render failed, keeping static HTML:', err);
    return false;
  }
}

// ── Init on DOM ready ────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  // Safety timeout — always reveal the page after 5 s even if fetches hang
  var revealTimer = setTimeout(revealPage, 5000);

  var path = window.location.pathname;
  // Match both clean URLs (/products/, /products/index.html) and old .html paths
  var isProducts = /\/products(\/|\.html)/.test(path) || document.querySelector('.filter-bar') !== null;
  var isAbout    = /\/about(\/|\.html)/.test(path)    || document.querySelector('.about-hero') !== null;
  var isContact  = /\/contact(\/|\.html)/.test(path)  || document.querySelector('.contact-layout') !== null;
  var isHome     = !isProducts && !isAbout && !isContact;

  // Collect all promises so we know when everything is done
  var renders = [];

  // Global — runs on every page
  renders.push(renderFooter().catch(function () {}));
  renders.push(renderNavigation().catch(function () {}));

  // Products page only
  if (isProducts) {
    // Set page banner from Sanity "products" page document if a heroImage is defined
    renders.push(
      getPage('products').then(function (page) {
        if (page && page.heroImage) {
          var imgUrl = sanityImageUrl(page.heroImage, 1920);
          var banner = document.querySelector('.page-banner');
          if (banner && imgUrl) banner.style.backgroundImage = "url('" + imgUrl + "')";
        }
      }).catch(function () {})
    );
    var urlCat = new URLSearchParams(window.location.search).get('cat') || 'all';
    // Filter bar and grid can fetch in parallel — grid reads ?cat= directly
    renders.push(
      renderFilterBar().then(function () {
        // After bar is built, activate the URL-driven button
        if (urlCat !== 'all') {
          var btn = document.querySelector('.filter-btn[data-filter="' + urlCat + '"]');
          if (btn) {
            document.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
          }
        }
      }).catch(function () {})
    );
    renders.push(renderProductsGrid(urlCat).catch(function () {}));
  }

  // Homepage only
  else if (isHome) {
    renders.push(renderHeroSlider().catch(function () {}));
    renders.push(
      renderHomepageSections().then(function (handled) {
        if (!handled) {
          return Promise.all([
            renderCategoriesGrid().catch(function () {}),
            renderFeaturedProducts().catch(function () {}),
            renderAboutStrip().catch(function () {}),
            renderBlogCards().catch(function () {}),
          ]);
        }
      }).catch(function () {})
    );
  }

  // About page only
  else if (isAbout) {
    renders.push(renderAboutPage().catch(function () {}));
  }

  // Contact page only
  else if (isContact) {
    renders.push(renderContactPage().catch(function () {}));
  }

  // Reveal the page once all renders have settled
  Promise.all(renders).then(function () {
    clearTimeout(revealTimer);
    // Double rAF: first frame lets the browser process DOM mutations,
    // second frame guarantees a paint cycle before the fade-in begins.
    requestAnimationFrame(function () {
      requestAnimationFrame(revealPage);
    });
  });
});
