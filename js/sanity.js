/**
 * Ceramisia – Sanity CMS Client
 * Drop-in fetch layer for your vanilla JS site.
 *
 * SETUP:
 * 1. Create a project at sanity.io/manage
 * 2. Replace PROJECT_ID and DATASET below
 * 3. Add your domain to CORS origins in the Sanity dashboard
 * 4. Include this file in your HTML: <script src="js/sanity.js"></script>
 */

const SANITY_PROJECT_ID = 'x08ju18x';
const SANITY_DATASET    = 'production';
const SANITY_API_VER    = '2024-01-01';
const CDN_BASE = `https://${SANITY_PROJECT_ID}.cdn.sanity.io`;

// ── Image URL builder (no extra dependencies) ─────────
function sanityImageUrl(ref, width) {
  if (!ref || !ref.asset || !ref.asset._ref) return '';
  // ref.asset._ref looks like: image-abc123-1200x800-webp
  const parts = ref.asset._ref.replace('image-', '').split('-');
  const id    = parts[0];
  const dims  = parts[1];
  const ext   = parts[2];
  let url = `${CDN_BASE}/images/${SANITY_PROJECT_ID}/${SANITY_DATASET}/${id}-${dims}.${ext}`;
  if (width) url += `?w=${width}&fit=max&auto=format`;
  return url;
}

// ── GROQ query runner ─────────────────────────────────
async function sanityFetch(query, params = {}) {
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

/** Fetch all categories ordered by display order */
async function getCategories() {
  return sanityFetch(`*[_type == "category"] | order(order asc) {
    _id, title, titleEn, "slug": slug.current, description, descriptionEn, image
  }`);
}

/** Fetch products, optionally filtered by category slug */
async function getProducts(categorySlug) {
  const base = `
    _id, name, nameEn, "slug": slug.current, sku, mainImage,
    price, salePrice, badge, isFeatured, inStock,
    additionalPackaging, packagingPrice, variants,
    "categoryTitle": category->title,
    "categoryTitleEn": category->titleEn,
    "categorySlug": category->slug.current
  `;
  if (categorySlug && categorySlug !== 'all') {
    return sanityFetch(
      `*[_type == "product" && category->slug.current == $cat && inStock == true] | order(order asc) { ${base} }`,
      { cat: categorySlug }
    );
  }
  return sanityFetch(
    `*[_type == "product" && inStock == true] | order(order asc) { ${base} }`
  );
}

/** Fetch featured products for homepage */
async function getFeaturedProducts() {
  return sanityFetch(`*[_type == "product" && isFeatured == true && inStock == true] | order(order asc) {
    _id, name, nameEn, "slug": slug.current, mainImage,
    price, salePrice, badge,
    "categoryTitle": category->title,
    "categoryTitleEn": category->titleEn,
    "categorySlug": category->slug.current
  }`);
}

/** Fetch single product by slug (full detail) */
async function getProduct(slug) {
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
async function getPage(slug) {
  return sanityFetch(
    `*[_type == "page" && slug.current == $slug][0] {
      _id, title, titleEn, "slug": slug.current,
      heroImage, heroHeading, heroHeadingEn,
      heroSubtext, heroSubtextEn,
      sections[] {
        _key, heading, headingEn, text, textEn, image
      },
      seo
    }`,
    { slug }
  );
}

/** Fetch global site settings */
async function getSiteSettings() {
  return sanityFetch(`*[_type == "siteSettings"][0] {
    siteTitle, logo, logoDark, favicon,
    homepageTitle, homepageTitleEn,
    homepageDescription, homepageDescriptionEn,
    heroImage, contactEmail, phoneNumber,
    address, addressEn, mapEmbedUrl,
    socialLinks, seo
  }`);
}

/** Fetch navigation menus */
async function getNavigation() {
  return sanityFetch(`*[_type == "navigation"][0] {
    mainMenu[] { _key, title, titleEn, link, openInNewTab },
    footerLinks[] { _key, title, titleEn, link, openInNewTab },
    footerText, footerTextEn
  }`);
}

/** Fetch latest N blog posts (for homepage cards) */
async function getBlogPosts(limit = 3) {
  return sanityFetch(
    `*[_type == "blogPost"] | order(publishedAt desc) [0...$limit] {
      _id, title, titleEn, "slug": slug.current,
      publishedAt, image, excerpt, excerptEn, tags
    }`,
    { limit }
  );
}

/** Fetch a single blog post by slug */
async function getBlogPost(slug) {
  const posts = await sanityFetch(
    `*[_type == "blogPost" && slug.current == $slug][0] {
      _id, title, titleEn, "slug": slug.current,
      publishedAt, image, excerpt, excerptEn,
      body, bodyEn, tags
    }`,
    { slug }
  );
  return posts;
}

// ── Expose globally for vanilla JS usage ──────────────
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
