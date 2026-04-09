/**
 * Ceramisia – About Page Renderer (ES Module)
 * Populates the about page hero, values, and team from Sanity CMS.
 * Static HTML remains as fallback.
 */

import { sanityImageUrl, getPage } from './sanity.js';

const LANG_KEY = 'ceramisia_lang';
function getLang() { return localStorage.getItem(LANG_KEY) || 'ge'; }
function esc(str) { if (!str) return ''; var el = document.createElement('span'); el.textContent = str; return el.innerHTML; }

export async function renderAboutPage() {
  // Only run on about page
  if (!document.querySelector('.about-hero')) return;

  try {
    var page = await getPage('about');
    if (!page) return;

    var lang = getLang();

    // ── Hero section ─────────────────────────────
    var heading = lang === 'ge' ? (page.heroHeading || '') : (page.heroHeadingEn || page.heroHeading || '');
    var subtext = lang === 'ge' ? (page.heroSubtext || '') : (page.heroSubtextEn || page.heroSubtext || '');

    var h1 = document.querySelector('.about-hero-text h1');
    if (h1 && heading) {
      h1.dataset.ge = page.heroHeading || '';
      h1.dataset.en = page.heroHeadingEn || '';
      h1.textContent = heading;
    }

    var p = document.querySelector('.about-hero-text > p');
    if (p && subtext) {
      p.dataset.ge = page.heroSubtext || '';
      p.dataset.en = page.heroSubtextEn || '';
      p.textContent = subtext;
    }

    // Hero image
    if (page.heroImage) {
      var imgUrl = sanityImageUrl(page.heroImage, 800);
      if (imgUrl) {
        var heroImg = document.querySelector('.about-hero-image img');
        if (heroImg) heroImg.src = imgUrl;
      }
    }

    // ── Content Sections (values, team, etc.) ────
    if (page.sections && page.sections.length) {
      renderAboutSections(page.sections, lang);
    }

  } catch (err) {
    console.warn('About page fetch failed, keeping static HTML:', err);
  }
}

function renderAboutSections(sections, lang) {
  // Map sections by index to known page areas
  // Section 0 → Values heading, Section 1+ → any additional content
  var valuesHeader = document.querySelector('.about-values')
    ? document.querySelector('.about-values').closest('.section').querySelector('.section-header')
    : null;

  sections.forEach(function (s, i) {
    // Try to update section headers that match
    var heading = lang === 'ge' ? (s.heading || '') : (s.headingEn || s.heading || '');

    if (i === 0 && valuesHeader) {
      var h2 = valuesHeader.querySelector('h2');
      if (h2 && heading) {
        h2.dataset.ge = s.heading || '';
        h2.dataset.en = s.headingEn || '';
        h2.textContent = heading;
      }
    }
  });
}
