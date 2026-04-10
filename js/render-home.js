/**
 * Ceramisia – Homepage Renderer (ES Module)
 * Renders hero slider, about strip, and footer from Sanity CMS.
 * Static HTML remains as fallback if Sanity data is empty.
 */

import { sanityImageUrl, getPage, getHomepage, getSiteSettings, getNavigation, getCategoriesFromProducts } from './sanity.js';

const LANG_KEY = 'ceramisia_lang';
function getLang() { return localStorage.getItem(LANG_KEY) || 'ge'; }
function esc(str) { if (!str) return ''; var el = document.createElement('span'); el.textContent = str; return el.innerHTML; }

// SVG path data for brand strip icons (keyed by icon id from siteSettings)
var BRAND_ICONS = {
  shield:  '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  clock:   '<circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>',
  heart:   '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  gift:    '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  truck:   '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  star:    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
};

// ── Hero Slider ──────────────────────────────────────
/**
 * Render the homepage hero carousel from Sanity data.
 *
 * Priority order:
 *  1. `slidesOverride` — slides array passed directly by the caller
 *     (used when sanity-render.js processes a homepage "slider" section
 *      that already has embedded slide data).
 *  2. Page document — fetches the "home" page and reads `heroSlides`.
 *  3. Homepage layout document — looks for the first `slider` section
 *     whose `slides[]` array is non-empty.
 *  4. Static HTML fallback — if all above fail, the hardcoded HTML
 *     slides already in index.html are kept and the carousel is
 *     (re-)initialised on them.
 */
export async function renderHeroSlider(slidesOverride) {
  var container = document.getElementById('slidesContainer');
  var dotsWrap  = document.getElementById('sliderDots');
  if (!container) return;

  try {
    var slides = null;

    // ── 1. Direct override from caller ──────────────
    if (Array.isArray(slidesOverride) && slidesOverride.length) {
      slides = slidesOverride;
    }

    // ── 2. Page document heroSlides ──────────────────
    if (!slides) {
      var page = await getPage('home');
      if (page && page.heroSlides && page.heroSlides.length) {
        slides = page.heroSlides;
      }
    }

    // ── 3. Homepage layout document slider section ───
    if (!slides) {
      var homepage = await getHomepage();
      if (homepage && Array.isArray(homepage.sections)) {
        var sliderSection = homepage.sections.find(function (s) {
          return s.type === 'slider' && Array.isArray(s.slides) && s.slides.length;
        });
        if (sliderSection) slides = sliderSection.slides;
      }
    }

    // ── 4. Fallback: keep static HTML, just re-init ──
    if (!slides || !slides.length) {
      if (typeof window.initHeroSlider === 'function') window.initHeroSlider();
      return;
    }

    // ── Build DOM ────────────────────────────────────
    var lang = getLang();

    container.innerHTML = '';
    if (dotsWrap) dotsWrap.innerHTML = '';

    slides.forEach(function (s, i) {
      var imgUrl   = sanityImageUrl(s.image, 1920);
      var subtitle = lang === 'ge' ? (s.subtitle || '') : (s.subtitleEn || s.subtitle || '');
      var heading  = lang === 'ge' ? (s.heading || '') : (s.headingEn || s.heading || '');
      var btnText  = lang === 'ge' ? (s.buttonText || '') : (s.buttonTextEn || s.buttonText || '');
      var btnLink  = s.buttonLink || 'products.html';
      // Sanitise link: only allow relative paths and http/https URLs
      var safeBtnLink = /^(https?:\/\/|\/|[a-zA-Z0-9_-]+\.[a-zA-Z])/.test(btnLink)
        ? btnLink : 'products.html';

      var slide = document.createElement('div');
      slide.className = 'slide' + (i === 0 ? ' active' : '');
      if (imgUrl) slide.style.backgroundImage = "url('" + esc(imgUrl) + "')";

      // Screen-reader text for the background image
      var imgAlt = (s.image && s.image.alt) ? s.image.alt : (heading || '');

      slide.innerHTML =
        '<div class="slide-overlay"></div>' +
        (imgAlt ? '<span class="sr-only">' + esc(imgAlt) + '</span>' : '') +
        '<div class="slide-content">' +
          (subtitle
            ? '<p class="slide-subtitle" data-ge="' + esc(s.subtitle || '') + '" data-en="' + esc(s.subtitleEn || '') + '">' + esc(subtitle) + '</p>'
            : '') +
          '<h1 class="slide-title" data-ge="' + esc(s.heading || '') + '" data-en="' + esc(s.headingEn || '') + '">' + esc(heading) + '</h1>' +
          (btnText
            ? '<a href="' + esc(safeBtnLink) + '" class="btn btn-light" data-ge="' + esc(s.buttonText || '') + '" data-en="' + esc(s.buttonTextEn || '') + '">' + esc(btnText) + '</a>'
            : '') +
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

    // Re-init slider controls with the new slides
    if (typeof window.initHeroSlider === 'function') window.initHeroSlider();

  } catch (err) {
    console.warn('Hero slider fetch failed, keeping static HTML:', err);
    // Still wire up the slider controls on the static HTML
    if (typeof window.initHeroSlider === 'function') window.initHeroSlider();
  }
}

// ── Navigation Menu ───────────────────────────────────
/**
 * Renders the main navigation <ul> from the Sanity navigation document.
 * Maintains data-ge / data-en attributes so the language switcher works.
 * Falls back to the hardcoded HTML if Sanity returns no items.
 */
export async function renderNavigation() {
  var navUl = document.querySelector('.main-nav ul');
  if (!navUl) return;

  try {
    var nav = await getNavigation();
    if (!nav || !nav.mainMenu || !nav.mainMenu.length) return; // keep static HTML

    var lang = getLang();
    var path = window.location.pathname.split('/').pop() || 'index.html';

    navUl.innerHTML = '';

    nav.mainMenu.forEach(function (item) {
      var label = lang === 'ge' ? (item.title || '') : (item.titleEn || item.title || '');
      var li = document.createElement('li');
      var a  = document.createElement('a');

      a.href      = esc(item.link || '#');
      a.dataset.ge = item.title   || '';
      a.dataset.en = item.titleEn || '';
      a.textContent = label;
      if (item.openInNewTab) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }

      // Active state
      var linkFile = (item.link || '').split('/').pop().split('?')[0];
      if (linkFile === path || (path === '' && linkFile === 'index.html')) {
        a.classList.add('active');
      }

      li.appendChild(a);
      navUl.appendChild(li);
    });

    // Re-attach close-on-click for mobile menu NAV links (main.js may not have seen these yet)
    navUl.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        var mainNav = document.getElementById('mainNav');
        var menuTgl = document.getElementById('menuToggle');
        var overlay = document.getElementById('navOverlay');
        if (mainNav) mainNav.classList.remove('open');
        if (menuTgl) { menuTgl.classList.remove('open'); menuTgl.setAttribute('aria-expanded', 'false'); }
        if (overlay) overlay.classList.remove('visible');
        document.body.style.overflow = '';
      });
    });

  } catch (err) {
    console.warn('Navigation fetch failed, keeping static HTML:', err);
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

// ── Render Footer + global CMS-driven content ──────
/**
 * Runs on every page. Fetches site settings, navigation, and active
 * categories in parallel, then applies them to:
 *   • Header / footer logos
 *   • Footer tagline, quick links, categories column, contact info
 *   • Copyright line
 *   • Brand strip (homepage only)
 *   • Social links and WhatsApp FAB button
 *   • Phone numbers
 *   • Default meta description from site settings
 */
export async function renderFooter() {
  try {
    var results = await Promise.all([
      getSiteSettings(),
      getNavigation().catch(function () { return null; }),
      getCategoriesFromProducts().catch(function () { return null; }),
    ]);
    var settings   = results[0];
    var nav        = results[1];
    var categories = results[2];

    if (!settings) return;
    var lang = getLang();

    // ── Logos ───────────────────────────────────────────
    if (settings.logo) {
      var logoUrl = sanityImageUrl(settings.logo, 200);
      if (logoUrl) {
        document.querySelectorAll('.logo-img, .footer-logo').forEach(function (img) { img.src = logoUrl; });
      }
    }

    // ── Footer tagline (under logo) ─────────────────────
    var tagline = document.querySelector('.footer-about p');
    if (tagline && (settings.footerText || settings.footerTextEn)) {
      tagline.dataset.ge = settings.footerText || '';
      tagline.dataset.en = settings.footerTextEn || '';
      tagline.textContent = lang === 'ge'
        ? (settings.footerText || tagline.textContent)
        : (settings.footerTextEn || tagline.textContent);
    }

    // ── Footer quick links (from navigation.footerLinks) ──────
    if (nav && nav.footerLinks && nav.footerLinks.length) {
      var quickUl = null;
      document.querySelectorAll('.footer-col').forEach(function (col) {
        var h4 = col.querySelector('h4');
        if (h4 && (h4.dataset.ge === 'სწრაფი ბმულები' || h4.dataset.en === 'Quick Links')) {
          quickUl = col.querySelector('ul');
        }
      });
      if (quickUl) {
        quickUl.innerHTML = '';
        nav.footerLinks.forEach(function (item) {
          var label = lang === 'ge' ? (item.title || '') : (item.titleEn || item.title || '');
          var li = document.createElement('li');
          var a  = document.createElement('a');
          a.href = esc(item.link || '#');
          a.dataset.ge  = item.title   || '';
          a.dataset.en  = item.titleEn || '';
          a.textContent = label;
          if (item.openInNewTab) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
          li.appendChild(a);
          quickUl.appendChild(li);
        });
      }
    }

    // ── Footer categories column (from Sanity categories) ───
    if (categories && categories.length) {
      var catsUl = null;
      document.querySelectorAll('.footer-col').forEach(function (col) {
        var h4 = col.querySelector('h4');
        if (h4 && (h4.dataset.ge === 'კატეგორიები' || h4.dataset.en === 'Categories')) {
          catsUl = col.querySelector('ul');
        }
      });
      if (catsUl) {
        catsUl.innerHTML = '';
        categories.forEach(function (cat) {
          var label = lang === 'ge' ? (cat.title || '') : (cat.titleEn || cat.title || '');
          var li = document.createElement('li');
          var a  = document.createElement('a');
          a.href = 'products.html?cat=' + esc(cat.slug || '');
          a.dataset.ge  = cat.title   || '';
          a.dataset.en  = cat.titleEn || '';
          a.textContent = label;
          li.appendChild(a);
          catsUl.appendChild(li);
        });
      }
    }

    // ── Footer contact (address, phone, email) ────────────
    var footerContactUl = document.querySelector('.footer-contact ul');
    if (footerContactUl) {
      // Address
      var addressLink = footerContactUl.querySelector('a[data-ge]');
      if (addressLink && settings.address) {
        addressLink.dataset.ge = settings.address || '';
        addressLink.dataset.en = settings.addressEn || '';
        addressLink.textContent = lang === 'ge' ? settings.address : (settings.addressEn || settings.address);
        if (settings.mapEmbedUrl) addressLink.href = settings.mapEmbedUrl;
      }

      // Phone numbers
      var footerPhones = footerContactUl.querySelector('.footer-phones');
      if (footerPhones) {
        var phones = [];
        if (settings.phoneNumber)  phones.push(settings.phoneNumber);
        if (settings.phoneNumber2) phones.push(settings.phoneNumber2);
        if (phones.length) {
          footerPhones.innerHTML = phones.map(function (num) {
            var cleaned = num.replace(/\D/g, '');
            return '<a href="tel:+' + esc(cleaned) + '">' + esc(num) + '</a>';
          }).join('\n');
        }
      }

      // Email
      var emailLink = footerContactUl.querySelector('a[href^="mailto:"]');
      if (emailLink && settings.contactEmail) {
        emailLink.href = 'mailto:' + settings.contactEmail;
        emailLink.textContent = settings.contactEmail;
      }
    }

    // ── Social links — footer, contact page, header ──────
    if (settings.socialLinks) {
      var sl = settings.socialLinks;

      // All .social-links wrappers (footer, contact etc.)
      document.querySelectorAll('.social-links').forEach(function (wrap) {
        if (sl.facebook) { var fb = wrap.querySelector('a[aria-label="Facebook"]');  if (fb) fb.href = sl.facebook; }
        if (sl.instagram) { var ig = wrap.querySelector('a[aria-label="Instagram"]'); if (ig) ig.href = sl.instagram; }
      });

      // FAB floating buttons
      if (sl.whatsapp)  { var fabWa = document.querySelector('.fab-social__item--whatsapp');  if (fabWa) fabWa.href = sl.whatsapp; }
      if (sl.facebook)  { var fabFb = document.querySelector('.fab-social__item--facebook');  if (fabFb) fabFb.href = sl.facebook; }
      if (sl.instagram) { var fabIg = document.querySelector('.fab-social__item--instagram'); if (fabIg) fabIg.href = sl.instagram; }
    }

    // ── Copyright / footer bottom line ─────────────────
    var footerBottom = document.querySelector('.footer-bottom p');
    if (footerBottom && (settings.copyrightText || settings.copyrightTextEn)) {
      footerBottom.dataset.ge = settings.copyrightText   || '';
      footerBottom.dataset.en = settings.copyrightTextEn || '';
      footerBottom.textContent = lang === 'ge'
        ? (settings.copyrightText   || footerBottom.textContent)
        : (settings.copyrightTextEn || footerBottom.textContent);
    }

    // ── Brand strip (homepage only — benign no-op on other pages) ──
    if (settings.brandFeatures && settings.brandFeatures.length) {
      var brandInner = document.querySelector('.brand-strip-inner');
      if (brandInner) {
        brandInner.innerHTML = '';
        settings.brandFeatures.forEach(function (feat) {
          var text    = lang === 'ge' ? (feat.text || '') : (feat.textEn || feat.text || '');
          var iconSvg = BRAND_ICONS[feat.icon] || '';
          var div = document.createElement('div');
          div.className = 'brand-feature';
          div.innerHTML =
            (iconSvg
              ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' + iconSvg + '</svg>'
              : '') +
            '<span data-ge="' + esc(feat.text || '') + '" data-en="' + esc(feat.textEn || '') + '">' + esc(text) + '</span>';
          brandInner.appendChild(div);
        });
      }
    }

    // ── Default meta description from site settings ─────────
    if (settings.homepageDescription || settings.homepageDescriptionEn) {
      var metaDescEl = document.querySelector('meta[name="description"]');
      if (metaDescEl) {
        var desc = lang === 'ge'
          ? (settings.homepageDescription || '')
          : (settings.homepageDescriptionEn || settings.homepageDescription || '');
        if (desc) metaDescEl.content = desc;
      }
    }

    // OG image from site-level SEO
    if (settings.seo && settings.seo.openGraphImage) {
      var ogUrl = sanityImageUrl(settings.seo.openGraphImage, 1200);
      if (ogUrl) {
        var ogMeta = document.querySelector('meta[property="og:image"]');
        if (ogMeta) ogMeta.setAttribute('content', ogUrl);
      }
    }

  } catch (err) {
    console.warn('Footer / global settings fetch failed, keeping static HTML:', err);
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
