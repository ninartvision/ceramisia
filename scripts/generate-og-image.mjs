#!/usr/bin/env node
/**
 * Generate OG image (1200×630) for Ceramisia brand.
 * Uses sharp to composite an SVG design + the logo into a final PNG.
 *
 * Run:  node scripts/generate-og-image.mjs
 */

import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const W = 1200;
const H = 630;

/* ── Brand palette ───────────────────────────── */
const CLR_BG      = '#FDFAF6';
const CLR_BG_ALT  = '#F5F0E8';
const CLR_RED     = '#8C1C13';
const CLR_RED_D   = '#6B1510';
const CLR_GOLD    = '#C49A5A';
const CLR_TEXT    = '#351f1f';
const CLR_MUTED   = '#4a3737';

/* ── SVG artwork ─────────────────────────────── */
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- Warm radial glow behind centre -->
    <radialGradient id="glow" cx="50%" cy="48%" r="55%">
      <stop offset="0%"   stop-color="${CLR_BG}" />
      <stop offset="60%"  stop-color="${CLR_BG_ALT}" />
      <stop offset="100%" stop-color="#EBE3D6" />
    </radialGradient>

    <!-- Gold gradient for decorative strokes -->
    <linearGradient id="goldLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="${CLR_GOLD}" stop-opacity="0" />
      <stop offset="15%"  stop-color="${CLR_GOLD}" stop-opacity="0.7" />
      <stop offset="85%"  stop-color="${CLR_GOLD}" stop-opacity="0.7" />
      <stop offset="100%" stop-color="${CLR_GOLD}" stop-opacity="0" />
    </linearGradient>

    <!-- Subtle noise texture -->
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise"/>
      <feColorMatrix type="saturate" values="0" in="noise" result="mono"/>
      <feBlend in="SourceGraphic" in2="mono" mode="multiply" result="blend"/>
      <feComponentTransfer in="blend">
        <feFuncA type="linear" slope="0.06"/>
      </feComponentTransfer>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#glow)" />

  <!-- Subtle grain overlay -->
  <rect width="${W}" height="${H}" fill="${CLR_BG_ALT}" opacity="0.3" filter="url(#grain)" />

  <!-- Decorative border frame -->
  <rect x="32" y="32" width="${W - 64}" height="${H - 64}"
        rx="3" fill="none" stroke="${CLR_GOLD}" stroke-opacity="0.25" stroke-width="1" />
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}"
        rx="2" fill="none" stroke="${CLR_GOLD}" stroke-opacity="0.12" stroke-width="0.5" />

  <!-- Top decorative line -->
  <line x1="200" y1="130" x2="1000" y2="130" stroke="url(#goldLine)" stroke-width="1" />

  <!-- Small diamond accent top centre -->
  <g transform="translate(600, 130) rotate(45)" opacity="0.5">
    <rect x="-4" y="-4" width="8" height="8" fill="${CLR_GOLD}" />
  </g>

  <!-- Bottom decorative line -->
  <line x1="200" y1="500" x2="1000" y2="500" stroke="url(#goldLine)" stroke-width="1" />

  <!-- Small diamond accent bottom centre -->
  <g transform="translate(600, 500) rotate(45)" opacity="0.5">
    <rect x="-4" y="-4" width="8" height="8" fill="${CLR_GOLD}" />
  </g>

  <!-- Corner accents (top-left, top-right, bottom-left, bottom-right) -->
  <g stroke="${CLR_GOLD}" stroke-opacity="0.35" stroke-width="1" fill="none">
    <path d="M 60,70 L 60,55 L 75,55" />
    <path d="M ${W-60},70 L ${W-60},55 L ${W-75},55" />
    <path d="M 60,${H-70} L 60,${H-55} L 75,${H-55}" />
    <path d="M ${W-60},${H-70} L ${W-60},${H-55} L ${W-75},${H-55}" />
  </g>

  <!-- Decorative side dots -->
  <circle cx="65" cy="${H / 2}" r="2" fill="${CLR_GOLD}" opacity="0.3" />
  <circle cx="65" cy="${H / 2 - 20}" r="1.2" fill="${CLR_GOLD}" opacity="0.2" />
  <circle cx="65" cy="${H / 2 + 20}" r="1.2" fill="${CLR_GOLD}" opacity="0.2" />

  <circle cx="${W - 65}" cy="${H / 2}" r="2" fill="${CLR_GOLD}" opacity="0.3" />
  <circle cx="${W - 65}" cy="${H / 2 - 20}" r="1.2" fill="${CLR_GOLD}" opacity="0.2" />
  <circle cx="${W - 65}" cy="${H / 2 + 20}" r="1.2" fill="${CLR_GOLD}" opacity="0.2" />

  <!-- ─── LOGO placeholder (composited later by sharp) ─── -->
  <!-- logo is overlaid at y≈160, centred -->

  <!-- Brand name -->
  <text x="600" y="340" text-anchor="middle"
        font-family="'Cormorant Garamond', 'Georgia', serif"
        font-size="72" font-weight="400" letter-spacing="6"
        fill="${CLR_TEXT}">
    Ceramisia
  </text>

  <!-- Red accent underline below brand name -->
  <line x1="480" y1="358" x2="720" y2="358"
        stroke="${CLR_RED}" stroke-width="2" stroke-opacity="0.6" />

  <!-- Tagline (Georgian) -->
  <text x="600" y="400" text-anchor="middle"
        font-family="'Noto Serif Georgian', 'Georgia', serif"
        font-size="22" font-weight="400" letter-spacing="3"
        fill="${CLR_MUTED}">
    ხელნაკეთი კერამიკა
  </text>

  <!-- Sub-tagline (English) -->
  <text x="600" y="440" text-anchor="middle"
        font-family="'Inter', 'Helvetica Neue', sans-serif"
        font-size="13" font-weight="500" letter-spacing="5"
        text-transform="uppercase"
        fill="${CLR_GOLD}" opacity="0.8">
    HANDMADE CERAMICS · GEORGIA
  </text>

  <!-- Small decorative element below tagline -->
  <g transform="translate(600, 470)" opacity="0.4">
    <line x1="-30" y1="0" x2="-8" y2="0" stroke="${CLR_GOLD}" stroke-width="1" />
    <circle cx="0" cy="0" r="2.5" fill="none" stroke="${CLR_GOLD}" stroke-width="0.8" />
    <line x1="8" y1="0" x2="30" y2="0" stroke="${CLR_GOLD}" stroke-width="1" />
  </g>
</svg>`;

/* ── Build image ─────────────────────────────── */
async function generate() {
  // 1. Render the SVG base
  const base = sharp(Buffer.from(svg)).resize(W, H).png();

  // 2. Prepare the logo — resize to fit nicely
  const logoSize = 100;
  const logo = await sharp(resolve(ROOT, 'images/logo.webp'))
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // 3. Composite logo onto the SVG base
  const output = await base
    .composite([
      {
        input: logo,
        left: Math.round((W - logoSize) / 2),
        top: 165,
        blend: 'over',
      },
    ])
    .png({ quality: 90, compressionLevel: 6 })
    .toFile(resolve(ROOT, 'images/og-image.png'));

  console.log(`✓ og-image.png created (${output.width}×${output.height}, ${(output.size / 1024).toFixed(1)} KB)`);
}

generate().catch((err) => {
  console.error('Error generating OG image:', err);
  process.exit(1);
});
