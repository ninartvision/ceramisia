/**
 * Ceramisia – Homepage Renderer (ES Module)
 * Renders hero slider, about strip, and footer from Sanity CMS.
 * Static HTML remains as fallback if Sanity data is empty.
 */

import { sanityImageUrl, getPage, getSiteSettings } from './sanity.js';

const LANG_KEY = 'ceramisia_lang';
function getLang() { return localStorage.getItem(LANG_KEY) || 'ge'; }
function esc(str) { if (!str) return ''; var el = document.createElement('span'); el.textContent = str; return el.innerHTML; }

// ── Hero Slider ──────────────────────────────────────
export async function renderHeroSlider() {
  var container = document.getElementById('slidesContainer');
  var dotsWrap  = document.getElementById('sliderDots');
  if (!container) return;

  try {
    var page = await getPage('home');
    if (!page || !page.heroSlides || !page.heroSlides.length) return; // keep static

    var lang   = getLang();
    var slides = page.heroSlides;

    container.innerHTML = '';
    if (dotsWrap) dotsWrap.innerHTML = '';

    slides.forEach(function (s, i) {
      var imgUrl   = sanityImageUrl(s.image, 1920);
      var subtitle = lang === 'ge' ? (s.subtitle || '') : (s.subtitleEn || s.subtitle || '');
      var heading  = lang === 'ge' ? (s.heading || '') : (s.headingEn || s.heading || '');
      var btnText  = lang === 'ge' ? (s.buttonText || '') : (s.buttonTextEn || s.buttonText || '');
      var btnLink  = s.buttonLink || 'products.html';

      var slide = document.createElement('div');
      slide.className = 'slide' + (i === 0 ? ' active' : '');
      if (imgUrl) slide.style.backgroundImage = "url('" + esc(imgUrl) + "')";

      slide.innerHTML =
        '<div class="slide-overlay"></div>' +
        '<div class="slide-content">' +
          (subtitle ? '<p class="slide-subtitle" data-ge="' + esc(s.subtitle || '') + '" data-en="' + esc(s.subtitleEn || '') + '">' + esc(subtitle) + '</p>' : '') +
          '<h1 class="slide-title" data-ge="' + esc(s.heading || '') + '" data-en="' + esc(s.headingEn || '') + '">' + esc(heading) + '</h1>' +
          (btnText ? '<a href="' + esc(btnLink) + '" class="btn btn-light" data-ge="' + esc(s.buttonText || '') + '" data-en="' + esc(s.buttonTextEn || '') + '">' + esc(btnText) + '</a>' : '') +
        '</div>';

      container.appendChild(slide);

      // Dot
      if (dotsWrap) {
        var dot = document.createElement('button');
        dot.className = 'dot' + (i === 0 ? ' active' : '');
        dot.dataset.index = i;
        dot.setAttribute('aria-label', 'Slide ' + (i + 1));
        dotsWrap.appendChild(dot);
      }
    });

    // Re-init slider if main.js exposes it
    if (typeof window.initHeroSlider === 'function') window.initHeroSlider();

  } catch (err) {
    console.warn('Hero slider fetch failed, keeping static HTML:', err);
  }
}

// ── About Strip (homepage) ──────────────────────────
export async function renderAboutStrip() {
  var section = document.querySelector('.about-strip');
  if (!section) return;

  try {
    var page = await getPage('home');
    if (!page || !page.sections || !page.sections.length) return;

    // Use the first section as "about strip"
    var s    = page.sections[0];
    var lang = getLang();

    var heading = lang === 'ge' ? (s.heading || '') : (s.headingEn || s.heading || '');
    var imgUrl  = sanityImageUrl(s.image, 800);

    var textEl = section.querySelector('.about-strip-text');
    if (textEl) {
      var h2 = textEl.querySelector('h2');
      var p  = textEl.querySelector('p');
      if (h2 && heading) {
        h2.dataset.ge = s.heading || '';
        h2.dataset.en = s.headingEn || '';
        h2.textContent = heading;
      }
      // Portable text — just use the first block's text for plain rendering
      if (p && s.text) {
        var geText = blocksToText(s.text);
        var enText = blocksToText(s.textEn);
        p.dataset.ge = geText;
        p.dataset.en = enText || geText;
        p.textContent = lang === 'ge' ? geText : (enText || geText);
      }
    }

    if (imgUrl) {
      var img = section.querySelector('.about-strip-image img');
      if (img) img.src = imgUrl;
    }

  } catch (err) {
    console.warn('About strip fetch failed, keeping static HTML:', err);
  }
}

// ── Render Footer from Site Settings ────────────────
export async function renderFooter() {
  try {
    var settings = await getSiteSettings();
    if (!settings) return;

    var lang = getLang();

    // Footer tagline
    var tagline = document.querySelector('.footer-about p');
    if (tagline && (settings.footerText || settings.footerTextEn)) {
      tagline.dataset.ge = settings.footerText || '';
      tagline.dataset.en = settings.footerTextEn || '';
      tagline.textContent = lang === 'ge'
        ? (settings.footerText || tagline.textContent)
        : (settings.footerTextEn || tagline.textContent);
    }

    // Footer logo
    if (settings.logo) {
      var logoUrl = sanityImageUrl(settings.logo, 200);
      if (logoUrl) {
        document.querySelectorAll('.footer-logo').forEach(function (img) { img.src = logoUrl; });
      }
    }

    // Header logo
    if (settings.logo) {
      var headerLogoUrl = sanityImageUrl(settings.logo, 200);
      if (headerLogoUrl) {
        document.querySelectorAll('.logo-img').forEach(function (img) { img.src = headerLogoUrl; });
      }
    }

    // Footer contact info
    var footerContact = document.querySelector('.footer-contact ul');
    if (footerContact) {
      // Address
      var addressLink = footerContact.querySelector('a[data-ge]');
      if (addressLink && settings.address) {
        addressLink.dataset.ge = settings.address || '';
        addressLink.dataset.en = settings.addressEn || '';
        addressLink.textContent = lang === 'ge' ? settings.address : (settings.addressEn || settings.address);
        if (settings.mapEmbedUrl) addressLink.href = settings.mapEmbedUrl;
      }

      // Email
      var emailLink = footerContact.querySelector('a[href^="mailto:"]');
      if (emailLink && settings.contactEmail) {
        emailLink.href = 'mailto:' + settings.contactEmail;
        emailLink.textContent = settings.contactEmail;
      }
    }

    // Footer social links
    if (settings.socialLinks) {
      var sl = settings.socialLinks;
      document.querySelectorAll('.social-links').forEach(function (wrap) {
        var fb = wrap.querySelector('a[aria-label="Facebook"]');
        var ig = wrap.querySelector('a[aria-label="Instagram"]');
        if (fb && sl.facebook) fb.href = sl.facebook;
        if (ig && sl.instagram) ig.href = sl.instagram;
      });
    }

  } catch (err) {
    console.warn('Footer settings fetch failed, keeping static HTML:', err);
  }
}

// ── Portable Text → Plain Text helper ───────────────
function blocksToText(blocks) {
  if (!blocks || !Array.isArray(blocks)) return '';
  return blocks
    .filter(function (b) { return b._type === 'block'; })
    .map(function (b) {
      return (b.children || []).map(function (c) { return c.text || ''; }).join('');
    })
    .join('\n\n');
}
