/**
 * Ceramisia – Sanity CMS Client (ES Module)
 * Fetch layer for your vanilla JS site.
 *
 * SETUP:
 * 1. Add your domain to CORS origins at sanity.io/manage
 * 2. Load via: <script type="module" src="js/sanity-render.js"></script>
 *    (sanity-render.js imports this file automatically)
 */

const SANITY_PROJECT_ID = 'uemjhi9v';
const SANITY_DATASET    = 'production';
const SANITY_API_VER    = '2025-01-01';
// Use the Sanity CDN for GROQ queries — globally distributed, fast TTFB.
// Content is typically fresh within 60 s, which is fine for a ceramics shop.
// The JS-level _cache prevents duplicate in-flight requests within a session.
const CDN_BASE   = `https://${SANITY_PROJECT_ID}.apicdn.sanity.io`;
// Images must always use cdn.sanity.io regardless
const IMAGE_BASE = `https://cdn.sanity.io`;

// ── Image URL builder (no extra dependencies) ─────────
/**
 * Build a Sanity CDN image URL with responsive transforms.
 * - auto=format: serves WebP/AVIF to browsers that support it
 * - q=80: 80% quality — imperceptible difference, ~35% smaller files
 * - fit=max: never upscales, preserves aspect ratio
 */
export function sanityImageUrl(ref, width) {
  if (!ref || !ref.asset || !ref.asset._ref) return '';
  const parts = ref.asset._ref.replace('image-', '').split('-');
  const ext   = parts[parts.length - 1];
  const dims  = parts[parts.length - 2];
  const id    = parts.slice(0, parts.length - 2).join('-');
  let url = `${IMAGE_BASE}/images/${SANITY_PROJECT_ID}/${SANITY_DATASET}/${id}-${dims}.${ext}`;
  const params = width ? `w=${width}&fit=max&auto=format&q=80` : 'auto=format&q=80';
  return url + '?' + params;
}

/**
 * Parse the original image dimensions from a Sanity asset ref.
 * Returns { width, height } or null if unavailable.
 * Used to set explicit width/height on <img> to prevent CLS.
 */
export function sanityImageDimensions(ref) {
  if (!ref || !ref.asset || !ref.asset._ref) return null;
  const parts = ref.asset._ref.replace('image-', '').split('-');
  const dims  = parts[parts.length - 2]; // e.g. "1920x1080"
  const [w, h] = dims.split('x').map(Number);
  if (!w || !h) return null;
  return { width: w, height: h };
}

/**
 * Build a srcset string for responsive images.
 * @param {object} ref     Sanity image reference
 * @param {number[]} widths Array of pixel widths, e.g. [400, 800, 1200]
 * @returns {string}        srcset value ready for <img srcset="...">
 */
export function sanityImageSrcset(ref, widths) {
  return widths.map(function (w) { return sanityImageUrl(ref, w) + ' ' + w + 'w'; }).join(', ');
}

// ── GROQ query runner ─────────────────────────────────
export async function sanityFetch(query, params = {}) {
  const searchParams = new URLSearchParams({ query });
  for (const [key, val] of Object.entries(params)) {
    searchParams.set(`$${key}`, JSON.stringify(val));
  }
  const url = `${CDN_BASE}/v${SANITY_API_VER}/data/query/${SANITY_DATASET}?${searchParams}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sanity fetch failed: ${res.status}`);
  const json = await res.json();
  return json.result;
}

// ── Ready-made queries ────────────────────────────────
// Per-page-load Promise cache — prevents duplicate simultaneous fetches.
// Caching the Promise (not the value) ensures concurrent callers share
// one in-flight network request rather than each firing their own.
const _cache = {};

/**
 * Evict one or all memoized promises from the session cache.
 * Pass a key (e.g. 'featuredProducts') to clear a single entry.
 * Called with no argument it resets everything — useful after a CMS publish
 * when you want fresh data without a full page reload.
 *
 * Available keys: 'featuredProducts', 'categoriesFromProducts',
 *                 'siteSettings', 'navigation', 'homepage', page slugs.
 */
export function clearCache(key) {
  if (key) {
    delete _cache[key];
  } else {
    Object.keys(_cache).forEach(function (k) { delete _cache[k]; });
  }
}

/** Fetch all categories ordered by display order */
export function getCategories() {
  if (!_cache.categories) {
    _cache.categories = sanityFetch(`*[_type == "category"] | order(order asc) {
    _id, title, titleEn, "slug": slug.current, description, descriptionEn, image
  }`);
  }
  return _cache.categories;
}

/**
 * Fetch only categories that are actually referenced by at least one
 * in-stock product — the definitive source for the homepage grid.
 * Result is ordered by the category's own `order` field.
 */
export function getCategoriesFromProducts() {
  if (!_cache.categoriesFromProducts) {
    _cache.categoriesFromProducts = sanityFetch(
      `*[_type == "category" && _id in *[_type == "product" && defined(category) && inStock != false].category._ref] | order(order asc) {
        _id, title, titleEn, "slug": slug.current, image,
        "productCount": count(*[_type == "product" && category._ref == ^._id && inStock != false])
      }`
    );
  }
  return _cache.categoriesFromProducts;
}

/** Fetch products, optionally filtered by category slug */
export async function getProducts(categorySlug) {
  const base = `
    _id, name, nameEn, "slug": slug.current, sku, mainImage, gallery,
    price, salePrice, badge, isFeatured, inStock,
    additionalPackaging, packagingPrice, variants,
    "categoryTitle": category->title,
    "categoryTitleEn": category->titleEn,
    "categorySlug": category->slug.current
  `;
  // inStock != false handles: true → show, false → hide, null/unset → show
  if (categorySlug && categorySlug !== 'all') {
    return sanityFetch(
      `*[_type == "product" && category->slug.current == $cat && inStock != false] | order(order asc) { ${base} }`,
      { cat: categorySlug }
    );
  }
  return sanityFetch(
    `*[_type == "product" && inStock != false] | order(order asc) { ${base} }`
  );
}

/** Fetch products marked isFeatured in Sanity, ordered by display order (order field) */
export function getFeaturedProducts() {
  if (!_cache.featuredProducts) {
    _cache.featuredProducts = sanityFetch(
      `*[_type == "product" && isFeatured == true && inStock != false] | order(order asc) {
        _id, name, nameEn, "slug": slug.current, mainImage, gallery,
        price, salePrice, badge,
        "categoryTitle": category->title,
        "categoryTitleEn": category->titleEn,
        "categorySlug": category->slug.current
      }`
    );
  }
  return _cache.featuredProducts;
}

/** Fetch single product by slug (full detail) */
export async function getProduct(slug) {
  return sanityFetch(
    `*[_type == "product" && slug.current == $slug][0] {
      _id, name, nameEn, "slug": slug.current, sku,
      description, descriptionEn, mainImage, gallery,
      price, salePrice, badge, inStock, isFeatured,
      variants, additionalPackaging, packagingPrice,
      category->{ _id, title, titleEn, "slug": slug.current },
      seo
    }`,
    { slug }
  );
}

/** Fetch page content by slug (home, about, contact) */
export function getPage(slug) {
  var key = 'page_' + slug;
  if (!_cache[key]) {
    _cache[key] = sanityFetch(
      `*[_type == "page" && slug.current == $slug][0] {
      _id, title, titleEn, "slug": slug.current,
      heroImage, heroHeading, heroHeadingEn,
      heroSubtext, heroSubtextEn,
      heroSlides[] {
        _key,
        image { _type, alt, asset { _ref, _type } },
        subtitle, subtitleEn,
        heading, headingEn,
        buttonText, buttonTextEn, buttonLink
      },
      sections[] {
        _key, heading, headingEn, text, textEn, image
      },
      teamMembers[] {
        _key, name, nameEn, role, roleEn, photo
      },
      seo
    }`,
      { slug }
    );
  }
  return _cache[key];
}

/** Fetch global site settings */
export function getSiteSettings() {
  if (!_cache.siteSettings) {
    _cache.siteSettings = sanityFetch(`*[_type == "siteSettings"][0] {
    siteTitle, logo, logoDark, favicon,
    homepageTitle, homepageTitleEn,
    homepageDescription, homepageDescriptionEn,
    heroImage, contactEmail, phoneNumber, phoneNumber2,
    address, addressEn, mapEmbedUrl,
    workingHours, workingHoursEn,
    footerText, footerTextEn,
    copyrightText, copyrightTextEn,
    brandFeatures[] { icon, text, textEn },
    featuredProductCount,
    socialLinks, seo,
    uiStrings {
      addToCart, addToCartEn,
      filterAll, filterAllEn,
      badgeNew, badgeNewEn, badgeSale, badgeSaleEn, badgeBestseller, badgeBestsellerEn,
      loading, loadingEn, noProducts, noProductsEn, loadFailed, loadFailedEn,
      viewAll, viewAllEn, viewAllProducts, viewAllProductsEn,
      viewProducts, viewProductsEn, readMore, readMoreEn, learnMore, learnMoreEn,
      categoriesHeading, categoriesHeadingEn, categoriesLabel, categoriesLabelEn,
      featuredHeading, featuredHeadingEn, featuredLabel, featuredLabelEn,
      aboutLabel, aboutLabelEn, blogHeading, blogHeadingEn, blogLabel, blogLabelEn,
      pageHome, pageHomeEn, pageProducts, pageProductsEn,
      pageAbout, pageAboutEn, pageContact, pageContactEn
    }
  }`);
  }
  return _cache.siteSettings;
}

/** Fetch navigation menus */
export function getNavigation() {
  if (!_cache.navigation) {
    _cache.navigation = sanityFetch(`*[_type == "navigation"][0] {
      mainMenu[] { _key, title, titleEn, link, openInNewTab },
      footerLinks[] { _key, title, titleEn, link, openInNewTab },
      footerText, footerTextEn
    }`);
  }
  return _cache.navigation;
}

/** Fetch homepage sections layout document (includes slider slides) */
export function getHomepage() {
  if (!_cache.homepage) {
    _cache.homepage = sanityFetch(`*[_type == "homepage"][0] {
    sections[] {
      _key, type,
      heading, headingEn, label, labelEn,
      text, textEn, image,
      buttonText, buttonTextEn, buttonLink,
      slides[] {
        _key,
        image { _type, alt, asset { _ref, _type } },
        subtitle, subtitleEn,
        heading, headingEn,
        buttonText, buttonTextEn, buttonLink
      }
    }
  }`);
  }
  return _cache.homepage;
}

/** Fetch latest N blog posts (for homepage cards) */
export function getBlogPosts(limit = 3) {
  var key = 'blogPosts_' + limit;
  if (!_cache[key]) {
    _cache[key] = sanityFetch(
      `*[_type == "blogPost"] | order(publishedAt desc) [0...$limit] {
        _id, title, titleEn, "slug": slug.current,
        publishedAt, image, excerpt, excerptEn, tags
      }`,
      { limit }
    );
  }
  return _cache[key];
}

/** Fetch a single blog post by slug */
export async function getBlogPost(slug) {
  return sanityFetch(
    `*[_type == "blogPost" && slug.current == $slug][0] {
      _id, title, titleEn, "slug": slug.current,
      publishedAt, image, excerpt, excerptEn,
      body, bodyEn, tags
    }`,
    { slug }
  );
}

// ── Backward-compatible global for non-module scripts ─
window.CeramisiaCMS = {
  sanityFetch,
  sanityImageUrl,
  getCategories,
  getProducts,
  getFeaturedProducts,
  clearCache,
  getProduct,
  getBlogPosts,
  getBlogPost,
  getPage,
  getSiteSettings,
  getNavigation,
};
