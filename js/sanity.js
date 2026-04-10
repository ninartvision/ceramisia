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
// Use api.sanity.io (not cdn) so new content appears immediately without cache delay
const CDN_BASE   = `https://${SANITY_PROJECT_ID}.api.sanity.io`;
// Images must always use cdn.sanity.io regardless
const IMAGE_BASE = `https://cdn.sanity.io`;

// ── Image URL builder (no extra dependencies) ─────────
export function sanityImageUrl(ref, width) {
  if (!ref || !ref.asset || !ref.asset._ref) return '';
  const parts = ref.asset._ref.replace('image-', '').split('-');
  const ext   = parts[parts.length - 1];
  const dims  = parts[parts.length - 2];
  const id    = parts.slice(0, parts.length - 2).join('-');
  let url = `${IMAGE_BASE}/images/${SANITY_PROJECT_ID}/${SANITY_DATASET}/${id}-${dims}.${ext}`;
  if (width) url += `?w=${width}&fit=max&auto=format`;
  return url;
}

// ── GROQ query runner ─────────────────────────────────
export async function sanityFetch(query, params = {}) {
  const searchParams = new URLSearchParams({ query });
  for (const [key, val] of Object.entries(params)) {
    searchParams.set(`$${key}`, JSON.stringify(val));
  }
  const url = `${CDN_BASE}/v${SANITY_API_VER}/data/query/${SANITY_DATASET}?${searchParams}`;
  // no-store prevents browser from serving stale cached responses
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Sanity fetch failed: ${res.status}`);
  const json = await res.json();
  return json.result;
}

// ── Ready-made queries ────────────────────────────────

/** Fetch all categories ordered by display order */
export async function getCategories() {
  return sanityFetch(`*[_type == "category"] | order(order asc) {
    _id, title, titleEn, "slug": slug.current, description, descriptionEn, image
  }`);
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

/** Fetch featured products for homepage */
export async function getFeaturedProducts() {
  return sanityFetch(`*[_type == "product" && isFeatured == true && inStock != false] | order(order asc) {
    _id, name, nameEn, "slug": slug.current, mainImage, gallery,
    price, salePrice, badge,
    "categoryTitle": category->title,
    "categoryTitleEn": category->titleEn,
    "categorySlug": category->slug.current
  }`);
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
export async function getPage(slug) {
  return sanityFetch(
    `*[_type == "page" && slug.current == $slug][0] {
      _id, title, titleEn, "slug": slug.current,
      heroImage, heroHeading, heroHeadingEn,
      heroSubtext, heroSubtextEn,
      heroSlides[] {
        _key, image, subtitle, subtitleEn,
        heading, headingEn,
        buttonText, buttonTextEn, buttonLink
      },
      sections[] {
        _key, heading, headingEn, text, textEn, image
      },
      seo
    }`,
    { slug }
  );
}

/** Fetch global site settings */
export async function getSiteSettings() {
  return sanityFetch(`*[_type == "siteSettings"][0] {
    siteTitle, logo, logoDark, favicon,
    homepageTitle, homepageTitleEn,
    homepageDescription, homepageDescriptionEn,
    heroImage, contactEmail, phoneNumber, phoneNumber2,
    address, addressEn, mapEmbedUrl,
    workingHours, workingHoursEn,
    footerText, footerTextEn,
    socialLinks, seo
  }`);
}

/** Fetch navigation menus */
export async function getNavigation() {
  return sanityFetch(`*[_type == "navigation"][0] {
    mainMenu[] { _key, title, titleEn, link, openInNewTab },
    footerLinks[] { _key, title, titleEn, link, openInNewTab },
    footerText, footerTextEn
  }`);
}

/** Fetch latest N blog posts (for homepage cards) */
export async function getBlogPosts(limit = 3) {
  return sanityFetch(
    `*[_type == "blogPost"] | order(publishedAt desc) [0...$limit] {
      _id, title, titleEn, "slug": slug.current,
      publishedAt, image, excerpt, excerptEn, tags
    }`,
    { limit }
  );
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
  getProduct,
  getBlogPosts,
  getBlogPost,
  getPage,
  getSiteSettings,
  getNavigation,
};
