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
// Convert a Sanity slug into a clean, URL-safe, lowercase, hyphenated path segment.
// Example: ' Tray "Traces of Time" ' → 'tray-traces-of-time'
// The original Sanity slug is kept separately for the ?id= redirect target.
function safeSlug(slug) {
  return (slug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff\u10d0-\u10ff]+/g, '-') // non-alphanum → hyphen (keeps Georgian/Cyrillic)
    .replace(/-+/g, '-')      // collapse consecutive hyphens
    .replace(/^-|-$/g, '');   // strip leading/trailing hyphens
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

  // ── Pass 1: assign a unique safe slug to every product ──────────────────
  // Products that share the same base safe slug get -2, -3, … appended to
  // the second, third, … occurrence (the first keeps the base slug).
  const usedSlugs = new Map(); // safe slug → count of products that map to it

  // First, count how many products each base slug is claimed by
  const baseSlugFor = new Map(); // product._id → base safe slug
  for (const product of products) {
    const slug = product.slug;
    if (!slug) continue;
    const base = safeSlug(slug);
    if (!base) continue;
    baseSlugFor.set(product._id, base);
    usedSlugs.set(base, (usedSlugs.get(base) || 0) + 1);
  }

  // Now assign the final unique slug per product
  const seenBase = new Map();   // base slug → how many have been assigned so far
  const finalSlug = new Map();  // product._id → final unique safe slug

  for (const product of products) {
    const slug = product.slug;
    if (!slug) continue;
    const base = baseSlugFor.get(product._id);
    if (!base) continue;

    const count = usedSlugs.get(base) || 1;
    const seen  = seenBase.get(base) || 0;

    let unique;
    if (count === 1 || seen === 0) {
      // No collision, or first occurrence → keep base slug
      unique = base;
    } else {
      // Subsequent occurrence → append -2, -3, …
      unique = `${base}-${seen + 1}`;
    }

    finalSlug.set(product._id, unique);
    seenBase.set(base, seen + 1);
  }

  // ── Pass 2: write one HTML file per product ─────────────────────────────
  let ok = 0;
  let skip = 0;

  for (const product of products) {
    const slug = product.slug;
    if (!slug) {
      console.warn(`  ⚠ Skipped product "${product.name || product._id}" — no slug`);
      skip++;
      continue;
    }

    const safe = finalSlug.get(product._id);
    if (!safe) {
      console.warn(`  ⚠ Skipped product "${product.name || product._id}" — slug "${slug}" produces an empty safe name after sanitisation`);
      skip++;
      continue;
    }

    const base = baseSlugFor.get(product._id);
    if (safe !== slug)   console.log(`  ℹ  slug sanitised: "${slug}" → "${safe}"`);
    else if (safe !== base) console.log(`  ℹ  slug deduplicated: "${base}" → "${safe}"`);

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
