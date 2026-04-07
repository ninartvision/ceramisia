/**
 * Convert hero PNGs to WebP + resize logo
 * Run: node scripts/convert-images.mjs
 */
import sharp from 'sharp';
import { readdir } from 'fs/promises';
import { join } from 'path';

const IMAGES = 'images';

// Hero covers: resize to 1920w, quality 80 → ~150-250KB each
const covers = ['cover/cover1.png', 'cover/cover2.png', 'cover/cover3.png'];
for (const file of covers) {
  const out = file.replace('.png', '.webp');
  await sharp(join(IMAGES, file))
    .resize(1920, null, { withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(join(IMAGES, out));
  const info = await sharp(join(IMAGES, out)).metadata();
  console.log(`✓ ${out} → ${Math.round(info.size / 1024)}KB (${info.width}×${info.height})`);
}

// Logo: convert to WebP
await sharp(join(IMAGES, 'logo.png'))
  .webp({ quality: 90, lossless: false })
  .toFile(join(IMAGES, 'logo.webp'));
const logoInfo = await sharp(join(IMAGES, 'logo.webp')).metadata();
console.log(`✓ logo.webp → ${Math.round(logoInfo.size / 1024)}KB`);

// Also delete root-level duplicate cover PNGs if they exist
const rootImages = await readdir(IMAGES);
const dupes = rootImages.filter(f => /^cover\d\.png$/.test(f));
if (dupes.length) {
  console.log(`\nFound ${dupes.length} duplicate cover PNGs in images/ root: ${dupes.join(', ')}`);
  console.log('You can safely delete these — the HTML references images/cover/coverX.webp');
}

console.log('\nDone! Now update HTML to use .webp instead of .png');
