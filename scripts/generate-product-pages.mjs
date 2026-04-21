/**
 * generate-product-pages.mjs
 *
 * Fetches every published product from Sanity and writes a static
 * /products/{slug}/index.html for each one.
 *
 * Each generated page:
 *   • Contains hardcoded OG / Twitter meta tags (product name, image, URL)
 *   • Immediately redirects the visitor's browser to /products/?id={slug}
 *     so the interactive product page opens with the correct product selected
 *   • Is invisible to users (< 1 s redirect) but readable by WhatsApp / social
 *     scrapers that don't execute JavaScript
 *
 * Run:
 *   node scripts/generate-product-pages.mjs
 *
 * Prerequisites: Node 18+ (built-in fetch).
 * No npm install required — zero external dependencies.
 */

import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Config ────────────────────────────────────────────
const SANITY_PROJECT_ID = 'uemjhi9v';
const SANITY_DATASET    = 'production';
const SANITY_API_VER    = '2025-01-01';
const SITE_BASE         = 'https://ceramisia.com';
const IMAGE_BASE        = 'https://cdn.sanity.io';

// Output folder — root of the static site (same level as products/, index.html, etc.)
const __dir  = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '..');
const OUT    = join(ROOT, 'products');

// ── Sanity image URL builder (mirrors sanity.js logic) ─
function sanityImageUrl(ref, width = 1200) {
  if (!ref || !ref.asset || !ref.asset._ref) return '';
  const parts = ref.asset._ref.replace('image-', '').split('-');
  const ext   = parts[parts.length - 1];
  const dims  = parts[parts.length - 2];
  const id    = parts.slice(0, parts.length - 2).join('-');
  const base  = `${IMAGE_BASE}/images/${SANITY_PROJECT_ID}/${SANITY_DATASET}/${id}-${dims}.${ext}`;
  return `${base}?w=${width}&fit=max&auto=format&q=80`;
}

// ── Portable Text → plain text (minimal, enough for og:description) ──
function blocksToText(blocks) {
  if (!Array.isArray(blocks) || !blocks.length) return '';
  return blocks
    .filter(b => b && b._type === 'block')
    .map(b => (b.children || []).map(c => c.text || '').join(''))
    .filter(s => s.length > 0)
    .join(' ')
    .trim();
}

// ── Sanitise Sanity slug → safe filesystem/URL path segment ─
// Removes characters that are invalid in file names on Windows (and unusual
// on Linux), while keeping spaces (they become %20 in URLs, which GitHub
// Pages resolves correctly to the folder).
function safeSlug(slug) {
  return (slug || '')
    .trim()
    .replace(/[<>:"\\|?*\/\x00-\x1f]/g, '') // strip filesystem-invalid chars
    .trim();
}

// ── Escape HTML attribute values ───────────────────────
function esc(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Fetch all products from Sanity ────────────────────
async function fetchProducts() {
  const query = `*[_type == "product" && defined(slug.current)] | order(order asc) {
    _id,
    name,
    nameEn,
    "slug": slug.current,
    mainImage,
    description[] { _type, _key, style, children[]{ _key, _type, text } },
    descriptionEn[] { _type, _key, style, children[]{ _key, _type, text } }
  }`;

  const params = new URLSearchParams({ query });
  const url    = `https://${SANITY_PROJECT_ID}.api.sanity.io/v${SANITY_API_VER}/data/query/${SANITY_DATASET}?${params}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sanity fetch failed: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return json.result || [];
}

// ── Generate one static HTML page per product ─────────
function buildHtml(product, dirSlug) {
  const slug      = product.slug;   // original Sanity slug — used for ?id= redirect target
  const safe      = dirSlug || safeSlug(slug); // sanitised — used for folder path & og:url
  const name      = product.name || product.nameEn || 'Ceramisia Product';
  const nameEn    = product.nameEn || name;

  // Description: prefer English for social previews (wider audience), fall back to Georgian
  const descRaw   = blocksToText(product.descriptionEn) || blocksToText(product.description);
  const desc      = descRaw.replace(/\s+/g, ' ').slice(0, 160).trim()
                    || 'Handmade ceramic art from Ceramisia – Tbilisi, Georgia.';

  const imgUrl    = sanityImageUrl(product.mainImage, 1200);
  const pageUrl   = `${SITE_BASE}/products/${encodeURIComponent(safe)}/`;
  const targetUrl = `${SITE_BASE}/products/?id=${encodeURIComponent(slug)}`;

  // og:image fallback if product has no image
  const ogImage   = imgUrl || `${SITE_BASE}/images/og-image-v2.png`;

  return `<!DOCTYPE html>
<html lang="ka">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(name)} – Ceramisia</title>
  <meta name="description" content="${esc(desc)}">

  <!-- Canonical: self-referential so WhatsApp/social scrapers use this page's OG tags -->
  <link rel="canonical" href="${esc(pageUrl)}">

  <!-- Open Graph — hardcoded per-product for WhatsApp / social scrapers -->
  <meta property="og:type"        content="product">
  <meta property="og:site_name"   content="Ceramisia">
  <meta property="og:url"         content="${esc(pageUrl)}">
  <meta property="og:title"       content="${esc(name)} – Ceramisia">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image"       content="${esc(ogImage)}">
  <meta property="og:image:width"  content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale"      content="ka_GE">
  <meta property="og:locale:alternate" content="en_US">

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${esc(nameEn)} – Ceramisia">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image"       content="${esc(ogImage)}">

  <!-- Redirect visitors immediately to the interactive page -->
  <meta http-equiv="refresh" content="0; url=${esc(targetUrl)}">
</head>
<body>
  <p>
    <a href="${esc(targetUrl)}">${esc(name)} – Ceramisia</a>
  </p>
  <script>window.location.replace(${JSON.stringify(targetUrl)});</script>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────
async function main() {
  console.log('Fetching products from Sanity…');
  const products = await fetchProducts();

  if (!products.length) {
    console.warn('No published products found. Nothing to generate.');
    return;
  }

  console.log(`Found ${products.length} product(s). Generating static pages…\n`);

  let ok = 0;
  let skip = 0;

  for (const product of products) {
    const slug = product.slug;
    if (!slug) {
      console.warn(`  ⚠ Skipped product "${product.name || product._id}" — no slug`);
      skip++;
      continue;
    }

    const safe = safeSlug(slug);
    if (!safe) {
      console.warn(`  ⚠ Skipped product "${product.name || product._id}" — slug "${slug}" produces an empty safe name after sanitisation`);
      skip++;
      continue;
    }

    if (safe !== slug) {
      console.log(`  ℹ  slug sanitised: "${slug}" → "${safe}"`);
    }

    const dir  = join(OUT, safe);
    const file = join(dir, 'index.html');

    await mkdir(dir, { recursive: true });
    await writeFile(file, buildHtml(product, safe), 'utf8');
    console.log(`  ✓ products/${safe}/index.html${safe !== slug ? ` (slug: "${slug}")` : ''}`);
    ok++;
  }

  console.log(`\nDone. ${ok} page(s) generated${skip ? `, ${skip} skipped` : ''}.`);
  console.log(`Output: ${OUT}`);
}

main().catch(err => {
  console.error('\n✗ Failed:', err.message || err);
  process.exit(1);
});
